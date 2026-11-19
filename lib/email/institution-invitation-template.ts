type InvitationEmailInput = {
  institutionName: string;
  institutionCode: string;
  administratorName: string;
  activationUrl: string;
  expiresAt: Date;
};

export function institutionInvitationEmail(input: InvitationEmailInput) {
  const expires = input.expiresAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const subject = "Welcome to SOHAN SOFT TECH ERP – Your Institution Account Is Ready";
  const html = `
    <div style="background:#eef1f5;padding:32px;font-family:Arial,sans-serif;color:#1e293b">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
        <tr><td style="background:#123b5a;padding:24px;color:#fff;font-size:20px;font-weight:700">SOHAN SOFT TECH ERP</td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 16px;font-size:22px">Welcome, ${input.administratorName}</h1>
          <p>Your primary administrator account for <strong>${input.institutionName}</strong> (${input.institutionCode}) is ready.</p>
          <p>Activate it to create your password and access the Institution Admin Portal.</p>
          <p style="margin:28px 0;text-align:center">
            <a href="${input.activationUrl}" style="display:inline-block;background:#f5a000;color:#fff;text-decoration:none;padding:13px 22px;border-radius:7px;font-weight:700">Activate Account</a>
          </p>
          <p>This secure activation link expires on <strong>${expires}</strong>.</p>
          <p>If you did not expect this invitation, do not activate the account and contact SOHAN SOFT TECH support.</p>
          <p style="margin-top:24px;color:#64748b;font-size:13px">SOHAN SOFT TECH ERP Support</p>
        </td></tr>
      </table>
    </div>`;
  return { subject, html };
}
