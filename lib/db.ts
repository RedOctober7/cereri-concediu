import { PrismaClient } from "@prisma/client";

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    // passwordHash nu este citit implicit (nici prin include: { user: true }),
    // ca să nu ajungă în răspunsuri API sau în props de client components.
    // Unde e nevoie de el se cere explicit cu omit: { passwordHash: false }.
    omit: {
      user: { passwordHash: true },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
