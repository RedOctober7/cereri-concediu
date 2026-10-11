import { Resend } from 'resend';
import { render } from '@react-email/render';
import { LeaveApprovedEmail } from './LeaveApprovedEmail';
import { LeaveRejectedEmail } from './LeaveRejectedEmail';
import { LeavePendingAdminEmail } from './LeavePendingAdminEmail';
import { formatInTimeZone } from 'date-fns-tz';
import { leavePdfFileName } from '@/lib/pdf/content';

// Clientul Resend se creează la primul email, nu la importul modulului: fără
// RESEND_API_KEY aplicația pornește și funcționează, doar că nu trimite emailuri
// (constructorul Resend aruncă o eroare dacă lipsește cheia).
let resendClient: Resend | null = null;
let missingKeyWarned = false;

function getResend(): Resend | null {
  if (resendClient) {
    return resendClient;
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (!missingKeyWarned) {
      missingKeyWarned = true;
      console.warn(
        '[Email] RESEND_API_KEY lipsește: emailurile nu se trimit (aplicația funcționează în rest).'
      );
    }
    return null;
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || 'noreply@example.ro';
}

/** Adresa publică a aplicației, fără „/” la final (linkurile din emailuri). */
export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Resend a răspuns cu eroare (cheie invalidă, domeniu neverificat, rețea). */
export class EmailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

/** `sent: false` doar când emailurile nu sunt configurate; erorile de trimitere aruncă EmailSendError. */
export type EmailResult = { sent: true } | { sent: false; reason: 'not_configured' };

type EmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
};

async function deliver(payload: EmailPayload): Promise<EmailResult> {
  const resend = getResend();
  if (!resend) {
    console.warn(`[Email] Neconfigurat, nu se trimite: „${payload.subject}”.`);
    return { sent: false, reason: 'not_configured' };
  }

  // Resend nu aruncă la erori de API: le întoarce în `error`.
  const { error } = await resend.emails.send({ from: emailFrom(), ...payload });
  if (error) {
    throw new EmailSendError(`Resend: ${error.message}`);
  }
  return { sent: true };
}

/** Zi calendaristică (Date la miezul nopții UTC, vezi lib/dates.ts) → „dd.MM.yyyy”. */
function formatDate(date: Date): string {
  return formatInTimeZone(date, 'UTC', 'dd.MM.yyyy');
}

export async function sendLeaveApprovedEmail({
  to,
  firstName,
  lastName,
  startDate,
  endDate,
  workingDays,
  availableDaysAfter,
  approvedByAdmin,
  pdfBuffer,
}: {
  to: string;
  firstName: string;
  lastName: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  availableDaysAfter: number;
  approvedByAdmin: boolean;
  /** Fără PDF (generarea a eșuat), emailul trimite la pagina de unde se descarcă. */
  pdfBuffer?: Buffer | null;
  /** Nefolosit (numele atașamentului vine din angajat și dată); păstrat pentru apelanți. */
  requestId?: string;
}): Promise<EmailResult> {
  const html = await render(
    LeaveApprovedEmail({
      firstName,
      lastName,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      workingDays,
      availableDaysAfter,
      approvedByAdmin,
      pdfAttached: Boolean(pdfBuffer),
      leavesUrl: `${appBaseUrl()}/cereri`,
    })
  );

  return deliver({
    to,
    subject: 'Cerere de concediu aprobată',
    html,
    attachments: pdfBuffer
      ? [{ filename: leavePdfFileName({ firstName, lastName }, startDate), content: pdfBuffer }]
      : undefined,
  });
}

export async function sendLeaveRejectedEmail({
  to,
  firstName,
  lastName,
  startDate,
  endDate,
  workingDays,
  rejectionReason,
}: {
  to: string;
  firstName: string;
  lastName: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  rejectionReason: string;
}): Promise<EmailResult> {
  const html = await render(
    LeaveRejectedEmail({
      firstName,
      lastName,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      workingDays,
      rejectionReason,
    })
  );

  return deliver({
    to,
    subject: 'Cerere de concediu respinsă',
    html,
  });
}

export async function sendLeavePendingAdminEmail({
  adminEmails,
  employeeFirstName,
  employeeLastName,
  startDate,
  endDate,
  workingDays,
  violationReasons,
}: {
  adminEmails: string[];
  employeeFirstName: string;
  employeeLastName: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  violationReasons: string[];
}): Promise<EmailResult> {
  // Lista de cereri din admin se deschide implicit pe filtrul „În așteptare”.
  const approvalUrl = `${appBaseUrl()}/admin/cereri`;

  const html = await render(
    LeavePendingAdminEmail({
      employeeFirstName,
      employeeLastName,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      workingDays,
      violationReasons,
      approvalUrl,
    })
  );

  return deliver({
    to: adminEmails,
    subject: `Cerere concediu în așteptare - ${employeeFirstName} ${employeeLastName}`,
    html,
  });
}
