"use client";

import React, { useState } from "react";
import Link from "next/link";
import { resetPasswordSchema } from "@/lib/validation";
import { TextInput } from "@/components/forms";
import { AuthCard, Button } from "@/components/ui";

// One consistent message for both "missing token" and API-level invalid/expired
// token errors — never reveal sensitive detail (AGENTS.md 3.1 / PRD 5.4).
const GENERIC_TOKEN_ERROR =
  "This password reset link is invalid, expired, or has already been used.";

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "password") setPassword(value);
    if (name === "confirmPassword") setConfirmPassword(value);
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (globalError) setGlobalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    const result = resetPasswordSchema.safeParse({
      token,
      password,
      confirmPassword,
    });
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[issue.path.length - 1];
        if (typeof path === "string" && !errors[path]) {
          errors[path] = issue.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setGlobalError(
          data.error || "Something went wrong. Please try again."
        );
        setIsLoading(false);
        return;
      }

      // Strip the token from the URL bar so it is not left in the address
      // bar / clipboard / referrer / browser history.  Does not trigger a
      // React re-render so the success state stays visible.
      window.history.replaceState(null, "", "/reset-password");

      setSuccessMessage(
        data.message || "Your password has been reset. You can now sign in."
      );
      setPassword("");
      setConfirmPassword("");
      setIsLoading(false);
    } catch {
      setGlobalError("A network error occurred. Please check your connection.");
      setIsLoading(false);
    }
  };

  // --- Missing / clearly invalid token (rendered from the server component) ---
  if (!token) {
    return (
      <AuthCard>
        <div className="text-center mb-6">
          <h1 className="text-headline-small text-on-surface">Reset Password</h1>
        </div>
        <div
          role="alert"
          className="mb-4 p-3 rounded bg-error-container text-on-error-container text-body-medium border border-error"
        >
          {GENERIC_TOKEN_ERROR}
        </div>
        <div className="space-y-2 text-body-medium text-on-surface-variant">
          <p>Please request a new password reset link.</p>
          <Link
            href="/forgot-password"
            className="block text-primary font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
          >
            Request a new link
          </Link>
        </div>
        <div className="mt-6 pt-6 border-t border-outline-variant text-center text-body-medium text-on-surface-variant">
          Remembered your password?{" "}
          <Link
            href="/signin"
            className="text-primary font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
          >
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  // --- Success state ---
  if (successMessage) {
    return (
      <AuthCard>
        <div className="text-center mb-6">
          <h1 className="text-headline-small text-on-surface">Reset Password</h1>
        </div>
        <div
          role="status"
          className="mb-4 p-3 rounded bg-primary-container text-on-primary-container text-body-medium border border-primary"
        >
          <p>{successMessage}</p>
          <div className="mt-3">
            <Link
              href="/signin"
              className="inline-block text-body-small text-primary underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
            >
              Go to Sign In &rarr;
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  // --- Main form ---
  return (
    <AuthCard>
      <div className="text-center mb-6">
        <h1 className="text-headline-small text-on-surface">Reset Password</h1>
        <p className="text-body-medium text-on-surface-variant mt-1">
          Choose a new password for your account.
        </p>
      </div>

      {globalError && (
        <div
          role="alert"
          className="mb-4 p-3 rounded bg-error-container text-on-error-container text-body-medium border border-error"
        >
          {globalError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <TextInput
          id="password"
          name="password"
          type="password"
          label="New Password"
          autoComplete="new-password"
          required
          value={password}
          onChange={handleChange}
          error={fieldErrors.password}
          helperText="Must be at least 8 characters."
          placeholder="••••••••"
        />

        <TextInput
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          label="Confirm Password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={handleChange}
          error={fieldErrors.confirmPassword}
          placeholder="••••••••"
        />

        <Button type="submit" isLoading={isLoading} className="mt-2">
          Reset Password
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-outline-variant text-center text-body-medium text-on-surface-variant">
        Remembered your password?{" "}
        <Link
          href="/signin"
          className="text-primary font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
        >
          Sign in
        </Link>
      </div>
    </AuthCard>
  );
}