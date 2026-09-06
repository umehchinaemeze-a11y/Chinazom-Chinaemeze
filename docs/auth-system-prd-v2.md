# PRD: Standalone Authentication System

*Revision 2 — post structured review (Skeptic / Author / Engineer / Product Lead / Judge)*


**Document Control:** This revision incorporates every correction produced by a structured, adversarial review of the original PRD. Sixteen lapses were identified across rate limiting, session lifetime, credential exposure, database constraints, indexing, hashing parameters, metric framing, and roadmap sequencing. Each correction is marked inline as **[NEW — REVIEW FIX]** at the point it was applied, so this document can be diffed against the original draft.


## 1. Product Summary

A standalone authentication system built with Next.js (App Router), TypeScript, Prisma, and PostgreSQL. It implements six screens: create account, sign in, forgot password, reset password, email verification, and a placeholder dashboard. The product exists to demonstrate a correctly built auth flow, not to ship a feature-complete app. Every mechanism that is normally faked in a demo — password hashing, validation, rate limiting, session handling, code and token expiry, uniqueness, idempotency, route protection — must be real, server-enforced, and provable with evidence pulled directly from the database and the API.


## 2. Problem Statement

Auth implementations that look correct in the browser often fail under direct inspection. Common failure points: passwords hashed with a fast general-purpose hash instead of an adaptive one; validation that exists only in client-side JavaScript and is skipped entirely when the API is hit directly; unlimited login or resend attempts; sessions with no server-side revocation; verification codes that "expire" only because a UI countdown reaches zero, while the database will still accept them forever; and signup endpoints that create two accounts when a form is double-submitted. This system exists to close each of those gaps and to prove, with a curl command and a database screenshot, that each gap is actually closed rather than assumed closed.


Left unfixed, these gaps translate directly into account takeover and credential replay risk in any real deployment, not just failed grading criteria. **[NEW — REVIEW FIX]**


## 3. Goals and Non-Goals


**Goals**

- A new user can create an account, verify their email with a 6-digit code, and land on the dashboard.
- A returning user can sign in with a verified account.
- A user who forgets their password can request a reset link, set a new password, and sign in with it.
- A signed-out user who requests the dashboard URL directly is redirected to sign in.
- Sign-out destroys the session server-side, not just client-side.
- Every mandatory engineering requirement (Section 7) is demonstrable with evidence (Section 11 acceptance criteria).


**Non-Goals**

- No landing page or marketing page.
- No dashboard functionality beyond a name and a sign-out button.
- No profile editing, no account settings.
- No social sign-in (Google, GitHub, etc.).
- No two-factor authentication.
- No admin role or multi-tenant support.
- Cleanup of abandoned unverified accounts is out of scope for this build (see Section 14 for the related open question). **[NEW — REVIEW FIX]**


## 4. User Personas

*The Technical Reviewer persona from the prior draft has been removed from this section — a grader inspecting the system directly is not a persona of the shipped product. That content now opens Section 11, where it actually belongs.* **[NEW — REVIEW FIX]**


**New User** — Has never created an account. Needs to sign up, receive a verification code, enter it before the 15-minute window closes, and reach the dashboard. Will hit the resend control if the code doesn't arrive.


**Returning User** — Has a verified account. Needs to sign in, and occasionally needs to reset a forgotten password through the emailed link.


## 5. Functional Requirements


### 5.1 Create Account

- Fields: name, email, password. All three required.
- On submit, client-side validation runs first (see Section 7.2) for immediate feedback; the request is sent regardless of client-side outcome only if the client-side check passes, but the server re-validates everything independently.
- Server normalizes email (lowercase, trimmed) before any lookup or insert.
- On success: account is created in an unverified state, a verification code is issued, and the response is a generic "check your email to verify your account" message with HTTP 200. The response is identical whether this is a brand-new email or a retried submission for the same pending email (see Section 7.6, idempotency).
- On a validation failure: HTTP 400 with field-level error messages, matching the shared schema (Section 7.2).
- On an email that already belongs to a **verified** account: the response is the same generic "check your email" message, HTTP 200. The account is not re-created and no new verification email is sent to a different address. This prevents account enumeration through the signup form.
- Rate limited: 5 requests per hour per IP (Section 7.1 table).
- If a second concurrent signup for the same unverified email carries different form data than the first (e.g., a different password), the second request still receives the generic success message, but that response does not imply the second submission's password was stored. This is a known, accepted limitation of single-submission idempotency and is not solved by a UI-level warning. **[NEW — REVIEW FIX]**


