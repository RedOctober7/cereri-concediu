import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Cu un fișier prisma.config.ts, CLI-ul Prisma nu mai încarcă singur .env, așa că
// îl încărcăm aici, în aceeași ordine ca scripturile din prisma/: .env.local, apoi
// .env. Variabilele deja setate (ex. în Vercel sau CI) nu sunt suprascrise.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
