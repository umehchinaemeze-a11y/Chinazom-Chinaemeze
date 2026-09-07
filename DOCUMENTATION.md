# Standalone Authentication System — Documentation

> Status: **evidence-complete for the verified items**. All claims were checked against the current working tree and, where possible, against a freshly started controlled server instance (Section 8.7). Two implementation/decision items remain open and are flagged **TODO** in Section 8.8 — the `/verify` UI screen and the Next 16 `middleware` deprecation decision — plus a maintainer sign-off on the dev-mode cookie flag (Problem 5).

---

## Section 1: Project Overview

This is a **standalone, production-grade authentication system** built with Next.js (App Router only), TypeScript (strict), Prisma, and PostgreSQL. It demonstrates a complete auth flow end-to-end across six screens and seven API routes, with database-backed sessions, hashed secrets, rate limiting, and idempotency guarantees on all mutation endpoints. It is infrastructure — not a monetized product.

### Purpose

Prove that the full auth pipeline works end to end with **evidence**: account creation, email verification, password-based sign-in, session management, password reset, sign-out, rate limiting, and a protected dashboard. The build is locked to the PRD (`docs/auth-system-prd-v2.md`) and the rules in `AGENTS.md`; anything beyond the auth flow is out of scope (no landing page, no admin, no billing, no AI — `AGENTS.md` §3.8).

### Users

- **New User** — signs up, verifies their email, reaches the dashboard.
- **Returning User** — signs in; occasionally requests a password reset.

There is no admin role.

### Tech Stack

| Layer | Choice | Version | Evidence |
|---|---|---|---|
| Framework | Next.js, App Router only | 16.3.4 | `package.json`, `src/app/**` |
| Language | TypeScript, strict | ^5 | `tsconfig.json` (`strict: true`) |
| ORM | Prisma | ^6.4.1 | `prisma/schema.prisma` |
| Database | PostgreSQL | external | `prisma/migrations/migration_lock.toml`, `.env` |
| Validation | Zod | ^4.5.4 | `src/lib/validation/index.ts` |
| Password hashing | argon2 (Argon2id only) | ^0.45.1 | `src/lib/crypto/password.ts` |
| Code/token hashing | SHA-256 + server-side pepper | Node built-in | `src/lib/crypto/token.ts` |
| Styling | Tailwind CSS v4 | ^4 | `src/app/globals.css`, `tailwind.config.ts` |
| Font | DM Sans 400/500/600/900, self-hosted via `next/font/google` | — | `src/app/layout.tsx` |
| Testing | Vitest | ^5.0.0 | `tests/*.test.ts` |
| Node requirement | >=20.0.0 (`.nvmrc` pins 22) | — | `package.json` `engines`, `.nvmrc` |

### Design tokens

Tokens live in `src/styles/tokens.css` (the `@import url('https://fonts.googleapis.com/...')` line from the Figma export is **stripped** — the file is variables only). The root layout imports it once. `tailwind.config.ts` and the Tailwind v4 `@theme` block in `src/app/globals.css` map every colour, spacing, shadow, and typography role token to utilities (`bg-primary`, `text-on-surface`, …). Components never reference `--primitive-*` values or hand-typed hex codes. DM Sans is loaded via `next/font/google` (build-time fetch, self-hosted), never via a runtime third-party `@import`.

---

## Section 2: File and Folder Structure

```
login form/
├── prisma/
│   ├── schema.prisma                          # 5 models — exact schema from AGENTS.md §2.8
│   └── migrations/
│       ├── migration_lock.toml                # provider = "postgresql"
│       ├── 20260906155428_init/migration.sql  # 5 tables, regular indexes, FKs
│       └── 20260906155448_add_partial_indexes/migration.sql
│                                              # partial unique indexes (raw SQL, hand-edited)
├── src/
│   ├── app/
│   │   ├── layout.tsx                         # Root layout: DM Sans, imports tokens.css + globals.css
│   │   ├── page.tsx                           # `/` → /dashboard if session valid, else /signin
│   │   ├── globals.css                        # Tailwind v4 @theme mapping to token CSS variables
│   │   ├── login/route.ts                     # GET /login → 307 redirect to /signin
│   │   ├── (auth)/
│   │   │   ├── signup/page.tsx                # "use client"; signUpSchema; calls /api/auth/signup
│   │   │   ├── signin/page.tsx                # "use client"; signInSchema; router.push('/dashboard')
│   │   │   ├── forgot-password/page.tsx       # "use client"; generic success regardless of email
│   │   │   ├── reset-password/page.tsx        # Server component; metadata referrer: "no-referrer"
│   │   │   ├── reset-password/ResetPasswordForm.tsx  # "use client"; strips ?token= from URL
│   │   │   └── verify/page.tsx                # Phase 0 placeholder — no interactive form (TODO)
│   │   ├── dashboard/page.tsx                 # Server component; getCurrentUser() + redirect('/signin')
│   │   └── api/auth/
│   │       ├── signup/route.ts                # POST signup
│   │       ├── signin/route.ts                # POST signin
│   │       ├── signout/route.ts               # POST signout
│   │       ├── forgot-password/route.ts       # POST forgot-password
│   │       ├── reset-password/route.ts        # POST reset-password
│   │       ├── verify/route.ts                # POST verify
│   │       └── verify/resend/route.ts         # POST verify/resend
│   ├── components/
│   │   ├── forms/
│   │   │   ├── index.ts                       # export * from "./TextInput"
│   │   │   └── TextInput.tsx                  # labeled input: htmlFor/id, aria-invalid, aria-describedby, error/helper
│   │   └── ui/
│   │       ├── index.ts                       # export * from AuthCard/Button/SignOutButton
│   │       ├── AuthCard.tsx                   # shared centered-card shell for all auth screens
│   │       ├── Button.tsx                     # primary/secondary/outline, isLoading spinner, aria-busy
│   │       └── SignOutButton.tsx              # "use client"; POST /api/auth/signout then push /signin
│   ├── lib/
│   │   ├── auth/index.ts                      # sessions + cookie helpers (locked config §2.2)
│   │   ├── crypto/password.ts                 # Argon2id ONLY — hashPassword / verifyPassword
│   │   ├── crypto/token.ts                    # SHA-256 + pepper ONLY — codes & reset tokens
│   │   ├── db/index.ts                        # Prisma singleton (globalThis pattern)
│   │   ├── email/index.ts                     # EmailService interface + console implementation only
│   │   ├── rate-limit/index.ts                # checkRateLimit (atomic raw SQL), rateLimitedResponse, getClientIp, cleanupExpiredEntries
│   │   └── validation/index.ts                # All Zod schemas — single source of truth (server + client)
│   ├── middleware.ts                          # Matcher: /dashboard/:path* — pass-through placeholder (see §7)
│   └── styles/tokens.css                      # Design tokens — @import stripped, variables only
├── tests/
│   ├── setup.ts                               # loads .env; direct Prisma client; beforeEach full wipe
│   ├── helpers.ts                             # createUser, createVerificationCode, createResetToken, mockPostRequest, runConcurrently
│   ├── signup.idempotency.test.ts
│   ├── signin.idempotency.test.ts
│   ├── verify.idempotency.test.ts             # covers POST /api/auth/verify and POST /api/auth/verify/resend
│   └── reset-password.idempotency.test.ts     # covers reset-password and forgot-password
├── docs/
│   └── auth-system-prd-v2.md                  # PRD (source of truth for what/why)
├── public/
│   └── *.svg                                  # default Next.js starter SVGs (unused)
├── .vscode/
│   ├── settings.json                          # css.customData → tailwind.css-data.json
│   └── tailwind.css-data.json                 # Tailwind intellisense data
├── .env.example                               # placeholders only (committed)
├── .env                                       # real local values (gitignored — never committed)
├── .gitignore                                 # ignores .env*, *.tsbuildinfo, next-env.d.ts, etc.
├── .nvmrc                                     # Node 22
├── AGENTS.md                                  # project rules for coding agents
├── design-tokens.tokens.json                  # Figma design-tokens export (source of src/styles/tokens.css)
├── tailwind.config.ts                         # theme.extend maps token CSS variables
├── vitest.config.ts                           # node env, fileParallelism: false
├── next.config.ts                             # empty config
├── tsconfig.json                              # strict; paths @/* → ./src/*
├── eslint.config.mjs                          # next/core-web-vitals + next/typescript
├── postcss.config.mjs                         # @tailwindcss/postcss only
├── package.json / package-lock.json
└── README.md                                  # default create-next-app (unmodified)
```

