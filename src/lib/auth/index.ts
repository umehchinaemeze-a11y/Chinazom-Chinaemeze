import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

// Locked constants (AGENTS.md Section 2.2 / PRD Section 7.3)
export const SESSION_COOKIE_NAME = "session_id";
export const SLIDING_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const ABSOLUTE_CAP_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Creates a database-backed session for a user and sets the sliding expiry.
 * Multiple concurrent sessions per user are permitted (AGENTS.md 3.7).
 */
export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SLIDING_EXPIRY_MS);

  const session = await prisma.session.create({
    data: {
      userId,
      expiresAt,
    },
  });

  return session;
}

/**
 * Sets the httpOnly session cookie with locked security configuration.
 * Carries ONLY the opaque session ID string (AGENTS.md 2.2).
 */
export async function setSessionCookie(sessionId: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Validates a session by ID:
 * 1. Checks if the session row exists in PostgreSQL.
 * 2. Checks if expired or reached the absolute 30-day ceiling.
 * 3. Extends sliding expiry on authenticated requests up to the 30-day ceiling.
 */
export async function validateSession(sessionId: string) {
  if (!sessionId) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) return null;

  const now = Date.now();
  const absoluteCapTime = session.createdAt.getTime() + ABSOLUTE_CAP_MS;

  // Expired by sliding expiry or hard ceiling reached
  if (session.expiresAt.getTime() <= now || now >= absoluteCapTime) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
    return null;
  }

  // Extend sliding expiry up to the absolute cap
  const potentialExpiry = now + SLIDING_EXPIRY_MS;
  const newExpiresAt = new Date(Math.min(potentialExpiry, absoluteCapTime));

  // Only update if extended by more than 1 hour to avoid excessive DB writes
  if (newExpiresAt.getTime() - session.expiresAt.getTime() > 60 * 60 * 1000) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt: newExpiresAt },
    });
    session.expiresAt = newExpiresAt;
  }

  return session;
}

/**
 * Retrieves the current authenticated user and session from the incoming request cookies.
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionId) return null;

  const result = await validateSession(sessionId);
  if (!result) {
    // Clear dead cookie (AGENTS.md 3.7)
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  return result.user;
}

/**
 * Server-side signout: deletes the session row in the database and clears the cookie.
 * Clearing only client state is NOT sign-out (AGENTS.md 3.7 / PRD 5.6).
 */
export async function invalidateSession(sessionId?: string) {
  const cookieStore = await cookies();
  const idToDelete = sessionId ?? cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (idToDelete) {
    await prisma.session.delete({ where: { id: idToDelete } }).catch(() => null);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
