import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signInSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/crypto/password";
import { createSession, setSessionCookie } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";

// Single generic 401 error message to prevent credential enumeration (AGENTS.md 3.1 / PRD 5.2)
const GENERIC_SIGNIN_ERROR = "Invalid email or password.";

// Rate limit: 5 attempts / 15 minutes / email + IP pair (AGENTS.md 2.6 / PRD 7.1).
// The budget is per (account, device) attempt-burst and is consumed ONLY on a
// failed credential check (unknown email or wrong password), never on a
// successful sign-in — otherwise a legitimate user signing in a few times in
// quick succession would trip it and be locked out.
async function attemptLimitResult(email: string, ip: string) {
  return checkRateLimit({
    key: `signin:pair:${email}:${ip}`,
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
}

function attemptLimitedResponse(result: Awaited<ReturnType<typeof attemptLimitResult>>) {
  return rateLimitedResponse(result.retryAfterSeconds ?? 1);
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    // Shared Zod validation
    const result = signInSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, password } = result.data;
    const ip = getClientIp(request);

    // Rate limit: 20 requests / 15 minutes / IP address only (AGENTS.md 2.6 / PRD 7.1).
    const ipLimit = await checkRateLimit({
      key: `signin:ip:${ip}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfterSeconds ?? 1);
    }

    // Look up user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Failed attempt #1 — consume the attempt budget, then answer generically.
      const attemptLimit = await attemptLimitResult(email, ip);
      if (!attemptLimit.allowed) {
        return attemptLimitedResponse(attemptLimit);
      }
      return NextResponse.json({ error: GENERIC_SIGNIN_ERROR }, { status: 401 });
    }

    // Verify Argon2id password hash
    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      // Failed attempt #2 — consume the attempt budget, then answer generically.
      // The generic body is the same in both failure paths (AGENTS.md 3.1),
      // so the rate-limit behaviour never reveals whether the email exists.
      const attemptLimit = await attemptLimitResult(email, ip);
      if (!attemptLimit.allowed) {
        return attemptLimitedResponse(attemptLimit);
      }
      return NextResponse.json({ error: GENERIC_SIGNIN_ERROR }, { status: 401 });
    }

    // Create DB session & set httpOnly cookie
    const session = await createSession(user.id);
    await setSessionCookie(session.id, session.expiresAt);

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Sign-in error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}
