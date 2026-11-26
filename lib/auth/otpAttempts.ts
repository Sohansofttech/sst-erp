// Simple in‑memory tracking of OTP verification attempts per mobile number.
// Used to enforce a maximum number of verification tries before requiring a new OTP.

const attempts = new Map<string, { count: number; expiresAt: number }>();

/** Initialize attempt tracking for a mobile number when an OTP is sent. */
export function initAttempts(mobile: string, ttlMinutes = 15) {
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
  attempts.set(mobile, { count: 0, expiresAt });
}

/** Increment attempt counter and return the new count. Throws if limit exceeded. */
export function incrementAttempt(mobile: string, maxAttempts = 5) {
  const entry = attempts.get(mobile);
  if (!entry) {
    // No tracking entry – treat as first attempt.
    initAttempts(mobile);
    return 1;
  }
  if (Date.now() > entry.expiresAt) {
    // Reset after expiry.
    attempts.delete(mobile);
    initAttempts(mobile);
    return 1;
  }
  entry.count += 1;
  if (entry.count > maxAttempts) {
    attempts.delete(mobile);
    const err: any = new Error("Maximum OTP verification attempts exceeded.");
    err.code = "MAX_ATTEMPTS";
    throw err;
  }
  attempts.set(mobile, entry);
  return entry.count;
}

/** Clear tracking after successful verification or when OTP is resent. */
export function clearAttempts(mobile: string) {
  attempts.delete(mobile);
}
