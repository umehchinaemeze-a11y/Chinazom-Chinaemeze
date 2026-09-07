import { describe, it, expect } from "vitest";
import { POST as signup } from "@/app/api/auth/signup/route";
import { testPrisma } from "./setup";
import { mockPostRequest, runConcurrently } from "./helpers";

const SIGNUP_BODY = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "sup3r-secret-pass",
};

describe("signup idempotency", () => {
  const DUPLICATE_EMAIL_ERROR = "An account with this email already exists.";

  it("creates exactly one user row for a repeated (duplicate) signup", async () => {
    const first = await signup(mockPostRequest(SIGNUP_BODY));
    // PRD DEVIATION (documented): the duplicate returns a 400 with an
    // account-exists message instead of the PRD's generic 200.
    const second = await signup(mockPostRequest(SIGNUP_BODY));

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);

    const users = await testPrisma.user.findMany({ where: { email: SIGNUP_BODY.email } });
    expect(users).toHaveLength(1);

    // The duplicate attempt must not create a second verification code either.
    const codes = await testPrisma.verificationCode.findMany({
      where: { userId: users[0]!.id },
    });
    expect(codes).toHaveLength(1);

    const secondBody = await second.json();
    expect(secondBody.error).toBe(DUPLICATE_EMAIL_ERROR);
  });

  it("settles concurrent duplicate signups into exactly one user row", async () => {
    const responses = await runConcurrently([
      () => signup(mockPostRequest(SIGNUP_BODY)),
      () => signup(mockPostRequest(SIGNUP_BODY)),
      () => signup(mockPostRequest(SIGNUP_BODY)),
    ]);

    // Exactly one request wins and creates the user; every other one gets the
    // duplicate-email 400.
    const success = responses.filter((res) => res.status === 200);
    const conflicts = responses.filter((res) => res.status === 400);
    expect(success).toHaveLength(1);
    expect(conflicts).toHaveLength(responses.length - 1);

    const users = await testPrisma.user.findMany({ where: { email: SIGNUP_BODY.email } });
    expect(users).toHaveLength(1);

    const codes = await testPrisma.verificationCode.findMany({
      where: { userId: users[0]!.id },
    });
    expect(codes).toHaveLength(1);
  });

  it("returns success for a brand-new email and 400 for an existing email", async () => {
    const fresh = await signup(mockPostRequest(SIGNUP_BODY));
    const duplicate = await signup(mockPostRequest(SIGNUP_BODY));

    expect(fresh.status).toBe(200);
    expect(duplicate.status).toBe(400);

    const freshBody = await fresh.json();
    expect(freshBody.success).toBe(true);

    const duplicateBody = await duplicate.json();
    expect(duplicateBody.error).toBe(DUPLICATE_EMAIL_ERROR);
  });

  it("returns 429 with Retry-After once the per-IP signup limit (5/hour) is exceeded", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await signup(
        mockPostRequest({ ...SIGNUP_BODY, email: `burst-${i}-${Date.now()}@example.com` })
      );
      expect(res.status).toBe(200);
    }

    const sixth = await signup(
      mockPostRequest({ ...SIGNUP_BODY, email: `burst-6-${Date.now()}@example.com` })
    );
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).toBeTruthy();
  });
});