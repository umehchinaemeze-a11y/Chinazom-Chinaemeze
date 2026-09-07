import cuid from "cuid";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Postgres-backed fixed-window rate limiter (AGENTS.md 2.6 / PRD 7.1).
//
// The counter is incremented via ONE atomic raw SQL statement. A Prisma
// findFirst + update pair would be a read-then-write race and is explicitly
// rejected by the PRD — do not "simplify" this back to two statements.
//
// The INSERT is a raw SQL statement, which bypasses Prisma's client-side
// default generation. Prisma's `@default(cuid())` on RateLimitEntry.id is NOT a
// PostgreSQL column default (verified in the init migration: `id TEXT NOT NULL`
// with no DEFAULT), so $queryRaw fails with a NOT NULL violation (SQLSTATE 23502)
// unless the raw INSERT supplies the id itself. We generate the same cuid that a
// Prisma `create()` would, keeping the ID scheme identical to every other row in
// the database. The id is an opaque, non-security row key — the atomicity and
// correctness come from the (key, windowStart) unique constraint, not from the id.

const CLEANUP_RETENTION_MS = 24 * 60 * 60 * 1000; // delete rows older than 24h

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets; present when the limit is exceeded. */
  retryAfterSeconds?: number;
}

/**
 * Checks (and increments) a fixed-window rate limit for `key` using the locked
 * atomic upsert. Returns whether the request is allowed and, when denied, the
 * number of seconds the client must wait before retrying (for `Retry-After`).
 */
export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now();

  // Fixed window boundaries aligned to the given window length.
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowEnd = windowStartMs + windowMs;

  // Single atomic raw SQL increment (AGENTS.md 2.6) — no read-then-write.
  // Supplies the id explicitly because $queryRaw bypasses Prisma's client-side
  // cuid() default and the DB column has no DEFAULT (see comment at top of file).
  //
  // windowStart is written via raw SQL. Binding a JS Date here would let
  // Prisma's raw-parameter serialization shift the value by the database
  // session's timezone offset (observed +1h on a UTC+1 session), while every
  // Prisma-client write (the 24h cleanup cutoff) is UTC-naive — the two would
  // disagree by the offset. So the epoch ms is converted to the exact UTC
  // wall-clock timestamp in SQL and the drift disappears for any session
  // timezone. Buckets created before this fix were shifted and naturally age
  // out via the existing cleanup; nothing depends on their exact values.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitEntry" (id, key, "windowStart", count)
    VALUES (${cuid()}, ${key}, (to_timestamp(${windowStartMs / 1000}) AT TIME ZONE 'UTC'), 1)
    ON CONFLICT (key, "windowStart")
    DO UPDATE SET count = "RateLimitEntry".count + 1
    RETURNING count;
  `;

  const count = rows[0]?.count ?? 1;

  // Opportunistic cleanup on new-window creation (AGENTS.md 2.6 / PRD 7.1):
  // never let the table grow unbounded. Runs on window rollover, not per request.
  if (count === 1) {
    void cleanupExpiredEntries();
  }

  if (count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
    };
  }

  return { allowed: true };
}

/**
 * Deletes RateLimitEntry rows whose window started more than 24 hours ago.
 */
export async function cleanupExpiredEntries(): Promise<void> {
  const cutoff = new Date(Date.now() - CLEANUP_RETENTION_MS);
  await prisma.rateLimitEntry.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
}

/**
 * Builds the locked 429 response with a Retry-After header (AGENTS.md 2.6 / PRD 7.1).
 * Shared by every rate-limited auth route so the shape never drifts.
 */
export function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, retryAfterSeconds)) },
    }
  );
}

/**
 * Extracts the client IP from forwarded headers, falling back to "unknown" so
 * IP-keyed rate limits always have a value.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}