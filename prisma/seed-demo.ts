import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
import { PrismaClient } from "@prisma/client";
import {
  DEMO_ADMIN_USERNAME,
  DEMO_EMPLOYEE_USERNAME,
  DEMO_PASSWORD,
  seedDemo,
} from "@/lib/demo/seed";

// Utilizare (DOAR pe baza instanței demo, ȘTERGE toate datele):
//   bash:        DEMO_MODE=true npm run db:seed-demo
//   PowerShell:  $env:DEMO_MODE = "true"; npm run db:seed-demo
//   sau DEMO_MODE=true în .env.local
async function main() {
  if (process.env.DEMO_MODE !== "true") {
    console.error(
      "Refuz: scriptul șterge toată baza de date. Rulează-l doar pe instanța demo, cu DEMO_MODE=true (în .env.local sau ca variabilă de mediu)."
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const result = await seedDemo(prisma);
    console.log(
      `Date demo create: ${result.users} conturi, ${result.workPoints} puncte de lucru, ${result.leaves} cereri.`
    );
    console.log(`Admin: ${DEMO_ADMIN_USERNAME} / ${DEMO_PASSWORD}`);
    console.log(`Angajat: ${DEMO_EMPLOYEE_USERNAME} / ${DEMO_PASSWORD}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Eroare:", error);
  process.exit(1);
});
