import { PrismaClient } from "@prisma/client";
import { loadEnvFile } from "node:process";
import { beforeEach, afterAll } from "vitest";

// Load DATABASE_URL and the pepper env vars from .env (Next.js does this
// automatically; vitest does not). Node >= 20.12 provides loadEnvFile.
try {
  loadEnvFile(".env");
} catch {
  // .env may be absent in CI — DATABASE_URL must then come from the environment.
}

// Direct Prisma client for test setup/teardown — bypasses the singleton in
// src/lib/db to avoid Next.js module caching issues in the test runner.
export const testPrisma = new PrismaClient({
  log: process.env.NODE_ENV === "test" ? ["error"] : [],
});

beforeEach(async () => {
  // Delete in FK-dependency order (children first).
  await testPrisma.session.deleteMany();
  await testPrisma.verificationCode.deleteMany();
  await testPrisma.passwordResetToken.deleteMany();
  await testPrisma.rateLimitEntry.deleteMany();
  await testPrisma.user.deleteMany();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});