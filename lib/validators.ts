import { z } from "zod";
import { ConstraintScope, ConstraintType } from "@prisma/client";
import { addYearsUTC, parseDateInput, todayInBucharest } from "@/lib/dates";

export const loginSchema = z.object({
  username: z
    .string()
    .min(1, "Introdu numele de utilizator")
    .max(100, "Numele de utilizator este prea lung"),
  password: z.string().min(1, "Introdu parola"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Introdu parola curentă"),
    newPassword: z
      .string()
      .min(10, "Parola trebuie să aibă minim 10 caractere")
      .regex(/[A-Z]/, "Parola trebuie să conțină cel puțin o literă mare")
      .regex(/[0-9]/, "Parola trebuie să conțină cel puțin o cifră"),
    confirmPassword: z.string().min(1, "Confirmă parola nouă"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Parolele nu coincid",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const workPointCreateSchema = z.object({
  name: z.string().trim().min(2, "Numele punctului de lucru este obligatoriu"),
  address: z.string().trim().max(500, "Adresa este prea lungă").optional(),
});

// PATCH parțial: activarea/dezactivarea trimite doar { active }; numele și
// adresa sunt validate doar dacă sunt trimise.
export const workPointUpdateSchema = workPointCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export const userCreateSchema = z.object({
  firstName: z.string().trim().min(2, "Prenumele este obligatoriu"),
  lastName: z.string().trim().min(2, "Numele este obligatoriu"),
  email: z.string().trim().email("Email invalid"),
  username: z
    .string()
    .trim()
    .min(3, "Username-ul trebuie să aibă minim 3 caractere")
    .max(100, "Username-ul este prea lung"),
  password: z
    .string()
    .min(10, "Parola trebuie să aibă minim 10 caractere")
    .regex(/[A-Z]/, "Parola trebuie să conțină cel puțin o literă mare")
    .regex(/[0-9]/, "Parola trebuie să conțină cel puțin o cifră"),
  jobTitle: z.string().trim().min(2, "Funcția este obligatorie"),
  employer: z.string().trim().min(2, "Angajatorul este obligatoriu"),
  workPointId: z.string().trim().optional().nullable(),
  hireDate: z.coerce.date({
    error: "Data angajării este invalidă",
  }),
  initialLeaveDays: z
    .number({ error: "Zilele inițiale trebuie să fie număr" })
    .min(0, "Zilele inițiale nu pot fi negative"),
  active: z.boolean().optional(),
});

export const userUpdateSchema = userCreateSchema.partial().extend({
  forcePasswordReset: z.boolean().optional(),
});

// Valorile ajung în bucle zi cu zi (ex. addWorkingDays pentru preaviz), deci
// le limităm la un an.
const MAX_CONSTRAINT_DAYS = 366;

function constraintDaysSchema() {
  return z
    .number({ error: "Numărul de zile trebuie să fie număr" })
    .int("Numărul de zile trebuie să fie întreg")
    .min(1, "Numărul minim de zile este 1")
    .max(
      MAX_CONSTRAINT_DAYS,
      `Numărul maxim de zile este ${MAX_CONSTRAINT_DAYS}`
    );
}

const constraintConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(ConstraintType.MAX_CONCURRENT_PERCENT),
    config: z.object({
      percent: z
        .number({ error: "Procentul trebuie să fie număr" })
        .min(1, "Procentul minim este 1")
        .max(100, "Procentul maxim este 100"),
    }),
  }),
  z.object({
    type: z.literal(ConstraintType.MIN_NOTICE_DAYS),
    config: z.object({
      days: constraintDaysSchema(),
    }),
  }),
  z.object({
    type: z.literal(ConstraintType.BLACKOUT_MONTH),
    config: z.object({
      month: z
        .number({ error: "Luna trebuie să fie număr" })
        .int("Luna trebuie să fie un număr întreg")
        .min(1, "Luna minimă este 1")
        .max(12, "Luna maximă este 12"),
    }),
  }),
  z.object({
    type: z.literal(ConstraintType.MAX_CONSECUTIVE_DAYS),
    config: z.object({
      days: constraintDaysSchema(),
    }),
  }),
  z.object({
    type: z.literal(ConstraintType.MIN_ONE_VACATION_OF_N_DAYS),
    config: z.object({
      days: constraintDaysSchema(),
    }),
  }),
]);

