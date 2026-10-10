import { Suspense } from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { formatInTimeZone } from "date-fns-tz";
import { ro } from "date-fns/locale";
import { LeaveStatus, Prisma, Role } from "@prisma/client";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Plane,
  Users,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { APP_TIME_ZONE, addDaysUTC, todayInBucharest } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDays, formatPeriod, pluralRo } from "./cereri/format";

/** Sub acest sold (zile disponibile) angajatul apare la „Sold redus”. */
const LOW_BALANCE_DAYS = 3;
const UPCOMING_DAYS = 14;
const LIST_LIMIT = 6;
const DAY_MS = 24 * 60 * 60 * 1000;

const APPROVED_STATUSES = [LeaveStatus.APPROVED_AUTO, LeaveStatus.APPROVED_ADMIN];

const activeEmployeeWhere = {
  role: Role.EMPLOYEE,
  active: true,
  deletedAt: null,
} satisfies Prisma.UserWhereInput;

const leaveListSelect = {
  id: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      workPointId: true,
      workPoint: { select: { name: true } },
    },
  },
} satisfies Prisma.LeaveRequestSelect;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function submittedLabel(createdAt: Date, today: Date): string {
  const days = daysBetween(todayInBucharest(createdAt), today);
  if (days <= 0) return "depusă azi";
  if (days === 1) return "depusă ieri";
  return `depusă acum ${pluralRo(days, "zi", "zile")}`;
}

function untilLabel(endDate: Date, today: Date): string {
  if (daysBetween(today, endDate) <= 0) return "ultima zi azi";
  return `până pe ${formatInTimeZone(endDate, "UTC", "d MMM", { locale: ro })}`;
}

function startsInLabel(startDate: Date, today: Date): string {
  const days = daysBetween(today, startDate);
  if (days === 1) return "mâine";
  return `în ${pluralRo(days, "zi", "zile")}`;
}

