import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Utilizare: npm run db:reset-password -- <username> <parolaNoua>
async function main() {
  const [usernameArg, newPassword] = process.argv.slice(2);

  if (!usernameArg || !newPassword) {
    console.error("Utilizare: npm run db:reset-password -- <username> <parolaNoua>");
    process.exit(1);
  }

  if (
    newPassword.length < 10 ||
    !/[A-Z]/.test(newPassword) ||
    !/[0-9]/.test(newPassword)
  ) {
    console.error(
      "Parola trebuie să aibă minim 10 caractere, o literă mare și o cifră."
    );
    process.exit(1);
  }

  const username = usernameArg.toLowerCase();
  const user = await prisma.user.findUnique({ where: { username } });

  if (!user) {
    console.error(`Utilizatorul "${username}" nu există.`);
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: true,
    },
  });

  console.log(`Parola pentru "${username}" a fost resetată.`);
  console.log("La următoarea autentificare va trebui schimbată.");
}

main()
  .catch((e) => {
    console.error("Eroare:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
