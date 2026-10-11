import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WorkPointsAdmin, type WorkPointRow } from "@/components/admin/WorkPointsAdmin";

export default async function WorkPointsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const [workPoints, usersByWorkPoint] = await Promise.all([
    prisma.workPoint.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        active: true,
        _count: {
          select: {
            users: { where: { role: "EMPLOYEE", active: true } },
            constraints: true,
          },
        },
      },
    }),
    // Toți utilizatorii legați (inclusiv dezactivați): de ei depinde dacă se poate șterge.
    prisma.user.groupBy({
      by: ["workPointId"],
      where: { workPointId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const linkedUsers = new Map(
    usersByWorkPoint.map((row) => [row.workPointId, row._count._all])
  );
  const collator = new Intl.Collator("ro", { sensitivity: "base" });

  const rows: WorkPointRow[] = workPoints
    .map((workPoint) => ({
      id: workPoint.id,
      name: workPoint.name,
      address: workPoint.address,
      active: workPoint.active,
      activeEmployees: workPoint._count.users,
      linkedUsers: linkedUsers.get(workPoint.id) ?? 0,
      constraints: workPoint._count.constraints,
    }))
    .sort(
      (a, b) => Number(b.active) - Number(a.active) || collator.compare(a.name, b.name)
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <WorkPointsAdmin workPoints={rows} />
    </div>
  );
}
