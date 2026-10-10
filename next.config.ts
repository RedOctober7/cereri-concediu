import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Singura imagine din aplicație este /logo.svg, pe care next/image oricum nu o
    // optimizează. Cu `unoptimized`, endpoint-ul /_next/image răspunde 404, deci
    // optimizatorul de imagini (sharp) nu poate fi apelat din exterior.
    unoptimized: true,
  },
};

export default nextConfig;
