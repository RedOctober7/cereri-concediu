import { toZonedTime } from "date-fns-tz";

// Codul Muncii, art. 146 alin. (2): zilele de concediu neefectuate se reportează și
// trebuie efectuate în 18 luni începând cu anul următor celui în care s-a născut
// dreptul. Zilele născute în anul N expiră deci la sfârșitul zilei de 30 iunie N + 2.

const TIME_ZONE = "Europe/Bucharest";

export const YEARLY_ROLLOVER_ACTION = "YEARLY_ROLLOVER";

/**
 * Prima zi după termenul de efectuare a zilelor din `expiringYear` (1 iulie N + 2),
 * la miezul nopții UTC, ca să se compare corect cu coloanele `@db.Date`.
 */
export function expiryDeadline(expiringYear: number): Date {
  return new Date(Date.UTC(expiringYear + 2, 6, 1));
}

/** Cel mai recent an ale cărui zile au expirat deja la momentul `now` (ora României). */
export function latestExpiredYear(now: Date): number {
  const local = toZonedTime(now, TIME_ZONE);
  const year = local.getFullYear();
  return local.getMonth() >= 6 ? year - 2 : year - 3;
}

/**
 * Anul căruia îi atribuim soldul inițial (`initialLeaveDays`), care nu are rânduri în
 * LeaveAccrual. Îl considerăm născut în cel mai recent an posibil: anul angajării sau
 * anul în care contul a fost creat în aplicație. Astfel aceste zile nu expiră niciodată
 * mai devreme decât permite legea (cel mult sunt păstrate mai mult).
 */
export function openingBalanceYear(hireDate: Date, createdAt: Date): number {
  // hireDate este `@db.Date`, deci vine din baza de date ca miezul nopții UTC.
  const hireYear = hireDate.getUTCFullYear();
  const createdYear = toZonedTime(createdAt, TIME_ZONE).getFullYear();
  return Math.max(hireYear, createdYear);
}

export type YearlyDays = { year: number; days: number };

export type ExpiringDaysInput = {
  expiringYear: number;
  /** Soldul curent (User.availableDays). */
  availableDays: number;
  /**
   * Zile din cereri încă în așteptare (PENDING_ADMIN) care încep înainte de termen.
   * Nu sunt încă scăzute din sold, dar au fost efectuate (sau solicitate) în termen,
   * așa că le tratăm ca deja consumate.
   */
  pendingDaysBeforeDeadline: number;
  /** Zilele câștigate pe ani: rândurile LeaveAccrual plus soldul inițial atribuit unui an. */
  entitlements: YearlyDays[];
};

/**
 * Câte zile din `expiringYear` sunt încă neefectuate și trebuie scăzute acum.
 *
 * Zilele se consumă FIFO (întâi cele mai vechi), deci soldul curent este format din
 * cele mai noi zile câștigate. Ce depășește totalul zilelor câștigate după anul care
 * expiră provine din anul care expiră; limităm la zilele câștigate în acel an (zilele
 * din ani și mai vechi nu sunt atinse aici) și nu coborâm niciodată soldul sub 0.
 */
export function computeExpiringDays(input: ExpiringDaysInput): number {
  let expiringYearDays = 0;
  let laterDays = 0;

  for (const entitlement of input.entitlements) {
    if (entitlement.year === input.expiringYear) {
      expiringYearDays += entitlement.days;
    } else if (entitlement.year > input.expiringYear) {
      laterDays += entitlement.days;
    }
  }

  const balance = input.availableDays - input.pendingDaysBeforeDeadline;
  const unused = Math.min(Math.max(balance - laterDays, 0), expiringYearDays);
  const rounded = Math.round(unused * 100) / 100;

  return Math.min(rounded, Math.max(input.availableDays, 0));
}