### 5.2 Sign In

- Fields: email, password. Both required.
- On success: a database-backed session is created, the session cookie is set (Section 7.3), and the user is redirected to `/dashboard`.
- On an unverified account: sign-in is blocked. The user is redirected to the email verification screen with the resend control active. This is not treated as an authentication error; the credentials may be correct.
- On incorrect credentials: HTTP 401 with a single generic message ("invalid email or password"), never indicating which field was wrong.
- A signed-in user who navigates to `/signin` is redirected to `/dashboard`.
- Rate limited: 5 attempts per 15 minutes per (email, IP) pair, plus a 20-per-15-minute IP-only ceiling (Section 7.1 table).
- Multiple concurrent sessions per user, across devices, are permitted. Signing in on a new device does not invalidate sessions on other devices. **[NEW — REVIEW FIX]**


### 5.3 Forgot Password (request form)

- Field: email.
- Always returns the same generic success message ("if an account exists, a reset link has been sent"), HTTP 200, regardless of whether the email exists. This is the deliberate anti-enumeration behavior for this endpoint.
- If the email exists, a password reset token is generated, hashed, stored with a 30-minute expiry, and any prior unexpired token for that user is invalidated.
- Rate limited: 3 requests per hour per email, plus a 20-per-15-minute IP-only ceiling (Section 7.1 table).


### 5.4 Reset Password (form from emailed link)

- The link contains the raw (unhashed) token as a query parameter. The form itself asks for a new password and a confirmation.
- On load, the server checks the token: it must hash-match a stored token, be unexpired, and be unconsumed. If any check fails, the form shows a single generic "this link is invalid or has expired" message. It does not distinguish between "expired," "already used," and "never existed."
- On successful submission: the password is re-hashed (Argon2id), the token is marked consumed, and all existing sessions for that user are invalidated, forcing re-authentication with the new password.
- Rate limited: covered under the same 3-per-hour-per-email bucket as the request step, since both operate against the same token lifecycle.
- The reset page sets `Referrer-Policy: no-referrer` and loads no third-party resources before the token has been validated, to prevent the token leaking via Referer headers. Server access logs for this route exclude the token query parameter or redact it at the logging layer, since the token is a credential-equivalent secret and its 30-minute expiry limits but does not eliminate the exposure window. **[NEW — REVIEW FIX]**


### 5.5 Email Verification (code entry + resend)

- Field: 6-digit numeric code.
- On correct, unexpired, unconsumed code: the account is marked verified, the code is marked consumed, a session is created, and the user is redirected to `/dashboard`.
- On incorrect code: HTTP 400, generic "invalid or expired code" message. The system does not reveal whether the code was wrong versus expired.
- Resend control: issues a new code, invalidates the previous unconsumed code, and is subject to a 60-second cooldown and a 5-per-hour cap, both enforced server-side (Section 7.1 and 7.5).
- Rate limited: resend endpoint specifically, 5 per hour per account, in addition to the 60-second cooldown (Section 7.1 table).
- The verification code submission endpoint (`POST /api/auth/verify`) is rate limited independently of the resend endpoint, at 10 attempts per 15 minutes per account (Section 7.1), since code submission — not resend — is the actual brute-force surface for the 6-digit code space. **[NEW — REVIEW FIX]**


### 5.6 Placeholder Dashboard

- Displays the signed-in user's name and a single sign-out button. No other content, no other controls.
- Unreachable without a valid session: a signed-out request to `/dashboard` is redirected to `/signin` before any dashboard content is rendered (Section 7.8, protected routes).
- Sign-out deletes the session row from the database and clears the session cookie. It does not merely clear client-side state.

## 6. AI Processing Pipeline

Not applicable. This product contains no AI-driven feature, model inference, or generative component. It is a deterministic authentication system, and this section is included only to confirm that no such pipeline exists rather than to describe one that doesn't.


