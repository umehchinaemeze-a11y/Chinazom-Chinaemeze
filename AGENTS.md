# AGENTS.md — Standalone Authentication System

This file tells you, the coding agent, **how to behave** while building this project. It is not the spec. The spec is the PRD. Read the PRD for *what* to build and *why*. Read this file for *how you are allowed to build it*.

If anything in this file conflicts with the PRD, stop and flag it — do not silently pick one. If a task description conflicts with this file, this file wins.

---

## 1. What Is This Project

This is a **standalone authentication system** — six screens (create account, sign in, forgot password, reset password, email verification, placeholder dashboard) built to prove that a production-grade auth flow works end to end, with evidence. It is infrastructure, not a monetized product, and it is not a feature-complete app.

- **Users:** a New User (signs up, verifies, reaches the dashboard) and a Returning User (signs in, occasionally resets a password). There is no admin role.
- **Version being built:** the single build described in the PRD's Phased Roadmap (Section 13), Phases 0 through 8. There is no v2, no future-phase work, no "while I'm in here" additions.
- **Source of truth:** `PRD: Standalone Authentication System — Revision 2` (post structured review). Every rule below cites the PRD section it comes from. If you find a gap between this file and the PRD, the PRD is the spec and this file is how you execute it — but you still follow this file's constraints on *behavior* while you close that gap.

---

## 2. What Is Locked

Everything in this section has already been decided by the team. **You do not change, swap, upgrade, or "improve" any of it — even if you believe an alternative is objectively better.** If you think something here is wrong, say so in a comment or PR note; do not silently substitute your own choice.

### 2.1 Stack
- **Framework:** Next.js, App Router only (no Pages Router).
- **Language:** TypeScript, strict mode, everywhere. No `.js` application files.
- **ORM:** Prisma. No other ORM or raw query builder, except the specific raw SQL called out below.
- **Database:** PostgreSQL. No other database engine, no in-memory fallback for anything that must persist (sessions, codes, tokens, rate limit counters).

### 2.2 Session strategy — locked
- Sessions are **database-backed**, referenced by an httpOnly cookie. **JWTs are explicitly rejected** for this build (PRD 7.3) because sign-out and reset-triggered logout require immediate server-side revocation. Do not introduce a JWT, a signed cookie carrying claims, or any stateless token scheme.
- Cookie configuration is fixed (PRD 7.3):
  - name: `session_id`
  - `httpOnly: true`, `secure: true`, `sameSite: lax`, `path: /`
  - sliding expiry: 7 days, extended on each authenticated request
  - **absolute cap: 30 days from `createdAt`**, regardless of activity — this is a hard ceiling on the sliding expiry above, not optional
- The cookie carries **only an opaque session id**. Never put a user id, role, or expiry claim inside it.

### 2.3 Password and secret hashing — locked
- Passwords: **Argon2id only**. No bcrypt, scrypt, PBKDF2, or general-purpose hash (SHA-*, MD5) for passwords, ever.
- Fixed parameters (PRD 7.4): memory cost 19 MiB (19456 KiB), 2 iterations, parallelism 1. These are named constants, not a "hit under 250ms" tuning target you compute at runtime.
- Verification codes and password reset tokens: hashed with a **fast deterministic hash (SHA-256 + server-side pepper)** — deliberately *not* Argon2id (PRD 7.4). Do not "harmonize" this with the password hasher. These are two separate, intentionally different mechanisms.

### 2.4 Validation — locked
- **Zod** is the schema library. All validation rules are declared **once**, in a single shared module, imported by both API route handlers and client-side form components (PRD 7.2). No hand-rolled `if` chains for validation, no duplicate rule definitions in a second place.

