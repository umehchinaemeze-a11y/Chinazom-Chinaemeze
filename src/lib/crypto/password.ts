import { hash, verify, argon2id, type HashOptions } from "argon2";

// Fixed parameters locked in AGENTS.md Section 2.3 / PRD Section 7.4:
// Memory cost: 19 MiB (19456 KiB)
// Iterations: 2
// Parallelism: 1
// Type: Argon2id
//
// These are named constants, not a tuning target computed at runtime.
// Heavy work must run in Node.js runtime API route handlers only, never in middleware (AGENTS.md 4.1).

export const ARGON2_OPTIONS: HashOptions & { raw?: false } = {
  type: argon2id,
  memoryCost: 19456, // 19 MiB in KiB
  timeCost: 2, // 2 iterations
  parallelism: 1, // 1 thread
  raw: false,
};

/**
 * Hashes a plaintext password using Argon2id with locked parameters.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(
  hashString: string,
  plainText: string
): Promise<boolean> {
  try {
    return await verify(hashString, plainText);
  } catch {
    return false;
  }
}
