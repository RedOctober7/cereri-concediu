import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-session";
import { leaveValidateQuerySchema } from "@/lib/validators";
import { validateLeaveRequest } from "@/lib/constraints/validate";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const auth = await requireSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const parsed = leaveValidateQuerySchema.safeParse({
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    });

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Date invalide.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const validation = await validateLeaveRequest(
      auth.session.user.id,
      parsed.data.startDate,
      parsed.data.endDate
    );

    const user = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: { availableDays: true },
    });

    return NextResponse.json({
      data: {
        ...validation,
        availableDays: user?.availableDays ?? 0,
      },
    });
  } catch (error) {
    console.error("[Leaves] Eroare validare:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