### 2.5 Styling and design tokens — locked
- **Tailwind CSS**, plain semantic HTML. (PRD 7.9 / 14 flags the styling library as revisitable later, but for *this* build it is fixed. Do not introduce a component library, CSS-in-JS, or a different utility framework.)
- **Design tokens are locked to the file below (`tokens.css`)**, generated from the Figma design-tokens export. This is the single source of truth for every color, spacing value, and typographic style in the UI. Do not hardcode a hex color, a `px` spacing value, or a font-size/weight/line-height/letter-spacing in component code when an equivalent token already exists — reference the CSS variable instead.
- The font is **DM Sans**, weights 400/500/600/900. Do not add a second font or swap this one. **However, do not ship the `@import url('https://fonts.googleapis.com/...')` line as written below.** That line makes a runtime request to a third-party domain on every page load — including the reset-password page, which Section 3.2 (PRD 5.4) requires to load zero third-party resources before the token is validated. Load DM Sans with `next/font/google` instead: it fetches the same font at build time and self-hosts it from your own domain, so no page ever makes a third-party font request. Strip the `@import` line out of `tokens.css` before using the file; keep only the `:root` variable block. This constraint is not in the PRD — it exists because the token file as generated conflicts with an existing hard rule (3.2/5.4), and self-hosting removes the conflict at zero visual cost.
- Token layers are intentional and must stay separate:
  - **Primitives** (`--primitive-*`) are raw palette/scale values. Components must never reference a primitive variable directly.
  - **Roles** (`--color-*`, `--spacing-*`, `--typography-*`) are the resolved, semantic aliases (e.g., `--color-primary`, `--color-on-primary-container`, `--color-error`, `--spacing-md`). Components and Tailwind utilities reference **roles only**, never primitives.
  - This indirection is what lets the palette be re-themed later by editing the tokens file, not by hunting through component code. Reaching past a role straight to a primitive defeats the point of having roles at all.
- Only the light-mode value set below exists. There is no dark-theme token set — do not invent one. Names like `--color-inverse-surface` and `--color-surface-dim` are roles used *within* this single theme, not a hint to build a second theme.

