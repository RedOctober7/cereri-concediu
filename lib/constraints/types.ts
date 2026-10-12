import type { ConstraintScope, ConstraintType } from "@prisma/client";

export type ValidationResult = {
  /**
   * Regulile încălcate. Nu blochează: toate cererile ajung la administrator, care vede
   * aceste motive ca atenționări când decide.
   */
  violations: string[];
  workingDays: number;
  /** Motiv pentru care cererea nu poate fi depusă deloc (nici spre admin). */
  blockingError: string | null;
};

/** Config-ul (coloana JSON) pentru fiecare tip de regulă; validat de lib/validators.ts. */
export type ConstraintConfigByType = {
  MIN_NOTICE_DAYS: { days: number };
  BLACKOUT_MONTH: { month: number };
  MIN_ONE_VACATION_OF_N_DAYS: { days: number };
};

export type ConstraintConfig = ConstraintConfigByType[ConstraintType];

export const MONTH_NAMES = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Luna ${month}`;
}

/** Câmpul editabil al fiecărui tip: cheia din config și cum se completează. */
export type ConstraintField = {
  key: "days" | "month";
  label: string;
  /** Unitatea afișată lângă câmp (lipsește la lună, care e o listă). */
  unit?: string;
  min: number;
  max: number;
  defaultValue: number;
};

export type ConstraintTypeInfo = {
  label: string;
  /** Ce verifică regula, exact cum o aplică validateLeaveRequest (lib/constraints/validate.ts). */
  description: string;
  field: ConstraintField;
};

// Toate cererile ajung la administrator; o regulă încălcată doar îl atenționează.
// Ordinea de aici este ordinea din pagina de reguli.
export const CONSTRAINT_TYPES: Record<ConstraintType, ConstraintTypeInfo> = {
  MIN_NOTICE_DAYS: {
    label: "Preaviz minim",
    description:
      "Cererea trebuie depusă cu cel puțin atâtea zile lucrătoare înainte de prima zi de concediu.",
    field: {
      key: "days",
      label: "Preaviz minim",
      unit: "zile lucrătoare",
      min: 1,
      max: 366,
      defaultValue: 5,
    },
  },
  BLACKOUT_MONTH: {
    label: "Lună restricționată",
    description:
      "Cererile care includ măcar o zi din luna aleasă (în orice an) îți sunt semnalate, ex. luna inventarului.",
    field: { key: "month", label: "Luna", min: 1, max: 12, defaultValue: 12 },
  },
  MIN_ONE_VACATION_OF_N_DAYS: {
    label: "Concediu neîntrerupt anual",
    description:
      "Codul muncii (art. 148) cere ca fiecare angajat să efectueze în fiecare an cel puțin 10 zile lucrătoare de concediu neîntrerupt. Dacă angajatul nu are încă un astfel de concediu în anul cererii (aprobat sau în așteptare), iar cererea i-ar coborî soldul sub numărul de zile ales, cererea îți este semnalată.",
    field: {
      key: "days",
      label: "Cel puțin",
      unit: "zile lucrătoare consecutive",
      min: 1,
      max: 366,
      defaultValue: 10,
    },
  },
};

export const CONSTRAINT_TYPE_ORDER = Object.keys(CONSTRAINT_TYPES) as ConstraintType[];

export const CONSTRAINT_SCOPE_LABELS: Record<ConstraintScope, string> = {
  GLOBAL: "Toate punctele de lucru",
  WORK_POINT: "Un punct de lucru",
};

function workingDays(count: number): string {
  if (count === 1) {
    return "1 zi lucrătoare";
  }
  const lastTwo = count % 100;
  return `${count} ${lastTwo === 0 || lastTwo >= 20 ? "de " : ""}zile lucrătoare`;
}

/**
 * Valoarea unei reguli într-o frază scurtă („Cel puțin 5 zile lucrătoare preaviz”),
 * pentru lista de reguli și jurnal. Un config invalid (date vechi) devine null.
 */
export function describeConstraint(type: ConstraintType, config: unknown): string | null {
  if (typeof config !== "object" || config === null) {
    return null;
  }
  const value = (config as Record<string, unknown>)[CONSTRAINT_TYPES[type]?.field.key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  switch (type) {
    case "MIN_NOTICE_DAYS":
      return `Cel puțin ${workingDays(value)} preaviz`;
    case "BLACKOUT_MONTH":
      return `Concediu în ${monthName(value).toLowerCase()}`;
    case "MIN_ONE_VACATION_OF_N_DAYS":
      return `Un concediu neîntrerupt de cel puțin ${workingDays(value)} pe an`;
    default:
      return null;
  }
}
