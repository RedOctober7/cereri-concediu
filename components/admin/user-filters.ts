// Filtrele listei de utilizatori (?q=&status=&punct=). Modul fără "use client", ca să
// poată fi folosit și de pagina de server.

export type UserStatusFilter = "toti" | "activi" | "inactivi";

export type UserFilters = {
  q: string;
  status: UserStatusFilter;
  /** "" = toate, NO_WORK_POINT = fără punct de lucru, altfel id-ul punctului. */
  workPoint: string;
};

export function parseUserFilters(get: (key: string) => string | null | undefined): UserFilters {
  const status = get("status") ?? "";
  return {
    q: (get("q") ?? "").slice(0, 100),
    status: status === "activi" || status === "inactivi" ? status : "toti",
    workPoint: (get("punct") ?? "").slice(0, 64),
  };
}
