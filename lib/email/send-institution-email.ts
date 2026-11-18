import { institutionInvitationEmail } from "@/lib/email/institution-invitation-template";

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
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INSTITUTION_INVITATION_FROM_EMAIL;
  if (!apiKey || !from) {
    return { sent: false, reason: "Email provider is not configured (RESEND_API_KEY and INSTITUTION_INVITATION_FROM_EMAIL are required)." };
  }

  const message = institutionInvitationEmail(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: message.subject,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const providerText = await response.text();
      return { sent: false, reason: `Email provider rejected the invitation (${response.status}). ${providerText.slice(0, 300)}` };
    }
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? `Email provider unavailable: ${error.message}` : "Email provider unavailable." };
  }
}
