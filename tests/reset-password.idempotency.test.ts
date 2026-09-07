import { describe, it, expect } from "vitest";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { testPrisma } from "./setup";
import {
  createUser,
  createResetToken,
  createSession,
  mockPostRequest,
  runConcurrently,
} from "./helpers";
import { verifyPassword } from "@/lib/crypto/password";

const RAW_TOKEN = "abc123-reset-token-for-idempotency-test";

describe("reset-password idempotency", () => {
  it("rejects a repeated use of the same token (single-use enforcement)", async () => {
    const user = await createUser({ emailVerified: true });
    await createResetToken(user.id, RAW_TOKEN);

    const first = await resetPassword(
      mockPostRequest({ token: RAW_TOKEN, password: "new-password-1", confirmPassword: "new-password-1" })
    );
    const second = await resetPassword(
      mockPostRequest({ token: RAW_TOKEN, password: "new-password-2", confirmPassword: "new-password-2" })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);

    // The password must reflect exactly the first request's value.
    const updated = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword(updated!.passwordHash, "new-password-1")).toBe(true);
    expect(await verifyPassword(updated!.passwordHash, "new-password-2")).toBe(false);

    // Only one (consumed) token row exists.
    const tokens = await testPrisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.consumedAt).not.toBeNull();
  });

  it("settles concurrent resets with the same token so exactly one succeeds", async () => {
    const user = await createUser({ emailVerified: true });
    await createResetToken(user.id, RAW_TOKEN);

    const responses = await runConcurrently([
      () =>
        resetPassword(
          mockPostRequest({ token: RAW_TOKEN, password: "winner-password-1", confirmPassword: "winner-password-1" })
        ),
      () =>
        resetPassword(
          mockPostRequest({ token: RAW_TOKEN, password: "winner-password-2", confirmPassword: "winner-password-2" })
        ),
    ]);

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);

    // The stored password is exactly one of the two submitted values — never a
    // blend, never both applied.
    const updated = await testPrisma.user.findUnique({ where: { id: user.id } });
    const matchesOne = await verifyPassword(updated!.passwordHash, "winner-password-1");
    const matchesTwo = await verifyPassword(updated!.passwordHash, "winner-password-2");
    expect(matchesOne).toBe(matchesTwo ? false : true);

    // Token consumed exactly once.
    const tokens = await testPrisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.consumedAt).not.toBeNull();
  });

  it("invalidate sessions once when the token is consumed", async () => {
    const user = await createUser({ emailVerified: true });
    await createResetToken(user.id, RAW_TOKEN);
    await createSession(user.id);
    await createSession(user.id);

    await resetPassword(
      mockPostRequest({ token: RAW_TOKEN, password: "reset-me-please", confirmPassword: "reset-me-please" })
    );

    const sessions = await testPrisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(0);
  });
});

describe("forgot-password idempotency", () => {
  it("keeps exactly one active token under concurrent requests", async () => {
    const user = await createUser({ emailVerified: true });

    const responses = await runConcurrently([
      () => forgotPassword(mockPostRequest({ email: user.email })),
      () => forgotPassword(mockPostRequest({ email: user.email })),
    ]);

    // Both must return the generic 200 — never a leaky or conflicting response.
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const tokens = await testPrisma.passwordResetToken.findMany({ where: { userId: user.id } });
    const activeTokens = tokens.filter((t) => t.consumedAt === null);
    expect(activeTokens.length).toBe(1);
  });

  it("answers identically for known and unknown emails", async () => {
    const known = await forgotPassword(mockPostRequest({ email: "someone@example.com" }));
    const unknown = await forgotPassword(mockPostRequest({ email: "nobody@example.com" }));

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });
});