## 7. Technical Requirements


### 7.1 Rate Limiting

| Endpoint | Limit | Key | Window | Response on limit |
|---|---|---|---|---|
| `POST /api/auth/signup` | 5 requests | IP address | 1 hour | `429`, `Retry-After` header |
| `POST /api/auth/signin` | 5 attempts | email + IP pair | 15 minutes | `429`, `Retry-After` header |
| `POST /api/auth/signin` **[NEW]** | 20 requests | IP address only | 15 minutes | `429`, `Retry-After` header |
| `POST /api/auth/forgot-password` | 3 requests | normalized email | 1 hour | `429`, `Retry-After` header |
| `POST /api/auth/forgot-password` **[NEW]** | 20 requests | IP address only | 15 minutes | `429`, `Retry-After` header |
| `POST /api/auth/verify/resend` | 5 requests + 60s cooldown between any two | account id | 1 hour cap / 60s cooldown | `429`, `Retry-After` header |
| `POST /api/auth/verify` **[NEW]** | 10 attempts | account id | 15 minutes | `429`, `Retry-After` header |

**Why these endpoints:** signin, signup, and password reset are the classic brute-force and enumeration surfaces. The resend endpoint is included because it has a direct monetary cost — every resend triggers an outbound email send — and is the endpoint most commonly forgotten because it doesn't look like an authentication boundary. The verification code submission endpoint is included because a 6-digit code has exactly 1,000,000 possible values, and with no per-attempt throttle that space is brute-forceable in minutes against a single account regardless of how tightly resend is limited.


IP-only ceilings on sign-in and forgot-password close a gap the per-email limits leave open: an attacker rotating through many known emails from a single IP address never trips a per-email limit, because each email is only tried once or twice. The IP ceiling catches that pattern regardless of how many distinct emails are targeted. **[NEW — REVIEW FIX]**


**Mechanism**

A `RateLimitEntry` table (Section 10) tracks a fixed-window count per key. The increment is implemented as a single atomic SQL statement, executed via Prisma's raw query interface, not a separate read-then-write:

```sql
INSERT INTO "RateLimitEntry" (key, "windowStart", count)
VALUES ($1, $2, 1)
ON CONFLICT (key, "windowStart")
DO UPDATE SET count = "RateLimitEntry".count + 1
RETURNING count;
```

A read-then-write pattern (find the row, check the count, then update) is not atomic under Prisma's ORM API and allows two concurrent requests to both read a count under the limit and both proceed, letting one extra request through per race. This build uses the raw atomic statement above instead. **[NEW — REVIEW FIX]**


This is a fixed-window counter, not a sliding window or token bucket. Trade-off, stated plainly: a fixed window allows a burst at the boundary between two windows (up to 2x the stated limit in the worst case). This is accepted for this build given the low absolute thresholds; a sliding-window or token-bucket implementation is the noted upgrade path if this system is ever exposed beyond a demo.


`RateLimitEntry` rows older than 24 hours are deleted by a scheduled job or opportunistically on write, so the table does not grow unbounded. **[NEW — REVIEW FIX]**


**What breaks if this is removed:** signin and reset-request become brute-forceable at network speed, the verification endpoint becomes brute-forceable across its full code space in minutes, and the resend endpoint becomes a mechanism for an attacker to run up the email-sending bill with no rate cap.


### 7.2 Validation: Client vs. Server

All validation rules are declared once, as a Zod schema, in a shared module imported by both the API route handlers and the client-side form components. The client never defines a rule that the server doesn't also enforce; the client-side copy exists purely for immediate user feedback, not as a security boundary.

| Field | Rule | Client | Server | Server-only, and why |
|---|---|---|---|---|
| Email | Valid email format | Yes | Yes | — |
| Email | Normalized (lowercase, trimmed) | No | Yes | Must match the exact bytes stored in the DB; client has no visibility into stored casing or collation. |
| Email | Unique (no existing verified account) | No | Yes | Requires a DB lookup the client cannot perform without leaking existence to an unauthenticated caller. |
| Password | Min 8 chars, 1 letter, 1 digit | Yes | Yes | — |
| Verification code | 6 numeric digits | Yes | Yes | — |
| Verification code | Matches stored hash, unexpired, unconsumed | No | Yes | Requires the DB record and server-side hash comparison; cannot exist client-side without exposing the hash. |
| Reset token | Matches stored hash, unexpired, unconsumed | No | Yes | Same reasoning as the verification code. |
| Rate limits | N/A | No | Yes | A client-side counter is trivially bypassed by calling the API directly. |

