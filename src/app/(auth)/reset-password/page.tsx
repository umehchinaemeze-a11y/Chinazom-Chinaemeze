import type { Metadata } from "next";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Security: the reset page must never leak the token via the Referer header
// (AGENTS.md 3.2 / PRD 5.4). This page also loads zero third-party resources
// (DM Sans is self-hosted via next/font), and the token is never written to any
// log in application code.
export const metadata: Metadata = {
  title: "Reset Password",
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawToken = params.token;

  // Accept a single string token only; an array or missing value is treated as
  // absent so the form shows the "invalid link" state instead of submitting junk.
  const token =
    typeof rawToken === "string" && rawToken.length > 0 ? rawToken : null;

  return <ResetPasswordForm token={token} />;
}