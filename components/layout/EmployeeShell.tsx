"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  CalendarPlus,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cereri/noua", label: "Cerere nouă", icon: CalendarPlus },
  { href: "/cereri", label: "Cererile mele", icon: ClipboardList },
  { href: "/profil", label: "Profil", icon: User },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function EmployeeShell({
  children,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
          <Image src="/logo.svg" alt="Logo" width={40} height={40} />
          <div>
            <p className="font-bold text-sm text-sidebar-foreground">Cereri Concediu</p>
            <p className="text-xs text-sidebar-foreground/60">Viomed Farm</p>
          </div>
        </div>
        <div className="flex-1 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 mb-3 px-2">
            Meniu
          </p>
          <NavLinks />
        </div>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{userEmail}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* Header mobile */}
        <header className="flex h-14 items-center justify-between border-b bg-sidebar px-4 md:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Meniu" className="text-sidebar-foreground">
                    <Menu className="size-5" />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-72 bg-sidebar text-sidebar-foreground">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-3 text-sidebar-foreground">
                    <Image src="/logo.svg" alt="Logo" width={32} height={32} />
                    Cereri Concediu
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-bold text-sidebar-foreground">Cereri Concediu</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="gap-2 px-2 text-sidebar-foreground">
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{userEmail}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={<Link href="/profil" className="flex items-center gap-2" />}
              >
                <User className="size-4" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="size-4" />
                Deconectare
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 md:p-6 bg-background">{children}</main>
      </div>
    </div>
  );
}