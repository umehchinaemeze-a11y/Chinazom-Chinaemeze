import { describe, it, expect } from "vitest";
import { POST as verify } from "@/app/api/auth/verify/route";
import { POST as resend } from "@/app/api/auth/verify/resend/route";
import { testPrisma } from "./setup";
import {
  createUser,
  createVerificationCode,
  mockPostRequest,
  runConcurrently,
} from "./helpers";

const VALID_CODE = "123456";
const WRONG_CODE = "000000";

describe("email verification idempotency", () => {
  it("verifies once and treats repeats as success (idempotent)", async () => {
    const user = await createUser();
    await createVerificationCode(user.id, VALID_CODE);

    const first = await verify(mockPostRequest({ email: user.email, code: VALID_CODE }));
    const second = await verify(mockPostRequest({ email: user.email, code: VALID_CODE }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const updated = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(updated!.emailVerified).toBe(true);

    // Code consumed exactly once.
    const codes = await testPrisma.verificationCode.findMany({ where: { userId: user.id } });
    expect(codes).toHaveLength(1);
    expect(codes[0]!.consumedAt).not.toBeNull();
  });

  it("settles concurrent verifications with the same code into one verified state", async () => {
    const user = await createUser();
    await createVerificationCode(user.id, VALID_CODE);

    const responses = await runConcurrently([
      () => verify(mockPostRequest({ email: user.email, code: VALID_CODE })),
      () => verify(mockPostRequest({ email: user.email, code: VALID_CODE })),
    ]);

    // Both are success — the loser of the race sees the already-verified state.
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const updated = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(updated!.emailVerified).toBe(true);

    const codes = await testPrisma.verificationCode.findMany({ where: { userId: user.id } });
    expect(codes).toHaveLength(1);
    expect(codes[0]!.consumedAt).not.toBeNull();
  });

  it("uses the same generic error for a wrong code and an unknown email", async () => {
    const user = await createUser();
    await createVerificationCode(user.id, VALID_CODE);

    const wrongCode = await verify(mockPostRequest({ email: user.email, code: WRONG_CODE }));
    const unknownEmail = await verify(mockPostRequest({ email: "ghost@example.com", code: VALID_CODE }));

    expect(wrongCode.status).toBe(400);
    expect(unknownEmail.status).toBe(400);
    expect(await wrongCode.json()).toEqual(await unknownEmail.json());
  });

  it("returns success when the email is already verified", async () => {
    const user = await createUser({ emailVerified: true });
    const res = await verify(mockPostRequest({ email: user.email, code: VALID_CODE }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 429 with Retry-After once the per-account verify limit (10/15min) is exceeded", async () => {
    const user = await createUser();
    await createVerificationCode(user.id, VALID_CODE);

    for (let i = 0; i < 10; i++) {
      const res = await verify(mockPostRequest({ email: user.email, code: WRONG_CODE }));
      expect(res.status).toBe(400);
    }

    const eleventh = await verify(mockPostRequest({ email: user.email, code: WRONG_CODE }));
    expect(eleventh.status).toBe(429);
    expect(eleventh.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("resend verification idempotency", () => {
  it("ever keeps only one active code under concurrent resends", async () => {
    const user = await createUser();

    const responses = await runConcurrently([
      () => resend(mockPostRequest({ email: user.email })),
      () => resend(mockPostRequest({ email: user.email })),
    ]);

    // Both are allowed: either both succeed or the cooldown rejects the second.
    for (const res of responses) {
      expect([200, 429]).toContain(res.status);
      if (res.status === 429) {
        expect(res.headers.get("Retry-After")).toBeTruthy();
      }
    }

    const codes = await testPrisma.verificationCode.findMany({ where: { userId: user.id } });
    const activeCodes = codes.filter((c) => c.consumedAt === null);
    expect(activeCodes.length).toBeLessThanOrEqual(1);
  });

  it("returns the same generic response for a verified, unverified, and unknown email", async () => {
    // Unverified user with NO existing code, so the resend succeeds rather than
    // tripping the 60-second cooldown (which is a separate, cooldown-specific
    // response — not an account-existence leak by itself).
    const unverified = await createUser();
    const unverifiedRes = await resend(mockPostRequest({ email: unverified.email }));

    const verified = await createUser({ emailVerified: true });
    const verifiedRes = await resend(mockPostRequest({ email: verified.email }));

    const unknownRes = await resend(mockPostRequest({ email: "ghost@example.com" }));

    expect(unverifiedRes.status).toBe(200);
    expect(verifiedRes.status).toBe(200);
    expect(unknownRes.status).toBe(200);

    const unverifiedBody = await unverifiedRes.json();
    const verifiedBody = await verifiedRes.json();
    const unknownBody = await unknownRes.json();
    expect(verifiedBody).toEqual(unverifiedBody);
    expect(unknownBody).toEqual(unverifiedBody);
  });

  it("rejects a resend within the 60-second cooldown with Retry-After", async () => {
    const user = await createUser();

    const first = await resend(mockPostRequest({ email: user.email }));
    expect(first.status).toBe(200);

    const second = await resend(mockPostRequest({ email: user.email }));
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 429 with Retry-After once the resend email limit (5/hour) is exceeded", async () => {
    // A verified account skips code minting and the cooldown, so repeated
    // resends only ever hit the fixed-window email rate limit.
    const user = await createUser({ emailVerified: true });

    for (let i = 0; i < 5; i++) {
      const res = await resend(mockPostRequest({ email: user.email }));
      expect(res.status).toBe(200);
    }

    const sixth = await resend(mockPostRequest({ email: user.email }));
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).toBeTruthy();
  });
});