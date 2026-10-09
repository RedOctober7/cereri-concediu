import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validators";
import { rateLimitAuth } from "@/lib/rate-limit";

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

        const allowed = await rateLimitAuth(ip);
        if (!allowed) {
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

        if (!user) {
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
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
      }

      // Payload-ul lui update() vine din browser, deci nu îl folosim niciodată:
      // la orice update recitim rolul și obligația de schimbare a parolei din DB.
      if (trigger === "update") {
        const dbUser = token.id
          ? await prisma.user.findUnique({
              where: { id: token.id },
              select: {
                role: true,
                mustChangePassword: true,
                active: true,
                deletedAt: true,
              },
            })
          : null;

        if (!dbUser || !dbUser.active || dbUser.deletedAt) {
          // O eroare aruncată aici face ca next-auth să șteargă cookie-ul de
          // sesiune (JWT_SESSION_ERROR), deci utilizatorul ajunge delogat.
          throw new Error("Contul nu mai este activ.");
        }

        token.role = dbUser.role;
        token.mustChangePassword = dbUser.mustChangePassword;
      }

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
