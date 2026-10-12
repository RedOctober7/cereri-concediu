"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, SearchX, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ActiveBadge, DaysValue, EmptyState, PageHeader } from "@/components/admin/admin-ui";
import { normalizeSearch, pluralRo } from "@/components/admin/format";
import { UserCreateDialog, type CreatedUser } from "@/components/admin/UserCreateDialog";
import type { WorkPointOption } from "@/components/admin/user-fields";
import { cn } from "@/lib/utils";

export type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  jobTitle: string;
  active: boolean;
  availableDays: number;
  mustChangePassword: boolean;
  workPoint: { id: string; name: string } | null;
};

export type UserStatusFilter = "toti" | "activi" | "inactivi";

export type UserFilters = {
  q: string;
  status: UserStatusFilter;
  /** "" = toate, NO_WORK_POINT = fără punct de lucru, altfel id-ul punctului. */
  workPoint: string;
};

const NO_WORK_POINT = "fara";

const STATUS_OPTIONS: { value: UserStatusFilter; label: string }[] = [
  { value: "toti", label: "Toți" },
  { value: "activi", label: "Activi" },
  { value: "inactivi", label: "Inactivi" },
];

function matchesStatus(user: UserRow, status: UserStatusFilter) {
  return status === "toti" || (status === "activi" ? user.active : !user.active);
}

function matchesWorkPoint(user: UserRow, workPoint: string) {
  if (!workPoint) {
    return true;
  }
  return workPoint === NO_WORK_POINT ? user.workPoint === null : user.workPoint?.id === workPoint;
}

function userHref(id: string) {
  return `/admin/utilizatori/${id}`;
}

function StatusCell({ user }: { user: UserRow }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActiveBadge active={user.active} />
      {user.active && user.mustChangePassword ? (
        <Badge variant="secondary" title="Angajatul trebuie să își schimbe parola la autentificare">
          Parolă temporară
        </Badge>
      ) : null}
    </div>
  );
}

