import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, ScrollText, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { EmptyState, PageHeader } from "@/components/admin/admin-ui";
import type { AuditDetailItem } from "@/components/admin/audit-format";
import { formatTimestamp, pluralRo } from "@/components/admin/format";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_GROUPS,
  type AuditActionGroup,
} from "@/lib/audit/actions";
import { cn } from "@/lib/utils";
import { SYSTEM_ACTOR } from "@/app/(admin)/admin/jurnal/query";

// Pagina /admin/jurnal: filtre (formular GET, merge și fără JavaScript), lista de
// evenimente (tabel pe desktop, carduri pe mobil) și paginare. Componentă de server.

export type AuditTarget = { label: string; kind: string; href?: string };

export type AuditRow = {
  id: string;
  action: string;
  actionLabel: string;
  destructive: boolean;
  createdAt: string;
  actor: { name: string; isEmployee: boolean } | null;
  target: AuditTarget | null;
  details: AuditDetailItem[];
};

export type AuditActorOption = { id: string; name: string; isEmployee: boolean };

type Query = {
  action: string;
  actor: string;
  from: string;
  to: string;
  target: string;
  page: number;
};

type Pagination = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  prevHref: string | null;
  nextHref: string | null;
};

const ACTION_GROUP_ORDER: AuditActionGroup[] = [
  "users",
  "leaves",
  "workPoints",
  "constraints",
  "system",
];

function ActionBadge({ row }: { row: AuditRow }) {
  return (
    <Badge
      variant={row.destructive ? "destructive" : "secondary"}
      className="h-auto max-w-full py-0.5 text-left whitespace-normal"
    >
      {row.actionLabel}
    </Badge>
  );
}

function Actor({ actor }: { actor: AuditRow["actor"] }) {
  if (!actor) {
    return <span className="text-muted-foreground">Sistem (automat)</span>;
  }
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{actor.name}</span>
      <span className="text-xs text-muted-foreground">
        {actor.isEmployee ? "Angajat" : "Administrator"}
      </span>
    </span>
  );
}

function Target({ target }: { target: AuditTarget | null }) {
  if (!target) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex min-w-0 flex-col">
      {target.href ? (
        <Link
          href={target.href}
          className="truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {target.label}
        </Link>
      ) : (
        <span className="truncate font-medium">{target.label}</span>
      )}
      <span className="truncate text-xs text-muted-foreground">{target.kind}</span>
    </span>
  );
}

