import { LeaveStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { todayInBucharest } from "@/lib/dates";
import { overlapsYear, workingDaysInYear } from "@/lib/leaves/year-days";

const APPROVED = [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN];

export async function getEmployeeDashboardStats(userId: string) {
  const today = todayInBucharest();
  const year = today.getUTCFullYear();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { availableDays: true },
  });

  const [approvedThisYear, lastAccrual, nextApproved, recentLeaves] = await Promise.all([
    // Și concediile peste Revelion: se numără doar zilele din anul curent.
    prisma.leaveRequest.findMany({
      where: { userId, status: { in: APPROVED }, ...overlapsYear(year) },
      select: { startDate: true, endDate: true, workingDays: true },
    }),
    // Cronul lunar scrie pe 1 ale lunii rândul lunii încheiate, deci luna curentă nu
    // are încă rând: arătăm ultima acumulare, cu luna ei.
    prisma.leaveAccrual.findFirst({
      where: { userId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { month: true, year: true, days: true },
    }),
    prisma.leaveRequest.findFirst({
      where: {
        userId,
        status: { in: APPROVED },
        startDate: { gte: today },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    availableDays: user?.availableDays ?? 0,
    takenThisYear: approvedThisYear.reduce((sum, leave) => sum + workingDaysInYear(leave, year), 0),
    lastAccrual,
    nextApproved,
    recentLeaves,
  };
}
