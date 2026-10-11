"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordSchema } from "@/lib/validators";

// Aceleași reguli ca la schimbarea parolei; serverul le verifică din nou.
const resetPasswordSchema = z
  .object({
    newPassword: changePasswordSchema.shape.newPassword,
    confirmPassword: changePasswordSchema.shape.confirmPassword,
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parolele nu coincid",
    path: ["confirmPassword"],
  });

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Parola nouă pentru tokenul din linkul de resetare (pagina a verificat deja tokenul). */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(data: ResetPasswordInput) {
    setIsLoading(true);
    try {
      const res = await fetch("/api/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...data }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };

      if (body.code === "INVALID_TOKEN") {
        // Linkul a expirat sau a fost folosit între timp: formularul nu mai ajută.
        setLinkError(body.error ?? "Linkul de resetare nu mai este valid.");
        return;
      }
      if (!res.ok) {
        toast.error(body.error ?? "Nu am putut schimba parola. Reîncearcă.");
        return;
      }

      toast.success("Parola a fost schimbată. Autentifică-te cu parola nouă.");
      router.replace("/login");
    } catch {
      toast.error(
        "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator."
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (linkError) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Linkul nu mai este valid</AlertTitle>
          <AlertDescription>{linkError}</AlertDescription>
        </Alert>
        <Link href="/reset-parola" className={cn(buttonVariants(), "h-11 w-full")}>
          Cere un link nou
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="newPassword">Parola nouă</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          autoFocus
          disabled={isLoading}
          aria-invalid={!!errors.newPassword}
          aria-describedby="newPassword-hint"
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p className="text-sm text-destructive">{errors.newPassword.message}</p>
        )}
        <p id="newPassword-hint" className="text-xs text-muted-foreground">
          Minim 10 caractere, o literă mare și o cifră.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmă parola nouă</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          disabled={isLoading}
          aria-invalid={!!errors.confirmPassword}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            Se salvează...
          </>
        ) : (
          "Salvează parola nouă"
        )}
      </Button>
    </form>
  );
}
