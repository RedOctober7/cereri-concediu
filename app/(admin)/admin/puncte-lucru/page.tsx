import { prisma } from "@/lib/db";
import { WorkPointsAdmin } from "@/components/admin/WorkPointsAdmin";

export default async function WorkPointsPage() {
  const workPoints = await prisma.workPoint.findMany({
    include: {
      _count: {
        select: { users: true, constraints: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Puncte de lucru</h1>
        <p className="text-muted-foreground">
          Gestionează locațiile și statusul punctelor de lucru.
        </p>
      </div>
      <WorkPointsAdmin initialWorkPoints={workPoints} />
    </div>
  );
}
