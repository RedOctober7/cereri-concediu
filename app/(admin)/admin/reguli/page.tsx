import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ConstraintsAdmin, type ConstraintRow } from "@/components/admin/ConstraintsAdmin";

export default async function ConstraintsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const [constraints, workPoints] = await Promise.all([
    prisma.constraint.findMany({
      select: {
        id: true,
        scope: true,
        type: true,
        active: true,
        config: true,
        workPoint: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workPoint.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
  ]);

  const rows: ConstraintRow[] = constraints.map((constraint) => ({
    ...constraint,
    config: (constraint.config ?? {}) as Record<string, unknown>,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ConstraintsAdmin constraints={rows} workPoints={workPoints} />
    </div>
  );
}
