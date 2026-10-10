import { CalendarPlus, ClipboardList, LayoutDashboard, User } from "lucide-react";
import { AppShell, type ShellNavItem } from "@/components/layout/AppShell";
import { getBrand } from "@/components/layout/brand";

/** Structura zonei de angajat (componentă server: citește APP_NAME/COMPANY_NAME). */
export function EmployeeShell({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const { appName, companyName } = getBrand();

  const navItems: ShellNavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard />, exact: true },
    { href: "/cereri/noua", label: "Cerere nouă", icon: <CalendarPlus /> },
    { href: "/cereri", label: "Cererile mele", icon: <ClipboardList /> },
    { href: "/profil", label: "Profil", icon: <User /> },
  ];

  return (
    <AppShell
      appName={appName}
      subtitle={companyName}
      homeHref="/dashboard"
      navLabel="Meniu"
      navItems={navItems}
      user={{ name: userName, email: userEmail }}
      userLinks={[{ href: "/profil", label: "Profil", icon: <User /> }]}
    >
      {children}
    </AppShell>
  );
}
