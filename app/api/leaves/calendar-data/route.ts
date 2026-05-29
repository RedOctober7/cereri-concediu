import { NextResponse } from "next/server";
import { LeaveStatus } from "@prisma/client";
import { format } from "date-fns";
import { prisma } from "@/lib/db";
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
    const year = Number(searchParams.get("year") ?? new Date().getFullYear());

    const user = await prisma.user.findUnique({
      where: { id: auth.session.user.id },
      select: { workPointId: true },
    });

    const holidays = getRomanianHolidays(year).map((date) => ({
      date: format(date, "yyyy-MM-dd"),
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
        ownLeaveDays.push(format(day, "yyyy-MM-dd"));
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
        const key = format(day, "yyyy-MM-dd");
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
    for (let month = 0; month < 12; month++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        if (isWeekend(date)) {
          weekendDays.push(format(date, "yyyy-MM-dd"));
        }
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
