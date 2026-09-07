import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resendVerificationSchema } from "@/lib/validation";
import {
  generateVerificationCode,
  hashVerificationCode,
} from "@/lib/crypto/token";
import { checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";
import { emailService } from "@/lib/email";

// Generic response — never reveal whether the email exists or the account is
// already verified (AGENTS.md 3.1 / PRD 5.5).
const GENERIC_RESEND_RESPONSE = {
  success: true,
  message: "If your account is unverified, a new verification code has been sent.",
};

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const COOLDOWN_MS = 60 * 1000; // 60 seconds between codes (PRD 5.5 / AGENTS.md 2.6)

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const result = resendVerificationSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email } = result.data;

    // Look up the user first so the limit can be keyed by account id (AGENTS.md
    // 2.6). The response stays identical whether the user exists, is already
    // verified, or doesn't exist — preventing enumeration.
    const user = await prisma.user.findUnique({ where: { email } });

    // Rate limit: 5 requests + 60s cooldown / account id / 1 hour (AGENTS.md 2.6).
    // Unknown emails have no account — key those per email so the budget still
    // applies without revealing whether the account exists.
    const rateKey = user
      ? `resend-verification:account:${user.id}`
      : `resend-verification:unknown:${email}`;
    const rateLimitResult = await checkRateLimit({
      key: rateKey,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitedResponse(rateLimitResult.retryAfterSeconds ?? 1);
    }

    if (user && !user.emailVerified) {
      // Cooldown check: reject if the most recent unconsumed code was created
      // less than COOLDOWN_MS ago (PRD 5.5 / AGENTS.md 2.6).
      const mostRecentCode = await prisma.verificationCode.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      if (mostRecentCode) {
        const elapsed = Date.now() - mostRecentCode.createdAt.getTime();
        if (elapsed < COOLDOWN_MS) {
          const retryAfter = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
          return rateLimitedResponse(retryAfter);
        }
      }

      const rawCode = generateVerificationCode();
      const codeHash = hashVerificationCode(rawCode);

      // One active (unconsumed) code per user enforced by the partial unique
      // index one_active_code_per_user (AGENTS.md 2.8 / PRD 7.5). Invalidate
      // any prior active code first, then insert the new one.
      try {
        await prisma.$transaction([
          prisma.verificationCode.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: new Date() },
          }),
          prisma.verificationCode.create({
            data: {
              userId: user.id,
              codeHash,
              expiresAt: new Date(Date.now() + CODE_TTL_MS),
            },
          }),
        ]);
      } catch (error) {
        // Concurrent request already created an active code (P2002 on
        // one_active_code_per_user). That code is still valid — answer with
        // the same generic response (AGENTS.md 3.6).
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return NextResponse.json(GENERIC_RESEND_RESPONSE, { status: 200 });
        }
        throw error;
      }

      await emailService.sendVerificationEmail({
        to: user.email,
        code: rawCode,
      });
    }

    // Same generic 200 for existing+unverified, existing+verified, and non-existing
    // emails (AGENTS.md 3.1 / PRD 5.5).
    return NextResponse.json(GENERIC_RESEND_RESPONSE, { status: 200 });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}