```css
/*
 * tokens.css
 * Auto-converted from design-tokens.tokens.json
 *
 * Sections:
 *   1. Effects (shadows)
 *   2. Primitive colour palettes
 *   3. Colour roles  (aliases resolved to their primitive values)
 *   4. Spacing roles
 *   5. Typography
 *
 * Colour values: 8-digit Figma hex (#rrggbbaa) converted to
 * standard 6-digit hex where alpha is fully opaque (ff),
 * or rgba() where alpha is not ff.
 */

@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;900&display=swap');

:root {

  /* ============================================================
     1. EFFECTS — DROP SHADOWS
     ============================================================ */

  --effect-hard-shadow:   4px 6px 8px rgba(0, 0, 0, 0.32);
  --effect-medium-shadow: 2px 4px 6px rgba(0, 0, 0, 0.28);
  --effect-soft-shadow:   2px 2px 20px rgba(0, 0, 0, 0.12);


  /* ============================================================
     2. PRIMITIVE COLOURS
     ============================================================ */

  /* — Key colours — */
  --primitive-primary-key-color:         #3416f6;
  --primitive-secondary-key-color:       #2308ce;
  --primitive-tertiary-key-color:        #614af8;
  --primitive-neutral-key-color:         #14131a;
  --primitive-neutral-variant-key-color: #333239;
  --primitive-error-key-color:           #df0013;

  /* — Primary palette — */
  --primitive-primary-0:   #000000;
  --primitive-primary-10:  #080231;
  --primitive-primary-20:  #100462;
  --primitive-primary-30:  #180594;
  --primitive-primary-40:  #2107c5;
  --primitive-primary-50:  #2909f6;
  --primitive-primary-60:  #543af8;
  --primitive-primary-70:  #7e6bfa;
  --primitive-primary-80:  #a99dfb;
  --primitive-primary-90:  #d4cefd;
  --primitive-primary-95:  #f2f2f2;
  --primitive-primary-98:  #fafafa;
  --primitive-primary-99:  #fcfcfc;
  --primitive-primary-100: #ffffff;

  /* — Secondary palette — */
  --primitive-secondary-0:   #000000;
  --primitive-secondary-10:  #080231;
  --primitive-secondary-20:  #110462;
  --primitive-secondary-30:  #190693;
  --primitive-secondary-40:  #2108c4;
  --primitive-secondary-50:  #2a0af5;
  --primitive-secondary-60:  #543bf7;
  --primitive-secondary-70:  #7f6cf9;
  --primitive-secondary-80:  #aa9dfb;
  --primitive-secondary-90:  #d4cefd;
  --primitive-secondary-95:  #eae6fe;
  --primitive-secondary-98:  #eae6fe;
  --primitive-secondary-99:  #fbfaff;
  --primitive-secondary-100: #ffffff;

  /* — Tertiary palette — */
  --primitive-tertiary-0:   #000000;
  --primitive-tertiary-10:  #080231;
  --primitive-tertiary-20:  #100462;
  --primitive-tertiary-30:  #180594;
  --primitive-tertiary-40:  #2108c4;
  --primitive-tertiary-50:  #2909f6;
  --primitive-tertiary-60:  #543bf7;
  --primitive-tertiary-70:  #7e6cf9;
  --primitive-tertiary-80:  #a99dfb;
  --primitive-tertiary-90:  #d4cefd;
  --primitive-tertiary-95:  #eae6fe;
  --primitive-tertiary-98:  #f6f5ff;
  --primitive-tertiary-99:  #fbfaff;
  --primitive-tertiary-100: #ffffff;

  /* — Neutral palette — */
  --primitive-neutral-0:   #000000;
  --primitive-neutral-10:  #17161d;
  --primitive-neutral-20:  #2d2b3b;
  --primitive-neutral-30:  #444158;
  --primitive-neutral-40:  #5b5775;
  --primitive-neutral-50:  #716c93;
  --primitive-neutral-60:  #8e8aa8;
  --primitive-neutral-70:  #aaa7be;
  --primitive-neutral-80:  #c6c4d4;
  --primitive-neutral-90:  #e3e2e9;
  --primitive-neutral-95:  #f1f0f4;
  --primitive-neutral-98:  #f9f9fb;
  --primitive-neutral-99:  #fcfcfd;
  --primitive-neutral-100: #ffffff;

  /* — Neutral variant palette — */
  --primitive-neutral-variant-0:   #000000;
  --primitive-neutral-variant-10:  #18181b;
  --primitive-neutral-variant-20:  #302f37;
  --primitive-neutral-variant-30:  #494752;
  --primitive-neutral-variant-40:  #615f6d;
  --primitive-neutral-variant-50:  #797788;
  --primitive-neutral-variant-60:  #9492a0;
  --primitive-neutral-variant-70:  #afadb8;
  --primitive-neutral-variant-80:  #c9c8d0;
  --primitive-neutral-variant-90:  #e4e4e7;
  --primitive-neutral-variant-95:  #f2f1f3;
  --primitive-neutral-variant-98:  #fafafa;
  --primitive-neutral-variant-99:  #fcfcfd;
  --primitive-neutral-variant-100: #ffffff;

  /* — Error palette — */
  --primitive-error-0:   #000000;
  --primitive-error-10:  #330004;
  --primitive-error-20:  #660008;
  --primitive-error-30:  #99000d;
  --primitive-error-40:  #cc0011;
  --primitive-error-50:  #ff0015;
  --primitive-error-60:  #ff3344;
  --primitive-error-70:  #ff6673;
  --primitive-error-80:  #ff3344;
  --primitive-error-90:  #ffccd0;
  --primitive-error-95:  #f2f2f2;
  --primitive-error-98:  #fafafa;
  --primitive-error-99:  #fcfcfc;
  --primitive-error-100: #ffffff;


  /* ============================================================
     3. COLOUR ROLES  (aliases resolved)
     ============================================================ */

  /* Primary */
  --color-primary:                #3416f6;
  --color-on-primary:             #ffffff;
  --color-primary-container:      #d4cefd;
  --color-on-primary-container:   #180594;

  /* Secondary */
  --color-secondary:              #2108c4;
  --color-on-secondary:           #ffffff;
  --color-secondary-container:    #d4cefd;
  --color-on-secondary-container: #190693;

  /* Tertiary */
  --color-tertiary:               #2108c4;
  --color-on-tertiary:            #ffffff;
  --color-tertiary-container:     #d4cefd;
  --color-on-tertiary-container:  #180594;

  /* Surface */
  --color-surface:                    #f9f9fb;
  --color-on-surface:                 #17161d;
  --color-surface-variant:            #e4e4e7;
  --color-on-surface-variant:         #494752;
  --color-surface-container-highest:  #e3e2e9;
  --color-surface-container-high:     #e3e2e9;
  --color-surface-container:          #f2f2f2;
  --color-surface-container-low:      #f1f0f4;
  --color-surface-container-lowest:   #ffffff;
  --color-surface-tint:               #2107c5;
  --color-surface-tint-color:         #2107c5;
  --color-surface-bright:             #f9f9fb;
  --color-surface-dim:                #a99dfb;

  /* Inverse */
  --color-inverse-surface:    #2d2b3b;
  --color-inverse-on-surface: #f1f0f4;
  --color-inverse-primary:    #a99dfb;

  /* Outline */
  --color-outline:         #797788;
  --color-outline-variant: #c9c8d0;

  /* Error */
  --color-error:              #cc0011;
  --color-on-error:           #ffffff;
  --color-error-container:    #ffccd0;
  --color-on-error-container: #99000d;

  /* Background */
  --color-background:    #f9f9fb;
  --color-on-background: #17161d;

  /* Misc */
  --color-scrim:  #000000;
  --color-shadow: #000000;

  /* Fixed variants */
  --color-primary-fixed:            #d4cefd;
  --color-on-primary-fixed:         #080231;
  --color-primary-fixed-dim:        #a99dfb;
  --color-on-primary-fixed-variant: #180594;

  --color-secondary-fixed:            #d4cefd;
  --color-on-secondary-fixed:         #080231;
  --color-secondary-fixed-dim:        #aa9dfb;
  --color-on-secondary-fixed-variant: #190693;

  --color-tertiary-fixed:            #d4cefd;
  --color-on-tertiary-fixed:         #080231;
  --color-tertiary-fixed-dim:        #a99dfb;
  --color-on-tertiary-fixed-variant: #180594;


  /* ============================================================
     4. SPACING ROLES
     ============================================================ */

  --spacing-none: 0px;
  --spacing-xs:   4px;
  --spacing-sm:   8px;
  --spacing-md:   12px;
  --spacing-base: 16px;
  --spacing-lg:   20px;
  --spacing-xl:   24px;
  --spacing-2xl:  32px;


  /* ============================================================
     5. TYPOGRAPHY
     ============================================================ */

  /* Shared font family */
  --font-family: 'DM Sans', sans-serif;

  /* — Display — */
  --typography-display-large-font-size:      64px;
  --typography-display-large-font-weight:    900;
  --typography-display-large-line-height:    96px;
  --typography-display-large-letter-spacing: -4px;

  --typography-display-medium-font-size:      50px;
  --typography-display-medium-font-weight:    900;
  --typography-display-medium-line-height:    75px;
  --typography-display-medium-letter-spacing: -3px;

  --typography-display-small-font-size:      40px;
  --typography-display-small-font-weight:    900;
  --typography-display-small-line-height:    60px;
  --typography-display-small-letter-spacing: -5px;

  /* — Headline — */
  --typography-headline-large-font-size:      32px;
  --typography-headline-large-font-weight:    500;
  --typography-headline-large-line-height:    48px;
  --typography-headline-large-letter-spacing: -1px;

  --typography-headline-medium-font-size:      28px;
  --typography-headline-medium-font-weight:    500;
  --typography-headline-medium-line-height:    42px;
  --typography-headline-medium-letter-spacing: -1px;

  --typography-headline-small-font-size:      24px;
  --typography-headline-small-font-weight:    500;
  --typography-headline-small-line-height:    36px;
  --typography-headline-small-letter-spacing: -1px;

  /* — Title — */
  --typography-title-large-font-size:      22px;
  --typography-title-large-font-weight:    500;
  --typography-title-large-line-height:    33px;
  --typography-title-large-letter-spacing: -1px;

  --typography-title-medium-font-size:      16px;
  --typography-title-medium-font-weight:    600;
  --typography-title-medium-line-height:    24px;
  --typography-title-medium-letter-spacing: -0.85px;

  --typography-title-small-font-size:      14px;
  --typography-title-small-font-weight:    600;
  --typography-title-small-line-height:    21px;
  --typography-title-small-letter-spacing: -0.75px;

  /* — Body — */
  --typography-body-large-font-size:      16px;
  --typography-body-large-font-weight:    500;
  --typography-body-large-line-height:    24px;
  --typography-body-large-letter-spacing: -0.8px;

  --typography-body-medium-font-size:      14px;
  --typography-body-medium-font-weight:    500;
  --typography-body-medium-line-height:    21px;
  --typography-body-medium-letter-spacing: -0.75px;

  --typography-body-small-font-size:      12px;
  --typography-body-small-font-weight:    500;
  --typography-body-small-line-height:    18px;
  --typography-body-small-letter-spacing: -0.75px;

  /* — Label — */
  --typography-label-large-font-size:      14px;
  --typography-label-large-font-weight:    500;
  --typography-label-large-line-height:    21px;
  --typography-label-large-letter-spacing: -0.9px;

  --typography-label-medium-font-size:      12px;
  --typography-label-medium-font-weight:    500;
  --typography-label-medium-line-height:    18px;
  --typography-label-medium-letter-spacing: -0.9px;

  --typography-label-small-font-size:      11px;
  --typography-label-small-font-weight:    500;
  --typography-label-small-line-height:    16.5px;
  --typography-label-small-letter-spacing: -0.8px;

}
```

