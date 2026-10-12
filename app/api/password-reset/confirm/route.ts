import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/log";
import {
  RESET_INVALID_TOKEN_MESSAGE,
  allowResetConfirm,
  clientIp,
  confirmPasswordReset,
  resetConfirmSchema,
} from "@/lib/password-reset";

/**
 * Setează parola nouă cu tokenul din linkul de resetare: { token, newPassword,
 * confirmPassword }. Marchează tokenul ca folosit, ridică obligația de schimbare a
 * parolei și scrie în audit. Ruta e publică (nu e în matcher-ul din proxy.ts).
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = resetConfirmSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Date invalide." },
        { status: 400 }
      );
    }

    const ip = clientIp(request);
    if (!(await allowResetConfirm(ip))) {
      return NextResponse.json(
        { error: "Prea multe încercări. Reîncearcă peste 15 minute." },
        { status: 429 }
      );
    }

    const result = await confirmPasswordReset(parsed.data.token, parsed.data.newPassword);
    if (!result.ok) {
      // `code` îi spune formularului că linkul (nu parola) e problema.
      return NextResponse.json(
        { error: RESET_INVALID_TOKEN_MESSAGE, code: "INVALID_TOKEN" },
        { status: 400 }
      );
    }

    try {
      await createAuditLog({
        userId: result.userId,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: "User",
        entityId: result.userId,
        ipAddress: ip,
      });
    } catch (error) {
      // Parola e deja schimbată: un audit eșuat nu trebuie să pară o resetare eșuată.
      console.error("[Resetare parolă] Auditul nu a putut fi scris:", error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Resetare parolă] Eroare confirmare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
