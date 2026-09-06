import { NextResponse } from "next/server";
import { invalidateSession } from "@/lib/auth";

export async function POST() {
  try {
    // Deletes session from DB and clears httpOnly cookie server-side (AGENTS.md 3.7 / PRD 5.6)
    await invalidateSession();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Sign-out error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred during sign-out." },
      { status: 500 }
    );
  }
}
