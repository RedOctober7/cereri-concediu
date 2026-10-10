import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/layout/AdminShell";

// Tot segmentul /admin depinde de sesiune și de baza de date: îl declarăm dinamic,
// ca `next build` să nu încerce să-l prerandeze (și să interogheze DB-ul). Fără
// Cache Components acesta e modul suportat; cu `cacheComponents` activ opțiunea
// dispare (paginile sunt oricum dinamice) și trebuie ștearsă.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
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

  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  // O eroare de DB aici nu trebuie să ascundă tot meniul: pagina își arată
  // propria eroare (error.tsx), iar antetul rămâne cu datele din sesiune.
  const [user, pendingCount] = await Promise.all([
    prisma.user
      .findUnique({
        where: { id: session.user.id },
        select: { email: true, firstName: true, lastName: true },
      })
      .catch((error: unknown) => {
        console.error("[Admin layout] utilizator:", error);
        return null;
      }),
    prisma.leaveRequest
      .count({ where: { status: "PENDING_ADMIN" } })
      .catch((error: unknown) => {
        console.error("[Admin layout] cereri în așteptare:", error);
        return null;
      }),
  ]);

  const userName =
    user != null
      ? `${user.firstName} ${user.lastName}`
      : (session.user.name ?? "Administrator");
  const userEmail = user?.email ?? session.user.email ?? "";

  return (
    <AdminShell userName={userName} userEmail={userEmail} pendingCount={pendingCount}>
      {children}
    </AdminShell>
  );
}
