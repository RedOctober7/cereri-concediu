"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LeaveStatus } from "@prisma/client";
import {
  ArrowLeft,
  CalendarX2,
  History,
  KeyRound,
  Loader2,
  Scale,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActiveBadge, DaysValue, EmptyState } from "@/components/admin/admin-ui";
import { BalanceAdjustmentDialog } from "@/components/admin/BalanceAdjustmentDialog";
import { PasswordResetDialog } from "@/components/admin/PasswordResetDialog";
import { UserEditForm } from "@/components/admin/UserEditForm";
import {
  formatDays,
  formatMonthYear,
  formatPeriod,
  formatTimestamp,
  pluralRo,
} from "@/components/admin/format";
import { apiRequest } from "@/components/admin/form-utils";
import type { WorkPointOption } from "@/components/admin/user-fields";
import { parseDateOnly } from "@/lib/dates";
import { leaveStatusClassName, leaveStatusLabel } from "@/lib/leaves/status";
import { cn } from "@/lib/utils";

export type UserDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  jobTitle: string;
  employer: string;
  active: boolean;
  mustChangePassword: boolean;
  availableDays: number;
  initialLeaveDays: number;
  /** 'yyyy-MM-dd' */
  hireDate: string;
  workPointId: string | null;
  workPointName: string | null;
  /** updatedAt (ISO): formularul de editare se remontează cu valorile noi după salvare. */
  version: string;
};

export type LeaveHistoryRow = {
  id: string;
  /** 'yyyy-MM-dd' */
  startDate: string;
  endDate: string;
  workingDays: number;
  status: LeaveStatus;
  rejectionReason: string | null;
  createdAt: string;
};

export type AccrualRow = {
  id: string;
  month: number;
  year: number;
  days: number;
  createdAt: string;
};

export type BalanceAdjustmentRow = {
  id: string;
  delta: number;
  reason: string;
  after: number;
  createdAt: string;
  actorName: string | null;
};

type Stats = {
  year: number;
  takenThisYear: number;
  pendingCount: number;
  pendingDays: number;
};

function initials(firstName: string, lastName: string) {
  return `${firstName.trim()[0] ?? ""}${lastName.trim()[0] ?? ""}`.toUpperCase();
}

function period(leave: LeaveHistoryRow) {
  const start = parseDateOnly(leave.startDate);
  const end = parseDateOnly(leave.endDate);
  return start && end ? formatPeriod(start, end) : `${leave.startDate} – ${leave.endDate}`;
}

function signedDays(value: number) {
  return `${value > 0 ? "+" : ""}${formatDays(value)}`;
}

