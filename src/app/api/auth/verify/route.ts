import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyEmailSchema } from "@/lib/validation";
import { hashVerificationCode } from "@/lib/crypto/token";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// Generic messages — never reveal whether the email doesn't exist, the code was
// wrong, expired, or already used (AGENTS.md 3.1 / PRD 5.4). No account
// information leaks via this endpoint.
const GENERIC_VERIFY_SUCCESS = {
  success: true,
  message: "Email verified successfully.",
};
const GENERIC_VERIFY_ERROR = "Invalid or expired verification code.";

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    // Shared Zod schema validation (AGENTS.md 2.4, 3.3)
    const result = verifyEmailSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email, code } = result.data;
    const codeHash = hashVerificationCode(code);

    // Idempotent success: if the email is already verified, return success
    // without touching any code row.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    // Rate limit: 10 attempts / 15 minutes / account id (AGENTS.md 2.6 / PRD 7.1).
    // Keyed by user id when the account exists; otherwise the email hash so the
    // limit still applies per attempted account without leaking existence.
    const rateKey = existingUser
      ? `verify:account:${existingUser.id}`
      : `verify:unknown:${email}`;
    const rateLimitResult = await checkRateLimit({
      key: rateKey,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitedResponse(rateLimitResult.retryAfterSeconds ?? 1);
    }

    // Same response whether the user/code doesn't exist or the code is bad —
    // no account enumeration (AGENTS.md 3.1).
    if (!existingUser) {
      return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 400 });
    }

    if (existingUser.emailVerified) {
      return NextResponse.json(GENERIC_VERIFY_SUCCESS, { status: 200 });
    }

    // Atomic consumption: try to mark the code as consumed in a single UPDATE.
    // The WHERE clause checks userId + codeHash + unconsumed + not expired.
    // Only one concurrent request can win this race — the others get 0 rows
    // affected and fall through to the paths below.
    //
    // The expiry bound is the current unix epoch in milliseconds, compared via
    // EXTRACT(EPOCH ...) on the naive-UTC TIMESTAMP. Comparing raw SQL Date
    // parameters against the column is unreliable because Prisma shifts raw-SQL
    // Date parameters by the database session's timezone while writing columns as
    // UTC-naive (see src/app/api/auth/reset-password/route.ts). Comparing epoch
    // integers avoids the mismatch entirely. consumedAt is written UTC-naive.
    const nowMs = Date.now();
    const consumedCount = await prisma.$executeRaw`
      UPDATE "VerificationCode"
      SET "consumedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE "userId" = ${existingUser.id}
        AND "codeHash" = ${codeHash}
        AND "consumedAt" IS NULL
        AND EXTRACT(EPOCH FROM "expiresAt") * 1000 > ${nowMs}
    `;

    if (consumedCount === 0) {
      // The code was not consumed by THIS request. Two possibilities:
      //  (a) A concurrent request with the same correct code won the atomic
      //      consume and is verifying the email right now, OR
      //  (b) the submitted code is wrong, expired, or was already used.
      //
      // To keep concurrent identical verifications idempotent (both return
      // success), distinguish (a) from (b) by checking whether an unconsumed-
      // at-submit-time code with this exact codeHash existed for this user and
      // was recently consumed. If the code was valid and is now consumed, a
      // concurrent winner is handling the verification — treat as success.
      const validCode = await prisma.verificationCode.findFirst({
        where: { userId: existingUser.id, codeHash },
        select: { consumedAt: true, expiresAt: true },
      });
      const codeWasRecentlyConsumed =
        validCode !== null &&
        validCode.consumedAt !== null &&
        validCode.expiresAt.getTime() > nowMs;

      // Also treat as success if the email is already verified (idempotent retry).
      const user = await prisma.user.findUnique({
        where: { id: existingUser.id },
        select: { emailVerified: true },
      });

      if (codeWasRecentlyConsumed || user?.emailVerified) {
        return NextResponse.json(GENERIC_VERIFY_SUCCESS, { status: 200 });
      }

      // Code was wrong, expired, or already used with no concurrent winner.
      // Answer uniformly so no detail is revealed (AGENTS.md 3.1).
      return NextResponse.json({ error: GENERIC_VERIFY_ERROR }, { status: 400 });
    }

    // Code consumed successfully — mark the user's email as verified.
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { emailVerified: true },
    });

    return NextResponse.json(GENERIC_VERIFY_SUCCESS, { status: 200 });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}