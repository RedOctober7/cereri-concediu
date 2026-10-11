"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { DaysValue } from "@/components/admin/admin-ui";
import { formatDays } from "@/components/admin/format";
import {
  apiRequest,
  decimalToInput,
  fieldErrorsFrom,
  omitKey,
  parseDecimal,
} from "@/components/admin/form-utils";
import {
  UserFields,
  userValuesToInput,
  type UserFieldName,
  type UserFieldValues,
  type WorkPointOption,
} from "@/components/admin/user-fields";
import { userProfileSchema } from "@/lib/validators";

export type EditableUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  jobTitle: string;
  employer: string;
  workPointId: string | null;
  hireDate: string;
  initialLeaveDays: number;
  availableDays: number;
};

function valuesFrom(user: EditableUser): UserFieldValues {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    username: user.username,
    jobTitle: user.jobTitle,
    employer: user.employer,
    workPointId: user.workPointId ?? "",
    hireDate: user.hireDate,
    initialLeaveDays: decimalToInput(user.initialLeaveDays),
  };
}

/** Câmpurile modificate față de valorile salvate, ca payload pentru PATCH. */
function changedFields(initial: UserFieldValues, current: UserFieldValues) {
  const before = userValuesToInput(initial);
  const after = userValuesToInput(current);
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    const a = before[key];
    const b = after[key];
    const same =
      typeof a === "string" && typeof b === "string"
        ? a.trim() === b.trim()
        : Object.is(a, b);
    if (!same) {
      changed[key] = b;
    }
  }
  return changed;
}

/**
 * Formularul „Date angajat” din pagina de detaliu. Trimite doar câmpurile schimbate;
 * după salvare pagina se reîncarcă, iar componenta e remontată cu valorile noi
 * (cheia ei este versiunea utilizatorului).
 */
export function UserEditForm({
  user,
  workPoints,
  jobTitles,
}: {
  user: EditableUser;
  workPoints: WorkPointOption[];
  jobTitles: string[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState(() => valuesFrom(user));
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const changes = changedFields(initial, values);
  const dirty = Object.keys(changes).length > 0;

  // Diferența de sold inițial se aplică și soldului disponibil (vezi ruta PATCH).
  const newInitial = parseDecimal(values.initialLeaveDays);
  const initialDelta =
    Number.isFinite(newInitial) && newInitial !== user.initialLeaveDays
      ? Math.round((newInitial - user.initialLeaveDays) * 100) / 100
      : 0;

  function onFieldChange(name: UserFieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => omitKey(current, name));
    setFormError(null);
  }

  function focusFirstInvalid() {
    requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = userProfileSchema.safeParse(userValuesToInput(values));
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues));
      focusFirstInvalid();
      return;
    }
    if (!dirty) {
      return;
    }

    setSaving(true);
    const result = await apiRequest(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: changes,
    });
    setSaving(false);

    if (!result.ok) {
      if (result.field && result.field in values) {
        setErrors({ [result.field]: result.error });
        focusFirstInvalid();
      } else {
        setFormError(result.error);
      }
      return;
    }

    toast.success("Datele angajatului au fost salvate.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Date angajat</CardTitle>
        <CardDescription>Apar în cererile de concediu generate în PDF.</CardDescription>
      </CardHeader>
      <form ref={formRef} noValidate onSubmit={onSubmit} className="contents">
        <CardContent className="space-y-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <UserFields
            idPrefix="edit-user"
            values={values}
            errors={errors}
            onChange={onFieldChange}
            workPoints={workPoints}
            jobTitles={jobTitles}
            disabled={saving}
            initialLeaveDaysHint={
              initialDelta !== 0 ? (
                <>
                  Soldul disponibil devine{" "}
                  <DaysValue
                    value={Math.round((user.availableDays + initialDelta) * 100) / 100}
                    className="font-medium text-foreground"
                  />{" "}
                  zile ({initialDelta > 0 ? "+" : ""}
                  {formatDays(initialDelta)}).
                </>
              ) : (
                "Diferența față de valoarea salvată se aplică și soldului disponibil. Pentru alte corecturi folosește „Ajustare sold”."
              )
            }
          />
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setValues(initial);
              setErrors({});
              setFormError(null);
            }}
          >
            Renunță
          </Button>
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {saving ? "Se salvează..." : "Salvează modificările"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
