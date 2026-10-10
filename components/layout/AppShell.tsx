"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  UserAvatar,
  UserMenu,
  useSignOut,
  type UserMenuLink,
} from "@/components/layout/UserMenu";

export type ShellNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Activ doar pe adresa exactă (ex. /admin nu se aprinde pe /admin/cereri). */
  exact?: boolean;
  /** Număr afișat lângă etichetă; 0 sau lipsă = ascuns. */
  badge?: number;
  /** Textul citit de cititoarele de ecran după număr, ex. „în așteptare”. */
  badgeLabel?: string;
};

type AppShellProps = {
  children: React.ReactNode;
  appName: string;
  subtitle?: string | null;
  homeHref: string;
  navLabel: string;
  navItems: ShellNavItem[];
  user: { name: string; email: string };
  userLinks?: UserMenuLink[];
};

/** Elementul activ = cel mai lung href potrivit (/cereri/noua nu aprinde și /cereri). */
function findActiveHref(pathname: string, items: ShellNavItem[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    const matches = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

function Brand({
  appName,
  subtitle,
  href,
  onNavigate,
}: {
  appName: string;
  subtitle?: string | null;
  href: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <Image src="/logo.svg" alt="" width={36} height={36} className="size-9 shrink-0" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-sidebar-foreground">
          {appName}
        </span>
        {subtitle ? (
          <span className="block truncate text-xs text-sidebar-foreground/60">{subtitle}</span>
        ) : null}
      </span>
    </Link>
  );
}

function NavLinks({
  items,
  onNavigate,
}: {
  items: ShellNavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activeHref = findActiveHref(pathname, items);

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === activeHref;
        const badge = item.badge && item.badge > 0 ? item.badge : null;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar md:min-h-10 [&_svg]:size-4 [&_svg]:shrink-0",
                active
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              {item.icon}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {badge !== null ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs leading-none font-semibold tabular-nums",
                    active
                      ? "bg-primary-foreground text-primary"
                      : "bg-sidebar-primary text-sidebar-primary-foreground"
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                  {item.badgeLabel ? <span className="sr-only"> {item.badgeLabel}</span> : null}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function MobileMenu({
  appName,
  subtitle,
  homeHref,
  navLabel,
  navItems,
  user,
}: Omit<AppShellProps, "children" | "userLinks">) {
  const [open, setOpen] = useState(false);
  const { signingOut, signOut } = useSignOut();
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label="Deschide meniul"
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground data-[side=left]:w-72"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-sidebar-border p-4">
          <SheetTitle className="sr-only">Meniu de navigare</SheetTitle>
          <Brand appName={appName} subtitle={subtitle} href={homeHref} onNavigate={close} />
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Închide meniul"
                className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent"
              />
            }
          >
            <X />
          </SheetClose>
        </SheetHeader>
        <nav aria-label={navLabel} className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/60 uppercase">
            {navLabel}
          </p>
          <NavLinks items={navItems} onNavigate={close} />
        </nav>
        <SheetFooter className="gap-3 border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{user.email}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-11 w-full justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:border-sidebar-border dark:bg-transparent dark:hover:bg-sidebar-accent"
            disabled={signingOut}
            onClick={signOut}
          >
            <LogOut />
            {signingOut ? "Se deconectează..." : "Deconectare"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Structura comună pentru zona de angajat și cea de administrare. */
export function AppShell({
  children,
  appName,
  subtitle,
  homeHref,
  navLabel,
  navItems,
  user,
  userLinks,
}: AppShellProps) {
  return (
    <div className="flex min-h-svh flex-1 flex-col md:flex-row">
      <a
        href="#continut"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-md ring-2 ring-ring focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Sari la conținut
      </a>

      {/* Bara laterală (desktop) */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <Brand appName={appName} subtitle={subtitle} href={homeHref} />
        </div>
        <nav aria-label={navLabel} className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-xs font-semibold tracking-wider text-sidebar-foreground/60 uppercase">
            {navLabel}
          </p>
          <NavLinks items={navItems} />
        </nav>
        <div className="flex items-center gap-1 border-t border-sidebar-border p-3">
          <UserMenu name={user.name} email={user.email} links={userLinks} variant="sidebar" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Antet (mobil) */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-2 text-sidebar-foreground md:hidden">
          <MobileMenu
            appName={appName}
            subtitle={subtitle}
            homeHref={homeHref}
            navLabel={navLabel}
            navItems={navItems}
            user={user}
          />
          <Link
            href={homeHref}
            className="min-w-0 truncate rounded-md text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            {appName}
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <UserMenu name={user.name} email={user.email} links={userLinks} variant="compact" />
          </div>
        </header>

        <main id="continut" tabIndex={-1} className="flex-1 px-4 py-6 outline-none md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
