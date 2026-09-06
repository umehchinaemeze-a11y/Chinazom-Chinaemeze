import { NextResponse } from "next/server";

// Placeholder for protected-route guard (Phase 4).
// Protected-route guard does lightweight cookie check and redirects.
// Heavy work (Argon2id hashing) must NEVER run in middleware (AGENTS.md 4.1).
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
