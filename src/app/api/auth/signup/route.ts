import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signUpSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/crypto/password";
import { Prisma } from "@prisma/client";

// Generic success message to prevent email enumeration (AGENTS.md 3.1 / PRD 5.1)
const GENERIC_SIGNUP_RESPONSE = {
  success: true,
  message: "If your email is eligible, your account has been created.",
};

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

    // Argon2id hashing with locked parameters in Node.js runtime (AGENTS.md 2.3, 4.1)
    const passwordHash = await hashPassword(password);

    try {
      await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          emailVerified: false,
        },
      });
    } catch (dbError) {
      // Catch duplicate email via Prisma P2002 unique constraint (AGENTS.md 3.6).
      // Return the EXACT SAME 200 response to prevent account enumeration.
      if (
        dbError instanceof Prisma.PrismaClientKnownRequestError &&
        dbError.code === "P2002"
      ) {
        return NextResponse.json(GENERIC_SIGNUP_RESPONSE, { status: 200 });
      }
      throw dbError;
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
