import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EmployeeShell } from "@/components/layout/EmployeeShell";

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/schimba-parola");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, firstName: true, lastName: true },
  });

  const userName =
    user != null
      ? `${user.firstName} ${user.lastName}`
      : (session.user.name ?? "Utilizator");
  const userEmail = user?.email ?? session.user.email ?? "";

  return (
    <EmployeeShell userName={userName} userEmail={userEmail}>
      {children}
    </EmployeeShell>
  );
}
