import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { todayInBucharest, utcDate } from '@/lib/dates';
import ExcelJS from 'exceljs';

export async function GET() {
  const auth = await requireAdminSession();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Anul curent în România; startDate este `@db.Date` (miezul nopții UTC), deci
  // limitele anului se construiesc tot în UTC (lib/dates.ts).
  const year = todayInBucharest().getUTCFullYear();

  const users = await prisma.user.findMany({
    where: { active: true, deletedAt: null, role: 'EMPLOYEE' },
    include: {
      workPoint: true,
      leaveRequests: {
        where: {
          status: { in: ['APPROVED_AUTO', 'APPROVED_ADMIN'] },
          startDate: {
            gte: utcDate(year, 0, 1),
            lt: utcDate(year + 1, 0, 1),
          },
        },
      },
      accruals: {
        where: { year },
      },
    },
    orderBy: { lastName: 'asc' },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Situație zile concediu');

  sheet.columns = [
    { header: 'Nume', key: 'name', width: 25 },
    { header: 'Funcție', key: 'jobTitle', width: 20 },
    { header: 'Punct de lucru', key: 'workPoint', width: 20 },
    { header: 'Zile inițiale', key: 'initial', width: 15 },
    { header: 'Zile acumulate (an curent)', key: 'accrued', width: 25 },
    { header: 'Zile luate (an curent)', key: 'used', width: 20 },
    { header: 'Zile disponibile', key: 'available', width: 18 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  for (const user of users) {
    const accrued = user.accruals.reduce((sum, a) => sum + a.days, 0);
    const used = user.leaveRequests.reduce((sum, r) => sum + r.workingDays, 0);

    sheet.addRow({
      name: `${user.lastName} ${user.firstName}`,
      jobTitle: user.jobTitle,
      workPoint: user.workPoint?.name || '-',
      initial: user.initialLeaveDays,
      accrued: accrued,
      used: used,
      available: user.availableDays,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="situatie-zile-${year}.xlsx"`,
    },
  });
}