---

## Section 3: Routes and API Endpoints

### Page Routes

| Route | File | Notes |
|---|---|---|
| `/` | `src/app/page.tsx` | Server component; `getCurrentUser()` → redirect `/dashboard` or `/signin` |
| `/login` | `src/app/login/route.ts` | GET → 307 redirect to `/signin` |
| `/signup` | `src/app/(auth)/signup/page.tsx` | Client component; shared `signUpSchema` |
| `/signin` | `src/app/(auth)/signin/page.tsx` | Client component; on success `router.push('/dashboard')` + refresh |
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` | Generic success regardless of email existence |
| `/reset-password` | `src/app/(auth)/reset-password/page.tsx` + `ResetPasswordForm.tsx` | Server component metadata `referrer: "no-referrer"`; token read from `searchParams`; client form strips `?token=` via `history.replaceState` on success |
| `/verify` | `src/app/(auth)/verify/page.tsx` | **Phase 0 placeholder** — renders a static message, no form (see §7) |
| `/dashboard` | `src/app/dashboard/page.tsx` | Server component; `getCurrentUser()` → redirect `/signin` if unauthenticated; renders name + email + sign-out button only |

### API Routes (all POST)

| Method | Path | File | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | `signup/route.ts` | Validate → rate limit (5/hr/IP) → Argon2id hash → `$transaction` create user + first verification code → generic 200; duplicate email → **400** (documented PRD deviation, §7) |
| POST | `/api/auth/signin` | `signin/route.ts` | Validate → rate limit (20/15min/IP) → lookup user → Argon2id verify → generic 401 on any failure → create DB session + set `session_id` cookie → 200 with user |
| POST | `/api/auth/signout` | `signout/route.ts` | `invalidateSession()` deletes the session row server-side + clears cookie → 200 |
| POST | `/api/auth/forgot-password` | `forgot-password/route.ts` | Validate → rate limits (3/hr/email + 20/15min/IP) → mint reset token (or not) → always the same generic 200 |
| POST | `/api/auth/reset-password` | `reset-password/route.ts` | Validate → atomic `UPDATE … WHERE consumedAt IS NULL AND NOT expired` → new Argon2id hash → `$transaction` update password + delete all sessions → 200 |
| POST | `/api/auth/verify` | `verify/route.ts` | Validate → rate limit (10/15min/account) → atomic code consume → `emailVerified = true` → generic 200; wrong/used/expired/unknown → same generic 400 |
| POST | `/api/auth/verify/resend` | `verify/resend/route.ts` | Validate → rate limit (5/hr/account + 60 s cooldown) → invalidate prior active code, mint new one → generic 200 |

### Middleware / Route Guard

`src/middleware.ts` matches `/dashboard/:path*` only and returns `NextResponse.next()` unconditionally — it is a pass-through. Real dashboard protection is the server component guard (`getCurrentUser()` + `redirect`) in `src/app/dashboard/page.tsx`. Per `AGENTS.md` §4.1, Argon2id hashing must never run in middleware (next lint/build currently warn that the `middleware` file convention is deprecated in Next 16 — see §7).

---

## Section 4: Database Schema

Datasource: PostgreSQL, `DATABASE_URL` from env. Source of truth: `prisma/schema.prisma` (exact, per `AGENTS.md` §2.8) + two applied migrations.

### `User`

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK; cuid default (client-side) |
| name | TEXT | NOT NULL |
| email | TEXT | NOT NULL, **UNIQUE** (`User_email_key`) |
| passwordHash | TEXT | NOT NULL — Argon2id string only, never plaintext |
| emailVerified | BOOLEAN | NOT NULL, default `false` |
| createdAt | TIMESTAMP(3) | NOT NULL, default `now()` |
| updatedAt | TIMESTAMP(3) | NOT NULL, `@updatedAt` |

### `Session`

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK; cuid default |
| userId | TEXT | NOT NULL, FK → `User.id` ON DELETE CASCADE |
| expiresAt | TIMESTAMP(3) | NOT NULL |
| createdAt | TIMESTAMP(3) | NOT NULL, default `now()` |

Index: `Session_userId_idx` on `(userId)`.
Sessions are **multi-session** by design: signing in never invalidates other sessions.

### `VerificationCode`

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK; cuid default |
| userId | TEXT | NOT NULL, FK → `User.id` ON DELETE CASCADE |
| codeHash | TEXT | NOT NULL — SHA-256 + `CODE_PEPPER` hash, never the raw code |
| expiresAt | TIMESTAMP(3) | NOT NULL |
| consumedAt | TIMESTAMP(3) | nullable |
| createdAt | TIMESTAMP(3) | NOT NULL, default `now()` |

Indexes:
- `VerificationCode_userId_codeHash_idx` on `(userId, codeHash)` — matches the actual lookup predicate.
- `one_active_code_per_user` — **partial unique index** on `(userId)` WHERE `consumedAt` IS NULL (raw SQL migration; Prisma schema DSL cannot express it). Enforces at most one active code per user at the database level.

### `PasswordResetToken`

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK; cuid default |
| userId | TEXT | NOT NULL, FK → `User.id` ON DELETE CASCADE |
| tokenHash | TEXT | NOT NULL — SHA-256 + `TOKEN_PEPPER` hash, never the raw token |
| expiresAt | TIMESTAMP(3) | NOT NULL |
| consumedAt | TIMESTAMP(3) | nullable |
| createdAt | TIMESTAMP(3) | NOT NULL, default `now()` |

Indexes:
- `PasswordResetToken_userId_tokenHash_idx` on `(userId, tokenHash)` — matches the actual lookup predicate.
- `one_active_token_per_user` — **partial unique index** on `(userId)` WHERE `consumedAt` IS NULL (raw SQL migration).

### `RateLimitEntry`

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PK; cuid is **supplied by application code** — the DB column has NO default (see §6 Decision 1) |
| key | TEXT | NOT NULL |
| windowStart | TIMESTAMP(3) | NOT NULL |
| count | INTEGER | NOT NULL, default 1 |

Unique constraint: `RateLimitEntry_key_windowStart_key` on `(key, windowStart)` — enables the single-statement atomic upsert-and-increment.

Note: migration SQL shows `id TEXT NOT NULL` with no `DEFAULT` clause — Prisma's `@default(cuid())` is client-side only, verified in `20260906155428_init/migration.sql`.

### Migrations

| Migration | Content |
|---|---|
| `20260906155428_init` | Creates all 5 tables, PKs, unique `User_email_key`, `Session_userId_idx`, `(userId, codeHash)` / `(userId, tokenHash)` indexes, `RateLimitEntry (key, windowStart)` unique, and the three FK cascade constraints |
| `20260906155448_add_partial_indexes` | Hand-edited raw SQL: `one_active_code_per_user` and `one_active_token_per_user` partial unique indexes |

Row-retention rule (AGENTS.md §2.6): `RateLimitEntry` rows older than 24 hours are cleaned up opportunistically on window rollover (`cleanupExpiredEntries`, called when `count === 1`).

---

## Section 5: Authentication Concepts

Eight concepts. Each answers the four required questions: **What is it? · Why this approach? · How is it implemented? · How is it verified (evidence)?**

### Concept 1 — Database-Backed Sessions with Sliding Expiry and Absolute Cap

**Q1. What is it?**
A session is a row in the `Session` table, referenced in the browser by an opaque `session_id` cookie value. There is no JWT and no stateless token anywhere.

**Q2. Why this approach?**
Sign-out and reset-triggered logout require *immediate, guaranteed* server-side revocation. A JWT (or signed cookie with claims) cannot be invalidated before its TTL expires; a database row can be deleted instantly. This is the explicit reason JWTs are rejected in `AGENTS.md` §2.2 / PRD 7.3. Multiple concurrent sessions per user are allowed by design (signing in on a new device never kills other sessions — AGENTS.md §3.7).

**Q3. How is it implemented?** (`src/lib/auth/index.ts`)
- `createSession(userId)` → `expiresAt = now + 7 days` (SLIDING_EXPIRY_MS).
- `setSessionCookie(sessionId, expiresAt)` → cookie `session_id`, `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"`, `path: "/"`, `expires` set. Carries only the opaque session id.
- `validateSession(sessionId)`: looks up the row; deletes it if `expiresAt` has passed **or** `now >= createdAt + 30 days` (ABSOLUTE_CAP_MS — the hard ceiling on the sliding expiry); otherwise extends `expiresAt` by 7 days *capped at the 30-day ceiling*, and only writes to the DB when the extension exceeds 1 hour (write suppression). Returns the session with its user.
- `getCurrentUser()`: reads the cookie, validates; on failure **deletes the dead cookie** server-side and returns null.
- `invalidateSession()`: deletes the `Session` row (`.catch(() => null)` so sign-out still succeeds if the row is already gone) and clears the cookie. Clearing only the cookie is not sign-out.

