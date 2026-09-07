import { describe, it, expect, vi, beforeEach } from "vitest";
import { testPrisma } from "./setup";
import { mockPostRequest, runConcurrently } from "./helpers";
import { hashPassword } from "@/lib/crypto/password";

// `next/headers` cookies() is a request-time API that throws outside a Next.js
// request context. Mock it with an in-memory cookie store so we can exercise the
// sign-in route handler's session side-effects in the test runner.
const cookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    getAll: () => [...cookieStore.entries()].map(([name, value]) => ({ name, value })),
    has: (name: string) => cookieStore.has(name),
    set: (name: string, value: string) => void cookieStore.set(name, value),
    delete: (name: string) => void cookieStore.delete(name),
    toString: () =>
      [...cookieStore.entries()].map(([n, v]) => `${n}=${v}`).join("; "),
  }),
}));

import { POST as signin } from "@/app/api/auth/signin/route";

describe("sign-in / session creation idempotency", () => {
  beforeEach(() => {
    cookieStore.clear();
  });

  function signInBody(email: string) {
    return mockPostRequest({ email, password: "correct-password" });
  }

  it("creates one distinct, valid session per concurrent sign-in (multi-session semantics)", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = await testPrisma.user.create({
      data: {
        name: "Concurrent Coder",
        email: "coder@example.com",
        passwordHash,
        emailVerified: true,
      },
    });

    const responses = await runConcurrently([
      () => signin(signInBody(user.email)),
      () => signin(signInBody(user.email)),
      () => signin(signInBody(user.email)),
    ]);

    // No duplicate-key or conflict errors.
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    // Three concurrent sessions exist — multiple concurrent sessions per user
    // are allowed by design (AGENTS.md 3.7) — and each has a unique id.
    const sessions = await testPrisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(3);
    const uniqueIds = new Set(sessions.map((s) => s.id));
    expect(uniqueIds.size).toBe(3);

    // Every session is in the future and individually valid.
    for (const session of sessions) {
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("does not create a session row when credentials are wrong (no phantom state)", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = await testPrisma.user.create({
      data: {
        name: "Wrong Pass",
        email: "wrongpass@example.com",
        passwordHash,
        emailVerified: true,
      },
    });

    const res = await signin(
      mockPostRequest({ email: user.email, password: "definitely-wrong" })
    );
    expect(res.status).toBe(401);

    const sessions = await testPrisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(0);
  });

  it("returns 429 with Retry-After once the per email+IP signin attempt limit (5/15min) is exceeded", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = await testPrisma.user.create({
      data: {
        name: "Brute Force",
        email: "bruteforce@example.com",
        passwordHash,
        emailVerified: true,
      },
    });

    for (let i = 0; i < 5; i++) {
      const res = await signin(
        mockPostRequest({ email: user.email, password: "wrong-password" })
      );
      expect(res.status).toBe(401);
    }

    const sixth = await signin(
      mockPostRequest({ email: user.email, password: "wrong-password" })
    );
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).toBeTruthy();
  });

  it("does not consume the attempt budget on successful sign-ins", async () => {
    const passwordHash = await hashPassword("correct-password");
    const user = await testPrisma.user.create({
      data: {
        name: "Frequent Flier",
        email: "frequent@example.com",
        passwordHash,
        emailVerified: true,
      },
    });

    // Six successful logins in a row — more than the 5/15min attempt limit —
    // must all succeed, because the attempt budget counts failed credentials only.
    for (let i = 0; i < 6; i++) {
      const res = await signin(signInBody(user.email));
      expect(res.status).toBe(200);
    }

    // The attempt budget is still untouched by those successes: five wrong
    // passwords are still allowed before the sixth is rate-limited.
    for (let i = 0; i < 5; i++) {
      const res = await signin(
        mockPostRequest({ email: user.email, password: "wrong-password" })
      );
      expect(res.status).toBe(401);
    }

    const sixth = await signin(
      mockPostRequest({ email: user.email, password: "wrong-password" })
    );
    expect(sixth.status).toBe(429);
  });
});