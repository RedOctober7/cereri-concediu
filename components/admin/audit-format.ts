import type { ConstraintType, LeaveStatus } from "@prisma/client";
import { CONSTRAINT_TYPES, describeConstraint } from "@/lib/constraints/types";
import { parseDateOnly } from "@/lib/dates";
import { leaveStatusLabel } from "@/lib/leaves/status";
import { formatDay, formatDays, formatPeriod, formatTimestamp, pluralRo } from "@/components/admin/format";

// Transformă `AuditLog.details` (JSON liber, diferit pe acțiuni și pe versiuni ale
// codului) în perechi etichetă–valoare lizibile. Nu afișează niciodată JSON brut și
// nici câmpuri care ar putea conține parole sau tokenuri.

export type AuditDetailItem = { label: string; value: string };

export type AuditLookups = {
  workPointName: (id: string) => string | null;
  userName: (id: string) => string | null;
};

const SENSITIVE_KEY = /pass|parol|hash|token|secret/i;

const FIELD_LABELS: Record<string, string> = {
  firstName: "Prenume",
  lastName: "Nume",
  email: "Email",
  username: "Nume de utilizator",
  jobTitle: "Funcție",
  employer: "Angajator",
  workPointId: "Punct de lucru",
  workPointName: "Punct de lucru",
  hireDate: "Data angajării",
  initialLeaveDays: "Sold inițial",
  availableDays: "Sold disponibil",
  active: "Status",
  name: "Nume",
  address: "Adresă",
  scope: "Se aplică",
  type: "Tip regulă",
  config: "Valoare",
  workingDays: "Zile lucrătoare",
  storedWorkingDays: "Zile lucrătoare salvate",
  rejectionReason: "Motiv",
  reason: "Motiv",
  startDate: "Început",
  endDate: "Sfârșit",
  violations: "Motive",
  status: "Status cerere",
  userId: "Angajat",
};

type Details = Record<string, unknown>;

