"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/admin/admin-ui";
import { apiRequest, fieldErrorsFrom, generatePassword } from "@/components/admin/form-utils";
import { adminPasswordResetSchema } from "@/lib/validators";

/**
 * Resetarea parolei: adminul alege o parolă temporară (sau o generează) și confirmă.
 * Contul trece pe „parolă temporară”, deci angajatul o schimbă la autentificare.
 * Nu pleacă niciun email, așa că la final parola rămâne vizibilă, ca s-o poată comunica.
 */
export function PasswordResetDialog({
  open,
  onOpenChange,
  userId,
  userName,
  username,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  username: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  function reset() {
    setPassword("");
    setVisible(false);
    setError(null);
    setFormError(null);
    setDone(false);
    setCopied(false);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = adminPasswordResetSchema.safeParse({ password });
    if (!parsed.success) {
      setError(fieldErrorsFrom(parsed.error.issues).password ?? null);
      return;
    }

    setSubmitting(true);
    const result = await apiRequest(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: { password, forcePasswordReset: true },
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.field === "password") {
        setError(result.error);
      } else {
        setFormError(result.error);
      }
      return;
    }

    setDone(true);
    router.refresh();
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) {
          onOpenChange(next);
        }
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          reset();
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle>Parola a fost resetată</DialogTitle>
              <DialogDescription>
                Comunică-i lui {userName} datele de mai jos. La autentificare va fi rugat să
                își aleagă o parolă nouă.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Nume de utilizator</dt>
                <dd className="font-medium">{username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Parolă temporară</dt>
                <dd className="flex items-center gap-1">
                  <span className="font-mono font-medium">{password}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copied ? "Parola a fost copiată" : "Copiază parola"}
                    onClick={copyPassword}
                  >
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </dd>
              </div>
            </dl>
            <DialogFooter>
              <DialogClose render={<Button type="button" />}>Gata</DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Resetează parola</DialogTitle>
              <DialogDescription>
                Parola actuală a lui {userName} nu va mai funcționa. Angajatul se autentifică
                cu parola temporară de mai jos și apoi își alege una nouă.
              </DialogDescription>
            </DialogHeader>
            <form noValidate onSubmit={onSubmit} className="grid gap-4">
              {formError ? (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}
              <FormField
                id="reset-password"
                label="Parolă temporară"
                error={error ?? undefined}
                hint="Minim 10 caractere, cel puțin o literă mare și o cifră."
              >
                {(field) => (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        {...field}
                        name="password"
                        type={visible ? "text" : "password"}
                        value={password}
                        disabled={submitting}
                        autoComplete="new-password"
                        spellCheck={false}
                        className="pr-9 font-mono"
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError(null);
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-1/2 right-0.5 -translate-y-1/2"
                        aria-label={visible ? "Ascunde parola" : "Arată parola"}
                        aria-pressed={visible}
                        onClick={() => setVisible((value) => !value)}
                      >
                        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => {
                        setPassword(generatePassword());
                        setVisible(true);
                        setError(null);
                      }}
                    >
                      <RefreshCw aria-hidden="true" />
                      Generează
                    </Button>
                  </div>
                )}
              </FormField>
              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="outline" disabled={submitting} />}
                >
                  Anulează
                </DialogClose>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                  {submitting ? "Se resetează..." : "Resetează parola"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
