import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16; // Standard 128-bit authentication tag

/**
 * Derives a 32-byte key from environment or deterministic seed.
 * Never throws so application does not crash in dev/test.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.PAYMENT_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "sst-erp-payment-encryption-master-key-seed-2026";
  return crypto.createHash("sha256").update(envKey).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: iv_hex:authTag_hex:ciphertext_hex
 */
export function encryptCredential(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext payload formatted as iv_hex:authTag_hex:ciphertext_hex.
 */
export function decryptCredential(encryptedPayload: string): string {
  if (!encryptedPayload) return "";
  
  const parts = encryptedPayload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format: expected iv:authTag:ciphertext");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid IV or authentication tag length in encrypted payload");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Safely masks an API secret or key for display.
 * e.g. "rzp_test_1234567890abcdef" -> "rzp_test_...cdef"
 * e.g. "secretKeyPassword123" -> "••••••••••••"
 */
export function maskCredential(
  val: string,
  visiblePrefix = 4,
  visibleSuffix = 4,
  isFullyMasked = false
): string {
  if (!val) return "";
  if (isFullyMasked) {
    return "••••••••••••";
  }
  if (val.length <= visiblePrefix + visibleSuffix) {
    return "••••••••";
  }
  const prefix = val.slice(0, visiblePrefix);
  const suffix = val.slice(-visibleSuffix);
  return `${prefix}...${suffix}`;
}

/**
 * Generates an unpredictable URL-safe random token for institution webhook routing.
 */
export function generateWebhookToken(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}