function asRecord(value: unknown): Details | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Details)
    : null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${pluralRo(Math.abs(value), "zi", "zile")}`;
}

/** 'yyyy-MM-dd' sau un ISO la miezul nopții UTC (zi calendaristică) → „14.10.2026”. */
function formatDateValue(value: string): string | null {
  const day = parseDateOnly(value.slice(0, 10));
  if (!day) {
    return null;
  }
  if (value.length === 10 || /T00:00:00(\.000)?Z$/.test(value)) {
    return formatDay(day);
  }
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : formatTimestamp(instant);
}

function humanizeKey(key: string): string {
  if (FIELD_LABELS[key]) {
    return FIELD_LABELS[key];
  }
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatValue(key: string, value: unknown, lookups: AuditLookups): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (key === "workPointId" && typeof value === "string") {
    return lookups.workPointName(value) ?? "punct de lucru șters";
  }
  if (key === "userId" && typeof value === "string") {
    return lookups.userName(value) ?? "utilizator necunoscut";
  }
  if (key === "active" && typeof value === "boolean") {
    return value ? "Activ" : "Inactiv";
  }
  if (key === "scope" && typeof value === "string") {
    return value === "GLOBAL" ? "Toate punctele de lucru" : "Un punct de lucru";
  }
  if (key === "type" && typeof value === "string" && value in CONSTRAINT_TYPES) {
    return CONSTRAINT_TYPES[value as ConstraintType].label;
  }
  if (key === "status" && typeof value === "string") {
    return leaveStatusLabel(value as LeaveStatus);
  }
  if (typeof value === "boolean") {
    return value ? "Da" : "Nu";
  }
  if (isNumber(value)) {
    return formatDays(value);
  }
  if (typeof value === "string") {
    return formatDateValue(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? "—"
      : value.map((item) => formatValue(key, item, lookups)).join("; ");
  }
  const record = asRecord(value);
  if (record) {
    return Object.entries(record)
      .filter(([subKey]) => !SENSITIVE_KEY.test(subKey))
      .map(([subKey, subValue]) => `${humanizeKey(subKey)}: ${formatValue(subKey, subValue, lookups)}`)
      .join(", ");
  }
  return String(value);
}

/** Valoarea unei reguli din jurnal (config + tip) ca frază, ex. „Cel puțin 5 zile lucrătoare preaviz”. */
function constraintValue(type: unknown, config: unknown): string {
  if (typeof type === "string" && type in CONSTRAINT_TYPES) {
    const text = describeConstraint(type as ConstraintType, config);
    if (text) {
      return text;
    }
  }
  return formatValue("config", config, { workPointName: () => null, userName: () => null });
}

function scopeValue(details: Details, scopeKey: unknown, workPointId: unknown, lookups: AuditLookups) {
  if (scopeKey === "GLOBAL") {
    return "Toate punctele de lucru";
  }
  if (typeof workPointId === "string") {
    return (
      lookups.workPointName(workPointId) ??
      (typeof details.workPointName === "string" ? details.workPointName : "punct de lucru șters")
    );
  }
  return "Un punct de lucru";
}

/**
 * Perechile afișate pentru un rând din jurnal. Cheile cunoscute ale fiecărei acțiuni
 * sunt formatate explicit; restul (date mai vechi sau acțiuni noi) trec prin
 * formatarea generică, fără câmpuri sensibile.
 */
export function formatAuditDetails(
  action: string,
  rawDetails: unknown,
  lookups: AuditLookups
): AuditDetailItem[] {
  const details = asRecord(rawDetails);
  if (!details) {
    return [];
  }
  const items: AuditDetailItem[] = [];
  const handled = new Set<string>();
  const add = (label: string, value: string, ...keys: string[]) => {
    items.push({ label, value });
    keys.forEach((key) => handled.add(key));
  };
  const has = (key: string) => details[key] !== undefined;

  switch (action) {
    case "UPDATE_USER":
    case "UPDATE_WORK_POINT":
    case "UPDATE_CONSTRAINT": {
      const changes = asRecord(details.changes);
      if (changes) {
        handled.add("changes");
        for (const [field, change] of Object.entries(changes)) {
          const pair = asRecord(change);
          if (!pair || SENSITIVE_KEY.test(field)) {
            continue;
          }
          let from: string;
          let to: string;
          if (field === "config") {
            from = constraintValue(details.type, pair.from);
            to = constraintValue(details.type, pair.to);
          } else if (field === "workPointId" && action === "UPDATE_CONSTRAINT") {
            from = pair.from ? formatValue("workPointId", pair.from, lookups) : "Toate punctele de lucru";
            to = pair.to ? formatValue("workPointId", pair.to, lookups) : "Toate punctele de lucru";
          } else if (field === "active" && action === "UPDATE_CONSTRAINT") {
            from = pair.from ? "Activă" : "Inactivă";
            to = pair.to ? "Activă" : "Inactivă";
          } else {
            from = formatValue(field, pair.from, lookups);
            to = formatValue(field, pair.to, lookups);
          }
          add(humanizeKey(field), `${from} → ${to}`);
        }
      }
      if (action === "UPDATE_USER") {
        if (details.passwordReset === true) {
          add(
            "Parolă",
            details.forcePasswordReset === true
              ? "resetată; angajatul o schimbă la autentificare"
              : "resetată de administrator",
            "passwordReset",
            "forcePasswordReset"
          );
        } else if (typeof details.forcePasswordReset === "boolean") {
          add(
            "Parolă",
            details.forcePasswordReset
              ? "trebuie schimbată la autentificare"
              : "nu mai trebuie schimbată",
            "forcePasswordReset"
          );
        }
        if (isNumber(details.availableDaysBefore) && isNumber(details.availableDaysAfter)) {
          add(
            "Sold disponibil",
            `${formatDays(details.availableDaysBefore)} → ${formatDays(details.availableDaysAfter)}`,
            "availableDaysBefore",
            "availableDaysAfter"
          );
        }
        // Detaliate deja în `changes` (rândurile noi) sau redundante cu soldul de mai sus.
        handled.add("initialLeaveDaysBefore");
        handled.add("initialLeaveDaysAfter");
        if (!changes && isNumber(details.initialLeaveDaysBefore) && isNumber(details.initialLeaveDaysAfter)) {
          add(
            "Sold inițial",
            `${formatDays(details.initialLeaveDaysBefore)} → ${formatDays(details.initialLeaveDaysAfter)}`
          );
          handled.add("initialLeaveDays");
        }
      }
      if (action === "UPDATE_CONSTRAINT") {
        if (!changes && has("config")) {
          add("Valoare", constraintValue(details.type, details.config), "config");
        }
        if (!changes && typeof details.active === "boolean") {
          add("Status", details.active ? "Activă" : "Inactivă", "active");
        }
        // Tipul regulii apare ca țintă a rândului.
        handled.add("type");
        if (!changes || !("scope" in changes || "workPointId" in changes)) {
          if (has("scope") || has("workPointId")) {
            add("Se aplică", scopeValue(details, details.scope, details.workPointId, lookups));
          }
        }
        handled.add("scope");
        handled.add("workPointId");
        handled.add("workPointName");
      }
      if (action === "UPDATE_WORK_POINT" && changes) {
        // Numele curent apare deja ca țintă a rândului.
        handled.add("name");
      }
      break;
    }

    case "CREATE_CONSTRAINT":
    case "DELETE_CONSTRAINT": {
      // Tipul regulii apare ca țintă a rândului.
      handled.add("type");
      if (has("config")) {
        add("Valoare", constraintValue(details.type, details.config), "config");
      }
      add("Se aplică", scopeValue(details, details.scope, details.workPointId, lookups), "scope", "workPointId", "workPointName");
      if (typeof details.active === "boolean") {
        add("Status", details.active ? "Activă" : "Inactivă", "active");
      }
      break;
    }

    case "BALANCE_ADJUSTMENT": {
      if (isNumber(details.delta)) {
        add("Ajustare", signed(details.delta), "delta");
      }
      if (typeof details.reason === "string") {
        add("Motiv", details.reason, "reason");
      }
      if (isNumber(details.before) && isNumber(details.after)) {
        add("Sold", `${formatDays(details.before)} → ${formatDays(details.after)}`, "before", "after");
      }
      break;
    }

    case "LEAVE_AUTO_APPROVED":
    case "LEAVE_PENDING_ADMIN": {
      const start = typeof details.startDate === "string" ? parseDateOnly(details.startDate.slice(0, 10)) : null;
      const end = typeof details.endDate === "string" ? parseDateOnly(details.endDate.slice(0, 10)) : null;
      if (start && end) {
        add("Perioadă", formatPeriod(start, end), "startDate", "endDate");
      }
      if (Array.isArray(details.violations)) {
        handled.add("violations");
        if (details.violations.length > 0) {
          add("Motive", details.violations.map(String).join("; "));
        }
      }
      break;
    }

    case "LEAVE_ADMIN_APPROVED": {
      if (
        isNumber(details.workingDays) &&
        isNumber(details.storedWorkingDays) &&
        details.workingDays !== details.storedWorkingDays
      ) {
        add(
          "Zile lucrătoare",
          `${details.storedWorkingDays} → ${details.workingDays} (recalculate la aprobare)`,
          "workingDays",
          "storedWorkingDays"
        );
      }
      handled.add("storedWorkingDays");
      if (details.sideEffectsFailed === true) {
        add("PDF și email", "nu au putut fi trimise", "sideEffectsFailed");
      }
      break;
    }

    case "LEAVE_REJECTED": {
      if (details.emailFailed === true) {
        add("Email către angajat", "nu a putut fi trimis", "emailFailed");
      }
      break;
    }

    case "YEARLY_ROLLOVER": {
      if (isNumber(details.expiredYear)) {
        add("Zile din anul", String(details.expiredYear), "expiredYear");
      }
      if (isNumber(details.expiredDays)) {
        add("Zile expirate", formatDays(details.expiredDays), "expiredDays");
      }
      if (isNumber(details.availableDaysBefore) && isNumber(details.availableDaysAfter)) {
        add(
          "Sold",
          `${formatDays(details.availableDaysBefore)} → ${formatDays(details.availableDaysAfter)}`,
          "availableDaysBefore",
          "availableDaysAfter"
        );
      }
      break;
    }

    case "LEAVE_DATA_REPAIR": {
      const before = asRecord(details.old);
      const after = asRecord(details.new);
      const period = (value: Details | null) => {
        const start = typeof value?.startDate === "string" ? parseDateOnly(value.startDate) : null;
        const end = typeof value?.endDate === "string" ? parseDateOnly(value.endDate) : null;
        return start && end ? formatPeriod(start, end) : "—";
      };
      if (before && after) {
        add("Perioadă", `${period(before)} → ${period(after)}`, "old", "new");
        if (isNumber(before.workingDays) && isNumber(after.workingDays) && before.workingDays !== after.workingDays) {
          add("Zile lucrătoare", `${before.workingDays} → ${after.workingDays}`);
        }
      }
      if (isNumber(details.availableDaysDelta) && details.availableDaysDelta !== 0) {
        add("Sold", signed(details.availableDaysDelta), "availableDaysDelta");
      }
      handled.add("availableDaysDelta");
      // Momentul-limită al reparației și indicatorul intern de deplasare nu ajută adminul;
      // angajatul apare deja ca țintă a rândului (cererea lui).
      handled.add("before");
      handled.add("shifted");
      handled.add("userId");
      break;
    }

    default:
      break;
  }

  for (const [key, value] of Object.entries(details)) {
    if (handled.has(key) || SENSITIVE_KEY.test(key) || value === undefined) {
      continue;
    }
    if (action.includes("CONSTRAINT") && key === "config") {
      items.push({ label: "Valoare", value: constraintValue(details.type, value) });
      continue;
    }
    items.push({ label: humanizeKey(key), value: formatValue(key, value, lookups) });
  }

  return items;
}
