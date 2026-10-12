"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SessionProvider>
        {children}
        {/* Toaster citește tema din next-themes (components/ui/sonner.tsx). */}
        <Toaster richColors position="top-center" />
      </SessionProvider>
    </ThemeProvider>
  );
}
