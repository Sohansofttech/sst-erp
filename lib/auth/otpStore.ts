// In‑memory OTP store for mobile OTP verification.
// This store holds a hash of the OTP along with expiry and attempt counters.
// It is cleared on process restart; suitable for test/dev environments.

import bcrypt from "bcryptjs";

type OtpEntry = {
  hash: string; // bcrypt hash of the OTP
  expiresAt: number; // timestamp in ms
  attempts: number; // number of verification attempts used
};

// Map keyed by normalized mobile number (digits only)
const store = new Map<string, OtpEntry>();

/**
 * Create and store an OTP entry.
 * ttlMinutes defaults to FAST2SMS_OTP_EXPIRY env value.
 */
export function storeOtp(mobile: string, otp: string, ttlMinutes?: number) {
  const ttl = ttlMinutes ?? Number(process.env.FAST2SMS_OTP_EXPIRY ?? 15);
  const expiry = Date.now() + ttl * 60 * 1000;
  const hash = bcrypt.hashSync(otp, 10);
  store.set(mobile, { hash, expiresAt: expiry, attempts: 0 });
}

/**
 * Verify a submitted OTP.
 * Returns true on success, throws an error on failure.
 */
export function verifyStoredOtp(mobile: string, otp: string, maxAttempts = 5) {
  const entry = store.get(mobile);
  if (!entry) {
    const err: any = new Error("OTP not found or expired.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(mobile);
    const err: any = new Error("OTP has expired.");
    err.code = "EXPIRED";
    throw err;
  }
  if (entry.attempts >= maxAttempts) {
    store.delete(mobile);
    const err: any = new Error("Maximum OTP verification attempts exceeded.");
    err.code = "MAX_ATTEMPTS";
    throw err;
  }
  const isValid = bcrypt.compareSync(otp, entry.hash);
  entry.attempts += 1;
  if (isValid) {
    // Successful verification – remove entry
    store.delete(mobile);
    return true;
  }
  // If attempts exhausted after this try, clean up
  if (entry.attempts >= maxAttempts) {
    store.delete(mobile);
  } else {
    store.set(mobile, entry);
  }
  const err: any = new Error("Invalid OTP.");
  err.code = "INVALID";
  throw err;
}

/**
 * Optional cleanup of stale entries (not strictly required for in‑memory store).
 */
export function cleanupExpiredOtps() {
  const now = Date.now();
  for (const [mobile, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(mobile);
    }
  }
}
