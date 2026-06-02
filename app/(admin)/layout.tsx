import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";

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

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      <aside className="border-b md:border-b-0 md:border-r md:w-56 bg-card p-4">
        <p className="font-semibold text-sm mb-2">Administrare</p>
        <nav className="text-sm space-y-1">
          <Link href="/admin" className="block text-foreground font-medium">
            Dashboard
          </Link>
          <Link href="/admin/puncte-lucru" className="block text-muted-foreground">
            Puncte de lucru
          </Link>
          <Link href="/admin/utilizatori" className="block text-muted-foreground">
            Utilizatori
          </Link>
          <Link href="/admin/reguli" className="block text-muted-foreground">
            Reguli
          </Link>
          <Link href="/admin/cereri" className="block text-muted-foreground">
            Cereri
          </Link>
          <Link href="/admin/rapoarte" className="block text-muted-foreground">
            Rapoarte
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}