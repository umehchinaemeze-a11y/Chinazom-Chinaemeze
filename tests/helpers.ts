import { testPrisma } from "./setup";

export interface TestUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Creates a user directly via Prisma. `emailVerified` defaults to false.
 */
export async function createUser(overrides?: {
  email?: string;
  emailVerified?: boolean;
}): Promise<TestUser> {
  const email =
    overrides?.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const user = await testPrisma.user.create({
    data: {
      name: "Test User",
      email,
      emailVerified: overrides?.emailVerified ?? false,
      passwordHash: "$argon2id$test-hash-not-a-real-password",
    },
  });
  return { id: user.id, name: user.name, email: user.email };
}

/**
 * Creates a verification code row for a user directly, using the given raw code
 * (already hashed with the same pepper the route handlers use).
 */
export async function createVerificationCode(userId: string, rawCode: string) {
  const { hashVerificationCode } = await import("@/lib/crypto/token");
  return testPrisma.verificationCode.create({
    data: {
      userId,
      codeHash: hashVerificationCode(rawCode),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
}

/**
 * Creates a password-reset token row for a user directly.
 */
export async function createResetToken(userId: string, rawToken: string) {
  const { hashResetToken } = await import("@/lib/crypto/token");
  return testPrisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashResetToken(rawToken),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });
}

/**
 * Creates a session row directly for a user.
 */
export async function createSession(userId: string) {
  return testPrisma.session.create({
    data: {
      userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * Builds a Request object with the given JSON body and optional cookies,
 * mocking the way Next.js server receives route-handler requests.
 */
export function mockPostRequest(body: unknown, cookie?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  return new Request("http://localhost/api/auth", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Runs N async tasks concurrently and waits for all of them to settle.
 */
export async function runConcurrently<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
  // Deliberately NOT Promise.allSettled: we need to observe the final
  // post-concurrency state, not swallow failures.
  return Promise.all(tasks.map((task) => task()));
}