**Answer to the defense question directly:** any rule that depends on the current state of the database (does this email exist, has this code already been used, has this IP already made five requests) cannot be enforced on the client, because the client has no trustworthy, tamper-proof view of server state. Only rules that are pure functions of the input itself (format, length, character class) are safe to duplicate on the client, and even those are re-checked server-side because the client can be bypassed entirely.


### 7.3 Session Management

Sessions are database-backed, not JWT-based. A `Session` row (Section 10) is created on successful sign-in or successful verification, and its id is placed in an httpOnly cookie. The cookie is not signed with claims the server trusts blindly; it is only a lookup key.


**Cookie configuration**

- Name: `session_id`
- `httpOnly: true` — inaccessible to client-side JavaScript, closing off XSS-based token theft.
- `secure: true` — sent only over HTTPS.
- `sameSite: lax` — sent on top-level navigation but not on cross-site subrequests, mitigating CSRF for state-changing requests without breaking normal link-based navigation.
- `path: /`
- Expiry: 7 days, sliding — each authenticated request that touches the session extends `expiresAt` by 7 days from that point, up to the point of inactivity.
- Absolute maximum lifetime: 30 days from `createdAt`, regardless of activity. A session past this point is deleted on next access and the user must re-authenticate, even if continuously active. This caps the sliding expiry above, which otherwise has no ceiling. **[NEW — REVIEW FIX]**

**Why a database session instead of a JWT:** sign-out and password-reset-triggered logout both require immediate, server-side revocation. A JWT that is valid until its exp claim cannot be individually revoked without an additional denylist, which is just a database-backed session by another name. Choosing a database session directly avoids maintaining two systems.


**What's inside the cookie:** only an opaque session id (a UUID). No user id, no role, no expiry timestamp — all of that lives in the `Session` row server-side and is looked up on every request.


**CSRF, stated as a trade-off:** `sameSite: lax` is the sole CSRF defense in this build. It covers top-level navigation but does not cover every cross-origin POST vector in every browser configuration. This is an accepted trade-off for a single-origin app with no cross-site POST targets, and is flagged as insufficient on its own if this system is later exposed to third-party integrations or embedded contexts. **[NEW — REVIEW FIX]**


### 7.4 Password Hashing

Algorithm: Argon2id, with fixed parameters: memory cost 19 MiB (19456 KiB), 2 iterations, parallelism 1 — the OWASP-recommended minimum baseline for interactive login as of this writing. These exact values, not a latency target, are what ships; they are re-benchmarked against production hardware before launch and increased if actual hash time falls meaningfully under 250ms, but the shipped parameters are always named explicitly, never expressed only as a timing goal. **[NEW — REVIEW FIX]**

Argon2id is memory-hard, which is the property a general-purpose hash (SHA-256, MD5) lacks — a GPU or ASIC can compute billions of SHA-256 hashes per second, but Argon2id's memory requirement caps that parallelism.


**Defense question, answered directly:** if the cost factor (memory or iteration parameter) is set to 4 — an unreasonably low value — the hash becomes fast to compute, which defeats the purpose of choosing Argon2id over a general-purpose hash in the first place. The output would still look like an Argon2id hash and would still function correctly, but an offline brute-force attack against a stolen hash would become tractable at a speed approaching what a fast general-purpose hash would allow. The cost factor is not cosmetic; it is the entire value proposition of an adaptive hash.


**Note on verification codes and reset tokens:** these are hashed with a fast deterministic hash (SHA-256 with a server-side pepper), not Argon2id. This is intentional and different from password hashing: codes and tokens are high-entropy, short-lived, single-use, and already protected by rate limiting and expiry, so the slow-hash property that protects passwords against offline brute force isn't needed here, and a slow hash would only add unnecessary latency to every verification and reset request.


