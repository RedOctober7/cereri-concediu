"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField } from "@/components/admin/admin-ui";
import { parseDecimal } from "@/components/admin/form-utils";
import type { UserProfileInput } from "@/lib/validators";

// Câmpurile de profil ale unui angajat, comune formularului de creare (dialog) și
// celui de editare (pagina de detaliu). Valorile sunt păstrate ca text, exact cum le
// scrie adminul; conversia la payload-ul API se face în userValuesToInput.

export type UserFieldValues = {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  jobTitle: string;
  employer: string;
  workPointId: string;
  hireDate: string;
  initialLeaveDays: string;
};

export type UserFieldName = keyof UserFieldValues;

export type WorkPointOption = { id: string; name: string; active: boolean };

export function userValuesToInput(values: UserFieldValues): UserProfileInput {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    username: values.username,
    jobTitle: values.jobTitle,
    employer: values.employer,
    workPointId: values.workPointId || null,
    hireDate: values.hireDate,
    initialLeaveDays: parseDecimal(values.initialLeaveDays),
  };
}

export function UserFields({
  idPrefix,
  values,
  errors,
  onChange,
  workPoints,
  jobTitles,
  initialLeaveDaysHint,
  disabled,
}: {
  idPrefix: string;
  values: UserFieldValues;
  errors: Partial<Record<string, string>>;
  onChange: (name: UserFieldName, value: string) => void;
  workPoints: WorkPointOption[];
  jobTitles: string[];
  initialLeaveDaysHint: React.ReactNode;
  disabled?: boolean;
}) {
  const id = (name: UserFieldName) => `${idPrefix}-${name}`;
  const text = (name: UserFieldName) => ({
    name,
    value: values[name],
    disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(name, event.target.value),
  });
  // Punctele inactive nu se mai aleg, dar cel deja atribuit rămâne vizibil în listă.
  const workPointOptions = workPoints.filter(
    (workPoint) => workPoint.active || workPoint.id === values.workPointId
  );
  const jobTitlesListId = `${idPrefix}-job-titles`;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={id("lastName")} label="Nume" error={errors.lastName}>
        {(field) => <Input {...field} {...text("lastName")} autoComplete="off" />}
      </FormField>
      <FormField id={id("firstName")} label="Prenume" error={errors.firstName}>
        {(field) => <Input {...field} {...text("firstName")} autoComplete="off" />}
      </FormField>
      <FormField id={id("email")} label="Email" error={errors.email}>
        {(field) => (
          <Input
            {...field}
            {...text("email")}
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </FormField>
      <FormField
        id={id("username")}
        label="Nume de utilizator"
        error={errors.username}
        hint="Folosit la autentificare. Litere fără diacritice, cifre, punct sau cratimă."
      >
        {(field) => (
          <Input
            {...field}
            {...text("username")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        )}
      </FormField>
      <FormField id={id("jobTitle")} label="Funcție" error={errors.jobTitle}>
        {(field) => (
          <>
            <Input {...field} {...text("jobTitle")} list={jobTitlesListId} autoComplete="off" />
            <datalist id={jobTitlesListId}>
              {jobTitles.map((title) => (
                <option key={title} value={title} />
              ))}
            </datalist>
          </>
        )}
      </FormField>
      <FormField id={id("employer")} label="Angajator" error={errors.employer}>
        {(field) => <Input {...field} {...text("employer")} autoComplete="organization" />}
      </FormField>
      <FormField id={id("workPointId")} label="Punct de lucru" error={errors.workPointId}>
        {(field) => (
          <NativeSelect
            {...field}
            name="workPointId"
            value={values.workPointId}
            disabled={disabled}
            onChange={(event) => onChange("workPointId", event.target.value)}
          >
            <option value="">Fără punct de lucru</option>
            {workPointOptions.map((workPoint) => (
              <option key={workPoint.id} value={workPoint.id}>
                {workPoint.active ? workPoint.name : `${workPoint.name} (inactiv)`}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField id={id("hireDate")} label="Data angajării" error={errors.hireDate}>
        {(field) => <Input {...field} {...text("hireDate")} type="date" />}
      </FormField>
      <FormField
        id={id("initialLeaveDays")}
        label="Sold inițial (zile)"
        error={errors.initialLeaveDays}
        hint={initialLeaveDaysHint}
        className="sm:col-span-2"
      >
        {(field) => (
          <Input
            {...field}
            {...text("initialLeaveDays")}
            inputMode="decimal"
            autoComplete="off"
            className="sm:max-w-40"
          />
        )}
      </FormField>
    </div>
  );
}
