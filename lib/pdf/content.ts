import type { LeaveStatus } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { APP_TIME_ZONE, toDateOnlyString } from '@/lib/dates';

// Textele cererii de concediu (PDF), separate de randare ca să poată fi testate.

/**
 * Versiunea conținutului PDF-ului. Se crește la orice schimbare vizibilă în
 * CerereConcediu.tsx: PDF-urile stocate cu o versiune mai veche se regenerează.
 */
export const LEAVE_PDF_VERSION = 2;

/** Zi calendaristică (Date la miezul nopții UTC, vezi lib/dates.ts) → „dd.MM.yyyy”. */
export function formatCalendarDay(date: Date): string {
  return formatInTimeZone(date, 'UTC', 'dd.MM.yyyy');
}

/** Momentul dat (ex. createdAt) → ziua lui în Europe/Bucharest, „dd.MM.yyyy”. */
export function formatDateInBucharest(instant: Date): string {
  return formatInTimeZone(instant, APP_TIME_ZONE, 'dd.MM.yyyy');
}

/** Momentul dat → „dd.MM.yyyy, ora HH:mm” în Europe/Bucharest. */
export function formatDateTimeInBucharest(instant: Date): string {
  return formatInTimeZone(instant, APP_TIME_ZONE, "dd.MM.yyyy', ora 'HH:mm");
}

/**
 * „1 zi lucrătoare”, „4 zile lucrătoare”, „20 de zile lucrătoare”: în română,
 * numerele care se termină în 00 sau între 20 și 99 se leagă de substantiv cu „de”.
 */
export function workingDaysPhrase(days: number): string {
  if (days === 1) {
    return '1 zi lucrătoare';
  }
  const lastTwo = Math.abs(days) % 100;
  const needsDe = lastTwo >= 20 || (lastTwo === 0 && days !== 0);
  return `${days} ${needsDe ? 'de ' : ''}zile lucrătoare`;
}

export type PersonName = { firstName: string; lastName: string };

/** „Popescu Ion”: ordinea din actele oficiale. */
export function formalName({ firstName, lastName }: PersonName): string {
  return `${lastName} ${firstName}`.trim();
}

export type LeaveApproval = {
  status: LeaveStatus;
  approvedAt: Date | null;
  /** Administratorul care a aprobat (doar pentru APPROVED_ADMIN). */
  approvedBy: PersonName | null;
};

/** Blocul „Aprobare” din cerere: cine a aprobat și când. */
export function approvalStatement({ status, approvedAt, approvedBy }: LeaveApproval): {
  title: string;
  detail: string;
} {
  const when = approvedAt ? ` pe ${formatDateTimeInBucharest(approvedAt)}` : '';
  switch (status) {
    case 'APPROVED_AUTO':
      return {
        title: 'Aprobată automat',
        detail: `Cererea respectă regulile de concediu stabilite de angajator și a fost aprobată automat de aplicație${when}.`,
      };
    case 'APPROVED_ADMIN':
      return {
        title: 'Aprobată de administrator',
        detail: approvedBy
          ? `Cererea a fost aprobată de ${approvedBy.firstName} ${approvedBy.lastName} (administrator)${when}.`
          : `Cererea a fost aprobată de un administrator${when}.`,
      };
    case 'PENDING_ADMIN':
      return {
        title: 'În așteptare',
        detail: 'Cererea așteaptă aprobarea unui administrator.',
      };
    case 'REJECTED':
      return { title: 'Respinsă', detail: 'Cererea a fost respinsă.' };
    case 'CANCELLED':
      return { title: 'Anulată', detail: 'Cererea a fost anulată.' };
  }
}

/** Fără diacritice și caractere speciale, ca numele fișierului să meargă oriunde. */
function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** „cerere-concediu-popescu-ion-2026-10-15.pdf” */
export function leavePdfFileName(user: PersonName, startDate: Date): string {
  const name = slug(formalName(user));
  return ['cerere-concediu', name, toDateOnlyString(startDate)].filter(Boolean).join('-') + '.pdf';
}
