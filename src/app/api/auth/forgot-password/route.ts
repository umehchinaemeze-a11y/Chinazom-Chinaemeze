import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validation";
import { generateResetToken, hashResetToken } from "@/lib/crypto/token";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { emailService } from "@/lib/email";

// Generic success message used for EVERY response to prevent email enumeration
// (AGENTS.md 3.1 / PRD 5.3): never reveal whether the email exists.
const GENERIC_FORGOT_PASSWORD_RESPONSE = {
  success: true,
  message: "If an account exists with that email, a password reset link has been sent.",
};

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes (PRD 5.3)

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
    const result = forgotPasswordSchema.safeParse(json);
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
    const ip = getClientIp(request);

    // Rate limit: 3 requests / hour / normalized email (AGENTS.md 2.6 / PRD 7.1)
    const emailLimit = await checkRateLimit({
      key: `forgot-password:email:${email}`,
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });
    if (!emailLimit.allowed) {
      return rateLimitedResponse(emailLimit.retryAfterSeconds ?? 1);
    }

    // Rate limit: 20 requests / 15 minutes / IP (AGENTS.md 2.6 / PRD 7.1)
    const ipLimit = await checkRateLimit({
      key: `forgot-password:ip:${ip}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfterSeconds ?? 1);
    }

    // Look up the user only to decide whether to mint a token. The response is
    // identical either way, so this lookup never leaks account existence.
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const rawToken = generateResetToken();
      const tokenHash = hashResetToken(rawToken);

      // One active (unconsumed) token per user is enforced by the partial unique
      // index (AGENTS.md 2.8 / PRD 7.5). Invalidate any prior active token for this
      // user first (PRD 5.3), then insert the new one.
      try {
        await prisma.$transaction([
          prisma.passwordResetToken.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: new Date() },
          }),
          prisma.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash,
              expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
            },
          }),
        ]);
      } catch (error) {
        // A concurrent request already created an active token for this user
        // (P2002 on one_active_token_per_user). That request's link is still
        // valid, so answer this duplicate with the same generic success
        // response — never leak anything or fail the request (AGENTS.md 3.6).
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return NextResponse.json(GENERIC_FORGOT_PASSWORD_RESPONSE, { status: 200 });
        }
        throw error;
      }

      const resetUrl = new URL("/reset-password", request.url);
      resetUrl.searchParams.set("token", rawToken);

      await emailService.sendPasswordResetEmail({
        to: user.email,
        resetUrl: resetUrl.toString(),
      });
    }

    // Same generic 200 for both existing and non-existing emails (AGENTS.md 3.1 / PRD 5.3)
    return NextResponse.json(GENERIC_FORGOT_PASSWORD_RESPONSE, { status: 200 });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}