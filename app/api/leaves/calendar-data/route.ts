import { NextResponse } from "next/server";
import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  addDaysUTC,
  toDateOnlyString,
  todayInBucharest,
  utcDate,
} from "@/lib/dates";
import { requireSession } from "@/lib/api-session";
import {
  eachDayInRange,
  getHolidayName,
  getRomanianHolidays,
  isWeekend,
} from "@/lib/holidays";

export async function GET(request: Request) {
  try {
    const auth = await requireSession();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const year = Number(
      searchParams.get("year") ?? todayInBucharest().getUTCFullYear()
    );

    const user = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: { workPointId: true },
    });

    const holidays = getRomanianHolidays(year).map((date) => ({
      date: toDateOnlyString(date),
      name: getHolidayName(date) ?? "Sărbătoare legală",
    }));

    const ownLeaves = await prisma.leaveRequest.findMany({
      where: {
        userId: auth.session.user.id,
        status: { not: LeaveStatus.REJECTED },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    const ownLeaveDays: string[] = [];
    for (const leave of ownLeaves) {
      for (const day of eachDayInRange(leave.startDate, leave.endDate)) {
        ownLeaveDays.push(toDateOnlyString(day));
      }
    }

    const colleagueLeaves = user?.workPointId
      ? await prisma.leaveRequest.findMany({
          where: {
            userId: { not: auth.session.user.id },
            user: { workPointId: user.workPointId },
            status: {
              in: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN],
            },
          },
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        })
      : [];

    const colleagueDaysMap = new Map<string, string[]>();

    for (const leave of colleagueLeaves) {
      for (const day of eachDayInRange(leave.startDate, leave.endDate)) {
        const key = toDateOnlyString(day);
        const name = `${leave.user.lastName} ${leave.user.firstName}`;
        const existing = colleagueDaysMap.get(key) ?? [];
        if (!existing.includes(name)) {
          existing.push(name);
        }
        colleagueDaysMap.set(key, existing);
      }
    }

    const colleagueDays = Array.from(colleagueDaysMap.entries()).map(
      ([date, names]) => ({ date, names })
    );

    const weekendDays: string[] = [];
    const nextYearStart = utcDate(year + 1, 0, 1);
    for (
      let date = utcDate(year, 0, 1);
      date < nextYearStart;
      date = addDaysUTC(date, 1)
    ) {
      if (isWeekend(date)) {
        weekendDays.push(toDateOnlyString(date));
      }
    }

    return NextResponse.json({
      data: {
        holidays,
        ownLeaveDays,
        colleagueDays,
        weekendDays,
      },
    });
  } catch (error) {
    console.error("[Leaves] Eroare calendar-data:", error);
    return NextResponse.json(
      {
        error:
          "A apărut o eroare. Reîncearcă în câteva momente sau contactează un administrator.",
      },
      { status: 500 }
    );
  }
}