### 7.5 Code and Token Expiry

Both the verification code and the password reset token carry an `expiresAt` column and a `consumedAt` column in the database (Section 10). Every check against a code or token queries these columns directly; there is no separate "is this still valid" flag that could drift out of sync with the timestamp.


**Why this must live in the database and not only in the UI:** a UI countdown is a display feature, not an enforcement mechanism. If expiry is only checked in the browser, a user (or a reviewer, using curl) can submit an expired code directly to the API after the countdown reaches zero, and the server will accept it if it never checks the timestamp itself. The proof required for this PRD's evidence section is exactly this: a database record showing the same code before and after its `expiresAt` has passed, with the API rejecting the request in the second case.


Resend cooldown is enforced the same way: the server checks the `createdAt` of the account's most recent unconsumed code against the current time before issuing a new one, rather than relying on a client-side disabled-button timer.


A partial unique index guarantees at most one unconsumed code (or token) per user at the database level: **[NEW — REVIEW FIX]**

```sql
CREATE UNIQUE INDEX one_active_code_per_user
ON "VerificationCode" ("userId")
WHERE "consumedAt" IS NULL;

-- equivalent index on PasswordResetToken
CREATE UNIQUE INDEX one_active_token_per_user
ON "PasswordResetToken" ("userId")
WHERE "consumedAt" IS NULL;
```

Without this, invalidate-then-issue is a check-then-act operation with no database enforcement behind it — the same category of race condition Section 7.7 argues database constraints exist to close. Two concurrent resend requests could otherwise both see "no active code" and both insert one, leaving two unconsumed codes for one user. The partial index makes that impossible at the database layer, consistent with the principle in 7.7.


### 7.6 Idempotent Signup

**Mechanism:** the unique constraint on `User.email` at the database level (Section 10) is the actual enforcement point. The application-level flow is:

1. Request arrives, passes schema validation, email is normalized.
2. The server attempts to create the `User` row inside a transaction.
3. If the insert succeeds, a verification code is issued and the generic success response is returned.
4. If the insert fails with a unique constraint violation (Prisma error code `P2002` on the `email` field), the server catches this specifically, looks up the existing user by normalized email, and returns the identical generic success response — it does not create a second account, does not issue a second verification code if one is already active and within its cooldown, and does not return an error to the client.

**Defense question, walked through step by step for two requests sent in the same second:** both requests pass validation independently and both attempt an insert. The database serializes the two inserts. Whichever reaches the database first succeeds and the row exists with a verification code attached. The second insert is rejected by the unique index on `email` before it can create a row — this happens inside PostgreSQL itself, not in application code, so there is no race window where two rows could both be created. The application catches the resulting `P2002` error and responds to the second request exactly as it would to the first: a 200 with the generic "check your email" message. From the outside, both requests appear to have succeeded identically; in the database, exactly one `User` row exists.


### 7.7 Database Constraints as a Last Line of Defense

The unique constraint on `User.email` is not a substitute for the application-level existence check — it is what makes that check safe under concurrency. Application code alone (check-then-insert) has a race window between the check and the insert; two concurrent requests can both pass the check before either has inserted. The database constraint closes that window, because the database enforces it atomically at the storage layer regardless of what the application already believed to be true. Every uniqueness or referential rule the application depends on for correctness is backed by an equivalent database-level constraint for this reason.


### 7.8 Protected Routes

The dashboard route is checked in server-side middleware/route logic before any dashboard markup is generated. The check reads the `session_id` cookie, looks up the corresponding `Session` row, and verifies it exists and `expiresAt` is in the future. If the cookie is missing, the session row doesn't exist, or the session has expired, the request is redirected to `/signin` — the redirect happens server-side, before the dashboard's data or markup is produced, so there is no flash of protected content and no client-side-only guard to bypass by disabling JavaScript or calling the underlying data route directly.


When the session lookup fails or the session is expired, the guard clears the `session_id` cookie before redirecting, so the browser does not keep presenting a dead credential on every subsequent request. **[NEW — REVIEW FIX]**


### 7.9 Input Groups and Accessibility

