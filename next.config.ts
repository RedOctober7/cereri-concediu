import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Singura imagine din aplicație este /logo.svg, pe care next/image oricum nu o
    // optimizează. Cu `unoptimized`, endpoint-ul /_next/image răspunde 404, deci
    // optimizatorul de imagini (sharp) nu poate fi apelat din exterior.
    unoptimized: true,
  },
  // Fonturile PDF-ului (lib/pdf/fonts.ts) se citesc de pe disc la rulare, deci nu
  // apar singure în bundle-ul funcțiilor. Cheile se potrivesc și pe subrute:
  // "/api/leaves" acoperă crearea cererii și descărcarea PDF-ului.
  outputFileTracingIncludes: {
    "/api/leaves": ["./lib/pdf/fonts/*"],
    "/api/admin/leaves/*/approve": ["./lib/pdf/fonts/*"],
  },
};

export default nextConfig;
