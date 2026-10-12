"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePasswordSchema,
  type ChangePasswordInput,
} from "@/lib/validators";

export function ChangePasswordForm() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  async function onSubmit(data: ChangePasswordInput) {
    setIsLoading(true);

    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const body = (await res.json()) as { error?: string };

      if (!res.ok) {
        toast.error(body.error ?? "Nu am putut schimba parola.");
        return;
      }

      // Fără payload: serverul recitește mustChangePassword din baza de date.
      const updated = await update();
      reset();

      // Dacă sesiunea nu a putut fi reîmprospătată, cookie-ul vechi (cu
      // mustChangePassword) ne-ar trimite înapoi aici; parola e deja schimbată,
      // deci delogăm și cerem autentificare cu parola nouă.
      if (!updated?.user || updated.user.mustChangePassword) {
        toast.success(
          "Parola a fost schimbată. Autentifică-te din nou cu parola nouă."
        );
        // Fără reîncărcare completă, ca mesajul să rămână vizibil pe pagina de login.
        await signOut({ callbackUrl: "/login", redirect: false });
        router.replace("/login");
        router.refresh();
        return;
      }

      toast.success("Parola a fost schimbată cu succes.");
      router.push(updated.user.role === "ADMIN" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      toast.error(
        "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator."
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Parola curentă</Label>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          disabled={isLoading}
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p className="text-sm text-destructive">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">Parola nouă</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          disabled={isLoading}
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p className="text-sm text-destructive">
            {errors.newPassword.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
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
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full h-11" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" />
            Se salvează...
          </>
        ) : (
          "Salvează parola"
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {session?.user?.name ? `Conectat ca ${session.user.name}. ` : null}
        <button
          type="button"
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary disabled:opacity-50"
          disabled={isLoading || signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut({ callbackUrl: "/login" }).catch(() => setSigningOut(false));
          }}
        >
          {signingOut ? "Se deconectează..." : "Deconectează-te"}
        </button>
      </p>
    </form>
  );
}
