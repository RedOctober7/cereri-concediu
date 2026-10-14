import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-session";
import { leaveValidateQuerySchema } from "@/lib/validators";
import { validateLeaveRequest } from "@/lib/constraints/validate";
import { prisma } from "@/lib/db";
import { findColleagueAbsences, toAbsenceViews } from "@/lib/leaves/colleague-absences";
import { formatPeriod } from "@/components/admin/format";

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

    if (validation.blockingError) {
      return NextResponse.json(
        { error: validation.blockingError },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: { availableDays: true, workPointId: true },
    });

    // Doar concediile aprobate: angajatul vede în calendar tot atât despre colegi.
    const colleagueAbsences = await findColleagueAbsences(
      {
        userId: auth.session.user.id,
        workPointId: user?.workPointId ?? null,
        start: parsed.data.startDate,
        end: parsed.data.endDate,
      },
      { includePending: false }
    );

    return NextResponse.json({
      data: {
        ...validation,
        availableDays: user?.availableDays ?? 0,
        // „Nume Prenume”, ca în calendarul de lângă previzualizare.
        colleagueAbsences: toAbsenceViews(colleagueAbsences, formatPeriod, "lastFirst"),
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
