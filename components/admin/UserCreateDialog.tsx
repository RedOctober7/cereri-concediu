"use client";

import { useRef, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
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
import {
  apiRequest,
  fieldErrorsFrom,
  generatePassword,
  omitKey,
} from "@/components/admin/form-utils";
import {
  UserFields,
  userValuesToInput,
  type UserFieldName,
  type UserFieldValues,
  type WorkPointOption,
} from "@/components/admin/user-fields";
import { toDateOnlyString, todayInBucharest } from "@/lib/dates";
import { userCreateSchema } from "@/lib/validators";

export type CreatedUser = { id: string; firstName: string; lastName: string };

function emptyValues(defaultEmployer: string): UserFieldValues {
  return {
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    jobTitle: "",
    employer: defaultEmployer,
    workPointId: "",
    hireDate: toDateOnlyString(todayInBucharest()),
    initialLeaveDays: "0",
  };
}

export function UserCreateDialog({
  open,
  onOpenChange,
  workPoints,
  jobTitles,
  defaultEmployer,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workPoints: WorkPointOption[];
  jobTitles: string[];
  defaultEmployer: string;
  onCreated: (user: CreatedUser, emailFailed: boolean) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(() => emptyValues(defaultEmployer));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Contul creat, dar emailul cu parola nu a plecat: arătăm datele ca să nu se piardă. */
  const [credentials, setCredentials] = useState<{
    name: string;
    username: string;
    password: string;
    warning: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function reset() {
    setCredentials(null);
    setCopied(false);
    setValues(emptyValues(defaultEmployer));
    setPassword("");
    setShowPassword(false);
    setErrors({});
    setFormError(null);
  }

  function onFieldChange(name: UserFieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => omitKey(current, name));
  }

  function focusFirstInvalid() {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const input = { ...userValuesToInput(values), password };
    const parsed = userCreateSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues));
      focusFirstInvalid();
      return;
    }

    setSubmitting(true);
    const result = await apiRequest<CreatedUser>("/api/admin/users", {
      method: "POST",
      body: input,
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.field) {
        setErrors({ [result.field]: result.error });
        focusFirstInvalid();
      } else {
        setFormError(result.error);
      }
      return;
    }

    if (result.warning) {
      setCredentials({
        name: `${result.data.firstName} ${result.data.lastName}`,
        username: parsed.data.username.toLowerCase(),
        password,
        warning: result.warning,
      });
      onCreated(result.data, true);
      return;
    }
    onCreated(result.data, false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Cât timp sunt afișate datele de autentificare (singurul loc unde apare parola),
        // dialogul se închide doar din „Gata”, nu la Esc sau la un click în afară.
        if (!submitting && !credentials) {
          onOpenChange(next);
        }
      }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) {
          reset();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"
      >
        {credentials ? (
          <>
            <DialogHeader>
              <DialogTitle>Contul a fost creat</DialogTitle>
              <DialogDescription>
                Comunică-i lui {credentials.name} datele de mai jos. La prima autentificare va fi
                rugat să își aleagă o parolă nouă.
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>{credentials.warning}</AlertDescription>
            </Alert>
            <dl className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Nume de utilizator</dt>
                <dd className="font-medium">{credentials.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Parolă temporară</dt>
                <dd className="flex items-center gap-1">
                  <span className="font-mono font-medium">{credentials.password}</span>
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
              <Button type="button" onClick={() => onOpenChange(false)}>
                Gata
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Adaugă utilizator</DialogTitle>
              <DialogDescription>
                Contul primește o parolă temporară, pe care angajatul o schimbă la prima
                autentificare.
              </DialogDescription>
            </DialogHeader>

            <form ref={formRef} noValidate onSubmit={onSubmit} className="grid gap-4">
              {formError ? (
                <Alert variant="destructive">
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              ) : null}

              <UserFields
                idPrefix="new-user"
                values={values}
                errors={errors}
                onChange={onFieldChange}
                workPoints={workPoints}
                jobTitles={jobTitles}
                disabled={submitting}
                initialLeaveDaysHint="Zilele de concediu pe care le are angajatul la crearea contului. De aici înainte se adaugă automat 1,75 zile în fiecare lună."
              />

              <FormField
                id="new-user-password"
                label="Parolă temporară"
                error={errors.password}
                hint="Minim 10 caractere, cel puțin o literă mare și o cifră. Se trimite angajatului pe email."
              >
                {(field) => (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        {...field}
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        disabled={submitting}
                        autoComplete="new-password"
                        spellCheck={false}
                        className="pr-9 font-mono"
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setErrors((current) => omitKey(current, "password"));
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-1/2 right-0.5 -translate-y-1/2"
                        aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() => {
                        setPassword(generatePassword());
                        setShowPassword(true);
                        setErrors((current) => omitKey(current, "password"));
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
                  {submitting ? "Se creează..." : "Creează contul"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