Place this file at `/src/styles/tokens.css` (Section 4) and import it once, globally, from the root layout — do not re-import it per page or per component. Wire Tailwind's theme (`tailwind.config.ts`) to reference these CSS variables (e.g. `colors: { primary: 'var(--color-primary)', 'on-primary': 'var(--color-on-primary)', ... }`) so that class names like `bg-primary` or `text-on-surface` resolve to the tokens above. Do not let component code call arbitrary-value Tailwind utilities with a hand-typed hex, e.g. `bg-[#3416f6]` — if you find yourself typing a hex code or a raw pixel number into a component, stop and use the token instead.

### 2.6 Rate limiting — locked mechanism and locked numbers
- Backed by a Postgres `RateLimitEntry` table, fixed-window counter, incremented via a **single atomic raw SQL statement** (PRD 7.1):
  ```sql
  INSERT INTO "RateLimitEntry" (key, "windowStart", count)
  VALUES ($1, $2, 1)
  ON CONFLICT (key, "windowStart")
  DO UPDATE SET count = "RateLimitEntry".count + 1
  RETURNING count;
  ```
  Do not implement this as a Prisma `findFirst` + `update` pair. That is a read-then-write race and is explicitly called out in the PRD as the wrong approach.
- No Redis, no sliding window, no token bucket for this build. The fixed-window trade-off is accepted and documented (PRD 7.1, 9). Do not "upgrade" the algorithm on your own initiative.
- Exact thresholds (PRD 7.1) — implement precisely, not approximately:

  | Endpoint | Limit | Key | Window |
  |---|---|---|---|
  | `POST /api/auth/signup` | 5 requests | IP address | 1 hour |
  | `POST /api/auth/signin` | 5 attempts | email + IP pair | 15 minutes |
  | `POST /api/auth/signin` | 20 requests | IP address only | 15 minutes |
  | `POST /api/auth/forgot-password` | 3 requests | normalized email | 1 hour |
  | `POST /api/auth/forgot-password` | 20 requests | IP address only | 15 minutes |
  | `POST /api/auth/verify/resend` | 5 requests + 60s cooldown between any two | account id | 1 hour cap / 60s cooldown |
  | `POST /api/auth/verify` | 10 attempts | account id | 15 minutes |

