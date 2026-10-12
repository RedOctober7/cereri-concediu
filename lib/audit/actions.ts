// Acțiunile din jurnalul de activitate (AuditLog.action) și etichetele lor în română,
// pentru pagina /admin/jurnal. O acțiune nouă scrisă undeva în cod trebuie adăugată
// aici; până atunci jurnalul o arată cu numele ei tehnic.

/** Ajustare manuală a soldului de către admin: details { delta, reason, before, after }. */
export const BALANCE_ADJUSTMENT_ACTION = "BALANCE_ADJUSTMENT";

export type AuditActionGroup = "users" | "leaves" | "workPoints" | "constraints" | "system";

export type AuditActionInfo = {
  label: string;
  group: AuditActionGroup;
  /** Acțiune care șterge sau respinge ceva (evidențiată în jurnal). */
  destructive?: boolean;
};

export const AUDIT_ACTION_GROUPS: Record<AuditActionGroup, string> = {
  users: "Conturi",
  leaves: "Cereri de concediu",
  workPoints: "Puncte de lucru",
  constraints: "Reguli",
  system: "Automate",
};

export const AUDIT_ACTIONS: Record<string, AuditActionInfo> = {
  CREATE_USER: { label: "Cont creat", group: "users" },
  UPDATE_USER: { label: "Cont modificat", group: "users" },
  [BALANCE_ADJUSTMENT_ACTION]: { label: "Sold ajustat", group: "users" },
  PASSWORD_RESET_REQUESTED: { label: "Resetare parolă cerută", group: "users" },
  PASSWORD_RESET_COMPLETED: { label: "Parolă resetată prin email", group: "users" },

  LEAVE_AUTO_APPROVED: { label: "Cerere aprobată automat", group: "leaves" },
  LEAVE_PENDING_ADMIN: { label: "Cerere trimisă spre aprobare", group: "leaves" },
  LEAVE_ADMIN_APPROVED: { label: "Cerere aprobată", group: "leaves" },
  LEAVE_REJECTED: { label: "Cerere respinsă", group: "leaves", destructive: true },
  LEAVE_CANCELLED: { label: "Cerere anulată", group: "leaves" },

  CREATE_WORK_POINT: { label: "Punct de lucru adăugat", group: "workPoints" },
  UPDATE_WORK_POINT: { label: "Punct de lucru modificat", group: "workPoints" },
  DELETE_WORK_POINT: { label: "Punct de lucru șters", group: "workPoints", destructive: true },

  CREATE_CONSTRAINT: { label: "Regulă adăugată", group: "constraints" },
  UPDATE_CONSTRAINT: { label: "Regulă modificată", group: "constraints" },
  DELETE_CONSTRAINT: { label: "Regulă ștearsă", group: "constraints", destructive: true },

  YEARLY_ROLLOVER: { label: "Zile expirate la reportarea anuală", group: "system" },
  LEAVE_DATA_REPAIR: { label: "Date de cerere corectate", group: "system" },
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action]?.label ?? action;
}
