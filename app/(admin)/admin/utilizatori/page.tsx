import { prisma } from "@/lib/db";
import { UsersAdmin } from "@/components/admin/UsersAdmin";

export default async function UsersPage() {
  const [users, workPoints] = await Promise.all([
    prisma.user.findMany({
      where: { role: "EMPLOYEE" },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Utilizatori</h1>
        <p className="text-muted-foreground">
          Creează, editează și dezactivează conturi de angajați.
        </p>
      </div>
      <UsersAdmin initialUsers={users} workPoints={workPoints} />
    </div>
  );
}