- All limit responses: `429` with a `Retry-After` header.
- `RateLimitEntry` rows older than 24 hours must be cleaned up (scheduled job or opportunistic delete on write) (PRD 7.1). Do not let this table grow unbounded.

### 2.7 Email delivery — locked for this build
- Console-logged only, behind a swappable interface (PRD 12, 14). **Do not integrate a real email provider** (SendGrid, Resend, SES, etc.) unless explicitly instructed. Build the interface so a real provider *could* be swapped in later, but do not do the swap.

### 2.8 Database schema — locked
This is the schema. Implement it exactly — field names, types, defaults, relations, and indexes as written. Do not rename fields, change types, drop indexes, or "normalize further."

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

  @@index([userId, codeHash])
}

model PasswordResetToken {
  id          String    @id @default(cuid())
  userId      String
  tokenHash   String
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, tokenHash])
}

model RateLimitEntry {
  id          String   @id @default(cuid())
  key         String
  windowStart DateTime
  count       Int      @default(1)

  @@unique([key, windowStart])
}
```

Plus, added via a raw SQL migration (Prisma's schema DSL cannot express partial indexes) (PRD 7.5, 10):

```sql
CREATE UNIQUE INDEX one_active_code_per_user
ON "VerificationCode" ("userId")
WHERE "consumedAt" IS NULL;

