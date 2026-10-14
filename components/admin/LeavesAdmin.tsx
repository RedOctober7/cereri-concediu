"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import type { LeaveStatus } from "@prisma/client";
import { toast } from "sonner";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Inbox,
  Loader2,
  Search,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { leaveStatusClassName, leaveStatusLabel } from "@/lib/leaves/status";
import type { ColleagueAbsenceView } from "@/lib/leaves/colleague-absences";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDays } from "@/components/admin/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NO_WORK_POINT,
  SEARCH_MAX_LENGTH,
  cereriHref,
  type CereriQuery,
  type StatusFilter,
} from "@/app/(admin)/admin/cereri/query";

/** O cerere pregătită de server pentru listă (datele sunt deja formatate). */
export type AdminLeaveRow = {
  id: string;
  employeeName: string;
  jobTitle: string;
  email: string;
  employeeInactive: boolean;
  workPointName: string | null;
  period: string;
  workingDays: number;
  /** Soldul curent al angajatului (zilele cererilor în așteptare nu sunt scăzute). */
  employeeAvailableDays: number;
  /** Concediu aprobat care nu a început: adminul îl poate anula (zilele se întorc în sold). */
  cancellable: boolean;
  status: LeaveStatus;
  violationReasons: string[];
  rejectionReason: string | null;
  /** „10.10.2026” și „17:03”, în ora României. */
  createdDate: string;
  createdTime: string;
  approvedAt: string | null;
  approvedBy: string | null;
  /**
   * La cererile în așteptare: colegii de la același punct de lucru care lipsesc în
   * perioada cererii (concediu aprobat sau cerere în așteptare). Gol la celelalte.
   */
  colleagueAbsences: ColleagueAbsenceView[];
};

export type StatusTab = {
  value: StatusFilter;
  label: string;
  count: number;
  href: string;
};

type Pagination = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  prevHref: string | null;
  nextHref: string | null;
};

type ApiResult = { error?: string; warning?: string; code?: string };

const REJECT_MIN_LENGTH = 10;
const SEARCH_DEBOUNCE_MS = 350;

function workingDaysLabel(days: number): string {
  if (days === 1) return "1 zi lucrătoare";
  const lastTwo = days % 100;
  return `${days} ${lastTwo === 0 || lastTwo >= 20 ? "de " : ""}zile lucrătoare`;
}

function requestsLabel(count: number): string {
  if (count === 1) return "1 cerere";
  const lastTwo = count % 100;
  return `${count} ${count !== 0 && (lastTwo === 0 || lastTwo >= 20) ? "de " : ""}cereri`;
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge className={leaveStatusClassName(status)}>{leaveStatusLabel(status)}</Badge>;
}

function ViolationHint({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
      {count === 1 ? "Încalcă o regulă" : `Încalcă ${count} reguli`}
    </span>
  );
}

function colleaguesLabel(count: number): string {
  if (count === 1) return "1 coleg lipsește";
  const lastTwo = count % 100;
  return `${count} ${lastTwo === 0 || lastTwo >= 20 ? "de " : ""}colegi lipsesc`;
}

/** „Ioana Stan (14–16 oct 2026)”, „Mihai Pop (15 oct 2026, în așteptare)”. */
function colleagueAbsenceText(colleague: ColleagueAbsenceView): string {
  const periods = colleague.periods
    .map((period) => (period.pending ? `${period.label}, în așteptare` : period.label))
    .join("; ");
  return `${colleague.name} (${periods})`;
}

function ColleagueHint({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Users aria-hidden="true" className="size-3.5 shrink-0" />
      {colleaguesLabel(count)}
    </span>
  );
}

/** Totalul din tab; pulsează cât timp se încarcă tabul apăsat (fără să mute layout-ul). */
function TabCount({ count, active }: { count: number; active: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        "min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs leading-none tabular-nums",
        active ? "bg-primary text-primary-foreground" : "bg-foreground/5 dark:bg-foreground/10",
        pending && "animate-pulse"
      )}
    >
      {count}
    </span>
  );
}

