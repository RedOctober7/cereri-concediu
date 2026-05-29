import { LeaveStatus } from "@prisma/client";
import { startOfDay } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db";

export async function getEmployeeDashboardStats(userId: string) {
  const now = toZonedTime(new Date(), "Europe/Bucharest");
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const yearStart = startOfDay(new Date(year, 0, 1));
  const yearEnd = startOfDay(new Date(year, 11, 31));
  const today = startOfDay(now);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { availableDays: true },
  });

  const [takenThisYear, monthlyAccrual, nextApproved, recentLeaves] =
    await Promise.all([
      prisma.leaveRequest.aggregate({
        _sum: { workingDays: true },
        where: {
          userId,
          status: { in: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN] },
          startDate: { gte: yearStart, lte: yearEnd },
        },
      }),
      prisma.leaveAccrual.findUnique({
        where: {
          userId_month_year: { userId, month, year },
        },
      }),
      prisma.leaveRequest.findFirst({
        where: {
          userId,
          status: { in: [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN] },
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
    takenThisYear: takenThisYear._sum.workingDays ?? 0,
    monthlyAccrualDays: monthlyAccrual?.days ?? 0,
    nextApproved,
    recentLeaves,
  };
}
