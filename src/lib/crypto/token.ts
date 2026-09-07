import { createHash, randomBytes } from "node:crypto";

// SHA-256 + server-side pepper hashing for verification codes and password-reset
// tokens (AGENTS.md 2.3 / PRD 7.4).
//
// Deliberately NOT Argon2id: codes/tokens are unguessable random values, so a fast
// deterministic hash (SHA-256 + pepper) is the correct mechanism. These two hashing
// strategies must stay separate — see the sibling file password.ts (Argon2id).

const RESET_TOKEN_PEPPER_ENV = "TOKEN_PEPPER";
const CODE_PEPPER_ENV = "CODE_PEPPER";
const RESET_TOKEN_BYTES = 32;

function getPepper(envKey: string): string {
  const pepper = process.env[envKey];
  if (!pepper) {
    throw new Error(`${envKey} environment variable is not set.`);
  }
  return pepper;
}

// ── Password-reset tokens ─────────────────────────────────────────────────────

/**
 * Generates a raw, unguessable password-reset token. The raw value is placed in the
 * emailed reset link ONCE and is never stored (AGENTS.md 3.2 / PRD 7.5).
 */
export function generateResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTES).toString("base64url");
}

/**
 * Hashes a raw reset token with SHA-256 + the server-side pepper.
 * Only this hash is persisted in the database (AGENTS.md 2.8).
 */
export function hashResetToken(rawToken: string): string {
  return createHash("sha256")
    .update(`${rawToken}${getPepper(RESET_TOKEN_PEPPER_ENV)}`)
    .digest("hex");
}

// ── Verification codes ────────────────────────────────────────────────────────

/**
 * Generates a 6-digit numeric verification code (zero-padded).
 */
export function generateVerificationCode(): string {
  const num = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(num).padStart(6, "0");
}

/**
 * Hashes a verification code with SHA-256 + the CODE_PEPPER.
 * Only this hash is stored in the database — never the raw code (AGENTS.md 3.2).
 */
export function hashVerificationCode(code: string): string {
  return createHash("sha256")
    .update(`${code}${getPepper(CODE_PEPPER_ENV)}`)
    .digest("hex");
}