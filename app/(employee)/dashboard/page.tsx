import Link from "next/link";
import { getServerSession } from "next-auth";
import { format } from "date-fns";
import { ro } from "date-fns/locale";
import { CalendarPlus } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getEmployeeDashboardStats } from "@/lib/leaves/employee-stats";
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

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const stats = await getEmployeeDashboardStats(userId);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Bun venit, {session?.user?.name ?? "angajat"}!
          </p>
        </div>
        <Button className="h-11 gap-2" render={<Link href="/cereri/noua" />}>
          <CalendarPlus className="size-4" />
          Cerere nouă
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Zile disponibile</CardDescription>
            <CardTitle>{stats.availableDays.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Zile luate în anul curent</CardDescription>
            <CardTitle>{stats.takenThisYear}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Zile acumulate luna curentă</CardDescription>
            <CardTitle>{stats.monthlyAccrualDays.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Următoarea cerere aprobată</CardDescription>
            <CardTitle className="text-base font-medium">
              {stats.nextApproved
                ? `${format(stats.nextApproved.startDate, "dd.MM.yyyy", { locale: ro })} – ${format(stats.nextApproved.endDate, "dd.MM.yyyy", { locale: ro })}`
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
                    {format(leave.startDate, "dd.MM.yyyy", { locale: ro })} –{" "}
                    {format(leave.endDate, "dd.MM.yyyy", { locale: ro })}
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
          <Button variant="outline" className="w-full sm:w-auto" render={<Link href="/cereri" />}>
            Vezi toate cererile
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
