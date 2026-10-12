import { parseDateOnly } from "@/lib/dates";

// Filtrele jurnalului de activitate, din URL: ?actiune=&autor=&de=&pana=&tinta=&pagina=

export const SYSTEM_ACTOR = "sistem";

export type AuditQuery = {
  action: string;
  /** "" = oricine, SYSTEM_ACTOR = acțiuni automate (fără utilizator), altfel id. */
  actor: string;
  /** 'yyyy-MM-dd' sau "" */
  from: string;
  to: string;
  /** entityId: istoricul unei singure înregistrări (ex. un angajat). */
  target: string;
  page: number;
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

function dateParam(value: string): string {
  return parseDateOnly(value) ? value : "";
}

export function parseAuditQuery(params: SearchParams): AuditQuery {
  const page = Number.parseInt(single(params.pagina), 10);
  return {
    action: single(params.actiune).slice(0, 64),
    actor: single(params.autor).slice(0, 64),
    from: dateParam(single(params.de)),
    to: dateParam(single(params.pana)),
    target: single(params.tinta).slice(0, 64),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10000) : 1,
  };
}

export function auditHref(query: Partial<AuditQuery>): string {
  const params = new URLSearchParams();
  if (query.action) params.set("actiune", query.action);
  if (query.actor) params.set("autor", query.actor);
  if (query.from) params.set("de", query.from);
  if (query.to) params.set("pana", query.to);
  if (query.target) params.set("tinta", query.target);
  if (query.page && query.page > 1) params.set("pagina", String(query.page));
  const search = params.toString();
  return search ? `/admin/jurnal?${search}` : "/admin/jurnal";
}
