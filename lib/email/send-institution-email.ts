import { institutionInvitationEmail } from "@/lib/email/institution-invitation-template";
import { sendEmail } from "@/lib/services/email.service";

type SendInvitationInput = {
  to: string;
  institutionName: string;
  institutionCode: string;
  administratorName: string;
  activationUrl: string;
  expiresAt: Date;
};

export type EmailSendResult = { sent: true } | { sent: false; reason: string };

export async function sendInstitutionInvitationEmail(input: SendInvitationInput): Promise<EmailSendResult> {
  const message = institutionInvitationEmail(input);

  const res = await sendEmail({
    to: input.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  if (!res.success) {
    return {
      sent: false,
      reason: res.error || "Email provider rejected the invitation.",
    };
  }

  return { sent: true };
}
