import { createHash, randomBytes } from "crypto";

// ── helpers ─────────────────────────────────────────────────────────────────
export function hashPassword(password, salt) {
  return createHash("sha256").update(salt + password + "hq_salt_v1").digest("hex");
}
export function generateSalt()  { return randomBytes(16).toString("hex"); }
export function generateToken() { return randomBytes(32).toString("hex"); }
export function generateId()    { return randomBytes(12).toString("hex"); }
