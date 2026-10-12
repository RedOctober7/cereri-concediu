import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validators";
import { startAuthAttempt } from "@/lib/rate-limit";

// Cât timp avem încredere în rolul și starea contului din JWT fără să le recitim
// din baza de date. getServerSession (layout-uri, pagini, gărzi API) trece prin
// callback-ul jwt; proxy.ts doar decodează JWT-ul (vezi comentariul de acolo).
const SESSION_REVALIDATE_MS = 5 * 60 * 1000;

function isRevalidationDue(checkedAt: number | undefined, now: number): boolean {
  // Token emis înainte de revalidarea periodică: îl verificăm imediat.
  if (typeof checkedAt !== "number") {
    return true;
  }
  const age = now - checkedAt;
  // Un checkedAt din viitor (ceas decalat între instanțe) nu prelungește încrederea.
  return age < 0 || age >= SESSION_REVALIDATE_MS;
}

/** Hash bcrypt (cost 12, ca parolele reale) al unei parole aleatorii, pentru login fără cont. */
const DUMMY_PASSWORD_HASH = "$2b$12$Kt/BHWXaYwNN9eGThILS/eQJqww.VchLj/Q8EQOZGlOjPeIbm4p42";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Utilizator", type: "text" },
        password: { label: "Parolă", type: "password" },
      },
      async authorize(credentials, req) {
        const ip =
          req.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ??
          req.headers?.["x-real-ip"]?.toString() ??
          "unknown";

        // Se numără doar încercările eșuate: pe utilizator + IP și, mai larg, pe IP.
        const attempt = await startAuthAttempt(
          typeof credentials?.username === "string" ? credentials.username : "",
          ip
        );
        if (!attempt.allowed) {
          throw new Error(
            "Prea multe încercări de autentificare. Reîncearcă în 15 minute."
          );
        }

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { username, password } = parsed.data;

        const user = await prisma.user.findFirst({
          where: {
            username: username.toLowerCase(),
            active: true,
            deletedAt: null,
          },
          omit: { passwordHash: false },
        });

        // Și fără cont, comparăm cu un hash fix: altfel răspunsul mai rapid (fără
        // bcrypt) ar arăta ce nume de utilizator există.
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        if (!user) {
          return null;
        }
        if (!valid) {
          return null;
        }

        await attempt.succeeded();
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.sessionVersion = user.sessionVersion;
        token.checkedAt = Date.now();
        return token;
      }

      // Payload-ul lui update() vine din browser, deci nu îl folosim niciodată:
      // recitim rolul și starea contului din DB la orice update() și, periodic, la
      // citirea sesiunii. Altfel dezactivarea, resetarea forțată a parolei sau
      // schimbarea rolului nu ar atinge sesiunile deschise (next-auth reemite
      // cookie-ul la fiecare /api/auth/session, deci un JWT ar trăi la nesfârșit).
      // getServerSession din RSC/rute nu poate rescrie cookie-ul, deci după 5 minute
      // recitirea se repetă la fiecare cerere server până când browserul îl
      // reîmprospătează; de aceea e un singur findUnique cu select minim.
      const now = Date.now();
      if (trigger !== "update" && !isRevalidationDue(token.checkedAt, now)) {
        return token;
      }

      let dbUser;
      try {
        dbUser = token.id
          ? await prisma.user.findUnique({
              where: { id: token.id },
              select: {
                role: true,
                mustChangePassword: true,
                active: true,
                deletedAt: true,
                sessionVersion: true,
              },
            })
          : null;
      } catch (error) {
        // O problemă temporară cu baza de date nu trebuie să delogheze pe toată
        // lumea: păstrăm token-ul așa cum e (checkedAt neschimbat), deci
        // revalidarea se reîncearcă la următoarea citire a sesiunii.
        console.error("[Auth] Revalidarea sesiunii a eșuat:", error);
        return token;
      }

      if (!dbUser || !dbUser.active || dbUser.deletedAt) {
        // O eroare aruncată aici face ca next-auth să nu mai întoarcă sesiunea
        // (getServerSession dă null) și să șteargă cookie-ul la /api/auth/session
        // (JWT_SESSION_ERROR), deci utilizatorul ajunge delogat.
        throw new Error("Contul nu mai este activ.");
      }

      // Parola s-a schimbat după emiterea acestui token (de utilizator, prin email sau de
      // un admin): sesiunea veche se închide, inclusiv una deschisă de altcineva.
      if (dbUser.sessionVersion !== (token.sessionVersion ?? 0)) {
        throw new Error("Parola contului a fost schimbată.");
      }

      token.role = dbUser.role;
      // La update() (POST /api/auth/session, cookie-ul se rescrie imediat) copiem
      // valoarea din DB. La revalidarea periodică doar ridicăm obligația: din RSC
      // cookie-ul rămâne cu true, proxy-ul ar trimite în continuare la
      // /schimba-parola, iar pagina ar redirecționa înapoi (buclă de redirect).
      // O obligație scoasă din DB dispare deci la schimbarea parolei sau la relogare.
      token.mustChangePassword =
        trigger === "update"
          ? dbUser.mustChangePassword
          : token.mustChangePassword || dbUser.mustChangePassword;
      token.checkedAt = now;

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "ADMIN" | "EMPLOYEE";
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
