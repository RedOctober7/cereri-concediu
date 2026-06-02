import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ExcelJS from 'exceljs';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { active: true, deletedAt: null, role: 'EMPLOYEE' },
    include: {
      workPoint: true,
      leaveRequests: {
        where: {
          status: { in: ['APPROVED_AUTO', 'APPROVED_ADMIN'] },
          startDate: {
            gte: new Date(new Date().getFullYear(), 0, 1),
          },
        },
      },
      accruals: {
        where: { year: new Date().getFullYear() },
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
      'Content-Disposition': `attachment; filename="situatie-zile-${new Date().getFullYear()}.xlsx"`,
    },
  });
}