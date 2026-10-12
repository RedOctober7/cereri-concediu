import Link from "next/link";
import { getServerSession } from "next-auth";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { formatDay, formatDays } from "@/components/admin/format";
import { getEmployeeDashboardStats } from "@/lib/leaves/employee-stats";
import { getUpcomingExpiry } from "@/lib/leaves/expiring";
import { todayInBucharest } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  leaveStatusClassName,
  leaveStatusLabel,
} from "@/lib/leaves/status";
import type { LeaveStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Sub atâtea zile până la termen, avertizarea despre zilele care expiră devine evidențiată. */
const EXPIRY_URGENT_DAYS = 90;

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const [stats, expiry] = await Promise.all([
    getEmployeeDashboardStats(userId),
    getUpcomingExpiry([userId]),
  ]);
  const expiringDays = expiry.byUser.get(userId) ?? 0;
  const daysLeft = Math.round(
    (expiry.lastDay.getTime() - todayInBucharest().getTime()) / (24 * 60 * 60 * 1000)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Panou</h1>
          <p className="text-muted-foreground">
            Bun venit, {session?.user?.name ?? "angajat"}!
          </p>
        </div>
        <Button className="h-11 gap-2" nativeButton={false} render={<Link href="/cereri/noua" />}>
          <CalendarPlus className="size-4" />
          Cerere nouă
        </Button>
      </div>

      {expiringDays > 0 ? (
        <Alert
          className={cn(
            daysLeft <= EXPIRY_URGENT_DAYS &&
              "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          )}
        >
          <CalendarClock />
          <AlertTitle>
            {formatDays(expiringDays)} {expiringDays === 1 ? "zi" : "zile"} din {expiry.year}{" "}
            expiră pe {formatDay(expiry.lastDay)}
          </AlertTitle>
          <AlertDescription>
            Zilele de concediu neefectuate se pot lua în cel mult 18 luni de la sfârșitul anului
            în care s-au acumulat (Codul muncii, art. 146 alin. 2). Depune o cerere care începe
            cel târziu pe {formatDay(expiry.lastDay)}, altfel aceste zile se pierd.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Zile disponibile</CardDescription>
            <CardTitle>{formatDays(stats.availableDays)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Zile luate în anul curent</CardDescription>
            <CardTitle>{formatDays(stats.takenThisYear)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Zile acumulate luna curentă</CardDescription>
            <CardTitle>{formatDays(stats.monthlyAccrualDays)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Următoarea cerere aprobată</CardDescription>
            <CardTitle className="text-base font-medium">
              {stats.nextApproved
                ? `${formatDay(stats.nextApproved.startDate)} – ${formatDay(stats.nextApproved.endDate)}`
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ultimele cereri</CardTitle>
          <CardDescription>Cele mai recente 5 cereri depuse de tine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.recentLeaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nu ai depus încă nicio cerere de concediu.
            </p>
          ) : (
            stats.recentLeaves.map((leave) => (
              <div
                key={leave.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-sm">
                    {formatDay(leave.startDate)} –{" "}
                    {formatDay(leave.endDate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {leave.workingDays} zile lucrătoare
                  </p>
                </div>
                <Badge
                  className={leaveStatusClassName(leave.status as LeaveStatus)}
                >
                  {leaveStatusLabel(leave.status as LeaveStatus)}
                </Badge>
              </div>
            ))
          )}
          <Button variant="outline" className="w-full sm:w-auto" nativeButton={false} render={<Link href="/cereri" />}>
            Vezi toate cererile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