function StatCard({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-1 px-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{children}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge className={leaveStatusClassName(status)}>{leaveStatusLabel(status)}</Badge>;
}

function LeaveHistory({ leaves, total }: { leaves: LeaveHistoryRow[]; total: number }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Istoric cereri</CardTitle>
        <CardDescription>
          {total === 0
            ? "Angajatul nu a depus încă nicio cerere."
            : total > leaves.length
              ? `Ultimele ${leaves.length} din ${total} cereri, după data de început.`
              : `${pluralRo(total, "cerere", "cereri")}, după data de început.`}
        </CardDescription>
      </CardHeader>
      {leaves.length === 0 ? (
        <EmptyState icon={CalendarX2} title="Nicio cerere de concediu" />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Perioadă</TableHead>
                  <TableHead className="text-right">Zile lucrătoare</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4">Depusă la</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="pl-4 font-medium">{period(leave)}</TableCell>
                    <TableCell className="text-right tabular-nums">{leave.workingDays}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      <div className="flex flex-col items-start gap-1">
                        <LeaveStatusBadge status={leave.status} />
                        {leave.status === "REJECTED" && leave.rejectionReason ? (
                          <span className="text-xs text-muted-foreground">
                            Motiv: {leave.rejectionReason}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="pr-4 text-muted-foreground tabular-nums">
                      {formatTimestamp(new Date(leave.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="divide-y md:hidden">
            {leaves.map((leave) => (
              <li key={leave.id} className="space-y-1.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{period(leave)}</p>
                  <LeaveStatusBadge status={leave.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {pluralRo(leave.workingDays, "zi lucrătoare", "zile lucrătoare")} · depusă{" "}
                  {formatTimestamp(new Date(leave.createdAt))}
                </p>
                {leave.status === "REJECTED" && leave.rejectionReason ? (
                  <p className="text-xs text-muted-foreground">Motiv: {leave.rejectionReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function AccrualHistory({ accruals }: { accruals: AccrualRow[] }) {
  const years = [...new Set(accruals.map((accrual) => accrual.year))];
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Acumulări lunare</CardTitle>
        <CardDescription>Zilele adăugate automat la începutul fiecărei luni.</CardDescription>
      </CardHeader>
      {accruals.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nicio acumulare încă.</p>
      ) : (
        <div className="divide-y">
          {years.map((year, index) => {
            const rows = accruals.filter((accrual) => accrual.year === year);
            const total = Math.round(rows.reduce((sum, row) => sum + row.days, 0) * 100) / 100;
            return (
              <details key={year} open={index === 0} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
                  <span className="font-medium">{year}</span>
                  <span className="text-muted-foreground">
                    {pluralRo(rows.length, "lună", "luni")} ·{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatDays(total)}
                    </span>{" "}
                    zile
                  </span>
                </summary>
                <ul className="px-4 pb-3">
                  {rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between py-1 text-sm"
                    >
                      <span className="capitalize text-muted-foreground">
                        {formatMonthYear(row.month, row.year)}
                      </span>
                      <span className="tabular-nums">{signedDays(row.days)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AdjustmentHistory({
  adjustments,
  onAdjust,
}: {
  adjustments: BalanceAdjustmentRow[];
  onAdjust: () => void;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>Ajustări de sold</CardTitle>
        <CardDescription>Corecturi manuale, cu motivul lor.</CardDescription>
      </CardHeader>
      {adjustments.length === 0 ? (
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">Nicio ajustare manuală.</p>
          <Button variant="outline" size="sm" onClick={onAdjust}>
            <Scale aria-hidden="true" />
            Ajustare sold
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {adjustments.map((adjustment) => (
            <li key={adjustment.id} className="space-y-1 px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    adjustment.delta < 0 && "text-destructive"
                  )}
                >
                  {signedDays(adjustment.delta)} {Math.abs(adjustment.delta) === 1 ? "zi" : "zile"}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatTimestamp(new Date(adjustment.createdAt))}
                </span>
              </div>
              <p className="break-words">{adjustment.reason}</p>
              <p className="text-xs text-muted-foreground">
                Sold după: {formatDays(adjustment.after)} zile
                {adjustment.actorName ? ` · ${adjustment.actorName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function UserDetailClient({
  user,
  isSelf,
  workPoints,
  jobTitles,
  stats,
  leaves,
  leaveTotal,
  accruals,
  adjustments,
}: {
  user: UserDetail;
  isSelf: boolean;
  workPoints: WorkPointOption[];
  jobTitles: string[];
  stats: Stats;
  leaves: LeaveHistoryRow[];
  leaveTotal: number;
  accruals: AccrualRow[];
  adjustments: BalanceAdjustmentRow[];
}) {
  const router = useRouter();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const fullName = `${user.firstName} ${user.lastName}`;

  async function toggleActive() {
    setStatusSaving(true);
    const result = await apiRequest(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: { active: !user.active },
    });
    setStatusSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setStatusOpen(false);
    toast.success(user.active ? `Contul lui ${fullName} a fost dezactivat.` : `Contul lui ${fullName} a fost reactivat.`);
    router.refresh();
  }

  return (
    <>
      <Link
        href="/admin/utilizatori"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 text-muted-foreground")}
      >
        <ArrowLeft aria-hidden="true" />
        Utilizatori
      </Link>

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="lg" className="size-12">
            <AvatarFallback className="bg-primary/10 font-medium text-primary">
              {initials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{fullName}</h1>
            <p className="text-sm break-words text-muted-foreground">
              {user.jobTitle} · {user.workPointName ?? "Fără punct de lucru"} · {user.username}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <ActiveBadge active={user.active} />
              {user.active && user.mustChangePassword ? (
                <Badge variant="secondary">Parolă temporară</Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/jurnal?tinta=${user.id}`}
            className={buttonVariants({ variant: "ghost" })}
          >
            <History aria-hidden="true" />
            Istoric modificări
          </Link>
          <Button variant="outline" onClick={() => setBalanceOpen(true)}>
            <Scale aria-hidden="true" />
            Ajustare sold
          </Button>
          <Button variant="outline" onClick={() => setPasswordOpen(true)}>
            <KeyRound aria-hidden="true" />
            Resetează parola
          </Button>
          {user.active ? (
            <Button
              variant="destructive"
              disabled={isSelf}
              title={isSelf ? "Nu îți poți dezactiva propriul cont" : undefined}
              onClick={() => setStatusOpen(true)}
            >
              <UserX aria-hidden="true" />
              Dezactivează
            </Button>
          ) : (
            <Button onClick={() => setStatusOpen(true)}>
              <UserCheck aria-hidden="true" />
              Reactivează
            </Button>
          )}
        </div>
      </div>

      {!user.active ? (
        <Alert>
          <UserX aria-hidden="true" />
          <AlertTitle>Cont dezactivat</AlertTitle>
          <AlertDescription>
            Angajatul nu se poate autentifica și nu primește acumulări lunare. Istoricul rămâne
            păstrat.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sold disponibil" hint="zile de concediu">
          <DaysValue value={user.availableDays} />
        </StatCard>
        <StatCard label="Sold inițial" hint="la crearea contului">
          {formatDays(user.initialLeaveDays)}
        </StatCard>
        <StatCard label={`Luate în ${stats.year}`} hint="zile lucrătoare aprobate">
          {stats.takenThisYear}
        </StatCard>
        <StatCard
          label="În așteptare"
          hint={
            stats.pendingCount > 0
              ? pluralRo(stats.pendingDays, "zi lucrătoare", "zile lucrătoare")
              : "nicio cerere"
          }
        >
          {stats.pendingCount}
        </StatCard>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <UserEditForm
            key={user.version}
            user={user}
            workPoints={workPoints}
            jobTitles={jobTitles}
          />
          <LeaveHistory leaves={leaves} total={leaveTotal} />
        </div>
        <div className="space-y-6">
          <AdjustmentHistory adjustments={adjustments} onAdjust={() => setBalanceOpen(true)} />
          <AccrualHistory accruals={accruals} />
        </div>
      </div>

      <BalanceAdjustmentDialog
        open={balanceOpen}
        onOpenChange={setBalanceOpen}
        userId={user.id}
        userName={fullName}
        availableDays={user.availableDays}
      />
      <PasswordResetDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
        userId={user.id}
        userName={fullName}
        username={user.username}
      />
      <AlertDialog
        open={statusOpen}
        onOpenChange={(next) => {
          if (!statusSaving) {
            setStatusOpen(next);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {user.active ? `Dezactivezi contul lui ${fullName}?` : `Reactivezi contul lui ${fullName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {user.active
                ? "Angajatul nu se va mai putea autentifica și nu va mai primi acumulări lunare. Cererile, soldul și istoricul rămân păstrate; contul poate fi reactivat oricând."
                : "Angajatul se va putea autentifica din nou cu parola actuală și va primi din nou acumulări lunare."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusSaving}>Anulează</AlertDialogCancel>
            <Button
              variant={user.active ? "destructive" : "default"}
              disabled={statusSaving}
              onClick={toggleActive}
            >
              {statusSaving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
              {user.active ? "Dezactivează" : "Reactivează"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
