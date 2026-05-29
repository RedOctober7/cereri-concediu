import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProfileContent } from "@/components/employee/ProfileContent";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [user, accruals] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        employer: true,
        hireDate: true,
        workPoint: { select: { name: true } },
      },
    }),
    prisma.leaveAccrual.findMany({
      where: { userId: session.user.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
        <p className="text-muted-foreground">
          Datele contului tău și istoricul zilelor de concediu.
        </p>
      </div>
      <ProfileContent user={user} accruals={accruals} />
    </div>
  );
}
