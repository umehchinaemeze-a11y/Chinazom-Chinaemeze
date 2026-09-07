"use client";

import React, { useState } from "react";
import Link from "next/link";
import { forgotPasswordSchema } from "@/lib/validation";
import { TextInput } from "@/components/forms";
import { AuthCard, Button } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (fieldErrors.email) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.email;
        return next;
      });
    }
    if (globalError) setGlobalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setSuccessMessage(null);

    // Client-side validation using shared Zod schema (AGENTS.md 3.3 / PRD 7.2)
    const result = forgotPasswordSchema.safeParse({ email });
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0];
        if (typeof path === "string" && !errors[path]) {
          errors[path] = issue.message;
        }
      });
      setFieldErrors(errors);
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterSeconds = res.headers.get("Retry-After");
          setGlobalError(
            retryAfterSeconds
              ? `Too many requests. Please try again in ${retryAfterSeconds} second${retryAfterSeconds === "1" ? "" : "s"}.`
              : "Too many requests. Please try again later."
          );
        } else {
          setGlobalError(data.error || "Something went wrong. Please try again.");
        }
        setIsLoading(false);
        return;
      }

      // Generic anti-enumeration success message from the server (AGENTS.md 3.1)
      setSuccessMessage(
        data.message ||
          "If an account exists with that email, a password reset link has been sent."
      );
      setEmail("");
      setIsLoading(false);
    } catch {
      setGlobalError("A network error occurred. Please check your connection.");
      setIsLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="text-center mb-6">
        <h1 className="text-headline-small text-on-surface">Forgot Password</h1>
        <p className="text-body-medium text-on-surface-variant mt-1">
          Enter the email address you used to sign up, and we&apos;ll send you a
          link to reset your password.
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

      {successMessage && (
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
              Back to Sign In
            </Link>
          </div>
        </div>
      )}

      {!successMessage && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextInput
            id="email"
            name="email"
            type="email"
            label="Email Address"
            autoComplete="email"
            required
            value={email}
            onChange={handleChange}
            error={fieldErrors.email}
            placeholder="you@example.com"
          />

          <Button type="submit" isLoading={isLoading} className="mt-2">
            Send Reset Link
          </Button>
        </form>
      )}

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