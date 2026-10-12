import {
  ClipboardList,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  MapPin,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { AppShell, type ShellNavItem } from "@/components/layout/AppShell";
import { getBrand } from "@/components/layout/brand";

/** Structura zonei de administrare (componentă server: citește APP_NAME/COMPANY_NAME). */
export function AdminShell({
  children,
  userName,
  userEmail,
  pendingCount,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  pendingCount: number | null;
}) {
  const { appName, companyName } = getBrand();

  const navItems: ShellNavItem[] = [
    { href: "/admin", label: "Panou", icon: <LayoutDashboard />, exact: true },
    {
      href: "/admin/cereri",
      label: "Cereri",
      icon: <ClipboardList />,
      badge: pendingCount ?? undefined,
      badgeLabel: pendingCount === 1 ? "cerere în așteptare" : "cereri în așteptare",
    },
    { href: "/admin/utilizatori", label: "Utilizatori", icon: <Users /> },
    { href: "/admin/puncte-lucru", label: "Puncte de lucru", icon: <MapPin /> },
    { href: "/admin/reguli", label: "Reguli", icon: <SlidersHorizontal /> },
    { href: "/admin/rapoarte", label: "Rapoarte", icon: <FileSpreadsheet /> },
    { href: "/admin/jurnal", label: "Jurnal activitate", icon: <History /> },
  ];

  return (
    <AppShell
      appName={appName}
      subtitle={companyName}
      homeHref="/admin"
      navLabel="Administrare"
      navItems={navItems}
      user={{ name: userName, email: userEmail }}
    >
      {children}
    </AppShell>
  );
}
