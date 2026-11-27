import assert from "node:assert/strict";
import { test } from "node:test";
import { provisionInstitutionAdmin } from "../lib/services/institution-provisioning.service";
import { sendInstitutionInvitationEmail } from "../lib/email/send-institution-email";

type Dependencies = NonNullable<Parameters<typeof provisionInstitutionAdmin>[1]>;

function fixture() {
  const institution = { id: "institution-1", name: "Example", code: "EX", slug: "example", email: "admin@example.com", phone: null, status: "ACTIVE", archivedAt: null };
  let platformUser: { id: string } | null = null;
  let appUser: { id: string; institutionId: string; name: string; fullName: string; phone: null; passwordHash: string } | null = null;
  let membership: { id: string } | null = null;
  let role: { id: string } | null = null;
  let status = "PENDING";
  let invitationStatus = "";
  let sent = false;
  let sync = true;
  let mailCalls = 0;
  let failStatusWrite = false;
  const tx = {
    platformInstitution: {
      findUnique: async () => institution,
      update: async ({ data }: { data: { provisioningStatus?: string } }) => {
        if (failStatusWrite && data.provisioningStatus === "INVITED") throw new Error("status write failed");
        if (data.provisioningStatus) status = data.provisioningStatus;
      },
    },
    platformUser: {
      findFirst: async () => platformUser,
      create: async ({ data }: { data: { id: string } }) => { platformUser = { id: data.id }; },
      update: async () => {},
    },
    role: {
      findUnique: async () => role,
      create: async () => (role = { id: "role-1" }),
    },
    institutionMembership: {
      findFirst: async () => null,
      findUnique: async () => membership,
      create: async () => (membership = { id: "membership-1" }),
      update: async () => membership,
    },
    membershipRole: { upsert: async () => {} },
    user: {
      findFirst: async () => appUser,
      create: async ({ data }: { data: typeof appUser }) => { appUser = data; },
      update: async ({ data }: { data: Partial<NonNullable<typeof appUser>> }) => { appUser = { ...appUser!, ...data }; },
    },
    institutionAdminInvitation: {
      updateMany: async () => {},
      create: async () => ({ id: "invitation-1" }),
      update: async ({ data }: { data: { status: string } }) => { invitationStatus = data.status; },
    },
    platformAuditLog: { create: async () => {} },
  };
  const dependencies = {
    prisma: { ...tx, $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx) },
    syncInstitutionToAppDb: async () => sync,
    sendInstitutionInvitationEmail: async () => {
      mailCalls++;
      return sent ? { sent: true as const } : { sent: false as const, reason: "Transport unavailable" };
    },
    invitationBaseUrl: () => "https://example.test",
  } as unknown as Dependencies;
  return {
    dependencies,
    setSync: (value: boolean) => { sync = value; },
    setSent: (value: boolean) => { sent = value; },
    setFailStatusWrite: (value: boolean) => { failStatusWrite = value; },
    getStatus: () => status,
    getInvitationStatus: () => invitationStatus,
    getAppUser: () => appUser,
    getMailCalls: () => mailCalls,
  };
}

test("sync failure records failed provisioning and does not create an account or send email", async () => {
  const f = fixture();
  f.setSync(false);
  const result = await provisionInstitutionAdmin({ institutionId: "institution-1" }, f.dependencies);
  assert.equal(result.success, false);
  assert.match(result.error!, /synchronized/);
  assert.equal(f.getStatus(), "FAILED");
  assert.equal(f.getAppUser(), null);
  assert.equal(f.getMailCalls(), 0);
});

test("failed delivery can be retried without creating another account or resetting its password", async () => {
  const f = fixture();
  const first = await provisionInstitutionAdmin({ institutionId: "institution-1", adminPassword: "first-password" }, f.dependencies);
  assert.equal(first.success, false);
  assert.match(first.error!, /invitation delivery failed/);
  assert.equal(f.getStatus(), "FAILED");
  assert.equal(f.getInvitationStatus(), "FAILED");
  const user = f.getAppUser()!;
  const hash = user.passwordHash;
  f.setSent(true);
  const retry = await provisionInstitutionAdmin({ institutionId: "institution-1", adminPassword: "different-password", resend: true }, f.dependencies);
  assert.equal(retry.success, true);
  assert.equal(f.getStatus(), "INVITED");
  assert.equal(f.getInvitationStatus(), "SENT");
  assert.equal(f.getAppUser()!.id, user.id);
  assert.equal(f.getAppUser()!.passwordHash, hash);
  assert.equal(f.getMailCalls(), 2);
});

test("delivery is not reported successful if its status cannot be recorded", async () => {
  const f = fixture();
  f.setSent(true);
  f.setFailStatusWrite(true);
  const result = await provisionInstitutionAdmin({ institutionId: "institution-1" }, f.dependencies);
  assert.equal(result.success, false);
  assert.equal(f.getStatus(), "FAILED");
});

test("test email transports are not reported as delivered invitations", async () => {
  const input = {
    to: "admin@example.com",
    institutionName: "Example",
    institutionCode: "EX",
    administratorName: "Administrator",
    activationUrl: "https://example.test/activate",
    expiresAt: new Date("2030-01-01"),
  };
  for (const provider of ["simulated", "ethereal"]) {
    const result = await sendInstitutionInvitationEmail(input, async () => ({ success: true, status: "PROVIDER_ACCEPTED", provider }));
    assert.equal(result.sent, false);
  }
  const result = await sendInstitutionInvitationEmail(input, async () => ({ success: true, status: "PROVIDER_ACCEPTED", provider: "smtp" }));
  assert.equal(result.sent, true);
});
