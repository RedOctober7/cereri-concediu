"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validators";
import { safeCallbackPath } from "./safe-callback";
import {
  DEMO_ADMIN_USERNAME,
  DEMO_EMPLOYEE_USERNAME,
  DEMO_PASSWORD,
} from "@/lib/demo/accounts";

// Pe instanța publică de demo (NEXT_PUBLIC_DEMO_MODE=true) vizitatorii intră cu un click.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  /** Butonul demo apăsat, pentru indicatorul de încărcare. */
  const [demoPending, setDemoPending] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  async function onSubmit(data: LoginInput) {
    await login(data.username, data.password);
  }

  async function login(username: string, password: string) {
    setIsLoading(true);
    let navigating = false;

    try {
      const result = await signIn("credentials", {
        username: username.trim().toLowerCase(),
        password,
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

      // Doar căi de pe același site: altfel ?callbackUrl=https://evil.com ar trimite
      // utilizatorul, imediat după autentificare, pe alt site (open redirect).
      const callbackPath = safeCallbackPath(
        searchParams.get("callbackUrl"),
        window.location.origin
      );

      // Navigare completă, nu router.push + router.refresh: cele două concurau (refresh
      // reîncărca /login și anula uneori navigarea), deci butonul trebuia apăsat de două
      // ori. Butoanele rămân dezactivate până se încarcă pagina nouă.
      navigating = true;
      const target = session.user?.mustChangePassword
        ? "/schimba-parola"
        : (callbackPath ?? (session.user?.role === "ADMIN" ? "/admin" : "/dashboard"));
      // Intenționat o navigare completă: cookie-ul de sesiune tocmai a fost setat, iar
      // cache-ul routerului client poate avea încă redirect-ul spre /login.
      window.location.assign(target);
    } catch {
      navigating = false;
      toast.error(
        "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator."
      );
    } finally {
      if (!navigating) {
        setIsLoading(false);
        setDemoPending(null);
      }
    }
  }

  function demoLogin(username: string) {
    setDemoPending(username);
    void login(username, DEMO_PASSWORD);
  }

  return (
    <div className="space-y-6">
      {DEMO_MODE ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Versiune demo</p>
            <p className="text-sm text-muted-foreground">
              Datele sunt fictive. Intră direct ca administrator sau ca angajat.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              className="h-10"
              disabled={isLoading}
              onClick={() => demoLogin(DEMO_ADMIN_USERNAME)}
            >
              {demoPending === DEMO_ADMIN_USERNAME ? <Loader2 className="animate-spin" /> : null}
              Intră ca administrator
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={isLoading}
              onClick={() => demoLogin(DEMO_EMPLOYEE_USERNAME)}
            >
              {demoPending === DEMO_EMPLOYEE_USERNAME ? <Loader2 className="animate-spin" /> : null}
              Intră ca angajat
            </Button>
          </div>
        </div>
      ) : null}
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
    </div>
  );
}