Every form input has an associated `<label>` bound via `htmlFor`/`id`, not a placeholder used as a substitute for a label. Every input has a visible focus state implemented with a non-removed focus ring (no `outline: none` without a replacement), styled with Tailwind CSS. Error messages are associated with their input via `aria-describedby` and the input carries `aria-invalid="true"` when its value fails validation.


These requirements are part of the definition of done for every screen as it is built (Section 13), not a separate pass applied after the fact. **[NEW — REVIEW FIX]**


## 8. Business Model

This is not a monetized product on its own. It is infrastructure: a reusable authentication module intended to sit underneath a future product that has not yet been defined. No pricing, billing, or plan-tier logic is in scope. [ASSUMPTION] If this system is later attached to a real product with a business model, the `User` model in Section 10 is the extension point, and that decision is deferred to that future product's own PRD rather than invented here.


## 9. Risks

| Risk | Mitigation |
|---|---|
| Validating only on the client and treating that as sufficient | Every rule is enforced server-side against the same shared schema (7.2); curl-based evidence (11) forces a browser-bypass check. |
| Building out dashboard functionality instead of finishing the auth flow | Sections 3 and 13 scope the dashboard to one line and one button, and place it last in the roadmap. |
| Verification codes with no server-side expiry check, making the UI countdown cosmetic | `expiresAt` is a DB column checked on every attempt (7.5); evidence proves an expired code is rejected by the API. |
| Committing the `.env` file | `.env`/`.env.local` in `.gitignore` before first commit; only `.env.example` with placeholders is committed. |
| Rate limiting sign-in but forgetting the resend endpoint | Resend has its own limit and cooldown in the rate limit table (7.1), since it has a direct per-request cost. |
| Fixed-window limiter allows boundary bursts up to 2x the stated limit | Accepted given low absolute thresholds; sliding window/token bucket is the noted upgrade path. |
| No rate limit on the verification-code submission endpoint **[NEW]** | Independent limit added: 10 attempts / 15 minutes / account (7.1, 5.5). |
| Password reset token exposed via URL, browser history, and Referer headers **[NEW]** | `Referrer-Policy: no-referrer`, no third-party assets on the reset page, log redaction of the token (5.4). |
| Sliding session with no absolute cap allows indefinite credential lifetime **[NEW]** | 30-day absolute session cap added regardless of activity (7.3). |

*The final three rows above are new since the prior draft.*


## 10. Prisma Data Model

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                  String               @id @default(cuid())
  name                String
  email               String               @unique
  passwordHash        String
  emailVerified       Boolean              @default(false)
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt

  sessions            Session[]
  verificationCodes   VerificationCode[]
  passwordResetTokens PasswordResetToken[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model VerificationCode {
  id          String    @id @default(cuid())
  userId      String
  codeHash    String
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, codeHash])   // [NEW] matches the actual lookup predicate
}

model PasswordResetToken {
  id          String    @id @default(cuid())
  userId      String
  tokenHash   String
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, tokenHash])  // [NEW] matches the actual lookup predicate
}

// Rows older than 24h are deleted by a scheduled job or opportunistic
// cleanup on write (Section 7.1). [NEW]
model RateLimitEntry {
  id          String   @id @default(cuid())
  key         String
  windowStart DateTime
  count       Int      @default(1)

  @@unique([key, windowStart])
}