**Q4. How is it verified?**
- Locked constants at `src/lib/auth/index.ts:5-7`; ceiling check and deletion at lines 71-74; 1-hour write suppression at lines 80-87.
- Test `tests/signin.idempotency.test.ts` asserts 3 concurrent sign-ins produce 3 distinct valid sessions (multi-session semantics) and no session row on wrong credentials.
- Live curl: valid sign-in returned `{"success":true,"user":{…}}` and the DB session row had `expiresAt = now + 7 days` (verified directly in PostgreSQL — `<Session>.expiresAt` ≈ 2026-09-14 for a 2026-09-07 sign-in).

### Concept 2 — Password Hashing (Argon2id only)

**Q1. What is it?**
Every password is stored exclusively as an Argon2id hash (`$argon2id$v=19$m=19456,p=1,t=2$…`). No plaintext password exists in the database, logs, or responses.

**Q2. Why this approach?**
Argon2id is memory-hard and defeats GPU/ASIC brute-force. bcrypt/scrypt/PBKDF2/SHA-* are explicitly excluded for passwords (AGENTS.md §2.3). Parameters are **named constants**, not a runtime "under-250 ms" tuning target.

**Q3. How is it implemented?** (`src/lib/crypto/password.ts`)
- `ARGON2_OPTIONS`: `type: argon2id`, `memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1`, `raw: false`.
- `hashPassword(password)` and `verifyPassword(hash, plaintext)` wrap the argon2 library; verify returns `false` on any error (including malformed hashes).
- Invoked **only** from Node.js-runtime route handlers (`signup`, `reset-password`), never from middleware (AGENTS.md §4.1).

