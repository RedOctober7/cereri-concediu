"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validators";
import { safeCallbackPath } from "./safe-callback";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(data: LoginInput) {
    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        username: data.username.trim().toLowerCase(),
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(
          result.error === "CredentialsSignin"
            ? "Utilizator sau parolă incorectă."
            : result.error
        );
        return;
      }

      const sessionRes = await fetch("/api/auth/session");
      const session = (await sessionRes.json()) as {
        user?: { role?: string; mustChangePassword?: boolean };
      };

      if (session.user?.mustChangePassword) {
        router.push("/schimba-parola");
        router.refresh();
        return;
      }

      // Doar căi de pe același site: altfel ?callbackUrl=https://evil.com ar trimite
      // utilizatorul, imediat după autentificare, pe alt site (open redirect).
      const callbackPath = safeCallbackPath(
        searchParams.get("callbackUrl"),
        window.location.origin
      );
      if (callbackPath) {
        router.push(callbackPath);
      } else if (session.user?.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
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
        <Label htmlFor="username">Utilizator</Label>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          disabled={isLoading}
          aria-invalid={!!errors.username}
          {...register("username")}
        />
        {errors.username && (
          <p className="text-sm text-destructive">{errors.username.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Parolă</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          disabled={isLoading}
          aria-invalid={!!errors.password}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full h-11" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" />
            Se autentifică...
          </>
        ) : (
          "Autentificare"
        )}
      </Button>
    </form>
  );
}
