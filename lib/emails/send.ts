import { Resend } from "resend";
import type { ReactElement } from "react";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

type SendEmailInput = {
  to: string | string[];
  subject: string;
  react: ReactElement;
};

export async function sendEmail(input: SendEmailInput) {
  if (!resend || !emailFrom) {
    console.warn(
      "[Email] RESEND_API_KEY sau EMAIL_FROM lipsesc. Emailul nu a fost trimis."
    );
    return;
  }

  await resend.emails.send({
    from: emailFrom,
    to: input.to,
    subject: input.subject,
    react: input.react,
  });
}
