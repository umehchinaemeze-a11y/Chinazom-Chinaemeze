import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signUpSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/crypto/password";
import { generateVerificationCode, hashVerificationCode } from "@/lib/crypto/token";
import { checkRateLimit, getClientIp, rateLimitedResponse } from "@/lib/rate-limit";
import { emailService } from "@/lib/email";
import { Prisma } from "@prisma/client";

// Success message for the genuinely-new-account path. NOTE — PRD DEVIATION
// (documented): PRD 5.1 / AGENTS.md 3.1 + 3.6 lock the duplicate-email case to
// return this SAME generic 200 (anti-enumeration). Per team decision this build
// instead returns a 400 account-exists error below. Revisit if the enumeration
// threat model tightens.
const GENERIC_SIGNUP_RESPONSE = {
  success: true,
  message: "If your email is eligible, your account has been created.",
};

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
    const result = signUpSchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    // Rate limit: 5 requests / hour / IP address (AGENTS.md 2.6 / PRD 7.1).
    const ip = getClientIp(request);
    const ipLimit = await checkRateLimit({
      key: `signup:ip:${ip}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      return rateLimitedResponse(ipLimit.retryAfterSeconds ?? 1);
    }

    // Argon2id hashing with locked parameters in Node.js runtime (AGENTS.md 2.3, 4.1)
    const passwordHash = await hashPassword(password);

    // Create the user and its first verification code atomically. If the email
    // already belongs to a user, the P2002 from the User.email unique constraint
    // aborts the whole transaction and nothing is created (AGENTS.md 3.6).
    let rawCode: string | null = null;

    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            name,
            email,
            passwordHash,
            emailVerified: false,
          },
          select: { id: true },
        });

        rawCode = generateVerificationCode();
        await tx.verificationCode.create({
          data: {
            userId: user.id,
            codeHash: hashVerificationCode(rawCode),
            expiresAt: new Date(Date.now() + CODE_TTL_MS),
          },
        });
      });
    } catch (dbError) {
      // Duplicate-email handling — PRD DEVIATION (documented). PRD 5.1 /
      // AGENTS.md 3.1 + 3.6 require this case to return the SAME generic 200 as
      // a new email to prevent account enumeration; the team explicitly
      // overrode that to surface a clean 400. Only P2002s whose target includes
      // the email field are treated as duplicates — anything else rethrows to
      // the generic 500 below. The raw Prisma error is never exposed.
      if (
        dbError instanceof Prisma.PrismaClientKnownRequestError &&
        dbError.code === "P2002" &&
        Array.isArray(dbError.meta?.target) &&
        dbError.meta.target.includes("email")
      ) {
        return NextResponse.json(
          { error: "An account with this email already exists." },
          { status: 400 }
        );
      }
      throw dbError;
    }

    // Only a genuinely new account gets a verification email; a duplicate signup
    // returns the same generic response but sends nothing.
    if (rawCode) {
      await emailService.sendVerificationEmail({ to: email, code: rawCode });
    }

    return NextResponse.json(GENERIC_SIGNUP_RESPONSE, { status: 200 });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again later." },
      { status: 500 }
    );
  }
}
