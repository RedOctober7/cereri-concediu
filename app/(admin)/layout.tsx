import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="md:w-64 bg-sidebar text-sidebar-foreground flex flex-col">
        {/* Header sidebar */}
        <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
          <Image src="/logo.svg" alt="Logo" width={40} height={40} />
          <div>
            <p className="font-bold text-sm text-sidebar-foreground">Cereri Concediu</p>
            <p className="text-xs text-sidebar-foreground/60">Viomed Farm</p>
          </div>
        </div>

        {/* Navigare */}
        <nav className="flex-1 p-4 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 mb-3 px-2">
            Administrare
          </p>
          {[
            { href: "/admin", label: "Dashboard", icon: "📊" },
            { href: "/admin/utilizatori", label: "Utilizatori", icon: "👥" },
            { href: "/admin/puncte-lucru", label: "Puncte de lucru", icon: "📍" },
            { href: "/admin/reguli", label: "Reguli", icon: "⚙️" },
            { href: "/admin/cereri", label: "Cereri", icon: "📋" },
            { href: "/admin/rapoarte", label: "Rapoarte", icon: "📈" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer sidebar */}
        <div className="p-4 border-t border-sidebar-border">
          <p className="text-xs text-sidebar-foreground/40 text-center">
            Administrator
          </p>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-6 bg-background">{children}</main>
    </div>
  );
}