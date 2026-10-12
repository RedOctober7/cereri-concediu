import type { LeaveStatus } from "@prisma/client";

// Filtrele listei de cereri trăiesc în URL (?status=&q=&wp=&page=), ca pagina să se
// poată reîncărca, partaja și naviga cu „Înapoi”. Modulul e folosit și de server
// (interogare), și de client (navigare), deci nu importă nimic de pe server.

export const STATUS_FILTERS = [
  { value: "pending", label: "În așteptare", statuses: ["PENDING_ADMIN"] },
  { value: "approved", label: "Aprobate", statuses: ["APPROVED_AUTO", "APPROVED_ADMIN"] },
  { value: "rejected", label: "Respinse", statuses: ["REJECTED"] },
  { value: "cancelled", label: "Anulate", statuses: ["CANCELLED"] },
  { value: "all", label: "Toate", statuses: null },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  statuses: readonly LeaveStatus[] | null;
}>;

export type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

export const DEFAULT_STATUS_FILTER: StatusFilter = "pending";

/** Valoarea filtrului de punct de lucru pentru angajații fără punct de lucru. */
export const NO_WORK_POINT = "none";

export const SEARCH_MAX_LENGTH = 100;

export type CereriQuery = {
  status: StatusFilter;
  q: string;
  wp: string;
  page: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseCereriQuery(params: RawSearchParams): CereriQuery {
  const rawStatus = firstValue(params.status);
  const status =
    STATUS_FILTERS.find((filter) => filter.value === rawStatus)?.value ??
    DEFAULT_STATUS_FILTER;
  const q = (firstValue(params.q) ?? "").trim().slice(0, SEARCH_MAX_LENGTH);
  const wp = (firstValue(params.wp) ?? "").trim().slice(0, 64);
  const rawPage = Number.parseInt(firstValue(params.page) ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  return { status, q, wp, page };
}

/** Adresa listei pentru filtrele date; valorile implicite nu apar în URL. */
export function cereriHref(query: Partial<CereriQuery>): string {
  const params = new URLSearchParams();
  if (query.status && query.status !== DEFAULT_STATUS_FILTER) {
    params.set("status", query.status);
  }
  if (query.q?.trim()) {
    params.set("q", query.q.trim());
  }
  if (query.wp) {
    params.set("wp", query.wp);
  }
  if (query.page && query.page > 1) {
    params.set("page", String(query.page));
  }
  const search = params.toString();
  return search ? `/admin/cereri?${search}` : "/admin/cereri";
}