CREATE UNIQUE INDEX one_active_token_per_user
ON "PasswordResetToken" ("userId")
WHERE "consumedAt" IS NULL;
```

Add these via `prisma migrate dev --create-only`, then hand-edit the generated SQL file. Do not attempt to force this into `schema.prisma` — it isn't supported there.

---

## 3. What Must Never Happen

Every rule below is a **hard rule**, not a preference. **Breaking any rule on this list means the task has failed, even if the code compiles, runs, and the feature appears to work.** Each rule cites the PRD section it enforces.

### 3.1 Never leak information about accounts
- Never let the signup response differ between "new email" and "email already belongs to a verified account." Both return the same generic 200 message. (PRD 5.1)
- Never let the forgot-password response reveal whether the email exists. Always the same generic 200 message. (PRD 5.3)
- Never let a sign-in failure indicate *which* field was wrong. One generic 401 message only. (PRD 5.2)
- Never let a verification-code or reset-token failure reveal whether it was wrong, already used, or expired. One generic message only. (PRD 5.4, 5.5)

### 3.2 Never store or expose secrets in plaintext
- Never store a password anywhere except as an Argon2id hash. No plaintext password in logs, error messages, database rows, or debug output, ever.
- Never store a verification code or reset token anywhere except as its hash. (PRD 7.5, 12)
- Never log the raw password-reset token. The reset page must send `Referrer-Policy: no-referrer` and load no third-party resources before the token is validated; access logs for that route must exclude or redact the token query parameter. (PRD 5.4)
- Never commit a `.env` file with real values. `.env` and `.env.local` must be in `.gitignore` from the first commit. Only `.env.example` with placeholder values may be committed. (PRD 9)

### 3.3 Never trust the client as an enforcement boundary
- Client-side validation is for user feedback only. The server must independently re-validate every field on every request, using the same shared Zod schema. (PRD 5.1, 7.2)
- Never treat a client-side countdown as expiry enforcement. Every check against a verification code or reset token must query the database's `expiresAt`/`consumedAt` columns directly, on every attempt. (PRD 7.5)
- Never rely on a client-side disabled button as the resend cooldown. The server checks the timestamp of the most recent code before issuing a new one. (PRD 5.5, 7.5)
- Never guard the dashboard on the client only. The route guard runs server-side, before any dashboard markup or data is produced. (PRD 7.8)

### 3.4 Never step outside the design token file
- Never introduce a color, spacing value, font size, weight, line height, or letter spacing that isn't defined in `tokens.css` (Section 2.5). If a screen seems to need something the tokens don't cover, flag it — do not invent a one-off hex code or pixel value inline to make progress.
- Never reference a `--primitive-*` variable from component code or Tailwind config. Only `--color-*`, `--spacing-*`, `--typography-*`, and `--effect-*` roles are valid references (Section 2.5).
- **Never ship the raw Google Fonts `@import` from the token file.** Use `next/font/google` (self-hosted at build time) instead, precisely because the raw `@import` violates 3.2/PRD 5.4 on the reset-password page. This is the single highest-priority conflict in this file between two locked pieces (design tokens vs. the reset-page security rule) — resolve it exactly this way, don't reintroduce it later by copy-pasting the token file verbatim into the project.

### 3.5 Never skip or weaken rate limiting
- All seven rate limits in Section 2.6 must be implemented — not just signin and signup. **The verification code submission endpoint and the resend endpoint are the two most commonly forgotten and are not optional.** (PRD 5.5, 7.1, 9)
- Never implement a permanent account lockout after failed logins. Rate limiting is the only permitted brute-force defense for this build — a lockout mechanism is a denial-of-service vector against the user and is explicitly rejected. (PRD 12)

### 3.6 Never let application code alone guarantee an invariant that concurrency can break
- The `User.email` uniqueness, and the "one active code/token per user" rule, must be enforced by an actual database constraint (a unique index, or the partial unique index in Section 2.8), not by an application-level check-then-insert. A duplicate signup request must be caught via the Prisma `P2002` error and answered with the same generic success response — never a second row, never a client-facing error for this case. (PRD 7.6, 7.7, 7.5)

### 3.7 Never break session integrity
- Signing in on a new device must never invalidate sessions on other devices — multiple concurrent sessions per user are allowed. (PRD 5.2)
- A successful password reset must invalidate **all** existing sessions for that user, forcing re-authentication everywhere. (PRD 5.4)
- Sign-out must delete the session row server-side. Clearing only the client-side cookie or client state is not sign-out. (PRD 5.6)
- When a session lookup fails or is expired, clear the `session_id` cookie before redirecting — never leave a dead cookie being resent on every request. (PRD 7.8)

### 3.8 Scope is locked — do not add anything from this list
No landing page, no marketing page, no dashboard content beyond the user's name and a sign-out button, no profile editing, no account settings, no social sign-in, no two-factor authentication, no admin role, no multi-tenancy, no billing or pricing logic, no AI/ML component of any kind, no cleanup job for abandoned unverified accounts. (PRD 3, 6, 8, 14) If a task seems to require one of these to "make the feature nicer," it doesn't — stop and flag it instead of building it.

### 3.9 Build order is locked — never build ahead of it
Follow the Phased Roadmap (PRD 13) in order: **Foundations → Signup → Email verification → Sign-in/Sessions → Protected routes → Forgot/Reset password → Rate limiting → Evidence collection → Dashboard.**
- **The dashboard is built last, on purpose**, so it cannot be used to avoid the harder authentication work. Never scaffold dashboard functionality before every earlier phase is complete and demonstrable.
- Never implement a rate limit, a route guard, or a security control "later" — accessibility and the controls that belong to a screen are part of that screen's own phase, not a cleanup pass at the end. (PRD 7.9, 13)

---

## 4. How Is the Work Arranged

Use this layout. Keep concerns in the module they belong to — do not let route handlers accumulate business logic that belongs in `/lib`.

```
/prisma
  schema.prisma
  /migrations              # includes the hand-edited partial-index migration