**Q4. How is it verified?**
- Live DB read: `passwordHash` for `evidence.user@example.com` = `$argon2id$v=19$m=19456,p=1,t=2$eCmtDlF8/pPEfmpsEpmP8A$fJdJFahh8JTLCgpGm5NgkTU72IabKhagtdAfwC3/xUU` — Argon2id, correct locked parameters, never plaintext.
- `tests/reset-password.idempotency.test.ts` verifies `verifyPassword` against both a freshly-reset hash and the old password's hash.

### Concept 3 — Verification Code and Reset-Token Hashing (SHA-256 + pepper)

**Q1. What is it?**
6-digit verification codes and 32-byte password-reset tokens are hashed with **SHA-256 plus a server-side pepper** before storage. Raw values live only in the emailed message / reset link and are never persisted.

**Q2. Why this approach?**
Codes and tokens are cryptographically random, unguessable values — their security comes from randomness, not from a slow KDF. Argon2id is deliberately **not** used here (AGENTS.md §2.3 / PRD 7.4); the pepper means a stolen database cannot be offline-queried without it. Two independent peppers (`CODE_PEPPER`, `TOKEN_PEPPER`) keep the two contexts separate. A fast deterministic hash also means lookups are indexed hashes, which is what the `(userId, codeHash/tokenHash)` indexes serve.

**Q3. How is it implemented?** (`src/lib/crypto/token.ts`)
- `generateResetToken()` → `randomBytes(32).toString("base64url")`.
- `hashResetToken(raw)` → `sha256(rawToken + TOKEN_PEPPER)` hex.
- `generateVerificationCode()` → `randomBytes(4).readUInt32BE(0) % 1_000_000`, zero-padded to 6 digits.
- `hashVerificationCode(code)` → `sha256(code + CODE_PEPPER)` hex.
- Peppers are read from `process.env` and the module throws if absent (fail-fast).
- Code TTL 10 minutes; reset token TTL 30 minutes.

**Q4. How is it verified?**
- Live DB read: verification-code row stores a `codeHash` (no raw code), reset-token row stores a `tokenHash` (no raw token).
- Reset link format produced by `forgot-password/route.ts`: `new URL("/reset-password", request.url)` with `?token=<base64url>` added; the raw token appears only in the email/log output, never in the DB.
- The reset-password page sets `referrer: "no-referrer"` and loads no third-party resources (DM Sans is self-hosted) so the token cannot leak via Referer (AGENTS.md §3.2 / PRD 5.4).

### Concept 4 — Rate Limiting (Postgres fixed-window, atomic upsert)

**Q1. What is it?**
A PostgreSQL-backed **fixed-window** rate limiter. Every action is counted in a `RateLimitEntry` row keyed by `(key, windowStart)`. All seven limits are implemented, and all deny responses are `429` with a `Retry-After` header.

**Q2. Why this approach?**
Redis is excluded for this build. A Prisma `findFirst`+`update` pair is a read-then-write race — two concurrent requests can both read `count=4` and both write `5`. The single `INSERT … ON CONFLICT … DO UPDATE SET count = count + 1` eliminates the race in one round-trip. The fixed-window boundary burst is a documented, accepted trade-off (no sliding window / token bucket in this build).