function StatusTabs({
  tabs,
  active,
  onTabClick,
}: {
  tabs: StatusTab[];
  active: StatusFilter;
  onTabClick: (value: StatusFilter, event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <nav aria-label="Filtrează după status" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="inline-flex min-w-max items-center gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => {
          const isActive = tab.value === active;
          return (
            <li key={tab.value}>
              <Link
                href={tab.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => onTabClick(tab.value, event)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-background font-medium text-foreground shadow-sm dark:bg-input/40"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <TabCount count={tab.count} active={isActive} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function LeavesAdmin({
  rows,
  query,
  tabs,
  workPoints,
  pagination,
}: {
  rows: AdminLeaveRow[];
  query: CereriQuery;
  tabs: StatusTab[];
  workPoints: { id: string; name: string; active: boolean }[];
  pagination: Pagination;
}) {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [isRefreshing, startRefresh] = useTransition();

  // Căutarea: câmp controlat, URL-ul se actualizează după o scurtă pauză la tastare.
  const [search, setSearch] = useState(query.q);
  const [requestedQ, setRequestedQ] = useState(query.q);
  const [seenQ, setSeenQ] = useState(query.q);
  if (query.q !== seenQ) {
    // URL-ul s-a schimbat; dacă nu e rezultatul tastării de aici (ex. „Înapoi”), îl preluăm.
    setSeenQ(query.q);
    if (query.q !== requestedQ) {
      setSearch(query.q);
      setRequestedQ(query.q);
    }
  }
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const [detailsRow, setDetailsRow] = useState<AdminLeaveRow | null>(null);
  const [cancelRow, setCancelRow] = useState<AdminLeaveRow | null>(null);
  const [approveRow, setApproveRow] = useState<AdminLeaveRow | null>(null);
  /** Serverul a cerut confirmarea aprobării peste sold (409 NEGATIVE_BALANCE). */
  const [confirmNegative, setConfirmNegative] = useState(false);
  const approveBalanceAfter = approveRow
    ? Math.round((approveRow.employeeAvailableDays - approveRow.workingDays) * 100) / 100
    : 0;
  const approveNegative = approveBalanceAfter < 0 || confirmNegative;
  const [rejectRow, setRejectRow] = useState<AdminLeaveRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTouched, setRejectTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting || isRefreshing;
  const trimmedReason = rejectReason.trim();
  const reasonTooShort = trimmedReason.length < REJECT_MIN_LENGTH;
  const hasFilters = query.q !== "" || query.wp !== "";
  const firstIndex = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastIndex = Math.min(pagination.page * pagination.pageSize, pagination.total);

  function navigate(next: Partial<CereriQuery>, mode: "push" | "replace" = "push") {
    const href = cereriHref({ status: query.status, q: requestedQ, wp: query.wp, ...next, page: 1 });
    startNavigation(() => {
      if (mode === "replace") {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    });
  }

  function cancelPendingSearch(): boolean {
    if (debounceRef.current === null) return false;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    return true;
  }

  function applySearch(value: string) {
    cancelPendingSearch();
    const q = value.trim();
    if (q === requestedQ) return;
    setRequestedQ(q);
    navigate({ q }, "replace");
  }

  function onSearchChange(value: string) {
    setSearch(value);
    cancelPendingSearch();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      applySearch(value);
    }, SEARCH_DEBOUNCE_MS);
  }

  /** Textul tastat încă netrimis intră în navigarea următoare (tab, punct de lucru). */
  function takeSearch(): string {
    cancelPendingSearch();
    const q = search.trim();
    setRequestedQ(q);
    return q;
  }

  function onTabClick(value: StatusFilter, event: React.MouseEvent<HTMLAnchorElement>) {
    if (debounceRef.current === null) return;
    event.preventDefault();
    navigate({ status: value, q: takeSearch() });
  }

  function clearFilters() {
    cancelPendingSearch();
    setSearch("");
    setRequestedQ("");
    navigate({ q: "", wp: "" });
  }

  function openReject(row: AdminLeaveRow) {
    setRejectReason("");
    setRejectTouched(false);
    setDetailsRow(null);
    setRejectRow(row);
  }

  function openApprove(row: AdminLeaveRow) {
    setConfirmNegative(false);
    setDetailsRow(null);
    setApproveRow(row);
  }

  async function decide(
    row: AdminLeaveRow,
    action: "approve" | "reject" | "cancel",
    allowNegativeBalance = false
  ) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/leaves/${row.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reject"
            ? { rejectionReason: trimmedReason }
            : action === "approve"
              ? { allowNegativeBalance }
              : {}
        ),
      });
      // O sesiune expirată e redirecționată (de proxy) spre /login, care răspunde 200 cu
      // HTML: fără verificarea asta am afișa „aprobată” deși nu s-a întâmplat nimic.
      const data = res.redirected
        ? null
        : ((await res.json().catch(() => null)) as ApiResult | null);
      if (res.ok && (data === null || typeof data !== "object")) {
        toast.error(
          "Sesiunea a expirat sau serverul a răspuns neașteptat. Reîncarcă pagina și autentifică-te din nou."
        );
        return;
      }

      // Soldul s-a schimbat între timp: dialogul rămâne deschis și cere confirmarea.
      if (res.status === 409 && data?.code === "NEGATIVE_BALANCE" && action === "approve") {
        toast.warning(data.error ?? "Aprobarea ar face soldul negativ. Confirmă dacă vrei să continui.");
        setConfirmNegative(true);
        return;
      }

      if (!res.ok || !data) {
        toast.error(data?.error ?? "A apărut o eroare. Reîncearcă.");
        // 4xx = cererea s-a schimbat între timp (sau nu mai există): închidem și reîncărcăm.
        if (res.status < 500) {
          setApproveRow(null);
          setRejectRow(null);
          setCancelRow(null);
          startRefresh(() => router.refresh());
        }
        return;
      }

      if (data.warning) {
        toast.warning(data.warning);
      } else {
        toast.success(
          action === "approve"
            ? "Cererea a fost aprobată."
            : action === "reject"
              ? "Cererea a fost respinsă."
              : "Concediul a fost anulat, iar zilele au revenit în sold."
        );
      }
      setApproveRow(null);
      setRejectRow(null);
      setCancelRow(null);
      startRefresh(() => router.refresh());
    } catch {
      toast.error("Serverul nu a putut fi contactat. Verifică conexiunea și reîncearcă.");
    } finally {
      setSubmitting(false);
    }
  }

  function rowActions(row: AdminLeaveRow, size: "sm" | "default") {
    if (row.status !== "PENDING_ADMIN") {
      return (
        <Button
          variant="ghost"
          size={size}
          onClick={() => setDetailsRow(row)}
          aria-label={`Detalii cerere ${row.employeeName}, ${row.period}`}
        >
          <Eye />
          Detalii
        </Button>
      );
    }
    return (
      <>
        <Button
          variant="destructive"
          size={size}
          disabled={busy}
          onClick={() => openReject(row)}
          aria-label={`Respinge cererea: ${row.employeeName}, ${row.period}`}
          className={size === "default" ? "h-10 flex-1" : undefined}
        >
          <X />
          Respinge
        </Button>
        <Button
          size={size}
          disabled={busy}
          onClick={() => openApprove(row)}
          aria-label={`Aprobă cererea: ${row.employeeName}, ${row.period}`}
          className={size === "default" ? "h-10 flex-1" : undefined}
        >
          <Check />
          Aprobă
        </Button>
      </>
    );
  }

  function employeeButton(row: AdminLeaveRow) {
    return (
      <button
        type="button"
        onClick={() => setDetailsRow(row)}
        className="max-w-full truncate rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {row.employeeName}
      </button>
    );
  }

  const activeTab = tabs.find((tab) => tab.value === query.status);
  const emptyMessage = hasFilters
    ? "Nicio cerere nu corespunde căutării sau filtrului ales."
    : query.status === "pending"
      ? "Nu există cereri în așteptare. Totul este la zi."
      : `Nu există cereri în categoria „${activeTab?.label ?? ""}”.`;

  return (
    <>
      <Card className="gap-0 py-0">
        <div className="space-y-3 border-b p-4">
          <StatusTabs tabs={tabs} active={query.status} onTabClick={onTabClick} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form
              role="search"
              className="relative sm:max-w-xs sm:flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                applySearch(search);
              }}
            >
              <Label htmlFor="cereri-cautare" className="sr-only">
                Caută după numele angajatului
              </Label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="cereri-cautare"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Caută angajat..."
                maxLength={SEARCH_MAX_LENGTH}
                autoComplete="off"
                enterKeyHint="search"
                className="h-9 pr-9 pl-8"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Șterge căutarea"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  onClick={() => {
                    setSearch("");
                    applySearch("");
                  }}
                >
                  <X />
                </Button>
              ) : null}
            </form>
            <div className="sm:w-56">
              <Label htmlFor="cereri-punct" className="sr-only">
                Punct de lucru
              </Label>
              <NativeSelect
                id="cereri-punct"
                value={query.wp}
                onChange={(event) => navigate({ wp: event.target.value, q: takeSearch() })}
                className="h-9"
              >
                <option value="">Toate punctele de lucru</option>
                {workPoints.map((wp) => (
                  <option key={wp.id} value={wp.id}>
                    {wp.active ? wp.name : `${wp.name} (inactiv)`}
                  </option>
                ))}
                <option value={NO_WORK_POINT}>Fără punct de lucru</option>
              </NativeSelect>
            </div>
            {hasFilters ? (
              <Button variant="ghost" className="h-9 self-start sm:self-auto" onClick={clearFilters}>
                Șterge filtrele
              </Button>
            ) : null}
            <span
              className={cn(
                "ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground transition-opacity sm:flex",
                isNavigating || isRefreshing ? "opacity-100" : "opacity-0"
              )}
              aria-hidden="true"
            >
              <Loader2 className="size-3.5 animate-spin" />
              Se actualizează
            </span>
          </div>
        </div>

        <p className="sr-only" aria-live="polite">
          {requestsLabel(pagination.total)} {pagination.total === 1 ? "găsită" : "găsite"}.
        </p>

        <CardContent
          className={cn("px-0 transition-opacity", (isNavigating || isRefreshing) && "opacity-60")}
          aria-busy={isNavigating || isRefreshing}
        >
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox aria-hidden="true" className="size-5" />
              </span>
              <p className="font-medium">Nicio cerere</p>
              <p className="max-w-sm text-sm text-muted-foreground">{emptyMessage}</p>
              {hasFilters ? (
                <Button variant="outline" className="mt-2" onClick={clearFilters}>
                  Șterge filtrele
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {/* Desktop: tabel */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Angajat · punct de lucru</TableHead>
                      <TableHead>Perioadă · zile lucrătoare</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Depusă</TableHead>
                      <TableHead className="pr-4 text-right">
                        <span className="sr-only">Acțiuni</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-64 pl-4">
                          <div className="flex min-w-0 flex-col">
                            {employeeButton(row)}
                            <span className="truncate text-xs text-muted-foreground">
                              {row.workPointName ?? "Fără punct de lucru"} · {row.jobTitle}
                              {row.employeeInactive ? " · cont inactiv" : ""}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{row.period}</span>
                            <span className="text-xs text-muted-foreground">
                              {workingDaysLabel(row.workingDays)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={row.status} />
                            {row.status === "PENDING_ADMIN" ? (
                              <>
                                <ViolationHint count={row.violationReasons.length} />
                                <ColleagueHint count={row.colleagueAbsences.length} />
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          <div className="flex flex-col">
                            <span>{row.createdDate}</span>
                            <span className="text-xs">{row.createdTime}</span>
                          </div>
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex justify-end gap-1.5">{rowActions(row, "sm")}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobil: carduri */}
              <ul className="divide-y md:hidden">
                {rows.map((row) => (
                  <li key={row.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        {employeeButton(row)}
                        <span className="truncate text-xs text-muted-foreground">
                          {row.workPointName ?? "Fără punct de lucru"} · {row.jobTitle}
                          {row.employeeInactive ? " · cont inactiv" : ""}
                        </span>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                      <span className="font-medium">{row.period}</span>
                      <span className="text-muted-foreground">{workingDaysLabel(row.workingDays)}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        Depusă {row.createdDate}, {row.createdTime}
                      </span>
                      {row.status === "PENDING_ADMIN" ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <ViolationHint count={row.violationReasons.length} />
                          <ColleagueHint count={row.colleagueAbsences.length} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex gap-2">{rowActions(row, "default")}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>

        {pagination.total > 0 ? (
          <CardFooter className="flex-col gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {firstIndex}–{lastIndex} din {pagination.total}
            </p>
            <nav aria-label="Paginare" className="flex items-center gap-2">
              {pagination.prevHref ? (
                <Link
                  href={pagination.prevHref}
                  scroll={false}
                  rel="prev"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <ChevronLeft data-icon="inline-start" />
                  Anterioară
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft data-icon="inline-start" />
                  Anterioară
                </Button>
              )}
              <span className="px-1 text-sm tabular-nums">
                Pagina {pagination.page} din {pagination.totalPages}
              </span>
              {pagination.nextHref ? (
                <Link
                  href={pagination.nextHref}
                  scroll={false}
                  rel="next"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Următoarea
                  <ChevronRight data-icon="inline-end" />
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Următoarea
                  <ChevronRight data-icon="inline-end" />
                </Button>
              )}
            </nav>
          </CardFooter>
        ) : null}
      </Card>

      {/* Detalii cerere */}
      <Dialog open={detailsRow !== null} onOpenChange={(open) => !open && setDetailsRow(null)}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        >
          {detailsRow ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailsRow.employeeName}</DialogTitle>
                <DialogDescription>
                  {detailsRow.jobTitle} · {detailsRow.workPointName ?? "Fără punct de lucru"}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Perioadă</dt>
                <dd>{detailsRow.period}</dd>
                <dt className="text-muted-foreground">Durată</dt>
                <dd>{workingDaysLabel(detailsRow.workingDays)}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={detailsRow.status} />
                </dd>
                <dt className="text-muted-foreground">Depusă</dt>
                <dd className="tabular-nums">
                  {detailsRow.createdDate}, {detailsRow.createdTime}
                </dd>
                {detailsRow.approvedAt ? (
                  <>
                    <dt className="text-muted-foreground">Aprobată</dt>
                    <dd className="tabular-nums">
                      {detailsRow.approvedAt}
                      {detailsRow.approvedBy ? ` · ${detailsRow.approvedBy}` : ""}
                    </dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{detailsRow.email}</dd>
              </dl>
              {detailsRow.violationReasons.length > 0 ? (
                <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <TriangleAlert aria-hidden="true" className="size-4 text-muted-foreground" />
                    {detailsRow.status === "PENDING_ADMIN"
                      ? "Atenționări pentru decizia ta"
                      : "Reguli încălcate la depunere"}
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {detailsRow.violationReasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detailsRow.colleagueAbsences.length > 0 ? (
                <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Users aria-hidden="true" className="size-4 text-muted-foreground" />
                    Colegi de la același punct de lucru care lipsesc
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {detailsRow.colleagueAbsences.map((colleague, index) => (
                      <li key={index}>{colleagueAbsenceText(colleague)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detailsRow.rejectionReason ? (
                <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">Motivul respingerii</p>
                  <p className="text-sm whitespace-pre-line">{detailsRow.rejectionReason}</p>
                </div>
              ) : null}
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Închide</DialogClose>
                {detailsRow.status === "PENDING_ADMIN" ? (
                  <>
                    <Button variant="destructive" disabled={busy} onClick={() => openReject(detailsRow)}>
                      <X />
                      Respinge
                    </Button>
                    <Button disabled={busy} onClick={() => openApprove(detailsRow)}>
                      <Check />
                      Aprobă
                    </Button>
                  </>
                ) : null}
                {detailsRow.cancellable ? (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      setCancelRow(detailsRow);
                      setDetailsRow(null);
                    }}
                  >
                    <X />
                    Anulează concediul
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Confirmare anulare concediu aprobat */}
      <AlertDialog
        open={cancelRow !== null}
        onOpenChange={(open) => !open && !submitting && setCancelRow(null)}
      >
        <AlertDialogContent>
          {cancelRow ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Anulezi concediul aprobat?</AlertDialogTitle>
                <AlertDialogDescription>
                  {cancelRow.employeeName} · {cancelRow.period} ·{" "}
                  {workingDaysLabel(cancelRow.workingDays)}. Zilele se întorc în soldul
                  angajatului, iar acțiunea apare în jurnal. Anunță angajatul despre anulare.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>Renunță</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={submitting}
                  onClick={() => void decide(cancelRow, "cancel")}
                >
                  {submitting ? <Loader2 className="animate-spin" /> : <X />}
                  {submitting ? "Se anulează..." : "Anulează concediul"}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmare aprobare */}
      <AlertDialog
        open={approveRow !== null}
        onOpenChange={(open) => !open && !submitting && setApproveRow(null)}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {approveRow ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Aprobi cererea?</AlertDialogTitle>
                <AlertDialogDescription>
                  {approveRow.employeeName} · {approveRow.period} ·{" "}
                  {workingDaysLabel(approveRow.workingDays)}. Zilele se scad din sold, iar
                  angajatul primește pe email confirmarea, cu cererea în PDF.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <p className="text-sm">
                Sold actual: <strong>{formatDays(approveRow.employeeAvailableDays)}</strong> ·
                după aprobare:{" "}
                <strong className={cn(approveNegative && "text-destructive")}>
                  {formatDays(approveBalanceAfter)}
                </strong>
              </p>
              {approveRow.colleagueAbsences.length > 0 ? (
                <p className="flex gap-1.5 text-sm text-muted-foreground">
                  <Users aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    În aceeași perioadă{" "}
                    {approveRow.colleagueAbsences.length === 1 ? "lipsește" : "lipsesc"} și:{" "}
                    {approveRow.colleagueAbsences.map(colleagueAbsenceText).join(", ")}.
                  </span>
                </p>
              ) : null}
              {approveNegative ? (
                <Alert variant="destructive">
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>
                    Soldul angajatului devine negativ. Aprobă doar dacă firma acordă concediu în
                    avans; altfel respinge cererea sau ajustează soldul din fișa angajatului.
                  </AlertDescription>
                </Alert>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>Renunță</AlertDialogCancel>
                <Button
                  variant={approveNegative ? "destructive" : "default"}
                  disabled={submitting}
                  onClick={() => void decide(approveRow, "approve", approveNegative)}
                >
                  {submitting ? <Loader2 className="animate-spin" /> : <Check />}
                  {submitting ? "Se aprobă..." : approveNegative ? "Aprobă oricum" : "Aprobă"}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      {/* Respingere cu motiv */}
      <Dialog
        open={rejectRow !== null}
        onOpenChange={(open) => !open && !submitting && setRejectRow(null)}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          {rejectRow ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setRejectTouched(true);
                if (!reasonTooShort) {
                  void decide(rejectRow, "reject");
                }
              }}
            >
              <DialogHeader>
                <DialogTitle>Respinge cererea</DialogTitle>
                <DialogDescription>
                  {rejectRow.employeeName} · {rejectRow.period}. Angajatul primește motivul pe email.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="motiv-respingere">Motivul respingerii</Label>
                <Textarea
                  id="motiv-respingere"
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  onBlur={() => setRejectTouched(true)}
                  placeholder="Ex.: În perioada aleasă sunt deja doi colegi în concediu."
                  rows={4}
                  maxLength={1000}
                  disabled={submitting}
                  aria-invalid={rejectTouched && reasonTooShort}
                  aria-describedby="motiv-respingere-ajutor"
                />
                <p
                  id="motiv-respingere-ajutor"
                  className={cn(
                    "text-xs",
                    rejectTouched && reasonTooShort ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {rejectTouched && reasonTooShort
                    ? `Motivul trebuie să aibă minim ${REJECT_MIN_LENGTH} caractere (acum ${trimmedReason.length}).`
                    : `Minim ${REJECT_MIN_LENGTH} caractere.`}
                </p>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" disabled={submitting} />}>
                  Renunță
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : <X />}
                  {submitting ? "Se respinge..." : "Respinge cererea"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