/** Primul mesaj de eroare pentru config-ul unei reguli de tipul dat, sau null. */
export function constraintConfigError(
  type: ConstraintType,
  config: unknown
): string | null {
  const parsed = constraintConfigSchema.safeParse({ type, config });
  if (parsed.success) {
    return null;
  }
  return (
    parsed.error.issues[0]?.message ?? "Configurația regulii este invalidă."
  );
}

export const constraintCreateSchema = z
  .object({
    scope: z.enum(ConstraintScope),
    type: z.enum(ConstraintType),
    workPointId: z.string().trim().optional().nullable(),
    active: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()),
  })
  .superRefine((data, ctx) => {
    const configError = constraintConfigError(data.type, data.config);
    if (configError) {
      ctx.addIssue({
        code: "custom",
        message: configError,
        path: ["config"],
      });
    }

    if (data.scope === ConstraintScope.WORK_POINT && !data.workPointId) {
      ctx.addIssue({
        code: "custom",
        message: "Selectează punctul de lucru pentru această regulă.",
        path: ["workPointId"],
      });
    }
  });

// Când payload-ul are doar `config` (sau doar `type`), ruta PATCH validează
// perechea împreună cu valoarea existentă a regulii.
export const constraintUpdateSchema = z
  .object({
    scope: z.enum(["GLOBAL", "WORK_POINT"]).optional(),
    type: z
      .enum([
        "MAX_CONCURRENT_PERCENT",
        "MIN_NOTICE_DAYS",
        "BLACKOUT_MONTH",
        "MAX_CONSECUTIVE_DAYS",
        "MIN_ONE_VACATION_OF_N_DAYS",
      ])
      .optional(),
    workPointId: z.string().optional().nullable(),
    config: z.record(z.string(), z.unknown()).optional(),
    active: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === undefined || data.config === undefined) {
      return;
    }
    const configError = constraintConfigError(data.type, data.config);
    if (configError) {
      ctx.addIssue({
        code: "custom",
        message: configError,
        path: ["config"],
      });
    }
  });

/** Dată calendaristică 'yyyy-MM-dd' → Date la miezul nopții UTC (lib/dates.ts). */
function leaveDateSchema(message: string) {
  return z.string({ error: message }).transform((value, ctx) => {
    const date = parseDateInput(value);
    if (!date) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return date;
  });
}

// Limite pentru interval: POST /api/leaves acceptă oricum doar perioade de
// până la un an de azi, iar numărarea zilelor lucrătoare parcurge intervalul
// zi cu zi, deci un interval nelimitat ar bloca serverul.
const LEAVE_MAX_SPAN_YEARS = 1;
const LEAVE_MAX_PAST_YEARS = 1;
const LEAVE_MAX_FUTURE_YEARS = 2;

const leaveRangeSchema = z
  .object({
    startDate: leaveDateSchema("Data de început este invalidă."),
    endDate: leaveDateSchema("Data de sfârșit este invalidă."),
  })
  .superRefine(({ startDate, endDate }, ctx) => {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
      return;
    }

    if (startDate > endDate) {
      ctx.addIssue({
        code: "custom",
        message: "Data de sfârșit nu poate fi înaintea datei de început.",
        path: ["endDate"],
      });
      return;
    }

    if (endDate > addYearsUTC(startDate, LEAVE_MAX_SPAN_YEARS)) {
      ctx.addIssue({
        code: "custom",
        message: "Perioada selectată nu poate depăși un an.",
        path: ["endDate"],
      });
      return;
    }

    const today = todayInBucharest();
    if (
      startDate < addYearsUTC(today, -LEAVE_MAX_PAST_YEARS) ||
      endDate > addYearsUTC(today, LEAVE_MAX_FUTURE_YEARS)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Perioada selectată este prea departe în trecut sau în viitor.",
        path: ["startDate"],
      });
    }
  });

export const leaveCreateSchema = leaveRangeSchema;

export const leaveValidateQuerySchema = leaveRangeSchema;

export type LeaveCreateInput = z.infer<typeof leaveCreateSchema>;
