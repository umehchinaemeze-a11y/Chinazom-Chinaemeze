-- Partial unique indexes enforcing that each user can have at most ONE active (unconsumed)
-- verification code and at most ONE active (unconsumed) password reset token at a time.
-- Prisma's schema DSL cannot express partial indexes (PRD 7.5, 10 / AGENTS.md 2.8).

CREATE UNIQUE INDEX one_active_code_per_user
ON "VerificationCode" ("userId")
WHERE "consumedAt" IS NULL;

CREATE UNIQUE INDEX one_active_token_per_user
ON "PasswordResetToken" ("userId")
WHERE "consumedAt" IS NULL;