export function UsersAdmin({
  users,
  workPoints,
  initialFilters,
  defaultEmployer,
  jobTitles,
}: {
  users: UserRow[];
  workPoints: WorkPointOption[];
  initialFilters: UserFilters;
  defaultEmployer: string;
  jobTitles: string[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [filters, setFilters] = useState<UserFilters>(() => ({
    ...initialFilters,
    // Un id din URL care nu mai există nu trebuie să ascundă toată lista.
    workPoint:
      initialFilters.workPoint === NO_WORK_POINT ||
      workPoints.some((workPoint) => workPoint.id === initialFilters.workPoint)
        ? initialFilters.workPoint
        : "",
  }));

  // Filtrele stau în URL: la întoarcerea din pagina unui angajat lista rămâne filtrată.
  useEffect(() => {
    const params = new URLSearchParams();
    const q = filters.q.trim();
    if (q) params.set("q", q);
    if (filters.status !== "toti") params.set("status", filters.status);
    if (filters.workPoint) params.set("punct", filters.workPoint);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [filters]);

  const terms = useMemo(
    () => normalizeSearch(filters.q).split(/\s+/).filter(Boolean),
    [filters.q]
  );

  // Căutarea și punctul de lucru se aplică întâi; numărul de pe fiecare status vine după ele.
  const searched = useMemo(
    () =>
      users.filter((user) => {
        if (!matchesWorkPoint(user, filters.workPoint)) {
          return false;
        }
        if (terms.length === 0) {
          return true;
        }
        const haystack = normalizeSearch(
          `${user.lastName} ${user.firstName} ${user.username} ${user.email}`
        );
        return terms.every((term) => haystack.includes(term));
      }),
    [users, terms, filters.workPoint]
  );
  const visible = searched.filter((user) => matchesStatus(user, filters.status));
  const statusCount = (status: UserStatusFilter) =>
    searched.filter((user) => matchesStatus(user, status)).length;
  const hasFilters = terms.length > 0 || filters.status !== "toti" || filters.workPoint !== "";

  function update(next: Partial<UserFilters>) {
    setFilters((current) => ({ ...current, ...next }));
  }

  function clearFilters() {
    setFilters({ q: "", status: "toti", workPoint: "" });
  }

  /**
   * `emailFailed`: emailul de bun venit nu a plecat, deci dialogul rămâne deschis și
   * arată datele de autentificare, pe care adminul trebuie să le comunice.
   */
  function onCreated(user: CreatedUser, emailFailed: boolean) {
    if (!emailFailed) {
      setCreateOpen(false);
    }
    toast.success(`Contul pentru ${user.firstName} ${user.lastName} a fost creat.`, {
      action: { label: "Deschide", onClick: () => router.push(userHref(user.id)) },
    });
    router.refresh();
  }

  const activeCount = users.filter((user) => user.active).length;

  return (
    <>
      <PageHeader
        title="Utilizatori"
        description={
          users.length > 0
            ? `${pluralRo(users.length, "angajat", "angajați")}, dintre care ${pluralRo(activeCount, "activ", "activi")}.`
            : "Conturile angajaților: date personale, sold de concediu și acces."
        }
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus aria-hidden="true" />
            Adaugă utilizator
          </Button>
        }
      />

      <UserCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workPoints={workPoints}
        jobTitles={jobTitles}
        defaultEmployer={defaultEmployer}
        onCreated={onCreated}
      />

      {users.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={Users}
            title="Niciun angajat încă"
            description="Adaugă primul cont de angajat, ca să poată depune cereri de concediu."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <UserPlus aria-hidden="true" />
                Adaugă utilizator
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
            <div role="search" className="relative lg:max-w-xs lg:flex-1">
              <Label htmlFor="users-search" className="sr-only">
                Caută după nume sau nume de utilizator
              </Label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="users-search"
                type="search"
                value={filters.q}
                onChange={(event) => update({ q: event.target.value })}
                placeholder="Caută după nume sau utilizator"
                autoComplete="off"
                className="h-9 pr-9 pl-8 [&::-webkit-search-cancel-button]:hidden"
              />
              {filters.q ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label="Șterge căutarea"
                  onClick={() => update({ q: "" })}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>

            <div
              role="group"
              aria-label="Filtrează după status"
              className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1"
            >
              {STATUS_OPTIONS.map((option) => {
                const selected = filters.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => update({ status: option.value })}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected && "bg-background text-foreground shadow-sm dark:bg-input/40"
                    )}
                  >
                    {option.label}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {statusCount(option.value)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="lg:ml-auto lg:w-60">
              <Label htmlFor="users-work-point" className="sr-only">
                Punct de lucru
              </Label>
              <NativeSelect
                id="users-work-point"
                className="h-9"
                value={filters.workPoint}
                onChange={(event) => update({ workPoint: event.target.value })}
              >
                <option value="">Toate punctele de lucru</option>
                {workPoints.map((workPoint) => (
                  <option key={workPoint.id} value={workPoint.id}>
                    {workPoint.active ? workPoint.name : `${workPoint.name} (inactiv)`}
                  </option>
                ))}
                <option value={NO_WORK_POINT}>Fără punct de lucru</option>
              </NativeSelect>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {pluralRo(visible.length, "utilizator afișat", "utilizatori afișați")}
          </p>

          {visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Niciun rezultat"
              description="Niciun utilizator nu corespunde căutării și filtrelor alese."
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Resetează filtrele
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Nume</TableHead>
                      <TableHead>Utilizator</TableHead>
                      <TableHead>Funcție</TableHead>
                      <TableHead>Punct de lucru</TableHead>
                      <TableHead className="text-right">Zile disponibile</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((user) => (
                      <TableRow
                        key={user.id}
                        className={cn(
                          "relative cursor-pointer",
                          !user.active && "text-muted-foreground"
                        )}
                      >
                        <TableCell className="max-w-64 py-2.5 pl-4">
                          <Link
                            href={userHref(user.id)}
                            className="flex min-w-0 flex-col outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-3 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset"
                          >
                            <span className="truncate font-medium text-foreground">
                              {user.lastName} {user.firstName}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.username}</TableCell>
                        <TableCell className="max-w-48 truncate">{user.jobTitle}</TableCell>
                        <TableCell className="max-w-48 truncate">
                          {user.workPoint?.name ?? (
                            <span className="text-muted-foreground">Fără punct de lucru</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DaysValue value={user.availableDays} />
                        </TableCell>
                        <TableCell className="pr-4">
                          <StatusCell user={user} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y md:hidden">
                {visible.map((user) => (
                  <li key={user.id}>
                    <Link
                      href={userHref(user.id)}
                      className="flex items-center gap-3 p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p
                              className={cn(
                                "truncate font-medium",
                                !user.active && "text-muted-foreground"
                              )}
                            >
                              {user.lastName} {user.firstName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {user.username}
                            </p>
                          </div>
                          <p className="shrink-0 text-right text-sm">
                            <DaysValue value={user.availableDays} className="font-medium" />{" "}
                            <span className="text-xs text-muted-foreground">zile</span>
                          </p>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {user.jobTitle} · {user.workPoint?.name ?? "Fără punct de lucru"}
                        </p>
                        <StatusCell user={user} />
                      </div>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    </Link>
                  </li>
                ))}
              </ul>

              {hasFilters ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
                  <span>
                    {visible.length} din {pluralRo(users.length, "utilizator", "utilizatori")}
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Resetează filtrele
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      )}
    </>
  );
}
