import crypto from "crypto";
import bcrypt from "bcryptjs";

// Common default / temporary passwords used during seeding and provisioning
export const DEFAULT_PASSWORDS = new Set([
  "student@123",
  "password@123",
  "superadmin@123",
  "parent@123",
  "student123",
  "teacher123",
  "admin123",
  "superadmin123",
  "password123",
  "welcome123",
  "welcome@123",
  "changeme123",
  "changeme@123",
  "temp12345",
  "12345678",
  "qwerty123",
]);

export interface PasswordValidationResult {
  valid: boolean;
  score: number; // 0 to 4
  errors: string[];
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
    noCommonWords: boolean;
    notPersonal: boolean;
  };
}

/**
 * Validates password strength based on industry security standards (NIST SP 800-63B).
 * Minimum 8 characters, requiring uppercase, lowercase, numbers, and special characters.
 */
export function validatePasswordStrength(
  password: string,
  userContext?: { email?: string; fullName?: string }
): PasswordValidationResult {
  const errors: string[] = [];
  const trimmed = password ? password.trim() : "";

  const minLength = trimmed.length >= 8;
  const hasUppercase = /[A-Z]/.test(trimmed);
  const hasLowercase = /[a-z]/.test(trimmed);
  const hasNumber = /[0-9]/.test(trimmed);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(trimmed);

  if (!minLength) errors.push("Password must be at least 8 characters long.");
  if (!hasUppercase) errors.push("Password must contain at least one uppercase letter (A-Z).");
  if (!hasLowercase) errors.push("Password must contain at least one lowercase letter (a-z).");
  if (!hasNumber) errors.push("Password must contain at least one number (0-9).");
  if (!hasSpecial) errors.push("Password must contain at least one special character (e.g. !@#$%^&*).");

  // Check personal identifiers
  let notPersonal = true;
  if (userContext?.email) {
    const emailPrefix = userContext.email.split("@")[0].toLowerCase();
    if (emailPrefix.length >= 3 && trimmed.toLowerCase().includes(emailPrefix)) {
      errors.push("Password must not contain parts of your email address.");
      notPersonal = false;
    }
  }

  if (userContext?.fullName) {
    const names = userContext.fullName.toLowerCase().split(/\s+/).filter((n) => n.length >= 3);
    for (const name of names) {
      if (trimmed.toLowerCase().includes(name)) {
        errors.push("Password must not contain your name.");
        notPersonal = false;
        break;
      }
    }
  }

  // Check common / sequential patterns
  let noCommonWords = true;
  const lower = trimmed.toLowerCase();
  if (DEFAULT_PASSWORDS.has(lower) || /^(.)\1+$/.test(lower) || "1234567890".includes(lower) || "qwertyuiop".includes(lower)) {
    errors.push("Password is too common or predictable.");
    noCommonWords = false;
  }

  // Calculate score
  let score = 0;
  if (minLength) score++;
  if (hasUppercase && hasLowercase) score++;
  if (hasNumber && hasSpecial) score++;
  if (trimmed.length >= 12 && noCommonWords && notPersonal) score++;

  return {
    valid: errors.length === 0,
    score,
    errors,
    requirements: {
      minLength,
      hasUppercase,
      hasLowercase,
      hasNumber,
      hasSpecial,
      noCommonWords,
      notPersonal,
    },
  };
}

/**
 * Checks if a password is a known default or temporary password.
 */
export function isDefaultOrTemporaryPassword(password: string): boolean {
  if (!password) return false;
  return DEFAULT_PASSWORDS.has(password.trim().toLowerCase());
}

/**
 * Checks if a password has been compromised in public data breaches using
 * the privacy-preserving k-Anonymity model (Have I Been Pwned API).
 *
 * Security Guarantee:
 * - Only the first 5 characters of the SHA-1 hash are transmitted.
 * - The full password or full hash is NEVER sent across the network.
 * - If the remote service is unreachable or offline, local blacklist is enforced without crashing.
 */
export async function checkPwnedPassword(password: string): Promise<{ compromised: boolean; occurrences: number }> {
  if (!password) return { compromised: false, occurrences: 0 };

  const lower = password.trim().toLowerCase();
  // 1. Fast check against known local high-risk dictionary
  if (DEFAULT_PASSWORDS.has(lower)) {
    return { compromised: true, occurrences: 999999 };
  }

  // 2. Compute SHA-1 hash of the password
  const sha1Hash = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1Hash.substring(0, 5);
  const suffix = sha1Hash.substring(5);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s timeout for fast UI response

    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: {
        "User-Agent": "SST-ERP-Password-Security-Validator",
        "Add-Padding": "true", // Privacy padding
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      // Graceful fallback if HIBP is rate limited or returning non-200
      return { compromised: false, occurrences: 0 };
    }

    const text = await res.text();
    const lines = text.split("\n");

    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix && hashSuffix.toUpperCase() === suffix) {
        const count = parseInt(countStr || "1", 10);
        return { compromised: true, occurrences: count };
      }
    }

    return { compromised: false, occurrences: 0 };
  } catch {
    // If offline, DNS failed, or timeout, do not block the user, fail open gracefully on the remote API
    return { compromised: false, occurrences: 0 };
  }
}

/**
 * Hashes a password using bcrypt with standard work factor of 10.
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

/**
 * Compares plain text password against bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return await bcrypt.compare(password, hash);
}

