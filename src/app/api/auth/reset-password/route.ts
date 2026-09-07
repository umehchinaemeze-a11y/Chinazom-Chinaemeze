import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validation";
import { hashResetToken } from "@/lib/crypto/token";
import { hashPassword } from "@/lib/crypto/password";

// One generic message for every invalid-token case — never reveal whether a
// token is wrong, expired, already used, or belongs to a different user
// (AGENTS.md 3.1 / PRD 5.4).
const INVALID_TOKEN_MESSAGE =
  "This password reset link is invalid, expired, or has already been used. Please request a new one.";

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
    const result = resetPasswordSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { token, password } = result.data;

    // Only the SHA-256 + pepper hash of the raw token is ever stored (AGENTS.md 2.3).
    const tokenHash = hashResetToken(token);

    // Atomic consumption via a single UPDATE with a WHERE clause on consumedAt IS NULL.
    // This eliminates the TOCTOU race where two concurrent requests could both see the
    // token as unconsumed and both proceed to reset the password to different values.
    // If 0 rows are affected, the token was already consumed, expired, or never existed —
    // all cases produce the same generic error message (AGENTS.md 3.1 / PRD 5.4).
    //
    // The expiry bound is the current unix epoch in milliseconds, and the comparison
    // is done via EXTRACT(EPOCH ...) on the naive-UTC TIMESTAMP. Comparing raw SQL
    // Date parameters against the column is unreliable: Prisma normalizes column
    // writes as UTC-naive but shifts raw-SQL Date parameters by the database
    // session's timezone, which corrupts the inequality across any non-zero offset.
    // Comparing epoch integers sidesteps this entirely.
    // consumedAt is written as UTC-naive (NOW() AT TIME ZONE 'UTC'), matching how
    // Prisma writes every other timestamp column.
    const nowMs = Date.now();
    const consumedCount = await prisma.$executeRaw`
      UPDATE "PasswordResetToken"
      SET "consumedAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE "tokenHash" = ${tokenHash}
        AND "consumedAt" IS NULL
        AND EXTRACT(EPOCH FROM "expiresAt") * 1000 > ${nowMs}
    `;

    if (consumedCount === 0) {
      return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
    }

    // Fetch the now-consumed token to get the userId for password update + session invalidation.
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: { tokenHash },
      select: { userId: true },
    });

    // The token was just consumed above, so it must exist. If findFirst returns null
    // something is critically wrong — but still answer with the generic message.
    if (!resetToken) {
      return NextResponse.json({ error: INVALID_TOKEN_MESSAGE }, { status: 400 });
    }

    const newPasswordHash = await hashPassword(password);

    // Update the password and invalidate ALL sessions for the user so they must
    // re-authenticate everywhere (AGENTS.md 3.7 / PRD 5.4).
    // The token is already consumed from the atomic UPDATE above — no need to
    // update it again here.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newPasswordHash },
      }),
      prisma.session.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        message: "Your password has been reset. You can now sign in.",
      },
      { status: 200 }
    );
  } catch (error) {
    // Surface unexpected failures in server logs only — never send stack traces
    // or internals to the client (AGENTS.md Section 5).
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}