"use client";

import React, { useState } from "react";
import Link from "next/link";
import { signUpSchema } from "@/lib/validation";
import { TextInput } from "@/components/forms";
import { AuthCard, Button } from "@/components/ui";

export default function SignUpPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
    setSuccessMessage(null);

    // Client-side validation using shared Zod schema (AGENTS.md 3.3 / PRD 7.2)
    const result = signUpSchema.safeParse(formData);
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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      const data = await res.json();

      if (!res.ok) {
        // Server-side validation always re-runs (AGENTS.md 3.3); surface its
        // field errors onto the matching inputs. The signup route's only other
        // non-ok response is the duplicate-email 400, which carries no
        // `details` — show that message next to the email input as well.
        if (data.details?.fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [field, messages] of Object.entries(data.details.fieldErrors)) {
            if (Array.isArray(messages) && messages[0]) {
              mapped[field] = messages[0];
            }
          }
          if (Object.keys(mapped).length > 0) {
            setFieldErrors(mapped);
          }
        } else if (data.error) {
          setFieldErrors((prev) => ({ ...prev, email: data.error }));
        }
        setGlobalError(data.error || "Failed to create account. Please try again.");
        setIsLoading(false);
        return;
      }

      // Success message (same generic message regardless of email existence - AGENTS.md 3.1)
      setSuccessMessage(
        data.message || "Your account has been created. You can now sign in."
      );
      setFormData({ name: "", email: "", password: "" });
      setIsLoading(false);
    } catch {
      setGlobalError("A network error occurred. Please check your connection.");
      setIsLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="text-center mb-6">
        <h1 className="text-headline-small text-on-surface">Create an Account</h1>
        <p className="text-body-medium text-on-surface-variant mt-1">
          Enter your details to get started
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
              Go to Sign In &rarr;
            </Link>
          </div>
        </div>
      )}

      {!successMessage && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <TextInput
            id="name"
            name="name"
            type="text"
            label="Full Name"
            autoComplete="name"
            required
            value={formData.name}
            onChange={handleChange}
            error={fieldErrors.name}
            placeholder="Alex Johnson"
          />

          <TextInput
            id="email"
            name="email"
            type="email"
            label="Email Address"
            autoComplete="email"
            required
            value={formData.email}
            onChange={handleChange}
            error={fieldErrors.email}
            placeholder="you@example.com"
          />

          <TextInput
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            required
            value={formData.password}
            onChange={handleChange}
            error={fieldErrors.password}
            helperText="Must be at least 8 characters."
            placeholder="••••••••"
          />

          <Button type="submit" isLoading={isLoading} className="mt-2">
            Create Account
          </Button>
        </form>
      )}

      <div className="mt-6 pt-6 border-t border-outline-variant text-center text-body-medium text-on-surface-variant">
        Already have an account?{" "}
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