import { prisma } from "@/lib/db";
import { ConstraintsAdmin } from "@/components/admin/ConstraintsAdmin";

export default async function ConstraintsPage() {
  const [constraintsRaw, workPoints] = await Promise.all([
    prisma.constraint.findMany({
      include: {
        workPoint: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workPoint.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const constraints = constraintsRaw.map((c) => ({
    ...c,
    config: (c.config ?? {}) as Record<string, unknown>,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reguli și constrângeri</h1>
        <p className="text-muted-foreground">
          Configurează regulile globale sau pe punct de lucru.
        </p>
      </div>
      <ConstraintsAdmin initialConstraints={constraints} workPoints={workPoints} />
    </div>
  );
}