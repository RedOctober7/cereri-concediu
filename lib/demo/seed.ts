import bcrypt from "bcryptjs";
import {
  ConstraintScope,
  ConstraintType,
  LeaveStatus,
  Role,
  type PrismaClient,
} from "@prisma/client";
import { addDaysUTC, todayInBucharest, utcDate } from "@/lib/dates";
import { calculateWorkingDays } from "@/lib/holidays";

/**
 * Date demo fictive pentru o instanță publică (portofoliu). Toate datele sunt relative
 * la ziua de azi, ca demo-ul să arate mereu actual. ȘTERGE tot conținutul bazei.
 */

import { DEMO_ADMIN_USERNAME, DEMO_EMPLOYEE_USERNAME, DEMO_PASSWORD } from "@/lib/demo/accounts";

export { DEMO_ADMIN_USERNAME, DEMO_EMPLOYEE_USERNAME, DEMO_PASSWORD };

const COMPANY = "Farmacia Exemplu SRL";
const MONTHLY_ACCRUAL = 1.75;

type Person = {
  username: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  workPoint: 0 | 1 | 2;
  initialLeaveDays: number;
  hiredMonthsAgo: number;
};

const PEOPLE: Person[] = [
  { username: DEMO_EMPLOYEE_USERNAME, firstName: "Ana", lastName: "Ionescu", jobTitle: "Farmacist", workPoint: 0, initialLeaveDays: 16, hiredMonthsAgo: 30 },
  { username: "mihai.popa", firstName: "Mihai", lastName: "Popa", jobTitle: "Farmacist șef", workPoint: 0, initialLeaveDays: 12, hiredMonthsAgo: 60 },
  { username: "ioana.stan", firstName: "Ioana", lastName: "Stan", jobTitle: "Asistent farmacie", workPoint: 0, initialLeaveDays: 4, hiredMonthsAgo: 18 },
  { username: "andrei.dumitru", firstName: "Andrei", lastName: "Dumitru", jobTitle: "Asistent farmacie", workPoint: 0, initialLeaveDays: 2, hiredMonthsAgo: 9 },
  { username: "elena.marin", firstName: "Elena", lastName: "Marin", jobTitle: "Farmacist", workPoint: 1, initialLeaveDays: 10, hiredMonthsAgo: 42 },
  { username: "radu.georgescu", firstName: "Radu", lastName: "Georgescu", jobTitle: "Asistent farmacie", workPoint: 1, initialLeaveDays: 6, hiredMonthsAgo: 24 },
  { username: "cristina.toma", firstName: "Cristina", lastName: "Toma", jobTitle: "Farmacist", workPoint: 1, initialLeaveDays: 0, hiredMonthsAgo: 5 },
  { username: "bogdan.ilie", firstName: "Bogdan", lastName: "Ilie", jobTitle: "Gestionar", workPoint: 2, initialLeaveDays: 9, hiredMonthsAgo: 36 },
  { username: "simona.lungu", firstName: "Simona", lastName: "Lungu", jobTitle: "Operator recepție marfă", workPoint: 2, initialLeaveDays: 3, hiredMonthsAgo: 14 },
  { username: "vlad.niculescu", firstName: "Vlad", lastName: "Niculescu", jobTitle: "Șofer distribuție", workPoint: 2, initialLeaveDays: 5, hiredMonthsAgo: 20 },
];

/** Prima zi lucrătoare de la `date` încolo (luni-vineri, fără sărbători legale). */
function nextWorkingDay(date: Date): Date {
  let day = date;
  while (calculateWorkingDays(day, day) === 0) {
    day = addDaysUTC(day, 1);
  }
  return day;
}

/** Interval care începe în prima zi lucrătoare după `offsetDays` și are `workingDays` zile lucrătoare. */
function period(today: Date, offsetDays: number, workingDays: number): { start: Date; end: Date; days: number } {
  const start = nextWorkingDay(addDaysUTC(today, offsetDays));
  let end = start;
  while (calculateWorkingDays(start, end) < workingDays) {
    end = addDaysUTC(end, 1);
  }
  return { start, end, days: calculateWorkingDays(start, end) };
}

