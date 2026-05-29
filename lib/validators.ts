import { z } from "zod";
import { ConstraintScope, ConstraintType } from "@prisma/client";

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

export const workPointUpdateSchema = workPointCreateSchema.extend({
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

const constraintConfigSchema = z.union([
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
      days: z
        .number({ error: "Numărul de zile trebuie să fie număr" })
        .min(1, "Numărul minim de zile este 1"),
    }),
  }),
  z.object({
    type: z.literal(ConstraintType.BLACKOUT_MONTH),
    config: z.object({
      month: z
        .number({ error: "Luna trebuie să fie număr" })
        .min(1, "Luna minimă este 1")
        .max(12, "Luna maximă este 12"),
    }),
  }),
  z.object({
    type: z.literal(ConstraintType.MAX_CONSECUTIVE_DAYS),
    config: z.object({
      days: z
        .number({ error: "Numărul de zile trebuie să fie număr" })
        .min(1, "Numărul minim de zile este 1"),
    }),
  }),
  z.object({
    type: z.literal(ConstraintType.MIN_ONE_VACATION_OF_N_DAYS),
    config: z.object({
      days: z
        .number({ error: "Numărul de zile trebuie să fie număr" })
        .min(1, "Numărul minim de zile este 1"),
    }),
  }),
]);

export const constraintCreateSchema = z
  .object({
    scope: z.enum(ConstraintScope),
    type: z.enum(ConstraintType),
    workPointId: z.string().trim().optional().nullable(),
    active: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()),
  })
  .superRefine((data, ctx) => {
    const parsed = constraintConfigSchema.safeParse({
      type: data.type,
      config: data.config,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      ctx.addIssue({
        code: "custom",
        message: firstIssue?.message ?? "Configurația regulii este invalidă.",
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

export const constraintUpdateSchema = z.object({
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
});

export const leaveCreateSchema = z.object({
  startDate: z.coerce.date({ error: "Data de început este invalidă" }),
  endDate: z.coerce.date({ error: "Data de sfârșit este invalidă" }),
});

export const leaveValidateQuerySchema = z.object({
  startDate: z.coerce.date({ error: "Data de început este invalidă" }),
  endDate: z.coerce.date({ error: "Data de sfârșit este invalidă" }),
});

export type LeaveCreateInput = z.infer<typeof leaveCreateSchema>;
