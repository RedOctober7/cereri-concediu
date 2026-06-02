import { Resend } from 'resend';
import { render } from '@react-email/render';
import { LeaveApprovedEmail } from './LeaveApprovedEmail';
import { LeaveRejectedEmail } from './LeaveRejectedEmail';
import { LeavePendingAdminEmail } from './LeavePendingAdminEmail';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

const resend = new Resend(process.env.RESEND_API_KEY);
const emailFrom = process.env.EMAIL_FROM || 'noreply@example.ro';
const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

function formatDate(date: Date): string {
  return format(new Date(date), 'dd.MM.yyyy', { locale: ro });
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
  requestId,
}: {
  to: string;
  firstName: string;
  lastName: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  availableDaysAfter: number;
  approvedByAdmin: boolean;
  pdfBuffer: Buffer;
  requestId: string;
}) {
  const html = await render(
    LeaveApprovedEmail({
      firstName,
      lastName,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      workingDays,
      availableDaysAfter,
      approvedByAdmin,
    })
  );

  await resend.emails.send({
    from: emailFrom,
    to,
    subject: 'Cerere de concediu aprobată',
    html,
    attachments: [
      {
        filename: `cerere-concediu-${requestId.slice(0, 8)}.pdf`,
        content: pdfBuffer,
      },
    ],
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
}) {
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

  await resend.emails.send({
    from: emailFrom,
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
  requestId,
}: {
  adminEmails: string[];
  employeeFirstName: string;
  employeeLastName: string;
  startDate: Date;
  endDate: Date;
  workingDays: number;
  violationReasons: string[];
  requestId: string;
}) {
  const approvalUrl = `${appUrl}/admin/cereri/${requestId}`;

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

  await resend.emails.send({
    from: emailFrom,
    to: adminEmails,
    subject: `Cerere concediu în așteptare - ${employeeFirstName} ${employeeLastName}`,
    html,
  });
}