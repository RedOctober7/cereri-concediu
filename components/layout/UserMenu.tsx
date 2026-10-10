"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type UserMenuLink = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

export function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function useSignOut() {
  const [signingOut, setSigningOut] = useState(false);

  function handleSignOut() {
    setSigningOut(true);
    void signOut({ callbackUrl: "/login" }).catch(() => setSigningOut(false));
  }

  return { signingOut, signOut: handleSignOut };
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Meniul contului: nume, email, linkuri opționale și „Deconectare”.
 * `sidebar` = rândul complet din subsolul barei laterale; `compact` = doar avatarul (antet mobil).
 */
export function UserMenu({
  name,
  email,
  links = [],
  variant,
}: {
  name: string;
  email: string;
  links?: UserMenuLink[];
  variant: "sidebar" | "compact";
}) {
  const { signingOut, signOut } = useSignOut();

  const trigger =
    variant === "sidebar" ? (
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring aria-expanded:bg-sidebar-accent"
      />
    ) : (
      <Button
        variant="ghost"
        size="icon-lg"
        aria-label={`Contul meu: ${name}`}
        className="rounded-full hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent dark:hover:bg-sidebar-accent"
      />
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>
        <UserAvatar name={name} />
        {variant === "sidebar" ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-sidebar-foreground">
                {name}
              </span>
              <span className="block truncate text-xs text-sidebar-foreground/60">
                {email}
              </span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-sidebar-foreground/60" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "sidebar" ? "top" : "bottom"}
        align={variant === "sidebar" ? "start" : "end"}
        className={variant === "sidebar" ? "min-w-56" : "w-60"}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="space-y-0.5 py-1.5">
            <span className="block truncate text-sm font-medium text-popover-foreground">
              {name}
            </span>
            <span className="block truncate text-xs font-normal">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {links.map((link) => (
          <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
            {link.icon}
            {link.label}
          </DropdownMenuItem>
        ))}
        {links.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem variant="destructive" disabled={signingOut} onClick={signOut}>
          <LogOut />
          {signingOut ? "Se deconectează..." : "Deconectare"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
