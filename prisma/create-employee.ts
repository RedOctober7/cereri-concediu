import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { todayInBucharest } from "@/lib/dates";

const prisma = new PrismaClient();

// Creează rapid un angajat (ex. de test), fără schimbare obligatorie a parolei:
//   npm run db:create-employee -- <username> <parola> [Prenume] [Nume]
async function main() {
  const [usernameArg, password, firstName = "Test", lastName = "Angajat"] = process.argv.slice(2);

  if (!usernameArg || !password) {
    console.error("Utilizare: npm run db:create-employee -- <username> <parola> [Prenume] [Nume]");
    process.exit(1);
  }
  if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    console.error("Parola trebuie să aibă minim 10 caractere, o literă mare și o cifră.");
    process.exit(1);
  }

  const username = usernameArg.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.error(`Utilizatorul "${username}" există deja. Folosește npm run db:reset-password.`);
    process.exit(1);
  }

  const workPoint = await prisma.workPoint.findFirst({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  await prisma.user.create({
    data: {
      username,
      email: `${username}@exemplu.ro`,
      passwordHash: await bcrypt.hash(password, 12),
      firstName,
      lastName,
      jobTitle: "Angajat",
      employer: process.env.COMPANY_NAME ?? "Companie",
      role: Role.EMPLOYEE,
      workPointId: workPoint?.id ?? null,
      hireDate: todayInBucharest(),
      initialLeaveDays: 21,
      availableDays: 21,
      mustChangePassword: false,
      active: true,
    },
  });

  console.log(`Angajat creat: ${username}${workPoint ? ` (punct de lucru: ${workPoint.name})` : ""}.`);
  console.log("Se poate autentifica direct, fără schimbarea parolei.");
}

main()
  .catch((e) => {
    console.error("Eroare:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
