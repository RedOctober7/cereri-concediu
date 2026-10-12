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

/** Zilele câștigate pe ani: rândurile LeaveAccrual plus soldul inițial, atribuit lui `openingBalanceYear`. */
export function userEntitlements(
  user: { initialLeaveDays: number; hireDate: Date; createdAt: Date },
  accruals: YearlyDays[]
): YearlyDays[] {
  return [
    ...accruals,
    { year: openingBalanceYear(user.hireDate, user.createdAt), days: user.initialLeaveDays },
  ];
}

/**
 * O cerere de concediu: data de început (`@db.Date`) și zilele lucrătoare. Față de un
 * termen de expirare contează doar data de început: o cerere care începe în termen și
 * se termină după el contează integral ca efectuată în termen.
 */
export type LeaveDays = { startDate: Date; workingDays: number };

/** O cerere PENDING_ADMIN: zilele ei nu sunt încă scăzute din sold. */
export type PendingLeave = LeaveDays;

/** O cerere aprobată (APPROVED_AUTO / APPROVED_ADMIN): zilele ei sunt deja scăzute din sold. */
export type ApprovedLeave = LeaveDays;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Totalul zilelor pe an (un an poate avea mai multe rânduri). */
function sumByYear(items: YearlyDays[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const item of items) {
    totals.set(item.year, (totals.get(item.year) ?? 0) + item.days);
  }
  return totals;
}

/**
 * Anul și zilele expirate dintr-un rând de audit YEARLY_ROLLOVER (câmpul `details`).
 * Întoarce null dacă rândul nu are un an valid. Un rând fără un număr valid de zile
 * contează ca 0 zile expirate: anilor mai vechi li se scad atunci mai puține zile, nu mai multe.
 */
export function parseRolloverDetails(details: unknown): YearlyDays | null {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return null;
  }
  const { expiredYear, expiredDays } = details as Record<string, unknown>;
  if (typeof expiredYear !== "number" || !Number.isInteger(expiredYear)) {
    return null;
  }
  return {
    year: expiredYear,
    days: typeof expiredDays === "number" && Number.isFinite(expiredDays) ? expiredDays : 0,
  };
}

/**
 * Anii de expirat acum, crescător: anii cu zile câștigate, până la `latestExpired`,
 * care nu au încă rând YEARLY_ROLLOVER. Astfel o rulare ratată sau eșuată este
 * recuperată la următoarea rulare. Anii fără zile câștigate nu au ce expira și sunt omiși.
 */
export function yearsToExpire(
  entitlements: YearlyDays[],
  expiredYears: Iterable<number>,
  latestExpired: number
): number[] {
  const done = new Set(expiredYears);
  const years: number[] = [];
  for (const [year, days] of sumByYear(entitlements)) {
    if (days > 0 && year <= latestExpired && !done.has(year)) {
      years.push(year);
    }
  }
  return years.sort((a, b) => a - b);
}

/** Zilele din cererile în așteptare care încep înainte de `deadline`. */
export function pendingDaysBefore(pendingLeaves: PendingLeave[], deadline: Date): number {
  let total = 0;
  for (const leave of pendingLeaves) {
    if (leave.startDate < deadline) {
      total += leave.workingDays;
    }
  }
  return total;
}

/** Zilele din cererile aprobate care încep la `deadline` sau după. */
export function approvedDaysFrom(approvedLeaves: ApprovedLeave[], deadline: Date): number {
  let total = 0;
  for (const leave of approvedLeaves) {
    if (leave.startDate >= deadline) {
      total += leave.workingDays;
    }
  }
  return total;
}

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
  /**
   * Zile din cereri aprobate care încep după termen (de la expiryDeadline inclusiv). Sunt
   * deja scăzute din sold, dar nu puteau consuma zilele anului care expiră (expiraseră
   * deja), așa că le adunăm înapoi: soldul devine cel de la termen, ca și cum expirarea
   * ar fi rulat atunci.
   */
  approvedDaysFromDeadline: number;
  /** Zilele câștigate pe ani: rândurile LeaveAccrual plus soldul inițial atribuit unui an. */
  entitlements: YearlyDays[];
  /** Zilele deja expirate pe ani, din rândurile YEARLY_ROLLOVER existente. */
  alreadyExpired: YearlyDays[];
};

/**
 * Câte zile din `expiringYear` sunt încă neefectuate și trebuie scăzute acum.
 *
 * Zilele se consumă FIFO (întâi cele mai vechi), deci soldul de la termen este format din
 * cele mai noi zile câștigate. Soldul de la termen este cel curent, minus cererile în
 * așteptare care încep înainte de termen, plus cererile aprobate care încep după el
 * (concediul de după termen nu a putut folosi zilele expirate, chiar dacă rularea a
 * întârziat). Ce depășește zilele anilor de după cel care expiră provine din anul care
 * expiră; pentru un an mai nou deja expirat (ex. procesat înaintea unui an ratat)
 * contează doar zilele câștigate minus cele deja expirate.
 * Limităm la zilele câștigate în anul care expiră și nu coborâm niciodată soldul curent sub 0.
 */
