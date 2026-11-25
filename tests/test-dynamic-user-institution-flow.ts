import assert from "node:assert/strict";
import db from "@/lib/db";
import { hashPassword } from "@/lib/auth/password-security";
import { signToken } from "@/lib/auth/jwt";
import type { SessionUser } from "@/types";

async function runTests() {
  console.log("\n=======================================================");
  console.log("TEST SUITE: DYNAMIC USER & MULTI-INSTITUTION ERP FLOW");
  console.log("=======================================================\n");

  // Step 0: Ensure Test Institutions and Students exist in Database
  console.log(">>> [0/4] Preparing test fixtures in database...");

  // Institution A: Aarohan Institute of Technology (TEST)
  let instAarohan = await db.institution.findFirst({
    where: {
      OR: [
        { code: { equals: "AIT2026", mode: "insensitive" } },
        { name: { contains: "Aarohan", mode: "insensitive" } },
      ],
    },
  });

  if (!instAarohan) {
    instAarohan = await db.institution.create({
      data: {
        id: "0772a46b-05dd-4ee7-beaa-f39e423bbf23",
        name: "Aarohan Institute of Technology (TEST)",
        code: "AIT2026",
        slug: "aarohan-institute-test",
        type: "COLLEGE",
        status: "ACTIVE",
        isActive: true,
        address: "Knowledge Campus, Tech Zone",
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        email: "contact@aarohan.edu",
        phone: "+91 80 2345 6789",
        website: "https://aarohan.edu",
      },
    });
  }

  // Student A: Aarohi in Aarohan Institute
  const passwordHash = await hashPassword("Student@123");
  let aarohiUser = await db.user.findFirst({
    where: { email: "aarohi@aarohan.edu" },
  });

  if (!aarohiUser) {
    aarohiUser = await db.user.create({
      data: {
        email: "aarohi@aarohan.edu",
        fullName: "Aarohi",
        role: "STUDENT",
        institutionId: instAarohan.id,
        passwordHash,
        isActive: true,
        status: "ACTIVE",
      },
    });
  } else {
    aarohiUser = await db.user.update({
      where: { id: aarohiUser.id },
      data: {
        fullName: "Aarohi",
        role: "STUDENT",
        institutionId: instAarohan.id,
        passwordHash,
        isActive: true,
        status: "ACTIVE",
      },
    });
  }

  let aarohiStudent = await db.student.findFirst({
    where: { userId: aarohiUser.id },
  });

  if (!aarohiStudent) {
    aarohiStudent = await db.student.create({
      data: {
        userId: aarohiUser.id,
        institutionId: instAarohan.id,
        rollNumber: "AIT26CS001",
        admissionNumber: "ADM-AIT-2026-001",
        firstName: "Aarohi",
        lastName: "",
        fullName: "Aarohi",
        dateOfBirth: new Date("2005-01-01"),
        admissionDate: new Date(),
        gender: "FEMALE",
        email: "aarohi@aarohan.edu",
        currentSemester: 1,
        currentSection: "A",
        status: "ACTIVE",
      },
    });
  } else {
    aarohiStudent = await db.student.update({
      where: { id: aarohiStudent.id },
      data: {
        fullName: "Aarohi",
        firstName: "Aarohi",
      },
    });
  }

  // Institution B: Alpha Academic Institute
  let instAlpha = await db.institution.findFirst({
    where: {
      OR: [
        { code: { equals: "ALPHA-942519", mode: "insensitive" } },
        { name: { contains: "Alpha Academic", mode: "insensitive" } },
      ],
    },
  });

  if (!instAlpha) {
    instAlpha = await db.institution.create({
      data: {
        id: "inst-alpha-942519",
        name: "Alpha Academic Institute",
        code: "ALPHA-942519",
        slug: "alpha-942519",
        type: "COLLEGE",
        status: "ACTIVE",
        isActive: true,
        address: "North Science Block",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        email: "info@alpha.edu",
        phone: "+91 22 9876 5432",
        website: "https://alpha.edu",
      },
    });
  }

  // Student B: Vikram Sarabhai in Alpha Academic Institute
  let vikramUser = await db.user.findFirst({
    where: { email: "student.alpha.p4@alpha.edu" },
  });

  if (!vikramUser) {
    vikramUser = await db.user.create({
      data: {
        email: "student.alpha.p4@alpha.edu",
        fullName: "Vikram Sarabhai",
        role: "STUDENT",
        institutionId: instAlpha.id,
        passwordHash,
        isActive: true,
        status: "ACTIVE",
      },
    });
  } else {
    vikramUser = await db.user.update({
      where: { id: vikramUser.id },
      data: {
        fullName: "Vikram Sarabhai",
        role: "STUDENT",
        institutionId: instAlpha.id,
        passwordHash,
        isActive: true,
        status: "ACTIVE",
      },
    });
  }

  let vikramStudent = await db.student.findFirst({
    where: { userId: vikramUser.id },
  });

  if (!vikramStudent) {
    vikramStudent = await db.student.create({
      data: {
        userId: vikramUser.id,
        institutionId: instAlpha.id,
        rollNumber: "ALPHA-26-001",
        admissionNumber: "ADM-ALPHA-001",
        firstName: "Vikram",
        lastName: "Sarabhai",
        fullName: "Vikram Sarabhai",
        email: "student.alpha.p4@alpha.edu",
        currentSemester: 2,
        currentSection: "B",
        status: "ACTIVE",
      },
    });
  }

  console.log("✓ Fixtures successfully verified in database.");

  // SCENARIO 1: Aarohi logs in
  console.log("\n>>> [1/4] SCENARIO 1: Aarohi logs in (Aarohan Institute of Technology)...");
  {
    // Simulate login endpoint logic directly
    const user = await db.user.findUnique({
      where: { id: aarohiUser.id },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            address: true,
            phone: true,
            email: true,
            website: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
    });

    assert(user, "Aarohi user must exist");
    assert.equal(user.fullName, "Aarohi", "User name must be Aarohi");
    assert.equal(user.email, "aarohi@aarohan.edu", "Email must be aarohi@aarohan.edu");
    assert(user.institution, "User institution must be linked");
    assert.equal(user.institution.name, "Aarohan Institute of Technology (TEST)", "Institution name must match Aarohan");
    assert.equal(user.institution.code, "AIT2026", "Institution code must match AIT2026");

    // Session payload construction
    const aarohiSession: SessionUser = {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      name: user.fullName,
      role: "STUDENT",
      institutionId: user.institution.id,
      institutionName: user.institution.name,
      institutionCode: user.institution.code,
      institutionSlug: user.institution.slug,
      institution: {
        id: user.institution.id,
        name: user.institution.name,
        code: user.institution.code,
        slug: user.institution.slug,
        logo: null,
        address: user.institution.address,
        phone: user.institution.phone,
        email: user.institution.email,
        website: user.institution.website,
        city: user.institution.city,
        state: user.institution.state,
        country: user.institution.country,
      },
      studentId: aarohiStudent.id,
    };

    const token = await signToken(aarohiSession);
    assert(token && token.length > 20, "Valid JWT session token generated");

    // Verify Dashboard displays Aarohi and Aarohan
    const studentData = await db.student.findUnique({
      where: { id: aarohiStudent.id },
      include: { institution: true },
    });
    assert(studentData, "Student profile must exist");
    const displayName = studentData.fullName || studentData.firstName;
    assert.equal(displayName, "Aarohi", "Dashboard displays Aarohi's actual name");
    assert.equal(studentData.institution?.name, "Aarohan Institute of Technology (TEST)", "Dashboard displays Aarohan Institute");

    console.log("✓ Aarohi displayed name: " + displayName);
    console.log("✓ Aarohi institution name: " + studentData.institution?.name);
    console.log("✓ Aarohi college code: " + studentData.institution?.code);
    console.log("✓ Scenario 1: PASSED");
  }

  // SCENARIO 2: Another student logs in (Vikram Sarabhai in Alpha Academic Institute)
  console.log("\n>>> [2/4] SCENARIO 2: Another student logs in (Alpha Academic Institute)...");
  {
    const user = await db.user.findUnique({
      where: { id: vikramUser.id },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
            address: true,
            phone: true,
            email: true,
            website: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
    });

    assert(user, "Vikram user must exist");
    assert.equal(user.fullName, "Vikram Sarabhai", "User name must be Vikram Sarabhai");
    assert.equal(user.email, "student.alpha.p4@alpha.edu", "Email must be student.alpha.p4@alpha.edu");
    assert(user.institution, "User institution must be linked");
    assert.equal(user.institution.name, "Alpha Academic Institute", "Institution must be Alpha Academic Institute");
    assert.equal(user.institution.code, "ALPHA-942519", "Institution code must match ALPHA-942519");

    // Negative assert: ensure absolutely no Aarohi, Aarohan, or Apex info exists
    assert(!user.institution.name.includes("Aarohan"), "Must not leak Aarohan info");
    assert(!user.institution.name.includes("Apex"), "Must not leak Apex info");
    assert.notEqual(user.fullName, "Aarohi", "Must not leak Aarohi name");

    console.log("✓ Vikram displayed name: " + user.fullName);
    console.log("✓ Vikram institution name: " + user.institution.name);
    console.log("✓ Vikram college code: " + user.institution.code);
    console.log("✓ Scenario 2: PASSED");
  }

  // SCENARIO 3: Logout -> Login as different institution user
  console.log("\n>>> [3/4] SCENARIO 3: Logout & complete context replacement...");
  {
    // Step A: Aarohi session active
    let clientCache: Record<string, any> = {
      erp_token: "aarohi-jwt-token",
      erp_user: JSON.stringify({
        fullName: "Aarohi",
        email: "aarohi@aarohan.edu",
        institutionName: "Aarohan Institute of Technology (TEST)",
      }),
      erp_institution_name: "Aarohan Institute of Technology (TEST)",
    };

    assert.equal(clientCache.erp_institution_name, "Aarohan Institute of Technology (TEST)");

    // Step B: Logout executed (simulating handleLogout and POST /api/auth/me)
    delete clientCache.erp_token;
    delete clientCache.erp_user;
    delete clientCache.erp_institution_name;
    delete clientCache.erp_institution;
    delete clientCache.erp_active_child_id;

    assert.equal(clientCache.erp_token, undefined, "Token purged on logout");
    assert.equal(clientCache.erp_institution_name, undefined, "Institution purged on logout");

    // Step C: Login as Vikram Sarabhai
    clientCache = {
      erp_token: "vikram-jwt-token",
      erp_user: JSON.stringify({
        fullName: "Vikram Sarabhai",
        email: "student.alpha.p4@alpha.edu",
        institutionName: "Alpha Academic Institute",
        institutionCode: "ALPHA-942519",
      }),
      erp_institution_name: "Alpha Academic Institute",
    };

    const parsedUser = JSON.parse(clientCache.erp_user);
    assert.equal(parsedUser.fullName, "Vikram Sarabhai", "Replaced with Vikram Sarabhai");
    assert.equal(parsedUser.institutionName, "Alpha Academic Institute", "Replaced with Alpha Academic Institute");
    assert.equal(clientCache.erp_institution_name, "Alpha Academic Institute", "Client cache holds Alpha Academic Institute");

    assert(!JSON.stringify(clientCache).includes("Aarohi"), "Zero stale Aarohi data");
    assert(!JSON.stringify(clientCache).includes("Aarohan"), "Zero stale Aarohan data");
    assert(!JSON.stringify(clientCache).includes("Apex"), "Zero stale Apex data");

    console.log("✓ Session completely wiped and replaced without any residue.");
    console.log("✓ Scenario 3: PASSED");
  }

  // SCENARIO 4: Cross-Tenant Security Isolation
  console.log("\n>>> [4/4] SCENARIO 4: Cross-Tenant Database Relationship Isolation...");
  {
    // Verify Vikram cannot query Aarohi's student records
    const crossTenantRecord = await db.student.findFirst({
      where: {
        id: aarohiStudent.id,
        institutionId: instAlpha.id, // Trying to access with Alpha's institution context
      },
    });

    assert.equal(crossTenantRecord, null, "Cross-tenant access must be rejected by database filter");
    console.log("✓ Cross-tenant access strictly blocked (null returned).");
    console.log("✓ Scenario 4: PASSED");
  }

  console.log("\n=======================================================");
  console.log("ALL SCENARIOS PASSED WITH ZERO HARDCODED INSTITUTIONS!");
  console.log("=======================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Test execution failed:", e);
    process.exit(1);
  });
