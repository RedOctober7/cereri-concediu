import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const SERVER_ERROR = {
  error: "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
};

/** 400 cu primul mesaj zod și câmpul lui (formularul îl arată lângă câmp). */
export function validationError(issue: { message: string; path: PropertyKey[] } | undefined) {
  const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
  return NextResponse.json(
    { error: issue?.message ?? "Date invalide.", ...(field ? { field } : {}) },
    { status: 400 }
  );
}

/**
 * Punctul de lucru al unei reguli noi sau mutate trebuie să existe și să fie activ.
 * Întoarce numele lui (pentru jurnal) sau un răspuns 400.
 */
export async function checkWorkPoint(
  workPointId: string
): Promise<{ name: string } | { response: NextResponse }> {
  const workPoint = await prisma.workPoint.findUnique({
    where: { id: workPointId },
    select: { name: true, active: true },
  });
  if (!workPoint?.active) {
    return {
      response: NextResponse.json(
        {
          error: "Punctul de lucru selectat nu există sau este inactiv.",
          field: "workPointId",
        },
        { status: 400 }
      ),
    };
  }
  return { name: workPoint.name };
}
