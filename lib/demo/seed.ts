import bcrypt from "bcryptjs";
import {
  ConstraintScope,
  ConstraintType,
  LeaveStatus,
  Role,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { addDaysUTC, todayInBucharest, utcDate } from "@/lib/dates";
import { calculateWorkingDays } from "@/lib/holidays";
import { nextExpiringYear } from "@/lib/leaves/rollover";
import { MONTHLY_ACCRUAL_DAYS } from "@/lib/leaves/accrual";
import {
  balanceViolationMessage,
  blackoutMonthMessage,
  minNoticeMessage,
} from "@/lib/constraints/messages";

/**
 * Date demo fictive pentru o instanță publică (portofoliu). Toate datele sunt relative
 * la ziua de azi, ca demo-ul să arate mereu actual. ȘTERGE tot conținutul bazei.
 */

import { DEMO_ADMIN_USERNAME, DEMO_EMPLOYEE_USERNAME, DEMO_PASSWORD } from "@/lib/demo/accounts";

export { DEMO_ADMIN_USERNAME, DEMO_EMPLOYEE_USERNAME, DEMO_PASSWORD };

const COMPANY = "Farmacia Exemplu SRL";

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

/**
 * Momentul la care par create conturile demo: 15 ianuarie din anul ale cărui zile expiră
 * următoarele (anul trecut din iulie până în decembrie, acum doi ani din ianuarie până în
 * iunie). Soldul inițial aparține acelui an (openingBalanceYear), deci avertizarea despre
 * zilele care expiră are ce arăta în orice lună în care se refac datele.
 */
export function demoAccountsCreatedAt(now: Date): Date {
  return new Date(Date.UTC(nextExpiringYear(now), 0, 15, 9));
}

// Cheia lock-ului Postgres care împiedică două refaceri simultane (ex. un cron livrat de
// două ori): a doua așteaptă să se termine prima.
const DEMO_RESET_LOCK = 727001;

type DemoClient = Pick<PrismaClient, "$transaction">;

/**
 * Șterge tot și pune la loc datele demo, într-o singură tranzacție: dacă ceva eșuează
 * pe parcurs, baza rămâne cu datele de dinainte, nu goală sau pe jumătate refăcută.
 */
export async function seedDemo(client: DemoClient, now: Date = new Date()) {
  const today = todayInBucharest(now);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  return client.$transaction(
    async (prisma) => {
      await prisma.$executeRaw`SELECT pg_advisory_xact_lock(${DEMO_RESET_LOCK}::bigint)`;
      return writeDemoData(prisma, { now, today, passwordHash });
    },
    // Câteva zeci de interogări, una după alta: mult peste cele 5 secunde implicite.
    { maxWait: 10_000, timeout: 45_000 }
  );
}

async function writeDemoData(
  prisma: Prisma.TransactionClient,
  { now, today, passwordHash }: { now: Date; today: Date; passwordHash: string }
) {
  await prisma.auditLog.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.leaveAccrual.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.constraint.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workPoint.deleteMany();

  const workPoints = [];
  for (const data of [
    { name: "Farmacia Centru", address: "Str. Republicii 12, Brașov" },
    { name: "Farmacia Tractorul", address: "Bd. 15 Noiembrie 48, Brașov" },
    { name: "Depozit central", address: "Str. Zizinului 110, Brașov" },
  ]) {
    workPoints.push(await prisma.workPoint.create({ data }));
  }

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

  const accountsCreatedAt = demoAccountsCreatedAt(now);
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
          // Soldul inițial reprezintă zilele reportate dintr-un an anterior: contul pare
          // creat atunci (demoAccountsCreatedAt), ca avertizarea despre zilele care
          // expiră să aibă ce arăta.
          createdAt: accountsCreatedAt,
        },
      })
    );
  }

  // Acumulări lunare, ca le-ar fi scris cronul (lunile încheiate, inclusiv luna angajării,
  // pentru că angajarea e pe 1): de la angajare pentru cei angajați în ultimele 12 luni,
  // altfel din ianuarie al anului lunii trecute (soldul inițial acoperă restul). Fiecare
  // angajat are astfel lunile la rând până luna trecută, iar cronul nu mai are ce completa.
  const lastMonth = monthsAgo(today, 1);
  const balances = PEOPLE.map((person) => person.initialLeaveDays);
  for (const [index, user] of users.entries()) {
    const person = PEOPLE[index];
    let month =
      person.hiredMonthsAgo <= 12
        ? monthsAgo(today, person.hiredMonthsAgo)
        : utcDate(lastMonth.getUTCFullYear(), 0, 1);
    const months: { year: number; month: number }[] = [];
    while (month <= lastMonth) {
      months.push({ year: month.getUTCFullYear(), month: month.getUTCMonth() + 1 });
      month = utcDate(month.getUTCFullYear(), month.getUTCMonth() + 1, 1);
    }
    if (months.length > 0) {
      await prisma.leaveAccrual.createMany({
        data: months.map((entry) => ({ userId: user.id, ...entry, days: MONTHLY_ACCRUAL_DAYS })),
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { availableDays: { increment: months.length * MONTHLY_ACCRUAL_DAYS } },
      });
      balances[index] += months.length * MONTHLY_ACCRUAL_DAYS;
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
    { user: 1, offsetDays: -60, workingDays: 5, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 80 },
    { user: 4, offsetDays: -45, workingDays: 10, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 70 },
    { user: 7, offsetDays: -90, workingDays: 3, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 100 },
    // În concediu acum.
    { user: 2, offsetDays: -2, workingDays: 5, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 25 },
    { user: 8, offsetDays: -1, workingDays: 3, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 12 },
    // Urmează.
    { user: 5, offsetDays: 7, workingDays: 5, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 6 },
    { user: 0, offsetDays: 21, workingDays: 3, status: LeaveStatus.APPROVED_ADMIN, createdDaysAgo: 4 },
    // În așteptarea deciziei adminului (depășirea soldului se calculează mai jos, din soldul real).
    { user: 3, offsetDays: 1, workingDays: 3, status: LeaveStatus.PENDING_ADMIN, createdDaysAgo: 0, violations: [minNoticeMessage(5)] },
    { user: 6, offsetDays: 20, workingDays: 10, status: LeaveStatus.PENDING_ADMIN, createdDaysAgo: 2 },
    { user: 9, offsetDays: daysUntilDecember8(today), workingDays: 5, status: LeaveStatus.PENDING_ADMIN, createdDaysAgo: 1, violations: [blackoutMonthMessage(12)] },
    // Respinse și anulate.
    { user: 6, offsetDays: -20, workingDays: 2, status: LeaveStatus.REJECTED, createdDaysAgo: 30, rejectionReason: "Inventar programat în aceeași săptămână." },
    { user: 1, offsetDays: 40, workingDays: 2, status: LeaveStatus.CANCELLED, createdDaysAgo: 9 },
  ];

  const pendingDays = PEOPLE.map(() => 0);
  for (const spec of leaves) {
    const { start, end, days } = period(today, spec.offsetDays, spec.workingDays);
    const user = users[spec.user];
    const createdAt = new Date(now.getTime() - spec.createdDaysAgo * 86_400_000);
    const approved = spec.status === LeaveStatus.APPROVED_AUTO || spec.status === LeaveStatus.APPROVED_ADMIN;
    const violations = [...(spec.violations ?? [])];
    if (spec.status === LeaveStatus.PENDING_ADMIN) {
      // Aceeași verificare ca validateLeaveRequest, ca textul să se potrivească cu soldul afișat.
      const freeDays = Math.round((balances[spec.user] - pendingDays[spec.user]) * 100) / 100;
      if (days > freeDays) {
        violations.unshift(balanceViolationMessage(freeDays, days, pendingDays[spec.user]));
      }
      pendingDays[spec.user] += days;
    }
    if (approved) {
      balances[spec.user] -= days;
    }
    const leave = await prisma.leaveRequest.create({
      data: {
        userId: user.id,
        startDate: start,
        endDate: end,
        workingDays: days,
        status: spec.status,
        violationReasons: violations,
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
