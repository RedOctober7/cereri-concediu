import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { LeaveStatus, Prisma } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { authOptions } from "@/lib/auth";
import { APP_TIME_ZONE } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  LeavesAdmin,
  type AdminLeaveRow,
  type StatusTab,
} from "@/components/admin/LeavesAdmin";
import { formatPeriod, formatTimestamp } from "./format";
import {
  NO_WORK_POINT,
  STATUS_FILTERS,
  cereriHref,
  parseCereriQuery,
} from "./query";

const PAGE_SIZE = 20;

export default async function AdminCereriPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const query = parseCereriQuery(await searchParams);
  const activeFilter = STATUS_FILTERS.find((filter) => filter.value === query.status)!;

  // Căutare după nume: fiecare cuvânt trebuie să apară în prenume sau nume.
  const terms = query.q.split(/\s+/).filter(Boolean).slice(0, 5);
  const userWhere: Prisma.UserWhereInput = {
    ...(terms.length > 0
      ? {
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term, mode: "insensitive" as const } },
              { lastName: { contains: term, mode: "insensitive" as const } },
            ],
          })),
        }
      : {}),
    ...(query.wp === NO_WORK_POINT
      ? { workPointId: null }
      : query.wp
        ? { workPointId: query.wp }
        : {}),
  };
  const baseWhere: Prisma.LeaveRequestWhereInput =
    Object.keys(userWhere).length > 0 ? { user: userWhere } : {};
  const statuses: readonly LeaveStatus[] | null = activeFilter.statuses;
  const where: Prisma.LeaveRequestWhereInput = statuses
    ? { ...baseWhere, status: { in: [...statuses] } }
    : baseWhere;

  const [statusCounts, workPoints] = await Promise.all([
    prisma.leaveRequest.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
    prisma.workPoint.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
  ]);

  const countFor = (list: readonly LeaveStatus[] | null) =>
    statusCounts
      .filter((row) => list === null || list.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);

  const total = countFor(statuses);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // O pagină care nu mai există (ex. după ultima aprobare de pe ea) arată ultima pagină.
  const page = Math.min(query.page, totalPages);

  const leaves = await prisma.leaveRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      startDate: true,
      endDate: true,
      workingDays: true,
      status: true,
      violationReasons: true,
      rejectionReason: true,
      approvedById: true,
      approvedAt: true,
      createdAt: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
          active: true,
          deletedAt: true,
          availableDays: true,
          workPoint: { select: { name: true } },
        },
      },
    },
  });

  const approverIds = [
    ...new Set(leaves.map((leave) => leave.approvedById).filter((id): id is string => !!id)),
  ];
  const approvers =
    approverIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: approverIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
  const approverName = new Map(
    approvers.map((user) => [user.id, `${user.firstName} ${user.lastName}`])
  );

  const rows: AdminLeaveRow[] = leaves.map((leave) => ({
    id: leave.id,
    employeeName: `${leave.user.firstName} ${leave.user.lastName}`,
    jobTitle: leave.user.jobTitle,
    email: leave.user.email,
    employeeInactive: !leave.user.active || leave.user.deletedAt !== null,
    workPointName: leave.user.workPoint?.name ?? null,
    period: formatPeriod(leave.startDate, leave.endDate),
    workingDays: leave.workingDays,
    employeeAvailableDays: leave.user.availableDays,
    status: leave.status,
    violationReasons: leave.violationReasons,
    rejectionReason: leave.rejectionReason,
    createdDate: formatInTimeZone(leave.createdAt, APP_TIME_ZONE, "dd.MM.yyyy"),
    createdTime: formatInTimeZone(leave.createdAt, APP_TIME_ZONE, "HH:mm"),
    approvedAt: leave.approvedAt ? formatTimestamp(leave.approvedAt) : null,
    approvedBy: leave.approvedById ? (approverName.get(leave.approvedById) ?? null) : null,
  }));

  const tabs: StatusTab[] = STATUS_FILTERS.map((filter) => ({
    value: filter.value,
    label: filter.label,
    count: countFor(filter.statuses),
    href: cereriHref({ status: filter.value, q: query.q, wp: query.wp }),
  }));

  const pageHref = (target: number) => cereriHref({ ...query, page: target });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cereri de concediu</h1>
        <p className="text-muted-foreground">
          Aprobă sau respinge cererile care au nevoie de decizia ta.
        </p>
      </div>
      <LeavesAdmin
        rows={rows}
        query={{ ...query, page }}
        tabs={tabs}
        workPoints={workPoints}
        pagination={{
          page,
          totalPages,
          total,
          pageSize: PAGE_SIZE,
          prevHref: page > 1 ? pageHref(page - 1) : null,
          nextHref: page < totalPages ? pageHref(page + 1) : null,
        }}
      />
    </div>
  );
}
