import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const MIN_SECRET_LENGTH = 16;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

// Comparăm hash-urile (mereu 32 de octeți), astfel încât timingSafeEqual primește
// buffere de lungime egală și nu se scurge nici lungimea secretului.
function matchesSecret(candidate: string | null, secret: string): boolean {
  if (!candidate) return false;
  return timingSafeEqual(sha256(candidate), sha256(secret));
}

/**
 * Verifică autentificarea unui apel către /api/cron/*.
 * Acceptă header-ul trimis de Vercel (`Authorization: Bearer <secret>`) și
 * header-ul pentru declanșare manuală (`x-cron-secret: <secret>`).
 * Întoarce răspunsul de eroare de trimis înapoi sau `null` dacă cererea este autorizată.
 * Dacă CRON_SECRET lipsește sau este prea scurt, respinge orice cerere (fail closed).
 * Folosește `node:crypto`, deci rutele care îl apelează trebuie să ruleze pe runtime-ul Node.js (implicit).
 */
export function verifyCronRequest(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `[Cron] CRON_SECRET lipsește sau are mai puțin de ${MIN_SECRET_LENGTH} caractere; cererea a fost respinsă.`
    );
    return NextResponse.json(
      { error: "Configurare server invalidă." },
      { status: 500 }
    );
  }

  const authHeader = req.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const manual = req.headers.get("x-cron-secret");

  const validVercel = matchesSecret(bearer, secret);
  const validManual = matchesSecret(manual, secret);

  if (!validVercel && !validManual) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }

  return null;
}
