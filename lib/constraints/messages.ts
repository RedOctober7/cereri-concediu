import { monthName } from "@/lib/constraints/types";

// Textele atenționărilor, într-un singur loc: le folosesc validarea cererilor
// (lib/constraints/validate.ts) și datele demo (lib/demo/seed.ts), ca să fie identice.

const daysFormatter = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 });

/** „1 zi”, „2,5 zile”, „20 de zile” („de” doar la numere întregi de la 20 în sus). */
export function daysText(value: number, one = "zi", many = "zile"): string {
  if (value === 1) {
    return `1 ${one}`;
  }
  const lastTwo = Math.abs(value) % 100;
  const needsDe = Number.isInteger(value) && value !== 0 && (lastTwo === 0 || lastTwo >= 20);
  return `${daysFormatter.format(value)} ${needsDe ? "de " : ""}${many}`;
}

/** „1 zi lucrătoare”, „5 zile lucrătoare”, „20 de zile lucrătoare”. */
export function workingDaysText(count: number): string {
  return daysText(count, "zi lucrătoare", "zile lucrătoare");
}

/** Cererea cere mai multe zile decât are angajatul (după cererile încă în așteptare). */
export function balanceViolationMessage(freeDays: number, workingDays: number, pendingDays: number): string {
  return pendingDays > 0
    ? `Cererea depășește zilele disponibile (${daysFormatter.format(freeDays)} disponibile după cererile în așteptare, ${workingDays} solicitate)`
    : `Cererea depășește zilele disponibile (${daysFormatter.format(freeDays)} disponibile, ${workingDays} solicitate)`;
}

export function minNoticeMessage(days: number): string {
  return `Preaviz minim ${workingDaysText(days)} (cererea trebuia depusă cu cel puțin ${workingDaysText(days)} înainte)`;
}

export function blackoutMonthMessage(month: number): string {
  return `Luna ${monthName(month).toLowerCase()} este perioadă restricționată`;
}

/** „1 zi disponibilă”, „9 zile disponibile”, „20 de zile disponibile”. */
export function availableDaysText(value: number): string {
  return value === 1 ? "1 zi disponibilă" : `${daysText(value)} disponibile`;
}

/** Concediul neîntrerupt anual (art. 148). */
export function uninterruptedVacationMessage(year: number, minDays: number, after: number): string {
  const remaining = availableDaysText(after);
  return `În ${year} nu există încă un concediu neîntrerupt de cel puțin ${workingDaysText(minDays)}, iar după această cerere ar rămâne ${remaining} (Codul muncii, art. 148)`;
}
