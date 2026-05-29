import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LeaveRequestForm } from "@/components/forms/LeaveRequestForm";

export default async function NewLeaveRequestPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { availableDays: true },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cerere nouă</h1>
        <p className="text-muted-foreground">
          Selectează perioada de concediu și verifică regulile înainte de trimitere.
        </p>
      </div>
      <LeaveRequestForm initialAvailableDays={user?.availableDays ?? 0} />
    </div>
  );
}