// [NEW] Partial unique indexes below cannot be expressed in Prisma's
// schema DSL and are added via a raw SQL migration (Section 7.5):
//   prisma migrate dev --create-only, then hand-edit the SQL to add:
//   CREATE UNIQUE INDEX one_active_code_per_user
//     ON "VerificationCode" ("userId") WHERE "consumedAt" IS NULL;
//   CREATE UNIQUE INDEX one_active_token_per_user
//     ON "PasswordResetToken" ("userId") WHERE "consumedAt" IS NULL;
```


**Notes on this schema**

- The unique constraint on `User.email` (Section 7.7) is `@unique`, not just an application-level check.
- `VerificationCode` and `PasswordResetToken` store hashes, never the raw code or token, so a database dump alone does not yield working credentials.
- `consumedAt` (nullable) is what makes both codes and tokens single-use: a lookup for an active code/token filters `WHERE consumedAt IS NULL AND expiresAt > now()`.
- `RateLimitEntry` uses a compound unique constraint on `(key, windowStart)` so the fixed-window counter (Section 7.1) can be implemented as an atomic upsert-and-increment.
- Indexes on `VerificationCode` and `PasswordResetToken` are keyed on `(userId, codeHash)` / `(userId, tokenHash)` respectively — matching the actual equality lookup performed at verification/reset time — rather than `(userId, consumedAt)`, which did not match the query pattern. **[NEW — REVIEW FIX]**
- The partial unique indexes enforcing one active code/token per user (Section 7.5) are added via a raw SQL migration (`prisma migrate dev --create-only`, then hand-edited SQL), since Prisma's schema DSL does not support partial indexes natively as of the current stable client. **[NEW — REVIEW FIX]**


## 11. Success Metrics

The evidence below is written for a reviewer who inspects the system directly — reading the database and calling the API with curl — rather than only through the UI. **[NEW — REVIEW FIX]**

Since this system is infrastructure rather than a growth product, success is measured by technical correctness, not adoption:

- 100% of the mandatory engineering requirements (Section 7, items 7.1–7.9) are present and demonstrable.
- 100% of the required evidence (below) is captured and matches the claims in this document.
- Signup-to-verified-account flow: in manual testing, an account reaches verified state on the first correct code entry, 100% of test runs. This is a pass/fail acceptance test performed once against the finished build, not an ongoing rate metric measured against live traffic, since this build has no live user base. **[NEW — REVIEW FIX]**
- Zero duplicate `User` rows produced under a repeated double-submit test against the signup endpoint.
- Rate-limited endpoints return `429` with a `Retry-After` header on the request immediately following the limit being reached, not one request later or one request early.


**Required Evidence (Acceptance Criteria)**

- A screenshot of the `User` table showing `passwordHash` populated with an Argon2id hash string (prefixed `$argon2id$...`), with no plaintext password visible anywhere in the row.
- The exact curl command used to hit `POST /api/auth/signup` directly, and the server's exact JSON response and status code.
- Evidence of a rate limit triggering on at least one of the limited endpoints: the request/response pair showing `429` and the `Retry-After` header value.
- A screenshot of a `VerificationCode` row before `expiresAt` has passed, and the same row (same `id`) after `expiresAt` has passed, alongside the API's `400` response when that code is submitted post-expiry.

```bash
curl -X POST https://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"Password123"}'