function StatTile({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  href?: string;
}) {
  const card = (
    <Card
      className={cn(
        "h-full",
        href && "transition-colors group-hover/tile:bg-muted/40 group-hover/tile:ring-primary/30"
      )}
    >
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
        <CardAction>
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
            {icon}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="mt-auto text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );

  if (!href) {
    return card;
  }
  return (
    <Link
      href={href}
      className="group/tile rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {card}
    </Link>
  );
}

function PersonRow({
  firstName,
  lastName,
  detail,
  aside,
  href,
}: {
  firstName: string;
  lastName: string;
  detail: string;
  aside: React.ReactNode;
  href?: string;
}) {
  const name = `${firstName} ${lastName}`;
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground"
      >
        {initials(firstName, lastName)}
      </span>
      <div className="min-w-0 flex-1">
        {href ? (
          <Link
            href={href}
            className="block truncate rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {name}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{name}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">{aside}</div>
    </li>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <CardFooter className="justify-end">
      <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        {children}
        <ArrowRight data-icon="inline-end" />
      </Link>
    </CardFooter>
  );
}

async function DashboardContent() {
  const today = todayInBucharest();
  const horizon = addDaysUTC(today, UPCOMING_DAYS);

  const upcomingWhere = {
    status: { in: APPROVED_STATUSES },
    startDate: { gt: today, lte: horizon },
    user: { active: true, deletedAt: null },
  } satisfies Prisma.LeaveRequestWhereInput;

  const lowBalanceWhere = {
    ...activeEmployeeWhere,
    availableDays: { lt: LOW_BALANCE_DAYS },
  } satisfies Prisma.UserWhereInput;

  const [
    pendingRequests,
    oldestPending,
    onLeaveToday,
    upcoming,
    upcomingCount,
    lowBalance,
    lowBalanceCount,
    activeEmployees,
    employeesWithoutWorkPoint,
    workPoints,
  ] = await Promise.all([
    // Doar punctul de lucru, pentru totaluri: cererile în așteptare sunt puține.
    prisma.leaveRequest.findMany({
      where: { status: LeaveStatus.PENDING_ADMIN },
      select: { user: { select: { workPointId: true } } },
    }),
    prisma.leaveRequest.findMany({
      where: { status: LeaveStatus.PENDING_ADMIN },
      orderBy: { createdAt: "asc" },
      take: LIST_LIMIT,
      select: leaveListSelect,
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: { in: APPROVED_STATUSES },
        startDate: { lte: today },
        endDate: { gte: today },
        user: { active: true, deletedAt: null },
      },
      orderBy: [{ endDate: "asc" }, { user: { lastName: "asc" } }],
      select: leaveListSelect,
    }),
    prisma.leaveRequest.findMany({
      where: upcomingWhere,
      orderBy: [{ startDate: "asc" }, { user: { lastName: "asc" } }],
      take: LIST_LIMIT,
      select: leaveListSelect,
    }),
    prisma.leaveRequest.count({ where: upcomingWhere }),
    prisma.user.findMany({
      where: lowBalanceWhere,
      orderBy: [{ availableDays: "asc" }, { lastName: "asc" }],
      take: LIST_LIMIT,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        availableDays: true,
        workPoint: { select: { name: true } },
      },
    }),
    prisma.user.count({ where: lowBalanceWhere }),
    prisma.user.count({ where: activeEmployeeWhere }),
    prisma.user.count({ where: { ...activeEmployeeWhere, workPointId: null } }),
    prisma.workPoint.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        active: true,
        _count: { select: { users: { where: activeEmployeeWhere } } },
      },
    }),
  ]);

  const pendingCount = pendingRequests.length;
  const pendingByWorkPoint = new Map<string | null, number>();
  for (const request of pendingRequests) {
    const key = request.user.workPointId;
    pendingByWorkPoint.set(key, (pendingByWorkPoint.get(key) ?? 0) + 1);
  }
  const onLeaveByWorkPoint = new Map<string | null, Set<string>>();
  for (const leave of onLeaveToday) {
    const key = leave.user.workPointId;
    const users = onLeaveByWorkPoint.get(key) ?? new Set<string>();
    users.add(leave.user.id);
    onLeaveByWorkPoint.set(key, users);
  }
  const onLeaveTodayCount = new Set(onLeaveToday.map((leave) => leave.user.id)).size;

  const workPointRows = [
    ...workPoints
      .filter((wp) => wp.active || wp._count.users > 0)
      .map((wp) => ({
        key: wp.id,
        filter: wp.id,
        name: wp.name,
        inactive: !wp.active,
        employees: wp._count.users,
      })),
    ...(employeesWithoutWorkPoint > 0 || pendingByWorkPoint.has(null)
      ? [
          {
            key: "none",
            filter: "none",
            name: "Fără punct de lucru",
            inactive: false,
            employees: employeesWithoutWorkPoint,
          },
        ]
      : []),
  ].map((row) => {
    const mapKey = row.key === "none" ? null : row.key;
    return {
      ...row,
      onLeave: onLeaveByWorkPoint.get(mapKey)?.size ?? 0,
      pending: pendingByWorkPoint.get(mapKey) ?? 0,
    };
  });
  const activeWorkPoints = workPoints.filter((wp) => wp.active).length;

  const workPointName = (leave: { user: { workPoint: { name: string } | null } }) =>
    leave.user.workPoint?.name ?? "Fără punct de lucru";

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Cereri în așteptare"
          value={pendingCount}
          hint={pendingCount > 0 ? "Necesită decizia ta" : "Nicio cerere de decis"}
          icon={<ClipboardList />}
          href="/admin/cereri"
        />
        <StatTile
          label="În concediu azi"
          value={onLeaveTodayCount}
          hint={`din ${pluralRo(activeEmployees, "angajat activ", "angajați activi")}`}
          icon={<Plane />}
        />
        <StatTile
          label={`Plecări în ${UPCOMING_DAYS} zile`}
          value={upcomingCount}
          hint="Concedii aprobate care încep curând"
          icon={<CalendarClock />}
        />
        <StatTile
          label="Angajați activi"
          value={activeEmployees}
          hint={`în ${pluralRo(activeWorkPoints, "punct de lucru activ", "puncte de lucru active")}`}
          icon={<Users />}
          href="/admin/utilizatori"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Așteaptă decizia de cel mai mult timp</CardTitle>
            <CardDescription>Cererile în așteptare, de la cea mai veche.</CardDescription>
          </CardHeader>
          <CardContent>
            {oldestPending.length === 0 ? (
              <EmptyText>Nu există cereri în așteptare.</EmptyText>
            ) : (
              <ul className="divide-y">
                {oldestPending.map((leave) => (
                  <PersonRow
                    key={leave.id}
                    firstName={leave.user.firstName}
                    lastName={leave.user.lastName}
                    detail={`${formatPeriod(leave.startDate, leave.endDate)} · ${pluralRo(leave.workingDays, "zi lucrătoare", "zile lucrătoare")}`}
                    aside={submittedLabel(leave.createdAt, today)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
          {pendingCount > 0 ? (
            <MoreLink href="/admin/cereri">
              {pendingCount > oldestPending.length
                ? `Toate cele ${pendingCount} cereri`
                : "Deschide cererile"}
            </MoreLink>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>În concediu azi</CardTitle>
            <CardDescription>Concedii aprobate care includ ziua de azi.</CardDescription>
          </CardHeader>
          <CardContent>
            {onLeaveToday.length === 0 ? (
              <EmptyText>Nimeni nu este în concediu azi.</EmptyText>
            ) : (
              <ul className="divide-y">
                {onLeaveToday.map((leave) => (
                  <PersonRow
                    key={leave.id}
                    firstName={leave.user.firstName}
                    lastName={leave.user.lastName}
                    detail={`${workPointName(leave)} · ${formatPeriod(leave.startDate, leave.endDate)}`}
                    aside={untilLabel(leave.endDate, today)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Urmează în {UPCOMING_DAYS} zile</CardTitle>
            <CardDescription>Concedii aprobate care încep în perioada următoare.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyText>Niciun concediu aprobat nu începe în următoarele {UPCOMING_DAYS} zile.</EmptyText>
            ) : (
              <ul className="divide-y">
                {upcoming.map((leave) => (
                  <PersonRow
                    key={leave.id}
                    firstName={leave.user.firstName}
                    lastName={leave.user.lastName}
                    detail={`${workPointName(leave)} · ${formatPeriod(leave.startDate, leave.endDate)}`}
                    aside={startsInLabel(leave.startDate, today)}
                  />
                ))}
              </ul>
            )}
            {upcomingCount > upcoming.length ? (
              <p className="pt-2 text-xs text-muted-foreground">
                Încă {upcomingCount - upcoming.length} în aceeași perioadă.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sold redus</CardTitle>
            <CardDescription>
              Angajați activi cu mai puțin de {LOW_BALANCE_DAYS} zile disponibile.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lowBalance.length === 0 ? (
              <EmptyText>
                Toți angajații activi au cel puțin {LOW_BALANCE_DAYS} zile disponibile.
              </EmptyText>
            ) : (
              <ul className="divide-y">
                {lowBalance.map((user) => (
                  <PersonRow
                    key={user.id}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    href={`/admin/utilizatori/${user.id}`}
                    detail={user.workPoint?.name ?? "Fără punct de lucru"}
                    aside={
                      <Badge variant={user.availableDays < 0 ? "destructive" : "secondary"}>
                        {formatDays(user.availableDays)}{" "}
                        {Math.abs(user.availableDays) === 1 ? "zi" : "zile"}
                      </Badge>
                    }
                  />
                ))}
              </ul>
            )}
            {lowBalanceCount > lowBalance.length ? (
              <p className="pt-2 text-xs text-muted-foreground">
                Încă {lowBalanceCount - lowBalance.length} cu sold redus.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pe puncte de lucru</CardTitle>
          <CardDescription>Angajați activi, absențe de azi și cereri de decis.</CardDescription>
        </CardHeader>
        <CardContent>
          {workPointRows.length === 0 ? (
            <EmptyText>Nu există încă puncte de lucru.</EmptyText>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Punct de lucru</TableHead>
                  <TableHead className="text-right">Angajați</TableHead>
                  <TableHead className="text-right">În concediu azi</TableHead>
                  <TableHead className="text-right">În așteptare</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workPointRows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">
                      {row.name}
                      {row.inactive ? (
                        <Badge variant="outline" className="ml-2">
                          inactiv
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.employees}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.onLeave}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.pending > 0 ? (
                        <Link
                          href={`/admin/cereri?wp=${row.filter}`}
                          className="rounded-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                          aria-label={`${pluralRo(row.pending, "cerere", "cereri")} în așteptare la ${row.name}`}
                        >
                          {row.pending}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SkeletonCard({ rows }: { rows: number }) {
  return (
    <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p role="status" className="sr-only">
        Se încarcă panoul...
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard rows={4} />
        <SkeletonCard rows={4} />
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  const weekdayLabel = formatInTimeZone(new Date(), APP_TIME_ZONE, "EEEE, d MMMM yyyy", {
    locale: ro,
  });
  const todayLabel = weekdayLabel.charAt(0).toUpperCase() + weekdayLabel.slice(1);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panou</h1>
        <p className="text-muted-foreground">
          {todayLabel}
          {session?.user?.name ? ` · Bun venit, ${session.user.name}` : null}
        </p>
      </div>
      {/* Antetul apare imediat; datele vin în flux, cu schelet până atunci. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

