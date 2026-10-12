import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "react-day-picker/style.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

const appName = process.env.APP_NAME ?? "Cereri Concediu";

export const metadata: Metadata = {
  title: appName,
  applicationName: appName,
  description:
    "Cereri de concediu de odihnă online: depunere, reguli de aprobare, aprobare de către administrator, PDF și evidența zilelor.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ro" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