export function computeExpiringDays(input: ExpiringDaysInput): number {
  const entitled = sumByYear(input.entitlements);
  const expired = sumByYear(input.alreadyExpired);

  let laterDays = 0;
  for (const [year, days] of entitled) {
    if (year > input.expiringYear) {
      laterDays += Math.max(days - (expired.get(year) ?? 0), 0);
    }
  }
  const expiringYearDays = Math.max(entitled.get(input.expiringYear) ?? 0, 0);

  const balance =
    input.availableDays - input.pendingDaysBeforeDeadline + input.approvedDaysFromDeadline;
  const unused = Math.min(Math.max(balance - laterDays, 0), expiringYearDays);

  return Math.min(round2(unused), Math.max(input.availableDays, 0));
}

export type RolloverInput = {
  /** latestExpiredYear(acum): ultimul an ale cărui zile au expirat. */
  latestExpired: number;
  availableDays: number;
  entitlements: YearlyDays[];
  alreadyExpired: YearlyDays[];
  /** Cererile PENDING_ADMIN care încep înainte de expiryDeadline(latestExpired). */
  pendingLeaves: PendingLeave[];
  /**
   * Cererile aprobate (APPROVED_AUTO, APPROVED_ADMIN) care încep la sau după
   * expiryDeadline(cel mai vechi an din yearsToExpire).
   */
  approvedLeaves: ApprovedLeave[];
};

export type RolloverStep = {
  expiredYear: number;
  expiredDays: number;
  availableDaysBefore: number;
  availableDaysAfter: number;
};

/**
 * Expirările de aplicat acum, câte una pentru fiecare an din `yearsToExpire`, în ordine
 * crescătoare (FIFO): fiecare an se calculează din soldul rămas după anii mai vechi,
 * readus la termenul lui (vezi computeExpiringDays): concediul luat după termen nu
 * consumă zilele anului care expiră, chiar dacă a fost aprobat în avans sau cronul a
 * întârziat.
 * Întoarce o listă goală dacă nu este nimic de făcut (rulare repetată).
 */
export function planRollover(input: RolloverInput): RolloverStep[] {
  const expiredYears = input.alreadyExpired.map((entry) => entry.year);
  const years = yearsToExpire(input.entitlements, expiredYears, input.latestExpired);
  const steps: RolloverStep[] = [];
  let availableDays = input.availableDays;

  for (const year of years) {
    // Un an mai nou expirat deja (în altă ordine, de codul vechi) a fost calculat cu
    // zilele acestui an încă în sold, deci concediul de până la termenul lui a fost pus
    // atunci pe seama acestui an. Ca aceleași zile să nu expire de două ori, adunăm
    // înapoi doar concediul de după termenul celui mai nou astfel de an (în acest caz
    // rar putem păstra zile în plus, dar nu expirăm mai multe decât trebuie).
    const addBackYear = Math.max(year, ...expiredYears.filter((expired) => expired > year));
    const expiredDays = computeExpiringDays({
      expiringYear: year,
      availableDays,
      pendingDaysBeforeDeadline: pendingDaysBefore(input.pendingLeaves, expiryDeadline(year)),
      approvedDaysFromDeadline: approvedDaysFrom(
        input.approvedLeaves,
        expiryDeadline(addBackYear)
      ),
      entitlements: input.entitlements,
      alreadyExpired: input.alreadyExpired,
    });
    const availableDaysAfter = availableDays - expiredDays;
    steps.push({
      expiredYear: year,
      expiredDays,
      availableDaysBefore: availableDays,
      availableDaysAfter,
    });
    availableDays = availableDaysAfter;
  }

  return steps;
}

/** Anul ale cărui zile expiră la următorul termen (30 iunie al anului `an + 2`). */
export function nextExpiringYear(now: Date): number {
  return latestExpiredYear(now) + 1;
}

export type ExpiryProjectionInput = Omit<RolloverInput, "latestExpired"> & {
  /** Anul pentru care facem proiecția, de obicei nextExpiringYear(acum). */
  year: number;
};

/**
 * Câte zile din `year` ar expira la termenul lui dacă angajatul nu mai depune cereri
 * până atunci. Este exact calculul pe care îl va face cronul (planRollover), rulat în
 * avans: anii mai vechi încă neprocesați se scad întâi (FIFO), concediul aprobat sau în
 * așteptare care începe înainte de termen contează ca efectuat, iar acumulările viitoare
 * aparțin anilor mai noi și nu schimbă rezultatul.
 * `pendingLeaves` și `approvedLeaves` pot conține toate cererile angajatului: filtrarea
 * după termen se face aici.
 */
export function projectExpiringDays(input: ExpiryProjectionInput): number {
  const { year, ...rest } = input;
  const steps = planRollover({ ...rest, latestExpired: year });
  return steps.find((step) => step.expiredYear === year)?.expiredDays ?? 0;
}
