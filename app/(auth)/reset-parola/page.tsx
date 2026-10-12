import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isResetTokenUsable } from "@/lib/password-reset";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: `Resetare parolă · ${process.env.APP_NAME?.trim() || "Cereri Concediu"}`,
  // Tokenul e în URL: nu îl trimitem mai departe în Referer.
  referrer: "no-referrer",
};

function BackToLogin() {
  return (
    <p className="text-center text-sm text-muted-foreground">
      <Link href="/login" className="text-primary underline-offset-4 hover:underline">
        Înapoi la autentificare
      </Link>
    </p>
  );
}

export default async function ResetParolaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;

  // Fără token: cererea linkului de resetare.
  if (token === undefined) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Ai uitat parola?</CardTitle>
          <CardDescription>
            Introdu numele de utilizator sau emailul contului. Îți trimitem un link
            cu care îți setezi o parolă nouă.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ForgotPasswordForm />
          <BackToLogin />
        </CardContent>
      </Card>
    );
  }

  const usable = typeof token === "string" && (await isResetTokenUsable(token));

  if (!usable) {
    return (
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Link invalid</CardTitle>
          <CardDescription>Linkul de resetare nu mai poate fi folosit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Linkul a expirat sau a fost deja folosit</AlertTitle>
            <AlertDescription>
              Un link de resetare este valabil o oră și merge o singură dată. Dacă ai
              cerut mai multe, doar ultimul este valabil.
            </AlertDescription>
          </Alert>
          <Link href="/reset-parola" className={cn(buttonVariants(), "h-11 w-full")}>
            Cere un link nou
          </Link>
          <BackToLogin />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Setează o parolă nouă</CardTitle>
        <CardDescription>
          Alege parola cu care te vei autentifica de acum înainte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResetPasswordForm token={token} />
        <BackToLogin />
      </CardContent>
    </Card>
  );
}