function Details({ items }: { items: AuditDetailItem[] }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="contents">
          <dt className="max-w-32 text-muted-foreground">{item.label}</dt>
          <dd className="break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Filters({
  query,
  actorOptions,
  otherActions,
}: {
  query: Query;
  actorOptions: AuditActorOption[];
  otherActions: string[];
}) {
  const admins = actorOptions.filter((actor) => !actor.isEmployee);
  const employees = actorOptions.filter((actor) => actor.isEmployee);
  const hasFilters = Boolean(query.action || query.actor || query.from || query.to || query.target);

  return (
    <Form action="/admin/jurnal" className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto_auto] lg:items-end">
      {query.target ? <input type="hidden" name="tinta" value={query.target} /> : null}
      <div className="space-y-1.5">
        <Label htmlFor="audit-action">Acțiune</Label>
        <NativeSelect id="audit-action" name="actiune" defaultValue={query.action} className="h-9">
          <option value="">Toate acțiunile</option>
          {ACTION_GROUP_ORDER.map((group) => (
            <optgroup key={group} label={AUDIT_ACTION_GROUPS[group]}>
              {Object.entries(AUDIT_ACTIONS)
                .filter(([, info]) => info.group === group)
                .map(([action, info]) => (
                  <option key={action} value={action}>
                    {info.label}
                  </option>
                ))}
            </optgroup>
          ))}
          {otherActions.length > 0 ? (
            <optgroup label="Altele">
              {otherActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </optgroup>
          ) : null}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-actor">Făcută de</Label>
        <NativeSelect id="audit-actor" name="autor" defaultValue={query.actor} className="h-9">
          <option value="">Oricine</option>
          <option value={SYSTEM_ACTOR}>Sistem (automat)</option>
          {admins.length > 0 ? (
            <optgroup label="Administratori">
              {admins.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {employees.length > 0 ? (
            <optgroup label="Angajați">
              {employees.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-from">De la</Label>
        <Input id="audit-from" name="de" type="date" defaultValue={query.from} className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-to">Până la</Label>
        <Input id="audit-to" name="pana" type="date" defaultValue={query.to} className="h-9" />
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" className="h-9 flex-1 lg:flex-none">
          <Filter aria-hidden="true" />
          Filtrează
        </Button>
        {hasFilters ? (
          <Link href="/admin/jurnal" className={cn(buttonVariants({ variant: "ghost" }), "h-9")}>
            Resetează
          </Link>
        ) : null}
      </div>
    </Form>
  );
}

export function AuditLogView({
  rows,
  query,
  rangeInvalid,
  actorOptions,
  otherActions,
  targetName,
  clearTargetHref,
  pagination,
}: {
  rows: AuditRow[];
  query: Query;
  rangeInvalid: boolean;
  actorOptions: AuditActorOption[];
  otherActions: string[];
  targetName: string | null;
  clearTargetHref: string;
  pagination: Pagination;
}) {
  const firstIndex = (pagination.page - 1) * pagination.pageSize + 1;
  const lastIndex = firstIndex + rows.length - 1;
  const filtered = Boolean(query.action || query.actor || query.from || query.to || query.target);

  return (
    <>
      <PageHeader
        title="Jurnal activitate"
        description="Cine a făcut ce și când: conturi, cereri, puncte de lucru, reguli și procesele automate."
      />

      <Card className="gap-0 py-0">
        <Filters query={query} actorOptions={actorOptions} otherActions={otherActions} />

        {targetName || rangeInvalid ? (
          <div className="space-y-3 border-b p-4">
            {targetName ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Doar evenimentele pentru</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 font-medium">
                  {targetName}
                  <Link
                    href={clearTargetHref}
                    aria-label="Arată evenimentele pentru toate înregistrările"
                    className="flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </Link>
                </span>
              </div>
            ) : null}
            {rangeInvalid ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Data „de la” este după data „până la”, așa că intervalul nu a fost aplicat.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered ? "Niciun eveniment pentru filtrele alese" : "Jurnalul este gol"}
            description={
              filtered
                ? "Schimbă acțiunea, persoana sau intervalul de date."
                : "Acțiunile din aplicație vor apărea aici pe măsură ce au loc."
            }
            action={
              filtered ? (
                <Link href="/admin/jurnal" className={buttonVariants({ variant: "outline" })}>
                  Resetează filtrele
                </Link>
              ) : null
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-36 pl-4">Când</TableHead>
                    <TableHead className="w-44">Cine</TableHead>
                    <TableHead className="w-48">Acțiune</TableHead>
                    <TableHead className="w-52">Ce</TableHead>
                    <TableHead className="pr-4">Detalii</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="align-top">
                      <TableCell className="pl-4 align-top text-muted-foreground tabular-nums">
                        {formatTimestamp(new Date(row.createdAt))}
                      </TableCell>
                      <TableCell className="max-w-44 align-top">
                        <Actor actor={row.actor} />
                      </TableCell>
                      <TableCell className="max-w-48 align-top">
                        <ActionBadge row={row} />
                      </TableCell>
                      <TableCell className="max-w-52 align-top">
                        <Target target={row.target} />
                      </TableCell>
                      <TableCell className="min-w-64 pr-4 align-top whitespace-normal">
                        <Details items={row.details} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y md:hidden">
              {rows.map((row) => (
                <li key={row.id} className="space-y-2.5 p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <ActionBadge row={row} />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(new Date(row.createdAt))}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Actor actor={row.actor} />
                    <Target target={row.target} />
                  </div>
                  {row.details.length > 0 ? <Details items={row.details} /> : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {pagination.total > 0 ? (
          <nav
            aria-label="Paginare jurnal"
            className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-muted-foreground">
              {firstIndex}–{lastIndex} din {pluralRo(pagination.total, "eveniment", "evenimente")}
            </p>
            <div className="flex items-center gap-2">
              {pagination.prevHref ? (
                <Link href={pagination.prevHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <ChevronLeft aria-hidden="true" />
                  Înapoi
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft aria-hidden="true" />
                  Înapoi
                </Button>
              )}
              <span className="px-1 text-muted-foreground tabular-nums">
                Pagina {pagination.page} din {pagination.totalPages}
              </span>
              {pagination.nextHref ? (
                <Link href={pagination.nextHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Înainte
                  <ChevronRight aria-hidden="true" />
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Înainte
                  <ChevronRight aria-hidden="true" />
                </Button>
              )}
            </div>
          </nav>
        ) : null}
      </Card>
    </>
  );
}