**Q3. How is it implemented?** (`src/lib/rate-limit/index.ts`)
```sql
INSERT INTO "RateLimitEntry" (id, key, "windowStart", count)
VALUES ($1, $2, (to_timestamp($3 / 1000) AT TIME ZONE 'UTC'), 1)
ON CONFLICT (key, "windowStart")
DO UPDATE SET count = "RateLimitEntry".count + 1
RETURNING count;
```
- Windows align to `floor(now / windowMs) * windowMs`.
- The `id` is a client-generated cuid (raw SQL bypasses Prisma's client-side default; the column has no DB default) — Decision 1.
- `windowStart` is written as an explicit UTC timestamp because Prisma's raw-parameter serializer shifts JS `Date` by the session timezone — Decisions 2 & Problem 2.
- `count > limit` → `{ allowed: false, retryAfterSeconds }` → `rateLimitedResponse()` emits `429` + `Retry-After`.
- `cleanupExpiredEntries()` deletes rows older than 24 h, run opportunistically when `count === 1` (window rollover).
- `getClientIp()` reads `x-forwarded-for` (first entry) → `x-real-ip` → `"unknown"`.

Limits enforced (verified in each route handler):

| Endpoint | Limit | Key | Window |
|---|---|---|---|
| POST /api/auth/signup | 5 requests | IP | 1 hour |
| POST /api/auth/signin | 20 requests | IP | 15 min |
| POST /api/auth/signin | 5 attempts | email+IP pair | 15 min (**failed credentials only**, never on success) |
| POST /api/auth/forgot-password | 3 requests | normalized email | 1 hour |
| POST /api/auth/forgot-password | 20 requests | IP | 15 min |
| POST /api/auth/verify/resend | 5 requests + 60 s cooldown between any two | account id (`verify/resend` uses account id; per-email fallback for unknown emails) | 1 hour cap / 60 s cooldown |
| POST /api/auth/verify | 10 attempts | account id | 15 min |

**Q4. How is it verified?**
- Tests assert `429` + `Retry-After` for: signup 5/hr/IP (`signup.idempotency.test.ts`), signin attempt budget 5/15 min failed-only and IP 20/15 min (`signin.idempotency.test.ts`), verify 10/15 min and resend 5/hr + 60 s cooldown (`verify.idempotency.test.ts`).
- Live curl: the 6th signup within the hour from the same IP returned `HTTP/1.1 429 Too Many Requests` with header `retry-after: 1714` and body `{"error":"Too many requests. Please try again later."}` (see Section 8).

### Concept 5 — Account Enumeration Prevention

**Q1. What is it?**
Every endpoint able to reveal whether an email, account, or token exists returns an identical response for both the "exists/valid" and "does not exist/invalid" cases.

**Q2. Why this approach?**
Different status codes or messages for known vs. unknown emails let an attacker enumerate registered accounts without authenticating. All flows (signup, signin, forgot-password, verification, reset) therefore return generic, identical responses (AGENTS.md §3.1).

**Q3. How is it implemented?**
- Signup: generic 200 for a genuine new account. **Deviation:** duplicate email returns a 400 "An account with this email already exists." — a documented team decision (see §7 Problem 1).
- Signin: `GENERIC_SIGNIN_ERROR = "Invalid email or password."` (401) for both unknown email and wrong password; the rate-limit attempt budget is also consumed identically in both failure paths so behaviour doesn't leak existence.
- Forgot-password: `GENERIC_FORGOT_PASSWORD_RESPONSE` — identical 200 for existing and non-existing emails.
- Verify: `GENERIC_VERIFY_ERROR = "Invalid or expired verification code."` (400) for unknown email, wrong, expired, or already-used codes.
- Resend: `GENERIC_RESEND_RESPONSE` — identical 200 for unverified, verified, and non-existing emails.
- Reset: `INVALID_TOKEN_MESSAGE` — identical message for wrong/expired/consumed/unknown-user tokens.

**Q4. How is it verified?**
- Live curl evidence: forgot-password for `nobody@example.com` and `evidence.user@example.com` returned byte-identical generic 200 bodies; wrong verification code and unknown-email verification return the same generic 400; wrong-password sign-in returns the generic 401.
- Tests: `verify.idempotency.test.ts` asserts wrong-code and unknown-email bodies are exactly equal; `reset-password.idempotency.test.ts` asserts known/unknown email responses are equal.

### Concept 6 — Atomic Token/Code Consumption (TOCTOU prevention)

**Q1. What is it?**
Verification codes and reset tokens are consumed with a **single** `UPDATE … WHERE consumedAt IS NULL (AND not expired)`. Only one concurrent request can win; a repeated or concurrent second request gets zero affected rows.

**Q2. Why this approach?**
A read-then-write (`findFirst` then `update`) pattern has a TOCTOU race: two simultaneous requests can both see the token as unconsumed and both proceed (e.g., two different new passwords). Making consumption itself the atomic check eliminates the race.

**Q3. How is it implemented?**
- Reset (`reset-password/route.ts:55-61`): sets `consumedAt = (NOW() AT TIME ZONE 'UTC')` where `tokenHash = … AND "consumedAt" IS NULL AND EXTRACT(EPOCH FROM "expiresAt") * 1000 > nowMs`. `consumedCount === 0` → generic invalid-token 400. Expiry is compared as epoch **integers**, never as a raw-SQL JS `Date`, to avoid the Prisma session-timezone shift (Decision 2 / Problem 2).
- Verify (`verify/route.ts:85-92`): same pattern on `VerificationCode`. When `consumedCount === 0`, a secondary read distinguishes "a concurrent request just won with the correct code" (return success, idempotent) from "the code is genuinely bad/expired/used" (generic 400) — Decision 3.
- Both endpoints write `consumedAt` UTC-naive, matching how Prisma writes every other timestamp column.

**Q4. How is it verified?**
- `tests/reset-password.idempotency.test.ts`: repeated use of the same token → first 200, second 400; concurrent resets with the same token → statuses `[200, 400]` and the stored password equals exactly one of the two submitted values.
- `tests/verify.idempotency.test.ts`: two concurrent verifications with the same correct code → both 200, exactly one consumed code row, `emailVerified = true`.

### Concept 7 — Validation — single Zod schema source of truth

**Q1. What is it?**
All client input validation rules live in exactly one module, `src/lib/validation/index.ts`, imported by both the API route handlers (authoritative server check) and the client form components (early user feedback).

**Q2. Why this approach?**
Duplicate rule definitions in two places inevitably drift. One shared module means a rule change propagates atomically; the server always re-validates every field with the same schema (client-side validation is not an enforcement boundary — AGENTS.md §3.3 / PRD 7.2).

**Q3. How is it implemented?** (schemas, as written in the module)
- `signUpSchema` — name: trimmed, 1-100; email: trimmed, valid, lowercased; password: 8-128.
- `signInSchema` — email: trimmed, valid, lowercased; password: 1-128.
- `forgotPasswordSchema` — email: trimmed, valid, lowercased (this is the "normalized email" the rate-limit key uses).
- `resetPasswordSchema` — token: trimmed non-empty; password: 8-128; confirmPassword; `.refine()` rejects mismatch at `["confirmPassword"]`.
- `verifyEmailSchema` — email: trimmed, valid, lowercased; code: exactly 6 chars.
- `resendVerificationSchema` — email: trimmed, valid, lowercased.

Both sides call `.safeParse()`; route handlers return field errors as `{ error, details: { fieldErrors } }` with 400.

**Q4. How is it verified?**
- Client imports: `signup/page.tsx:5`, `signin/page.tsx:6`, `forgot-password/page.tsx:5`, `ResetPasswordForm.tsx:5`. Server imports in every route handler.
- All idempotency tests depend on the same schemas; malformed payloads are covered by the route handlers' early 400 JSON-body guard.

### Concept 8 — Reset-Triggered Session Invalidation (session integrity)

**Q1. What is it?**
Consuming a password-reset token updates the password **and** deletes every `Session` row for that user in the same transaction — forcing re-authentication on every device.

**Q2. Why this approach?**
After a reset, a pre-reset session may belong to an attacker or an unknown device. Leaving it valid would let that session keep the account open despite the new password. Transactionality guarantees no partial state (AGENTS.md §3.7 / PRD 5.4).

**Q3. How is it implemented?** (`reset-password/route.ts:85-93`)
```ts
await prisma.$transaction([
  prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash: newPasswordHash } }),
  prisma.session.deleteMany({ where: { userId: resetToken.userId } }),
]);
```
The token is already atomically consumed by the earlier `UPDATE`, so it is not re-touched here. Contrast with sign-in and sign-out: sign-in adds sessions (multi-session), sign-out removes exactly one (the current), reset removes all.

**Q4. How is it verified?**
- `tests/reset-password.idempotency.test.ts` ("invalidate sessions once when the token is consumed"): two sessions exist → one reset → zero sessions remain.
- Implementation cross-ref: `reset-password/route.ts:85-93`.

---

## Section 6: Implementation Decisions

### Decision 1 — RateLimitEntry `id` supplied by application code (raw SQL bypasses Prisma defaults)

**Context:** `RateLimitEntry.id` is `@default(cuid())` in `schema.prisma`, but that is a **client-side** Prisma transformation, not a PostgreSQL column default (the init migration shows `"id" TEXT NOT NULL` with no `DEFAULT`). The locked rate-limit SQL is raw `$queryRaw`, which bypasses Prisma's client — the INSERT failed with SQLSTATE 23502 (NOT NULL violation).

**Decision:** `import cuid from "cuid"` and supply the same cuid the query would otherwise generate in the raw `INSERT`. Correctness and atomicity come from the `(key, windowStart)` unique constraint, not the id.
**Source:** `src/lib/rate-limit/index.ts:12-18` (comment), `:64`.

### Decision 2 — Epoch-integer comparisons and explicit UTC writes in raw SQL, never JS `Date`

**Context:** Prisma's raw-parameter serializer shifts a JS `Date` by the database session's timezone (observed +1 h on a UTC+1 session), while Prisma writes column timestamps as UTC-naive. Comparing a shifted `Date` against the column corrupts expiry inequalities and window boundaries.

**Decision:** Compare expiry as integers (`EXTRACT(EPOCH FROM col) * 1000 > nowMs`) and write `windowStart` with `(to_timestamp(epochMs / 1000) AT TIME ZONE 'UTC')`; `consumedAt` is written `(NOW() AT TIME ZONE 'UTC')`.
**Source:** `verify/route.ts:77-84`, `reset-password/route.ts:44-53`, `rate-limit/index.ts:54-62`.

### Decision 3 — Concurrent-verify idempotency via a secondary read after a 0-row UPDATE

**Context:** Two concurrent requests with the same correct code both run the atomic UPDATE; one wins, the other sees `consumedCount = 0`. Answering the loser with an error is wrong — the email is being verified right now by the winner.

**Decision:** When `consumedCount === 0`, read back the code row; if it was recently consumed and unexpired, or the user is now `emailVerified`, return success. Otherwise answer with the single generic invalid-code 400.
**Source:** `verify/route.ts:94-126`.

### Decision 4 — DM Sans self-hosted via `next/font/google`, not the raw Google `@import`

**Context:** The Figma-generated token file ships `@import url('https://fonts.googleapis.com/...')`. A runtime third-party font request on the reset-password page could leak the `?token=` value via the Referer header and violates the "zero third-party resources before token validation" rule (AGENTS.md §3.2/§3.4, PRD 5.4).

**Decision:** Load `DM_Sans` in the root layout via `next/font/google` (fetched at build time, self-hosted); strip the `@import` line from `tokens.css`.
**Source:** `src/app/layout.tsx:2-11`, `src/styles/tokens.css` header note.

### Decision 5 — Sliding-expiry write suppression (extend only when the gain exceeds 1 hour)

**Context:** `validateSession` runs on every authenticated request; writing `expiresAt` to Postgres each time is excessive for active users.

**Decision:** Update only when `newExpiresAt - currentExpiresAt > 1 hour`; otherwise return the stored value unchanged. The 30-day absolute cap is always enforced regardless.
**Source:** `src/lib/auth/index.ts:80-87`.

### Decision 6 — Test files run sequentially (`fileParallelism: false`), intra-file concurrency kept

**Context:** All integration tests share one PostgreSQL database and each file wipes all tables in `beforeEach`. Parallel files would let one file's wipe delete another's fixtures mid-test.

**Decision:** `fileParallelism: false` in `vitest.config.ts`. Intra-file concurrency (`runConcurrently` → `Promise.all`) still exercises the real race conditions.
**Source:** `vitest.config.ts:20`.

### Decision 7 — Sign-in "attempt budget" consumed on failed credentials only

**Context:** The 5/15-min email+IP sign-in limit must protect against brute force without locking out a legitimate user who signs in several times in quick succession.

**Decision:** The per-pair attempt counter increments only on a failed credential check (unknown email or wrong password), never on success — and with the identical generic 401 body in both failure paths so the budget behaviour cannot reveal email existence.
**Source:** `signin/route.ts:16-26, 68-88`; tested by "does not consume the attempt budget on successful sign-ins".

### Decision 8 — Cookie `secure` flag gated to production

**Context:** `AGENTS.md` §2.2 fixes `secure: true`. Over plain-HTTP localhost development, a `secure` cookie is never stored by the browser, which breaks the whole flow in dev.

**Decision:** `secure: process.env.NODE_ENV === "production"` in `setSessionCookie`. `httpOnly`, `sameSite: "lax"`, `path: "/"`, and the opaque-value rule are unconditional. Flagged as a deviation in §7 (Problem 5); revisit if PRD ruling is stricter than this build intended.

---

## Section 7: Problems and Limitations

### Problem 1 — PRD deviation: duplicate email returns 400, not the PRD's generic 200

**What the PRD/AGENTS.md requires:** a duplicate signup email must return the *same generic 200* as a new email (anti-enumeration, AGENTS.md §3.1/§3.6).

**What the code does:** `signup/route.ts:99-103` catches Prisma `P2002` on the email field and returns `400 {"error":"An account with this email already exists."}`.

**Documented at:** `signup/route.ts:10-14` and `:87-103`; asserted by `tests/signup.idempotency.test.ts`.

**Risk:** an attacker can learn whether an email is registered from the 200 vs 400 status difference. Accepted and documented team decision for this build; the observable fold back to the generic response if the threat model tightens.

### Problem 2 — Prisma raw-SQL timezone-offset bug (fixed)

**Symptom:** binding a JS `Date` into raw SQL via Prisma shoves the value by the database session's `TimeZone` (observed +1 h in UTC+1). Prisma writes column timestamps UTC-naive, so the two disagree and corrupt expiry/window comparisons.

**Affected areas:** rate limiter `windowStart`, verify `expiresAt` check, reset-password `expiresAt` check.

**Fix:** epoch-integer comparisons (`EXTRACT(EPOCH FROM col) * 1000`) and explicit-UTC writes (`to_timestamp(ms/1000) AT TIME ZONE 'UTC'`, `NOW() AT TIME ZONE 'UTC'`).

**Residual:** rate-limit buckets created before the fix in a non-UTC session carry a shifted `windowStart`; they age out via the 24-hour cleanup.

### Problem 3 — `/verify` page is a Phase 0 placeholder

The route exists and tests cover the API, but `src/app/(auth)/verify/page.tsx` renders a static "Verification screen — coming in Phase 2." message — there is **no UI** to enter the code. A user who signs up receives a console-logged code with no screen to submit it. **TODO:** build the verification form (the API and tests are complete).

### Problem 4 — Next 16 deprecates the `middleware` file convention

`next build` emits: `The "middleware" file convention is deprecated. Please use "proxy" instead.` The file also only free-passes. **TODO:** decide whether to migrate to the `proxy` convention and/or implement the actual cookie presence check there. (Per AGENTS.md §4.1 any heavy/session work stays out of middleware; only a lightweight guard may live there.)

### Problem 5 — Cookie `secure` is production-only, vs. the lock-step `secure: true`

`src/lib/auth/index.ts:34` sets `secure: process.env.NODE_ENV === "production"`. Over HTTP in dev the secure cookie would be dropped by browsers, so this is a pragmatic deviation from AGENTS.md §2.2's fixed `secure: true`. **Production behavior is verified** (see §8.7): a `next start` (production) sign-in emits `…; Secure; HttpOnly; SameSite=lax`. The only open remainder is a maintainer sign-off that the dev-mode insecure cookie is an acceptable, documented deviation.

### Problem 6 — Stray root-level `tokens.css` (resolved)

A tracked copy of the token export previously sat at the repo root (`./tokens.css`) and still contained the banned `@import url('https://fonts.googleapis.com/...')` (AGENTS.md §3.4). It was never imported by the app — the only import is `@/styles/tokens.css` in the root layout — so it was a pure copy-paste hazard. **Resolved:** removed from the working tree on 2026-09-07; the build, typecheck, lint, and all 22 tests still pass without it.

### Limitation 1 — Email delivery is console-only

`src/lib/email/index.ts` implements `EmailService` with `console.log` only. The interface is swappable (replace the two methods with a provider SDK without touching call sites), but no real provider (SendGrid/Resend/SES) is integrated, per AGENTS.md §2.7. Manual verification therefore requires reading the dev server's stdout.

### Limitation 2 — Middleware is a pass-through

`src/middleware.ts` matches `/dashboard/:path*` and returns `NextResponse.next()` unconditionally. Dashboard protection relies entirely on the server component (`getCurrentUser()` + redirect). There is no edge-level redirect.

### Limitation 3 — No email-verification gate on sign-in

`signin/route.ts` never checks `emailVerified`. An unverified user can sign in and reach the dashboard. `emailVerified` is stored and returned in session data but is not enforced as an access condition anywhere.

### Limitation 4 — No session-revocation UI

Sign-in always creates a new `Session` row (multi-session by design) and `SignOutButton` signs out only the current session. There is no UI to list or revoke other active sessions.

### Limitation 5 — Fixed-window rate-limit boundary burst

Windows align to `floor(now / window) * window`, so a client can fire `limit` requests at the end of one window and another `limit` at the start of the next — effectively doubling throughput at the boundary. Accepted trade-off; no sliding window or token bucket is planned for this build.

### Limitation 6 — No cleanup job for abandoned unverified accounts

Per PRD Section 14's stated default assumption, no job prunes unverified accounts. The `RateLimitEntry` 24-hour cleanup is the only scheduled/opportunistic deletion in the system.

### Observation — `opencode-ai` dependency placement (resolved)

`opencode-ai ^1.18.29` was previously listed under runtime `dependencies` although nothing in the application imports it (it is a CLI tool with a `bin`). **Resolved:** moved to `devDependencies` in both `package.json` and `package-lock.json` via `npm install --legacy-peer-deps` (the pre-existing `vitest@5` ↔ `@types/node@^20` peer conflict requires that flag for fresh resolution in this repo). Build, typecheck, lint, and tests unchanged.

---

## Section 8: Evidence

All evidence below was captured on this working tree on **2026-09-07**: against the pre-existing dev server on localhost:3000, and against a **freshly started, controlled** production instance (`npm run start -- -p 3001`) whose stdout was captured to a log file. Both use the same local PostgreSQL referenced by `.env`. The pre-existing port-3000 process was never touched.

### 8.1 Build, typecheck, lint

| Check | Command | Result |
|---|---|---|
| TypeScript strict | `npx tsc --noEmit` | Passed — zero errors |
| ESLint | `npm run lint` | Passed — zero errors |
| Production build | `npm run build` | Succeeded — `next build` compiled, ran TS, generated 18 pages; only warnings are the middleware-deprecation and an out-of-repo `package-lock.json` note |

### 8.2 Test suite (real PostgreSQL)

`npm test` → **4 files, 22 tests, 22 passed** (Vitest 5). Each file wipes all tables in FK order in `beforeEach`; `fileParallelism: false`.

| File | Coverage | Key assertions (all reproducible in the repo) |
|---|---|---|
| `signup.idempotency.test.ts` | signup | duplicate email → exactly 1 user + 1 code; concurrent duplicates → exactly 1 winner; 5/hr/IP burst → 6th request `429` + `Retry-After` |
| `signin.idempotency.test.ts` | signin/sessions | 3 concurrent sign-ins → 3 distinct valid sessions; wrong password → 401, no session row; 5/15-min failed-only budget → 429; successful logins do not consume the budget |
| `verify.idempotency.test.ts` | verify + resend | repeat/concurrent correct code → all 200, code consumed once; wrong code vs unknown email → identical 400 bodies; already-verified → 200 idempotent; 10/15-min verify → 429; resend → ≤1 active code; 60 s cooldown → 429; 5/hr resend → 429; identical generic bodies for verified/unverified/unknown |
| `reset-password.idempotency.test.ts` | reset + forgot | repeated token → 200 then 400, password = first value only; concurrent resets → `[200, 400]`, exactly one value stored; reset deletes all sessions; concurrent forgot → exactly 1 active token; identical responses for known/unknown email |

### 8.3 Live curl evidence (dev server, real responses)

Signup, new email — **HTTP 200**:
```
{"success":true,"message":"If your email is eligible, your account has been created."}
```

Duplicate signup — **HTTP 400** (documented deviation):
```
{"error":"An account with this email already exists."}
```

Forgot-password, unknown email `nobody@example.com` — **HTTP 200**; forgot-password, known email `evidence.user@example.com` — **HTTP 200**, byte-identical body (anti-enumeration):
```
{"success":true,"message":"If an account exists with that email, a password reset link has been sent."}
```

Verify with a wrong code — **HTTP 400**:
```
{"error":"Invalid or expired verification code."}
```

Signin with a wrong password — **HTTP 401**:
```
{"error":"Invalid email or password."}
```

Reset-password with an invalid token — **HTTP 400**:
```
{"error":"This password reset link is invalid, expired, or has already been used. Please request a new one."}
```

Valid signin — **HTTP 200**:
```
{"success":true,"user":{"id":"cmtra335o0000p9j015yik7f4","name":"Evidence User","email":"evidence.user@example.com"}}
```

Rate limit — 6th signup from the same IP within the hour → **HTTP 429** with `retry-after` header (value `1714` seconds remaining in the window at capture time):
```
HTTP/1.1 429 Too Many Requests
...
retry-after: 1714

{"error":"Too many requests. Please try again later."}
```

### 8.4 Database evidence (read directly from PostgreSQL)

Record for `evidence.user@example.com`:

| Field | Observed value |
|---|---|
| `User.passwordHash` | `$argon2id$v=19$m=19456,p=1,t=2$eCmtDlF8/pPEfmpsEpmP8A$fJdJFahh8JTLCgpGm5NgkTU72IabKhagtdAfwC3/xUU` — Argon2id, locked params, never plaintext |
| `User.emailVerified` | `false` |
| `VerificationCode.codeHash` | prefix `61e0ecc26c82…`, `consumedAt: null` — raw code never stored |
| `PasswordResetToken.tokenHash` | prefix `9ff6bbe874c5…`, `consumedAt: null` — raw token never stored |
| `Session.expiresAt` | `2026-09-14T13:31:00.550Z` for a 2026-09-07 sign-in — **7-day sliding expiry confirmed** |

### 8.5 `Retry-After` and expiry cases

- **429 + Retry-After:** proven live (8.3) and by the 6 rate-limit tests.
- **Expired-code/token rejection by the API, not just the UI:** proven by the route handlers' `EXTRACT(EPOCH FROM "expiresAt") * 1000 > nowMs` clauses and by the single-use/concurrency tests. A before/after DB read of an *expired-but-unconsumed* code was also captured on the fresh controlled instance — see §8.7.

### 8.6 Manual curl commands for re-verification

```bash
# Sign up
curl -s -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Sign in (save cookie)
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Dashboard (authenticated)
curl -s -b cookies.txt http://localhost:3000/dashboard

# Sign out (server-side session deletion)
curl -s -b cookies.txt -X POST http://localhost:3000/api/auth/signout
```

### 8.7 Fresh controlled-server evidence (port 3001, `next start`)

A new instance was started on **port 3001** with stdout+stderr captured to a log file (the port-3000 process was left running but unused for these captures). `RateLimitEntry` was cleared first so budgets started at zero.

**Email console output** (item: email console-log capture) — captured verbatim from the fresh server's log:

```
[email] Verification code requested for: fresh.134332633155647838@example.com
[email] Verification code: 498491
[email] Password reset requested for: fresh.134332633155647838@example.com
[email] Reset link: http://localhost:3001/reset-password?token=<redacted>
```

The raw reset token was redacted above (AGENTS.md §3.2). The code is 6 digits; the token is a 43-char base64url (32 bytes).

**Expired-code rejection with before/after DB state** (item: expired verification code) — a user + verification code row for raw code `424242` was inserted directly via Prisma with `expiresAt` **already in the past**:

```
BEFORE  code row: codeHash=1a34119f4fb460ddebe511f8edefe4cb9b93c060526b042f8f903ca980ca9547
                  expiresAt=2026-09-07T14:01:36.175Z  consumedAt=null
        user:     emailVerified=false

POST /api/auth/verify {email, code:"424242"}  →  HTTP 400
        {"error":"Invalid or expired verification code."}

AFTER   code row: codeHash=1a34119f4fb460ddebe511f8edefe4cb9b93c060526b042f8f903ca980ca9547
                  expiresAt=2026-09-07T14:01:36.175Z  consumedAt=null   (unchanged)
        user:     emailVerified=false
```

The API (not the UI) rejected the expired code, and the row was **not** consumed/mutated — it remains unconsumed and `emailVerified` stays false. This is the required before/after database evidence.

**Production-mode cookie** (item: secure cookie configuration) — sign-in on the fresh `next start` instance returned this `Set-Cookie` (NODE_ENV=production in `next start`):

```
set-cookie: session_id=cmtrb9psy0006p9j0bzkga4lh; Path=/; Expires=Mon, 14 Sep 2026 14:03:33 GMT; Secure; HttpOnly; SameSite=lax
```

Confirms: opaque `session_id` value only, `Secure` + `HttpOnly` + `SameSite=lax`, and a `Expires` 7 days after the 2026-09-07 sign-in (7-day sliding expiry, in production mode).

### 8.8 TODO — verify before submission (`/verify` UI and open decisions only)

- **`/verify` UI:** not yet built (Problem 3) — the API and tests are complete; the screen itself still needs implementation and validation.
- **Middleware/proxy decision:** confirm deprecation handling (Problem 4) — the build warning is real; no migration performed, awaiting a decision.
- **Cookie `secure` dev-mode deviation:** the production (`Secure`) behavior is now verified in §8.7; the only remainder is a maintainer sign-off that the dev-mode (NODE_ENV=development over HTTP) insecure flag is acceptable (Problem 5).

Resolved items (no longer TODO): email console-log capture and expired-code DB rejection (both now covered by §8.7); root `tokens.css` removed (Problem 6); `opencode-ai` moved to `devDependencies` (Observation).

### 8.9 Key files cross-reference

| Concept | Source file |
|---|---|
| Session create/validate/invalidate, cookie helpers | `src/lib/auth/index.ts` |
| Argon2id hashing | `src/lib/crypto/password.ts` |
| SHA-256 + pepper hashing | `src/lib/crypto/token.ts` |
| Rate limiting (atomic raw SQL) | `src/lib/rate-limit/index.ts` |
| Zod schemas (single source) | `src/lib/validation/index.ts` |
| Email interface (console-only) | `src/lib/email/index.ts` |
| Prisma singleton | `src/lib/db/index.ts` |
| Schema (locked) | `prisma/schema.prisma` |
| Partial unique indexes | `prisma/migrations/20260906155448_add_partial_indexes/migration.sql` |
| PRD deviation (signup 400) | `src/app/api/auth/signup/route.ts:10-14, 87-103` |
| Atomic token consumption / session invalidation | `src/app/api/auth/reset-password/route.ts:55-61, 85-93` |
| Concurrent-verify idempotency | `src/app/api/auth/verify/route.ts:94-126` |
| Referrer-Policy: no-referrer | `src/app/(auth)/reset-password/page.tsx:10` |
| Token stripped from URL | `src/app/(auth)/reset-password/ResetPasswordForm.tsx:79` |
| Repro tests | `tests/*.idempotency.test.ts` |