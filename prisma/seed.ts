import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !email || !password) {
    console.log(
      "[Seed] Variabilele ADMIN_USERNAME, ADMIN_EMAIL și ADMIN_PASSWORD lipsesc — se omite crearea adminului."
    );
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
  });

  if (existing) {
    console.log(`[Seed] Administratorul "${username}" există deja.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const hireDate = new Date("2020-01-01");

  await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      passwordHash,
      firstName: "Administrator",
      lastName: "Sistem",
      jobTitle: "Administrator",
      employer: process.env.COMPANY_NAME ?? "Companie",
      role: Role.ADMIN,
      hireDate,
      initialLeaveDays: 0,
      availableDays: 0,
      mustChangePassword: true,
      active: true,
    },
  });

  console.log(`[Seed] Administrator creat: ${username} (${email})`);
  console.log("[Seed] La prima autentificare va fi necesară schimbarea parolei.");
}

main()
  .catch((e) => {
    console.error("[Seed] Eroare:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
