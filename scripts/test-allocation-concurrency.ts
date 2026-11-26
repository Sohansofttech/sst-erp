/**
 * SST-ERP Hostel & Transport Allocation Concurrency Verification Suite
 *
 * Uses in-memory db mocks with simulated async yield and pg_advisory_xact_lock
 * serialization (zero live database writes).
 */

import assert from "assert";
import db from "../lib/db";
import {
  createHostelAllocation,
  createTransportAllocation,
  transferHostelAllocation,
} from "../lib/services/institution-admin.service";

let passCount = 0;
let totalCount = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  totalCount++;
  try {
    await fn();
    passCount++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`      ${err?.message || err}`);
    process.exitCode = 1;
  }
}

const INST_A = "11111111-1111-4111-8111-111111111111";
const INST_B = "22222222-2222-4222-8222-222222222222";

async function main() {
  console.log("\n=== SST-ERP Hostel & Transport Allocation Concurrency Suite ===\n");

  const origTransaction = db.$transaction;
  const origPlatformFindUnique = db.platformSetting.findUnique;

  let hostelRows: any[] = [];
  let transportRows: any[] = [];
  let lockAcquisitionLog: string[][] = [];
  const locks = new Map<string, Promise<void>>();

  function installMocks() {
    hostelRows = [];
    transportRows = [];
    lockAcquisitionLog = [];
    locks.clear();

    (db.platformSetting as any).findUnique = async ({ where }: any) => {
      if (where?.key === `hostel_catalog:${INST_A}`) {
        return {
          key: where.key,
          value: [
            { hostelName: "Block A", roomNumber: "101", capacity: 2 },
            { hostelName: "Block B", roomNumber: "202", capacity: 1 },
            { hostelName: "Block C", roomNumber: "303", capacity: 2 },
          ],
        };
      }
      if (where?.key === `hostel_catalog:${INST_B}`) {
        return {
          key: where.key,
          value: [{ hostelName: "Block A", roomNumber: "101", capacity: 1 }],
        };
      }
      if (where?.key === `transport_catalog:${INST_A}`) {
        return {
          key: where.key,
          value: [{ routeNumber: "R-1", vehicleNumber: "KA-01", capacity: 2, status: "ACTIVE" }],
        };
      }
      if (where?.key === `transport_catalog:${INST_B}`) {
        return {
          key: where.key,
          value: [{ routeNumber: "R-1", vehicleNumber: "KA-01", capacity: 1, status: "ACTIVE" }],
        };
      }
      return null;
    };

    (db as any).$transaction = async (fn: any) => {
      const txLockWaiters: Array<{ lockId: string; release: () => void }> = [];
      const txAcquiredOrder: string[] = [];

      const tx = {
        $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
          const sql = strings.join(" ");
          if (sql.includes("pg_advisory_xact_lock")) {
            const lockId = `${values[0]}::${values[1]}`;
            while (locks.has(lockId)) {
              await locks.get(lockId);
            }
            let release!: () => void;
            const p = new Promise<void>((res) => {
              release = res;
            });
            locks.set(lockId, p);
            txLockWaiters.push({ lockId, release });
            txAcquiredOrder.push(String(values[1]));
          }
          return 0;
        },
        $executeRawUnsafe: async () => 1,
        hostelAllocation: {
          findFirst: async ({ where }: any) => {
            await new Promise((r) => setTimeout(r, 15));
            return (
              hostelRows.find(
                (r) =>
                  r.institutionId === where.institutionId &&
                  (where.id === undefined ||
                    (typeof where.id === "object" && where.id.not !== undefined
                      ? r.id !== where.id.not
                      : r.id === where.id)) &&
                  (where.studentId === undefined || r.studentId === where.studentId) &&
                  (where.hostelName === undefined || r.hostelName === where.hostelName) &&
                  (where.roomNumber === undefined || r.roomNumber === where.roomNumber) &&
                  (where.bedNumber === undefined || r.bedNumber === where.bedNumber)
              ) || null
            );
          },
          count: async ({ where }: any) => {
            await new Promise((r) => setTimeout(r, 15));
            return hostelRows.filter(
              (r) =>
                r.institutionId === where.institutionId &&
                r.hostelName === where.hostelName &&
                r.roomNumber === where.roomNumber &&
                (where.id === undefined ||
                  (typeof where.id === "object" && where.id.not !== undefined
                    ? r.id !== where.id.not
                    : r.id === where.id))
            ).length;
          },
          create: async ({ data, include }: any) => {
            await new Promise((r) => setTimeout(r, 15));
            assert.ok(include?.student?.select, "Must preserve ALLOCATION_STUDENT_SELECT projection");
            const row = {
              id: `h-${hostelRows.length + 1}`,
              ...data,
              student: { id: data.studentId, fullName: `Student ${data.studentId}` },
            };
            hostelRows.push(row);
            return row;
          },
          update: async ({ where, data, include }: any) => {
            await new Promise((r) => setTimeout(r, 15));
            assert.ok(include?.student?.select, "Must preserve ALLOCATION_STUDENT_SELECT projection");
            const idx = hostelRows.findIndex((r) => r.id === where.id);
            if (idx === -1) throw new Error("Allocation not found");
            hostelRows[idx] = { ...hostelRows[idx], ...data };
            return hostelRows[idx];
          },
        },
        transportAllocation: {
          findFirst: async ({ where }: any) => {
            await new Promise((r) => setTimeout(r, 15));
            return (
              transportRows.find(
                (r) =>
                  r.institutionId === where.institutionId &&
                  (where.studentId === undefined || r.studentId === where.studentId)
              ) || null
            );
          },
          count: async ({ where }: any) => {
            await new Promise((r) => setTimeout(r, 15));
            return transportRows.filter(
              (r) =>
                r.institutionId === where.institutionId &&
                r.routeNumber === where.routeNumber &&
                r.vehicleNumber === where.vehicleNumber
            ).length;
          },
          create: async ({ data, include }: any) => {
            await new Promise((r) => setTimeout(r, 15));
            assert.ok(include?.student?.select, "Must preserve ALLOCATION_STUDENT_SELECT projection");
            const row = {
              id: `t-${transportRows.length + 1}`,
              ...data,
              student: { id: data.studentId, fullName: `Student ${data.studentId}` },
            };
            transportRows.push(row);
            return row;
          },
        },
      };

      try {
        const res = await fn(tx);
        if (txAcquiredOrder.length > 0) lockAcquisitionLog.push(txAcquiredOrder);
        return res;
      } catch (err) {
        if (txAcquiredOrder.length > 0) lockAcquisitionLog.push(txAcquiredOrder);
        throw err;
      } finally {
        for (const w of txLockWaiters) {
          locks.delete(w.lockId);
          w.release();
        }
      }
    };
  }

  try {
    await check("1. Hostel allocation within capacity succeeds and preserves student select", async () => {
      installMocks();
      const alloc = await createHostelAllocation(INST_A, {
        studentId: "stu-1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      assert.strictEqual(alloc.studentId, "stu-1");
      assert.strictEqual(hostelRows.length, 1);
    });

    await check("2. Concurrent hostel allocations competing for final slot never exceed room capacity", async () => {
      installMocks();
      await createHostelAllocation(INST_A, {
        studentId: "stu-1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });

      const results = await Promise.allSettled([
        createHostelAllocation(INST_A, {
          studentId: "stu-2",
          hostelName: "Block A",
          roomNumber: "101",
          bedNumber: "Bed 2",
          wardenName: "Warden",
          wardenContact: "9999999999",
        }),
        createHostelAllocation(INST_A, {
          studentId: "stu-3",
          hostelName: "Block A",
          roomNumber: "101",
          bedNumber: "Bed 3",
          wardenName: "Warden",
          wardenContact: "9999999999",
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      assert.strictEqual(fulfilled.length, 1, "Only one concurrent request should claim the final bed");
      assert.strictEqual(rejected.length, 1);
      assert.match(rejected[0].reason.message, /full capacity/i);
      assert.strictEqual(hostelRows.length, 2);
    });

    await check("3. Hostel rejects duplicate student, full capacity, and isolates across institutions", async () => {
      installMocks();
      await createHostelAllocation(INST_A, {
        studentId: "stu-1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      await assert.rejects(
        () =>
          createHostelAllocation(INST_A, {
            studentId: "stu-1",
            hostelName: "Block A",
            roomNumber: "101",
            bedNumber: "Bed 2",
            wardenName: "Warden",
            wardenContact: "9999999999",
          }),
        /already has an active hostel allocation/i
      );

      // Same room/bed in Institution B succeeds independently
      const instBAlloc = await createHostelAllocation(INST_B, {
        studentId: "stu-b1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden B",
        wardenContact: "8888888888",
      });
      assert.strictEqual(instBAlloc.institutionId, INST_B);

      // Institution B is now at capacity (1)
      await assert.rejects(
        () =>
          createHostelAllocation(INST_B, {
            studentId: "stu-b2",
            hostelName: "Block A",
            roomNumber: "101",
            bedNumber: "Bed 2",
            wardenName: "Warden B",
            wardenContact: "8888888888",
          }),
        /full capacity/i
      );
    });

    await check("4. Concurrent transport allocations competing for final seat never exceed capacity", async () => {
      installMocks();
      await createTransportAllocation(INST_A, {
        studentId: "stu-1",
        routeName: "Route 1",
        routeNumber: "R-1",
        vehicleNumber: "KA-01",
        driverName: "Driver",
        driverContact: "9999999999",
        pickupPoint: "Gate 1",
        pickupTime: "07:30 AM",
        dropTime: "05:00 PM",
      });

      const results = await Promise.allSettled([
        createTransportAllocation(INST_A, {
          studentId: "stu-2",
          routeName: "Route 1",
          routeNumber: "R-1",
          vehicleNumber: "KA-01",
          driverName: "Driver",
          driverContact: "9999999999",
          pickupPoint: "Gate 2",
          pickupTime: "07:35 AM",
          dropTime: "05:05 PM",
        }),
        createTransportAllocation(INST_A, {
          studentId: "stu-3",
          routeName: "Route 1",
          routeNumber: "R-1",
          vehicleNumber: "KA-01",
          driverName: "Driver",
          driverContact: "9999999999",
          pickupPoint: "Gate 3",
          pickupTime: "07:40 AM",
          dropTime: "05:10 PM",
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      assert.strictEqual(fulfilled.length, 1, "Only one concurrent request should claim the final seat");
      assert.strictEqual(rejected.length, 1);
      assert.match(rejected[0].reason.message, /maximum passenger seating capacity/i);
      assert.strictEqual(transportRows.length, 2);
    });

    await check("5. Transport rejects duplicate student and isolates across institutions", async () => {
      installMocks();
      await createTransportAllocation(INST_A, {
        studentId: "stu-1",
        routeName: "Route 1",
        routeNumber: "R-1",
        vehicleNumber: "KA-01",
        driverName: "Driver",
        driverContact: "9999999999",
        pickupPoint: "Gate 1",
        pickupTime: "07:30 AM",
        dropTime: "05:00 PM",
      });
      await assert.rejects(
        () =>
          createTransportAllocation(INST_A, {
            studentId: "stu-1",
            routeName: "Route 1",
            routeNumber: "R-1",
            vehicleNumber: "KA-01",
            driverName: "Driver",
            driverContact: "9999999999",
            pickupPoint: "Gate 1",
            pickupTime: "07:30 AM",
            dropTime: "05:00 PM",
          }),
        /already has an active allocation/i
      );

      const instBAlloc = await createTransportAllocation(INST_B, {
        studentId: "stu-b1",
        routeName: "Route 1",
        routeNumber: "R-1",
        vehicleNumber: "KA-01",
        driverName: "Driver B",
        driverContact: "8888888888",
        pickupPoint: "Gate B",
        pickupTime: "07:30 AM",
        dropTime: "05:00 PM",
      });
      assert.strictEqual(instBAlloc.institutionId, INST_B);

      await assert.rejects(
        () =>
          createTransportAllocation(INST_B, {
            studentId: "stu-b2",
            routeName: "Route 1",
            routeNumber: "R-1",
            vehicleNumber: "KA-01",
            driverName: "Driver B",
            driverContact: "8888888888",
            pickupPoint: "Gate B",
            pickupTime: "07:30 AM",
            dropTime: "05:00 PM",
          }),
        /maximum passenger seating capacity/i
      );
    });

    await check("6. Hostel transfer succeeds within capacity and rejects when destination room is full", async () => {
      installMocks();
      const a1 = await createHostelAllocation(INST_A, {
        studentId: "stu-t1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      // Transfer stu-t1 to Block B / 202 (capacity 1)
      const moved = await transferHostelAllocation(INST_A, a1.id, {
        hostelName: "Block B",
        roomNumber: "202",
        bedNumber: "Bed 1",
      });
      assert.strictEqual(moved.hostelName, "Block B");
      assert.strictEqual(moved.roomNumber, "202");

      // Second student in Block A / 101 tries to transfer to full Block B / 202
      const a2 = await createHostelAllocation(INST_A, {
        studentId: "stu-t2",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      await assert.rejects(
        () =>
          transferHostelAllocation(INST_A, a2.id, {
            hostelName: "Block B",
            roomNumber: "202",
            bedNumber: "Bed 2",
          }),
        /full capacity/i
      );
    });

    await check("7. Concurrent hostel transfers competing for final destination bed never exceed capacity", async () => {
      installMocks();
      const a1 = await createHostelAllocation(INST_A, {
        studentId: "stu-c1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      const a2 = await createHostelAllocation(INST_A, {
        studentId: "stu-c2",
        hostelName: "Block C",
        roomNumber: "303",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });

      const results = await Promise.allSettled([
        transferHostelAllocation(INST_A, a1.id, {
          hostelName: "Block B",
          roomNumber: "202",
          bedNumber: "Bed 1",
        }),
        transferHostelAllocation(INST_A, a2.id, {
          hostelName: "Block B",
          roomNumber: "202",
          bedNumber: "Bed 2",
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      assert.strictEqual(fulfilled.length, 1, "Only one concurrent transfer should claim the single bed in Block B / 202");
      assert.strictEqual(rejected.length, 1);
      assert.match(rejected[0].reason.message, /full capacity/i);
      const blockBOccupants = hostelRows.filter(
        (r) => r.institutionId === INST_A && r.hostelName === "Block B" && r.roomNumber === "202"
      );
      assert.strictEqual(blockBOccupants.length, 1);
    });

    await check("8. Hostel transfer acquires source and destination locks in deterministic sorted order", async () => {
      installMocks();
      const a1 = await createHostelAllocation(INST_A, {
        studentId: "stu-l1",
        hostelName: "Block C",
        roomNumber: "303",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      lockAcquisitionLog = [];

      // Transfer from Block C:303 -> Block A:101; sorted order must acquire block a:101 before block c:303
      await transferHostelAllocation(INST_A, a1.id, {
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
      });
      assert.strictEqual(lockAcquisitionLog.length, 1);
      assert.deepStrictEqual(lockAcquisitionLog[0], [
        `${INST_A}:block a:101`,
        `${INST_A}:block c:303`,
      ]);

      // Same-room bed swap acquires a single deduplicated lock
      lockAcquisitionLog = [];
      await transferHostelAllocation(INST_A, a1.id, {
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 2",
      });
      assert.deepStrictEqual(lockAcquisitionLog[0], [`${INST_A}:block a:101`]);
    });

    await check("9. Hostel transfer enforces cross-institution isolation", async () => {
      installMocks();
      const a1 = await createHostelAllocation(INST_A, {
        studentId: "stu-iso",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      await assert.rejects(
        () =>
          transferHostelAllocation(INST_B, a1.id, {
            hostelName: "Block A",
            roomNumber: "101",
            bedNumber: "Bed 2",
          }),
        /not found or access denied/i
      );
    });

    await check("10. Transfer retries with new sorted source/destination locks if source room changes before lock", async () => {
      installMocks();
      const a1 = await createHostelAllocation(INST_A, {
        studentId: "stu-retry-1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      lockAcquisitionLog = [];

      // Simulate another concurrent transfer moving a1 from Block A:101 -> Block C:303
      // right after attempt 1 reads initial (Block A:101) and before locks are acquired.
      let findFirstCount = 0;
      const origTx = db.$transaction;
      (db as any).$transaction = async (fn: any) => {
        return origTx(async (tx: any) => {
          const origFindFirst = tx.hostelAllocation.findFirst;
          tx.hostelAllocation.findFirst = async (args: any) => {
            findFirstCount++;
            // On the 1st findFirst (attempt 1 initial read), return Block A:101, then mutate row to Block C:303
            const res = await origFindFirst(args);
            if (findFirstCount === 1 && res && res.id === a1.id) {
              hostelRows[0] = { ...hostelRows[0], hostelName: "Block C", roomNumber: "303" };
            }
            return res;
          };
          return fn(tx);
        });
      };

      try {
        const result = await transferHostelAllocation(INST_A, a1.id, {
          hostelName: "Block B",
          roomNumber: "202",
          bedNumber: "Bed 1",
        });
        assert.strictEqual(result.hostelName, "Block B");
        assert.strictEqual(result.roomNumber, "202");
        assert.strictEqual(lockAcquisitionLog.length, 2, "Attempt 1 should roll back and Attempt 2 should succeed");
        assert.deepStrictEqual(lockAcquisitionLog[0], [`${INST_A}:block a:101`, `${INST_A}:block b:202`]);
        assert.deepStrictEqual(lockAcquisitionLog[1], [`${INST_A}:block b:202`, `${INST_A}:block c:303`]);
      } finally {
        (db as any).$transaction = origTx;
      }
    });

    await check("11. Transfer enforces bounded retry limit when source room changes repeatedly", async () => {
      installMocks();
      const a1 = await createHostelAllocation(INST_A, {
        studentId: "stu-retry-limit",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      lockAcquisitionLog = [];

      let attemptCounter = 0;
      const origTx = db.$transaction;
      (db as any).$transaction = async (fn: any) => {
        attemptCounter++;
        const currentAttempt = attemptCounter;
        return origTx(async (tx: any) => {
          let callsInTx = 0;
          const origFindFirst = tx.hostelAllocation.findFirst;
          tx.hostelAllocation.findFirst = async (args: any) => {
            callsInTx++;
            const res = await origFindFirst(args);
            // Mutate source room on every attempt's initial read so re-fetch mismatches every time
            if (callsInTx === 1 && res && res.id === a1.id) {
              hostelRows[0] = {
                ...hostelRows[0],
                hostelName: `Block X${currentAttempt}`,
                roomNumber: `${400 + currentAttempt}`,
              };
            }
            return res;
          };
          return fn(tx);
        });
      };

      try {
        await assert.rejects(
          () =>
            transferHostelAllocation(INST_A, a1.id, {
              hostelName: "Block B",
              roomNumber: "202",
              bedNumber: "Bed 1",
            }),
          /source room changed concurrently/i
        );
        assert.strictEqual(attemptCounter, 3, "Must stop after MAX_TRANSFER_LOCK_ATTEMPTS (3)");
        assert.strictEqual(lockAcquisitionLog.length, 3);
      } finally {
        (db as any).$transaction = origTx;
      }
    });

    await check("12. Opposite-direction concurrent transfers (A->C and C->A) complete without deadlock", async () => {
      installMocks();
      const a1 = await createHostelAllocation(INST_A, {
        studentId: "stu-opp-1",
        hostelName: "Block A",
        roomNumber: "101",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      const a2 = await createHostelAllocation(INST_A, {
        studentId: "stu-opp-2",
        hostelName: "Block C",
        roomNumber: "303",
        bedNumber: "Bed 1",
        wardenName: "Warden",
        wardenContact: "9999999999",
      });
      lockAcquisitionLog = [];

      const [r1, r2] = await Promise.all([
        transferHostelAllocation(INST_A, a1.id, {
          hostelName: "Block C",
          roomNumber: "303",
          bedNumber: "Bed 2",
        }),
        transferHostelAllocation(INST_A, a2.id, {
          hostelName: "Block A",
          roomNumber: "101",
          bedNumber: "Bed 2",
        }),
      ]);
      assert.strictEqual(r1.hostelName, "Block C");
      assert.strictEqual(r2.hostelName, "Block A");
      assert.strictEqual(lockAcquisitionLog.length, 2);
      for (const order of lockAcquisitionLog) {
        assert.deepStrictEqual(order, [`${INST_A}:block a:101`, `${INST_A}:block c:303`]);
      }
    });
  } finally {
    (db as any).$transaction = origTransaction;
    (db.platformSetting as any).findUnique = origPlatformFindUnique;
  }

  console.log(`\n=== RESULTS: ${passCount} / ${totalCount} CHECKS PASSED ===\n`);
}

main();
