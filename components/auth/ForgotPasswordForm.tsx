"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const forgotPasswordSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Introdu numele de utilizator sau emailul.")
    .max(254, "Numele de utilizator sau emailul este prea lung."),
});

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Cererea linkului de resetare: același mesaj pentru orice cont (vezi API-ul). */
export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: "" },
  });

  async function onSubmit(data: ForgotPasswordInput) {
    setIsLoading(true);
    try {
      const res = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error ?? "Nu am putut trimite cererea. Reîncearcă.");
        return;
      }
      setSentMessage(body.message ?? "Verifică-ți emailul pentru linkul de resetare.");
    } catch {
      toast.error(
        "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator."
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (sentMessage) {
    return (
      <div className="space-y-4">
        <Alert>
          <MailCheck aria-hidden="true" />
          <AlertTitle>Verifică-ți emailul</AlertTitle>
          <AlertDescription>
            <p>{sentMessage}</p>
            <p>Linkul este valabil o oră. Dacă nu îl găsești, verifică și dosarul Spam.</p>
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="h-11 w-full" onClick={() => setSentMessage(null)}>
          Nu a venit emailul? Trimite din nou
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="identifier">Utilizator sau email</Label>
        <Input
          id="identifier"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          disabled={isLoading}
          aria-invalid={!!errors.identifier}
          aria-describedby={errors.identifier ? "identifier-error" : undefined}
          {...register("identifier")}
        />
        {errors.identifier && (
          <p id="identifier-error" className="text-sm text-destructive">
            {errors.identifier.message}
          </p>
        )}
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Se trimite...
          </>
        ) : (
          "Trimite linkul de resetare"
        )}
      </Button>
    </form>
  );
}
