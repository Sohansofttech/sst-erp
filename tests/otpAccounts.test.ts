import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { findOtpLoginAccount, OtpAccountError, type OtpPortalRole } from "../lib/auth/otp-accounts";
import { db } from "../lib/db";

type AccountRow = {
  id: string;
  email: string;
  fullName: string | null;
  passwordHash: string | null;
  role: string | null;
  platformRole: string;
  status: string;
  isActive: boolean;
  institutionId: string | null;
  institutionName: string | null;
  institutionSlug: string | null;
  institutionCode: string | null;
  institutionStatus: string | null;
  institutionIsActive: boolean | null;
};

const originalQueryDescriptor = Object.getOwnPropertyDescriptor(db, "$queryRaw");
const roles: OtpPortalRole[] = ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"];

function accountForRole(role: OtpPortalRole): AccountRow {
  return {
    id: `inst_test_${role.toLowerCase()}`,
    email: `${role.toLowerCase()}@example.test`,
    fullName: `${role} Test User`,
    passwordHash: null,
    role: role === "SUPER_ADMIN" ? null : role,
    platformRole: role,
    status: "ACTIVE",
    isActive: true,
    institutionId: role === "SUPER_ADMIN" ? null : "inst_test",
    institutionName: role === "ADMIN" ? "Test Institution" : null,
    institutionSlug: null,
    institutionCode: null,
    institutionStatus: "ACTIVE",
    institutionIsActive: true,
  };
}

function installAccountRows(rows: AccountRow[]) {
  Object.defineProperty(db, "$queryRaw", {
    configurable: true,
    writable: true,
    value: async () => rows,
  });
}

afterEach(() => {
  if (originalQueryDescriptor) {
    Object.defineProperty(db, "$queryRaw", originalQueryDescriptor);
  } else {
    delete (db as unknown as Record<string, unknown>).$queryRaw;
  }
});

test("registered users match only their authorized portal across all four roles", async () => {
  for (const role of roles) {
    installAccountRows([accountForRole(role)]);
    const account = await findOtpLoginAccount("9876543210", role);
    assert.equal(account!.role, role);
  }

  installAccountRows([accountForRole("STUDENT")]);
  await assert.rejects(
    findOtpLoginAccount("9876543210", "TEACHER"),
    (error: unknown) => error instanceof OtpAccountError && error.status === 403
  );
});

test("unregistered and inactive accounts are rejected", async () => {
  installAccountRows([]);
  const account = await findOtpLoginAccount("9876543210", "STUDENT");
  assert.equal(account, null);

  const inactiveAccount = accountForRole("STUDENT");
  inactiveAccount.isActive = false;
  installAccountRows([inactiveAccount]);
  await assert.rejects(
    findOtpLoginAccount("9876543210", "STUDENT"),
    (error: unknown) => error instanceof OtpAccountError && error.status === 403
  );

  const suspendedInstitution = accountForRole("ADMIN");
  suspendedInstitution.institutionStatus = "SUSPENDED";
  installAccountRows([suspendedInstitution]);
  await assert.rejects(
    findOtpLoginAccount("9876543210", "ADMIN"),
    (error: unknown) => error instanceof OtpAccountError && error.status === 403
  );
});
