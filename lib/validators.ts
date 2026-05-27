import { z } from "zod";

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
