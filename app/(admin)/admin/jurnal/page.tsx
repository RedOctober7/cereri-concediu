import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { ConstraintType, Prisma } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { APP_TIME_ZONE, addDaysUTC, parseDateOnly, toDateOnlyString } from "@/lib/dates";
import { AUDIT_ACTIONS, auditActionLabel } from "@/lib/audit/actions";
import { CONSTRAINT_TYPES } from "@/lib/constraints/types";
import { formatPeriod } from "@/components/admin/format";
import { formatAuditDetails } from "@/components/admin/audit-format";
import {
  AuditLogView,
  type AuditActorOption,
  type AuditRow,
  type AuditTarget,
} from "@/components/admin/AuditLogView";
import { SYSTEM_ACTOR, auditHref, parseAuditQuery } from "./query";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Începutul zilei `day` ('yyyy-MM-dd') în ora României, ca moment UTC. */
function startOfBucharestDay(day: string): Date {
  return fromZonedTime(`${day}T00:00:00`, APP_TIME_ZONE);
}

/** Id-urile de puncte de lucru și utilizatori menționate în detalii (pentru nume). */
function collectDetailIds(details: unknown, workPointIds: Set<string>, userIds: Set<string>) {
  const record = asRecord(details);
  if (!record) {
    return;
  }
  if (typeof record.workPointId === "string") workPointIds.add(record.workPointId);
  if (typeof record.userId === "string") userIds.add(record.userId);
  const change = asRecord(asRecord(record.changes)?.workPointId);
  if (typeof change?.from === "string") workPointIds.add(change.from);
  if (typeof change?.to === "string") workPointIds.add(change.to);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const query = parseAuditQuery(await searchParams);
  const rangeInvalid = Boolean(query.from && query.to && query.from > query.to);

  const where: Prisma.AuditLogWhereInput = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.actor === SYSTEM_ACTOR ? { userId: null } : query.actor ? { userId: query.actor } : {}),
    ...(query.target ? { entityId: query.target } : {}),
    ...(!rangeInvalid && (query.from || query.to)
      ? {
          createdAt: {
            ...(query.from ? { gte: startOfBucharestDay(query.from) } : {}),
            ...(query.to
              ? { lt: startOfBucharestDay(toDateOnlyString(addDaysUTC(parseDateOnly(query.to)!, 1))) }
              : {}),
          },
        }
      : {}),
  };

  const [total, actionGroups, actorGroups] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["action"] }),
    prisma.auditLog.groupBy({ by: ["userId"], where: { userId: { not: null } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, totalPages);

  const entries = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      details: true,
      ipAddress: true,
      createdAt: true,
      user: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  });

  // Numele țintelor și ale id-urilor din detalii, într-o singură interogare pe tabel.
  const userIds = new Set<string>();
  const leaveIds = new Set<string>();
  const workPointIds = new Set<string>();
  const constraintIds = new Set<string>();
  for (const entry of entries) {
    if (entry.entityId) {
      if (entry.entityType === "User") userIds.add(entry.entityId);
      if (entry.entityType === "LeaveRequest") leaveIds.add(entry.entityId);
      if (entry.entityType === "WorkPoint") workPointIds.add(entry.entityId);
      if (entry.entityType === "Constraint") constraintIds.add(entry.entityId);
    }
    collectDetailIds(entry.details, workPointIds, userIds);
  }
  if (query.target) {
    userIds.add(query.target);
    workPointIds.add(query.target);
  }

  const [users, leaves, workPoints, constraints, actors] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, firstName: true, lastName: true, role: true },
    }),
    prisma.leaveRequest.findMany({
      where: { id: { in: [...leaveIds] } },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.workPoint.findMany({
      where: { id: { in: [...workPointIds] } },
      select: { id: true, name: true },
    }),
    prisma.constraint.findMany({
      where: { id: { in: [...constraintIds] } },
      select: { id: true, type: true, scope: true, workPoint: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { id: { in: actorGroups.map((row) => row.userId!).filter(Boolean) } },
      select: { id: true, firstName: true, lastName: true, role: true },
    }),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const leaveById = new Map(leaves.map((leave) => [leave.id, leave]));
  const workPointById = new Map(workPoints.map((workPoint) => [workPoint.id, workPoint]));
  const constraintById = new Map(constraints.map((constraint) => [constraint.id, constraint]));
  const fullName = (user: { firstName: string; lastName: string }) =>
    `${user.firstName} ${user.lastName}`;

  const lookups = {
    workPointName: (id: string) => workPointById.get(id)?.name ?? null,
    userName: (id: string) => {
      const user = userById.get(id);
      return user ? fullName(user) : null;
    },
  };

  function targetFor(entry: (typeof entries)[number]): AuditTarget | null {
    const details = asRecord(entry.details) ?? {};
    const id = entry.entityId;
    if (!id) {
      return null;
    }
    switch (entry.entityType) {
      case "User": {
        const user = userById.get(id);
        if (!user) return { label: "Cont șters", kind: "Cont" };
        return {
          label: fullName(user),
          kind: user.role === "ADMIN" ? "Administrator" : "Angajat",
          href: user.role === "EMPLOYEE" ? `/admin/utilizatori/${user.id}` : undefined,
        };
      }
      case "LeaveRequest": {
        const leave = leaveById.get(id);
        if (!leave) return { label: "Cerere ștearsă", kind: "Cerere" };
        return {
          label: fullName(leave.user),
          kind: `Cerere · ${formatPeriod(leave.startDate, leave.endDate)}`,
          href: `/admin/utilizatori/${leave.user.id}`,
        };
      }
      case "WorkPoint": {
        const workPoint = workPointById.get(id);
        if (workPoint) return { label: workPoint.name, kind: "Punct de lucru", href: "/admin/puncte-lucru" };
        return {
          label: typeof details.name === "string" ? details.name : "Punct de lucru șters",
          kind: "Punct de lucru șters",
        };
      }
      case "Constraint": {
        const constraint = constraintById.get(id);
        // Tipul, nu valoarea curentă: valoarea de la momentul respectiv e în detalii.
        if (constraint) {
          return {
            label: CONSTRAINT_TYPES[constraint.type].label,
            kind: `Regulă · ${constraint.scope === "GLOBAL" ? "toate punctele de lucru" : (constraint.workPoint?.name ?? "punct de lucru")}`,
            href: "/admin/reguli",
          };
        }
        const type =
          typeof details.type === "string" && details.type in CONSTRAINT_TYPES
            ? (details.type as ConstraintType)
            : null;
        return {
          label: type ? CONSTRAINT_TYPES[type].label : "Regulă",
          kind: "Regulă ștearsă",
        };
      }
      default:
        return { label: entry.entityType, kind: "Înregistrare" };
    }
  }

  const rows: AuditRow[] = entries.map((entry) => {
    const items = formatAuditDetails(entry.action, entry.details, lookups);
    if (entry.ipAddress) {
      items.push({ label: "IP", value: entry.ipAddress });
    }
    return {
      id: entry.id,
      action: entry.action,
      actionLabel: auditActionLabel(entry.action),
      destructive: AUDIT_ACTIONS[entry.action]?.destructive ?? false,
      createdAt: entry.createdAt.toISOString(),
      actor: entry.user
        ? { name: fullName(entry.user), isEmployee: entry.user.role === "EMPLOYEE" }
        : null,
      target: targetFor(entry),
      details: items,
    };
  });

  const collator = new Intl.Collator("ro", { sensitivity: "base" });
  const actorOptions: AuditActorOption[] = actors
    .map((user) => ({ id: user.id, name: fullName(user), isEmployee: user.role === "EMPLOYEE" }))
    .sort((a, b) => Number(a.isEmployee) - Number(b.isEmployee) || collator.compare(a.name, b.name));

  const knownActions = Object.keys(AUDIT_ACTIONS);
  const otherActions = actionGroups
    .map((row) => row.action)
    .filter((action) => !knownActions.includes(action))
    .sort();

  const targetName = query.target
    ? (lookups.userName(query.target) ?? lookups.workPointName(query.target) ?? "înregistrarea aleasă")
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AuditLogView
        rows={rows}
        query={{ ...query, page }}
        rangeInvalid={rangeInvalid}
        actorOptions={actorOptions}
        otherActions={otherActions}
        targetName={targetName}
        clearTargetHref={auditHref({ ...query, target: "", page: 1 })}
        pagination={{
          page,
          totalPages,
          total,
          pageSize: PAGE_SIZE,
          prevHref: page > 1 ? auditHref({ ...query, page: page - 1 }) : null,
          nextHref: page < totalPages ? auditHref({ ...query, page: page + 1 }) : null,
        }}
      />
    </div>
  );
}
