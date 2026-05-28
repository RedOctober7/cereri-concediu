import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const session = await getServerSession(authOptions);
  const [activeEmployees, pendingRequests, approvedThisMonth, workPoints] =
    await Promise.all([
      prisma.user.count({
        where: { role: "EMPLOYEE", active: true, deletedAt: null },
      }),
      prisma.leaveRequest.count({
        where: { status: "PENDING_ADMIN" },
      }),
      prisma.leaveRequest.aggregate({
        _sum: { workingDays: true },
        where: {
          status: { in: ["APPROVED_AUTO", "APPROVED_ADMIN"] },
          approvedAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      prisma.workPoint.count({ where: { active: true } }),
    ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Panou administrator
        </h1>
        <p className="text-muted-foreground">
          Bun venit, {session?.user?.name ?? "admin"}!
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Angajați activi</CardDescription>
            <CardTitle>{activeEmployees}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Cereri în așteptare</CardDescription>
            <CardTitle>{pendingRequests}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Zile acordate luna curentă</CardDescription>
            <CardTitle>{approvedThisMonth._sum.workingDays ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Puncte de lucru active</CardDescription>
            <CardTitle>{workPoints}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Core este activ</CardTitle>
          <CardDescription>
            Poți gestiona puncte de lucru, utilizatori și reguli din meniul din stânga.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sistemul este pregătit pentru fazele următoare (cereri, aprobări, PDF, email).
        </CardContent>
      </Card>
    </div>
  );
}