# Expected response, HTTP 200:
# {"message":"Check your email to verify your account."}
```


## 12. Assumptions

Carried over from the original scoping, treated as fixed decisions for this document:

- Single user role, no admin tier.
- Email is normalized to lowercase and trimmed before storage and lookup.
- An unverified user who tries to sign in is redirected to the verification screen with resend available, not shown a generic error.
- Password rule: minimum 8 characters, at least one letter and one number.
- Verification code: 6 digits, numeric, expires 15 minutes after issue.
- Resend cooldown: 60 seconds between sends, maximum 5 sends per hour per account.
- Password reset token: single use, expires 30 minutes after issue, stored as a hash.
- Session: database-backed, httpOnly/secure/sameSite=lax cookie, 7-day sliding expiry, not a JWT.
- Rate limits as specified in Section 7.1.
- No permanent account lockout after failed logins; rate limiting is the only brute-force defense.
- Signup fields: name, email, password.
- Verification codes and reset tokens stored as hashes, never plaintext.
- Issuing a new code or token invalidates the previous one.
- Forgot-password always returns the same generic success message regardless of whether the email exists.
- A signed-in user who visits signup or sign-in is redirected to the dashboard.
- Password hashing algorithm: Argon2id.
- Styling: Tailwind CSS, plain semantic HTML, visible focus states.
- Email delivery in this build: logged to console, behind a swappable interface.
- Rate limiter backend: in-memory or DB-backed, single instance; Redis is the noted upgrade path at scale.
- This is infrastructure for a future product, not a monetized product on its own.
- Success is measured by technical correctness, not growth metrics.

Added in this document, flagged inline where they first appear and repeated here:

- [ASSUMPTION] Validation is implemented with Zod as the shared schema library between client and server (Section 7.2).
- [ASSUMPTION] Verification codes and reset tokens are hashed with a fast deterministic hash (SHA-256 plus server-side pepper), deliberately different from the slow Argon2id hash used for passwords, for the reasons stated in Section 7.4.
- [ASSUMPTION] The rate limiter is implemented as a fixed-window counter backed by a `RateLimitEntry` Prisma model (Section 10), accepting the boundary-burst trade-off noted in Section 7.1 and Section 9.
- Argon2id parameters are fixed at memory cost 19 MiB, 2 iterations, parallelism 1 (OWASP minimum baseline), re-benchmarked against production hardware but never redefined by a timing target alone (Section 7.4). **[NEW — REVIEW FIX]**
- An IP-only rate ceiling of 20 requests per 15 minutes applies to sign-in and forgot-password, in addition to their per-email limits (Section 7.1). **[NEW — REVIEW FIX]**
- Verification code submission is rate limited at 10 attempts per 15 minutes per account, independent of the resend limit (Section 7.1, 5.5). **[NEW — REVIEW FIX]**
- Sessions carry an absolute maximum lifetime of 30 days from creation, on top of the 7-day sliding expiry (Section 7.3). **[NEW — REVIEW FIX]**
- `RateLimitEntry` rows are retained for 24 hours before cleanup (Section 7.1). **[NEW — REVIEW FIX]**


## 13. Phased Roadmap

The dashboard is built last, deliberately, so it cannot be used to avoid the harder authentication work. Accessibility work (Section 7.9) is folded into the definition of done for every screen-building phase below, not scheduled as a separate late pass.


- **Phase 0 — Foundations** — Prisma schema (Section 10), PostgreSQL setup, `.env` / `.env.example` split, project scaffolding.
- **Phase 1 — Signup core** — Signup endpoint, Argon2id hashing, shared Zod schema, unique email constraint, idempotent double-submit handling (7.6). Definition of done includes labels, focus states, and aria wiring (7.9) on the signup form.
- **Phase 2 — Email verification** — Code generation and hashing, `expiresAt`/`consumedAt` enforcement, partial unique index (7.5), resend endpoint with server-side cooldown and cap, independent rate limit on code submission. Definition of done includes accessibility wiring on this form.
- **Phase 3 — Sign-in and sessions** — Sign-in endpoint, `Session` model, cookie configuration and 30-day absolute cap (7.3), sign-out (server-side session deletion). Definition of done includes accessibility wiring on this form.
- **Phase 4 — Protected routes** — Dashboard route guard (7.8), including stale-cookie clearing, redirect behavior for signed-out and already-signed-in users.
- **Phase 5 — Forgot / reset password** — Request endpoint (generic response), token generation and hashing, partial unique index, reset form with `Referrer-Policy: no-referrer` and log redaction (5.4), session invalidation on password change. Definition of done includes accessibility wiring on both forms.
- **Phase 6 — Rate limiting** — `RateLimitEntry` model, atomic increment (7.1), limiter middleware applied to all endpoints in the Section 7.1 table including the new IP-only ceilings and the verification-attempt limit, cleanup job for stale entries.
- **Phase 7 — Evidence collection** — Capture the four required artifacts in Section 11 against the finished system.
- **Phase 8 — Placeholder dashboard (last)** — The one-line name display and sign-out button, added only once everything above is verified end to end.


## 14. Open Questions

- **Business model framing:** settled as 'not applicable' for this build (Section 8). This is only worth revisiting if the system is attached to a specific product with its own business model — it is not a blocking question for this PRD. **[NEW — REVIEW FIX]**
- **Styling library:** this document assumes Tailwind CSS (Section 7.9). If a different styling approach is required, the accessibility requirements (labels, focus states) carry over unchanged, but the implementation across Phases 1–5 changes.
- **Email delivery provider:** this document assumes console-logged email in this build, behind a swappable interface (Section 12). Which real provider (if any) it should be swapped for in a later phase is unresolved.
- **Retention policy for unverified accounts:** this build does not clean up abandoned unverified `User` rows (Section 3). A real deployment needs a decision on whether and when to purge or re-permit signup for abandoned unverified accounts. **[NEW — REVIEW FIX]**
