import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { DEMO_PROTECTED_USERNAMES, isDemoMode } from "@/lib/demo/accounts";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit/log";
import { appBaseUrl, sendPasswordResetEmail } from "@/lib/emails/send";
import { createMemoryLimiter } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validators";

// Resetarea parolei prin email („Ai uitat parola?”).
//
// Tokenul (32 de octeți aleatori, base64url) ajunge doar în linkul din email. În
// PasswordReset.token se păstrează hash-ul SHA-256 al lui: cine citește baza de
// date nu poate folosi linkurile încă valabile. Tokenul e valabil o oră, o singură
// dată; o cerere nouă le invalidează pe cele nefolosite (marcate `used`, singurul
// câmp de stare al modelului).

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
const TOKEN_BYTES = 32;
/** base64url fără padding pentru 32 de octeți. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Același răspuns indiferent dacă există sau nu contul (fără enumerarea utilizatorilor). */
export const RESET_REQUEST_MESSAGE =
  "Dacă există un cont activ cu aceste date, vei primi în câteva minute un email cu linkul de resetare.";
export const RESET_INVALID_TOKEN_MESSAGE =
  "Linkul de resetare a expirat sau a fost deja folosit. Cere unul nou.";

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function isWellFormedResetToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export const resetRequestSchema = z.object({
  identifier: z
    .string({ error: "Introdu numele de utilizator sau emailul." })
    .trim()
    .min(1, "Introdu numele de utilizator sau emailul.")
    .max(254, "Numele de utilizator sau emailul este prea lung."),
});

// Aceleași reguli pentru parola nouă ca la schimbarea parolei (lib/validators.ts).
export const resetConfirmSchema = z
  .object({
    token: z.string({ error: RESET_INVALID_TOKEN_MESSAGE }).min(1, RESET_INVALID_TOKEN_MESSAGE),
    newPassword: changePasswordSchema.shape.newPassword,
    confirmPassword: changePasswordSchema.shape.confirmPassword,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parolele nu coincid",
    path: ["confirmPassword"],
  });

/** IP-ul clientului, ca la autentificare (lib/auth.ts): primul din x-forwarded-for. */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

// Limite în memorie (pe instanță), ca să nu se poată trimite emailuri în masă
// către un cont și să nu se poată încerca tokenuri la nesfârșit.
const WINDOW_MS = 15 * 60 * 1000;
const requestPerIdentifier = createMemoryLimiter(3, WINDOW_MS);
const requestPerIp = createMemoryLimiter(20, WINDOW_MS);
const confirmPerIp = createMemoryLimiter(10, WINDOW_MS);

export async function allowResetRequest(ip: string, identifier: string): Promise<boolean> {
  const perIp = await requestPerIp.reserve(ip);
  if (!perIp.allowed) {
    return false;
  }
  const perIdentifier = await requestPerIdentifier.reserve(
    `${ip}\n${identifier.trim().toLowerCase()}`
  );
  return perIdentifier.allowed;
}

export async function allowResetConfirm(ip: string): Promise<boolean> {
  return (await confirmPerIp.reserve(ip)).allowed;
}

/**
 * Linkul se scrie în log doar când emailul nu a plecat și aplicația nu rulează în
 * producție: în dezvoltare (NODE_ENV) sau cu EMAIL_LOG_LINKS=true pe un server de
 * test, niciodată într-un deployment Vercel de producție.
 */
export function canLogResetLinks(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === "production") {
    return false;
  }
  return env.NODE_ENV === "development" || env.EMAIL_LOG_LINKS === "true";
}

function logUndeliveredLink(link: string) {
  if (canLogResetLinks()) {
    console.warn(`[Resetare parolă] Emailul nu a fost trimis. Link (doar în afara producției): ${link}`);
  } else {
    console.warn("[Resetare parolă] Emailul cu linkul de resetare nu a fost trimis.");
  }
}

/**
 * Creează un token pentru contul activ cu acest nume de utilizator sau email și
 * trimite linkul. Pentru un cont inexistent, inactiv sau șters nu face nimic.
 */
export async function processResetRequest(identifier: string, ip: string): Promise<void> {
  const value = identifier.trim();
  const user = await prisma.user.findFirst({
    where: {
      active: true,
      deletedAt: null,
      OR: [
        { username: value.toLowerCase() },
        { email: { equals: value, mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, firstName: true, username: true },
  });
  if (!user) {
    return;
  }

  const { token, tokenHash } = createResetToken();
  await prisma.$transaction([
    prisma.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    }),
    prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  try {
    await createAuditLog({
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "User",
      entityId: user.id,
      ipAddress: ip,
    });
  } catch (error) {
    // Tokenul e creat: un audit eșuat nu trebuie să oprească emailul.
    console.error("[Resetare parolă] Auditul nu a putut fi scris:", error);
  }

  const link = `${appBaseUrl()}/reset-parola?token=${token}`;
  try {
    const result = await sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName,
      username: user.username,
      resetUrl: link,
      validMinutes: RESET_TOKEN_TTL_MS / 60_000,
    });
    if (!result.sent) {
      logUndeliveredLink(link);
    }
  } catch (error) {
    console.error("[Resetare parolă] Trimiterea emailului a eșuat:", error);
    logUndeliveredLink(link);
  }
}

type ResetLookup = {
  id: string;
  userId: string;
  used: boolean;
  expiresAt: Date;
  user: { active: boolean; deletedAt: Date | null };
};

function findReset(token: string): Promise<ResetLookup | null> {
  return prisma.passwordReset.findUnique({
    where: { token: hashResetToken(token) },
    select: {
      id: true,
      userId: true,
      used: true,
      expiresAt: true,
      user: { select: { active: true, deletedAt: true } },
    },
  });
}

function isUsable(reset: ResetLookup | null, now: Date): reset is ResetLookup {
  return (
    !!reset &&
    !reset.used &&
    reset.expiresAt > now &&
    reset.user.active &&
    !reset.user.deletedAt
  );
}

/** Pentru pagina /reset-parola: tokenul există, nu e folosit, nu a expirat, contul e activ. */
export async function isResetTokenUsable(token: string): Promise<boolean> {
  if (!isWellFormedResetToken(token)) {
    return false;
  }
  return isUsable(await findReset(token), new Date());
}

class ResetRejected extends Error {}

/**
 * Setează parola nouă și consumă tokenul. Atomic: din două confirmări simultane cu
 * același link reușește una singură, iar un cont dezactivat între timp nu e modificat.
 */
export async function confirmPasswordReset(
  token: string,
  newPassword: string
): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (!isWellFormedResetToken(token)) {
    return { ok: false };
  }
  const reset = await findReset(token);
  if (!isUsable(reset, new Date())) {
    return { ok: false };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordReset.updateMany({
        where: { id: reset.id, used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });
      if (consumed.count !== 1) {
        throw new ResetRejected();
      }
      const updated = await tx.user.updateMany({
        where: {
          id: reset.userId,
          active: true,
          deletedAt: null,
          // Conturile demo de pe pagina de login rămân cu parola publică.
          ...(isDemoMode() ? { username: { notIn: DEMO_PROTECTED_USERNAMES } } : {}),
        },
        data: { passwordHash, mustChangePassword: false },
      });
      if (updated.count !== 1) {
        throw new ResetRejected();
      }
      // Alte linkuri trimise între timp nu mai pot schimba parola.
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, used: false },
        data: { used: true },
      });
    });
  } catch (error) {
    if (error instanceof ResetRejected) {
      return { ok: false };
    }
    throw error;
  }

  return { ok: true, userId: reset.userId };
}