/** Zile până la 8 decembrie (anul curent sau următorul): cererea cade în luna restricționată a depozitului. */
function daysUntilDecember8(today: Date): number {
  let target = utcDate(today.getUTCFullYear(), 11, 8);
  if (target.getTime() <= today.getTime()) {
    target = utcDate(today.getUTCFullYear() + 1, 11, 8);
  }
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function monthsAgo(today: Date, months: number): Date {
  return utcDate(today.getUTCFullYear(), today.getUTCMonth() - months, 1);
}

type DemoClient = Pick<
  PrismaClient,
  "$transaction" | "auditLog" | "passwordReset" | "leaveAccrual" | "leaveRequest" | "constraint" | "user" | "workPoint"
>;

export async function seedDemo(prisma: DemoClient, now: Date = new Date()) {
  const today = todayInBucharest(now);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.passwordReset.deleteMany(),
    prisma.leaveAccrual.deleteMany(),
    prisma.leaveRequest.deleteMany(),
    prisma.constraint.deleteMany(),
    prisma.user.deleteMany(),
    prisma.workPoint.deleteMany(),
  ]);

  const workPoints = await Promise.all(
    [
      { name: "Farmacia Centru", address: "Str. Republicii 12, Brașov" },
      { name: "Farmacia Tractorul", address: "Bd. 15 Noiembrie 48, Brașov" },
      { name: "Depozit central", address: "Str. Zizinului 110, Brașov" },
    ].map((data) => prisma.workPoint.create({ data }))
  );

  const admin = await prisma.user.create({
    data: {
      username: DEMO_ADMIN_USERNAME,
      email: "admin.demo@exemplu.ro",
      passwordHash,
      firstName: "Daniela",
      lastName: "Moraru",
      jobTitle: "Manager resurse umane",
      employer: COMPANY,
      role: Role.ADMIN,
      hireDate: monthsAgo(today, 72),
      initialLeaveDays: 0,
      availableDays: 0,
      mustChangePassword: false,
      active: true,
    },
  });

  const users = [];
  for (const person of PEOPLE) {
    const hireDate = monthsAgo(today, person.hiredMonthsAgo);
    users.push(
      await prisma.user.create({
        data: {
          username: person.username,
          email: `${person.username}@exemplu.ro`,
          passwordHash,
          firstName: person.firstName,
          lastName: person.lastName,
          jobTitle: person.jobTitle,
          employer: COMPANY,
          role: Role.EMPLOYEE,
          workPointId: workPoints[person.workPoint].id,
          hireDate,
          initialLeaveDays: person.initialLeaveDays,
          availableDays: person.initialLeaveDays,
          mustChangePassword: false,
          active: true,
          // Soldul inițial reprezintă zilele reportate din anul trecut: contul pare creat
          // atunci, ca aceste zile să aparțină anului trecut (openingBalanceYear) și
          // avertizarea despre zilele care expiră să aibă ce arăta.
          createdAt: new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 15, 9)),
        },
      })
    );
  }

  // Acumulări lunare pentru lunile încheiate din anul curent (cel mult de la angajare).
  const year = today.getUTCFullYear();
  for (const [index, user] of users.entries()) {
    const hire = monthsAgo(today, PEOPLE[index].hiredMonthsAgo);
    const firstMonth = hire.getUTCFullYear() === year ? hire.getUTCMonth() + 2 : 1;
    const months: number[] = [];
    for (let month = firstMonth; month <= today.getUTCMonth(); month++) {
      months.push(month);
    }
    if (months.length > 0) {
      await prisma.leaveAccrual.createMany({
        data: months.map((month) => ({ userId: user.id, month, year, days: MONTHLY_ACCRUAL })),
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { availableDays: { increment: months.length * MONTHLY_ACCRUAL } },
      });
    }
  }

  type LeaveSpec = {
    user: number;
    offsetDays: number;
    workingDays: number;
    status: LeaveStatus;
    createdDaysAgo: number;
    violations?: string[];
    rejectionReason?: string;
  };
  const leaves: LeaveSpec[] = [
    // Concedii trecute, aprobate.
    { user: 0, offsetDays: -120, workingDays: 10, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 150 },
    { user: 1, offsetDays: -60, workingDays: 5, status: LeaveStatus.APPROVED_AUTO, createdDaysAgo: 80 },
    { user: 4, offsetDays: -45, workingDays: 10, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 70 },
    { user: 7, offsetDays: -90, workingDays: 3, status: LeaveStatus.APPROVED_AUTO, createdDaysAgo: 100 },
    // În concediu acum.
    { user: 2, offsetDays: -2, workingDays: 5, status: LeaveStatus.APPROVED_AUTO, createdDaysAgo: 25 },
    { user: 8, offsetDays: -1, workingDays: 3, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 12 },
    // Urmează.
    { user: 5, offsetDays: 7, workingDays: 5, status: LeaveStatus.APPROVED_AUTO, createdDaysAgo: 6 },
    { user: 0, offsetDays: 21, workingDays: 3, status: LeaveStatus.APPROVED_AUTO, createdDaysAgo: 4 },
    // În așteptarea deciziei adminului.
    { user: 3, offsetDays: 1, workingDays: 3, status: LeaveStatus.PENDING_ADMIN, createdDaysAgo: 0, violations: ["Preaviz minim 5 zile lucrătoare (cererea trebuia depusă cu cel puțin 5 zile înainte)"] },
    { user: 6, offsetDays: 20, workingDays: 8, status: LeaveStatus.PENDING_ADMIN, createdDaysAgo: 2, violations: ["Cererea depășește zilele disponibile (7 disponibile, 8 solicitate)"] },
    { user: 9, offsetDays: daysUntilDecember8(today), workingDays: 5, status: LeaveStatus.PENDING_ADMIN, createdDaysAgo: 1, violations: ["Luna Decembrie este perioadă restricționată"] },
    // Respinse și anulate.
    { user: 6, offsetDays: -20, workingDays: 2, status: LeaveStatus.REJECTED, createdDaysAgo: 30, rejectionReason: "Inventar programat în aceeași săptămână." },
    { user: 1, offsetDays: 40, workingDays: 2, status: LeaveStatus.CANCELLED, createdDaysAgo: 9 },
  ];

  for (const spec of leaves) {
    const { start, end, days } = period(today, spec.offsetDays, spec.workingDays);
    const user = users[spec.user];
    const createdAt = new Date(now.getTime() - spec.createdDaysAgo * 86_400_000);
    const approved = spec.status === LeaveStatus.APPROVED_AUTO || spec.status === LeaveStatus.APPROVED_ADMIN;
    const leave = await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        startDate: start,
        endDate: end,
        workingDays: days,
        status: spec.status,
        violationReasons: spec.violations ?? [],
        rejectionReason: spec.rejectionReason ?? null,
        approvedById: spec.status === LeaveStatus.APPROVED_ADMIN ? admin.id : null,
        approvedAt: approved ? new Date(createdAt.getTime() + 3_600_000) : null,
        createdAt,
      },
    });
    if (approved) {
      await prisma.user.update({ where: { id: user.id }, data: { availableDays: { decrement: days } } });
    }
    if (spec.status === LeaveStatus.APPROVED_ADMIN || spec.status === LeaveStatus.REJECTED) {
      await prisma.auditLog.create({
        data: {
          userId: admin.id,
          action: spec.status === LeaveStatus.REJECTED ? "LEAVE_REJECTED" : "LEAVE_ADMIN_APPROVED",
          entityType: "LeaveRequest",
          entityId: leave.id,
          details: spec.rejectionReason ? { rejectionReason: spec.rejectionReason } : { workingDays: days },
          createdAt: new Date(createdAt.getTime() + 3_600_000),
        },
      });
    }
  }

  await prisma.constraint.createMany({
    data: [
      { scope: ConstraintScope.GLOBAL, type: ConstraintType.MIN_NOTICE_DAYS, config: { days: 5 } },
      { scope: ConstraintScope.GLOBAL, type: ConstraintType.MIN_ONE_VACATION_OF_N_DAYS, config: { days: 10 } },
      { scope: ConstraintScope.WORK_POINT, type: ConstraintType.MAX_CONCURRENT_PERCENT, workPointId: workPoints[0].id, config: { percent: 50 } },
      { scope: ConstraintScope.WORK_POINT, type: ConstraintType.BLACKOUT_MONTH, workPointId: workPoints[2].id, config: { month: 12 } },
    ],
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "CREATE_WORK_POINT",
      entityType: "WorkPoint",
      entityId: workPoints[2].id,
      details: { name: workPoints[2].name },
      createdAt: new Date(now.getTime() - 200 * 86_400_000),
    },
  });

  return { workPoints: workPoints.length, users: users.length + 1, leaves: leaves.length };
}