/src
  /app
    layout.tsx              # imports tokens.css once; loads DM Sans via next/font/google
    /(auth)
      /signup/page.tsx
      /signin/page.tsx
      /forgot-password/page.tsx
      /reset-password/page.tsx
      /verify/page.tsx
    /dashboard/page.tsx     # last phase — see 3.9
    /api/auth
      /signup/route.ts
      /signin/route.ts
      /signout/route.ts
      /forgot-password/route.ts
      /reset-password/route.ts
      /verify/route.ts
      /verify/resend/route.ts

  /lib
    /auth                   # session creation, lookup, revocation, cookie helpers
    /crypto
      password.ts           # Argon2id ONLY — password hash/verify
      token.ts              # SHA-256 + pepper ONLY — code/token hash/verify
    /validation             # single shared Zod schema module (server + client import from here)
    /rate-limit             # atomic raw-SQL upsert, limit check, cleanup job
    /db                     # Prisma client singleton
    /email                  # swappable interface; console implementation only

  /components
    /forms                  # inputs with bound <label>, focus states, aria wiring
    /ui

  /styles
    tokens.css              # design tokens (Section 2.5) — @import stripped, variables only

  middleware.ts             # protected-route guard ONLY — see 4.1 below

tailwind.config.ts          # theme.extend maps to the CSS variables in tokens.css
```

### 4.1 Where heavy work is allowed to run
- **Argon2id hashing must run in a Node.js runtime API route handler**, never in `middleware.ts`. Next.js middleware commonly runs on the Edge runtime, which does not support native Argon2 bindings. If you need to check auth state in middleware, do a lightweight cookie-presence check only and let the actual session/DB validation happen in the route handler or a server component — do not attempt to run password or session-secret hashing inside middleware.
- The protected-route guard (`middleware.ts` or an equivalent server-side check) does exactly one thing: read the cookie, look up the `Session` row, check `expiresAt`, redirect or clear the cookie. It does not contain business logic for signup, verification, or password reset.
- `/lib/crypto/password.ts` and `/lib/crypto/token.ts` are two separate files with two separate hashing strategies (Section 2.3). Do not merge them into one "hash.ts" utility — that merge is exactly the kind of "helpful unification" this file exists to prevent.
- Validation schemas live only in `/lib/validation`. Both a client form component and an API route handler import from there — neither defines its own copy.

---

## 5. How Should the Code Look

- **TypeScript strict mode**, no `any` (use `unknown` and narrow it if the type is genuinely unknown). No `@ts-ignore` to silence a real type error — fix the type.
- Use the current active **Node.js LTS** at project start. Pin it in an `.nvmrc` and in `package.json`'s `engines` field. Do not bump the Node version mid-project without instruction.
- One package manager for the life of the project. If a lockfile already exists in the repo, use that package manager — do not introduce a second lockfile.
- Prefer small, single-purpose functions and modules over large multi-responsibility files. A route handler should orchestrate; it should call into `/lib` for the actual hashing, validation, and rate-limit logic rather than inlining it.
- Functional style for React components (function components + hooks). No class components.
- Naming: descriptive, no abbreviations that aren't obvious (`passwordHash`, not `pwHash` or `ph`). Match the exact field names in the Prisma schema when referring to those fields in code.
- Comments explain *why*, not *what* — especially at every point in Section 3 where a rule exists specifically to prevent a subtle bug (e.g., the atomic rate-limit upsert, the `P2002` idempotency catch, the partial unique index). A future reader should be able to tell from the comment why the "obvious simpler" approach was rejected.
- No commented-out code, no dead code, no leftover `console.log` debugging statements in what you consider a finished file.
- Run the formatter/linter before considering any file done. Do not hand-format to "look like" Prettier — run it.
- Error handling: never swallow an error silently. Either handle it and return the correct generic response the PRD specifies, or let it surface in a way that's visible in logs — but never let an unhandled case return a misleading success response.

---

## 6. What Counts as Done

Before you consider **any** task complete, produce this checklist filled in, not just a claim that it's "done":

- [ ] **Builds with zero errors.** `tsc --noEmit` passes, `next build` succeeds, lint passes.
- [ ] **No rule in Section 3 is violated.** Go down that list explicitly for the feature you just touched — not just the phase you think you're in.
- [ ] **The relevant Locked Choice from Section 2 was used, not substituted.** (Right hashing function in the right file, right cookie config, right rate-limit numbers, right schema fields.)
- [ ] **Phase order was respected** (Section 3.9) — you did not implement something from a later phase to make this one "more complete."
- [ ] **No design value was invented outside `tokens.css`**, and DM Sans loads via `next/font/google`, never the raw Google Fonts `@import` (Section 3.4).
- [ ] **Accessibility is done for any screen touched this task**, not deferred: labels bound via `htmlFor`/`id`, visible focus states, `aria-describedby`/`aria-invalid` wiring. (PRD 7.9)
- [ ] **Evidence exists for whatever this task claims to fix**, matching PRD Section 11's acceptance criteria where applicable:
  - Password hash visible only as an Argon2id string in the DB, never plaintext.
  - The exact `curl` command used to test the endpoint directly, and the exact response received.
  - For anything rate-limited: proof of a `429` with `Retry-After` on the request immediately after the limit is reached.
  - For anything with expiry: a before/after database record showing the expired case is rejected by the API, not just by the UI.
- [ ] **`.env` was not committed.** Only `.env.example` changed, if anything.
- [ ] **Migrations are present and applied**, including the hand-edited partial-index SQL where relevant (Section 2.8).

If any box can't be checked, the task is not done — say so plainly rather than reporting it as complete.

---

## 7. What Does the Agent Do When Unsure

- **Never invent a feature, a screen, or a scope item that isn't in the PRD**, even if it seems small, obviously useful, or "expected" in a typical auth system (this includes anything on the Section 3.8 forbidden list).
- **Never patch over a missing decision with a workaround, a TODO, or spaghetti code** to make something appear to work. If the correct behavior is genuinely undetermined, do the smallest correct scaffold and stop — do not guess your way to a green build.
- When the PRD has an explicit open question (Section 14: styling library, email provider, unverified-account retention) — **use the PRD's stated default assumption** (Tailwind, console-logged email, no cleanup job) rather than resolving the open question yourself. Do not treat "it's marked open" as permission to pick a different answer than the documented default.
- When a requirement is genuinely ambiguous and has no stated default: stop, write a clear comment or note describing the ambiguity and the options you see, and implement nothing further on that specific point until it's resolved. Do not proceed on a guess and hope it's close enough.
- When in doubt between "do less" and "do more": do less. A smaller, correct, PRD-compliant piece of work is always preferable to a larger one that quietly exceeds scope or skips a rule in Section 3.
