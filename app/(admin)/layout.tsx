import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
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
        <nav className="text-sm text-muted-foreground space-y-1">
          <p className="text-foreground font-medium">Dashboard</p>
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
