import { NextResponse, after } from "next/server";
import {
  RESET_REQUEST_MESSAGE,
  allowResetRequest,
  clientIp,
  processResetRequest,
  resetRequestSchema,
} from "@/lib/password-reset";

/**
 * „Ai uitat parola?”: primește { identifier } (utilizator sau email). Răspunsul e
 * același pentru orice cont, existent sau nu; căutarea contului, tokenul și emailul
 * rulează după răspuns, ca nici durata răspunsului să nu arate dacă un cont există.
 * Ruta e publică (nu e în matcher-ul din proxy.ts).
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const parsed = resetRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Date invalide." },
        { status: 400 }
      );
    }

    const { identifier } = parsed.data;
    const ip = clientIp(request);
    if (!(await allowResetRequest(ip, identifier))) {
      return NextResponse.json(
        { error: "Prea multe cereri de resetare. Reîncearcă peste 15 minute." },
        { status: 429 }
      );
    }

    after(async () => {
      try {
        await processResetRequest(identifier, ip);
      } catch (error) {
        console.error("[Resetare parolă] Cererea nu a putut fi procesată:", error);
      }
    });

    return NextResponse.json({ message: RESET_REQUEST_MESSAGE });
  } catch (error) {
    console.error("[Resetare parolă] Eroare cerere:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
