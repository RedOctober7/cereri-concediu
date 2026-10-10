import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testele rulează de două ori, cu fusul orar al serverului pe UTC (ca pe Vercel) și pe
// Europe/Bucharest (ca local): logica de date (lib/dates.ts) trebuie să dea același
// rezultat în ambele. `npm test` rulează ambele proiecte.
const TIME_ZONES = ["UTC", "Europe/Bucharest"] as const;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    projects: TIME_ZONES.map((timeZone) => ({
      extends: true,
      test: {
        name: timeZone,
        env: { TZ: timeZone },
      },
    })),
  },
});
