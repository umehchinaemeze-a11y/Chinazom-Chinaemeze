"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInSchema } from "@/lib/validation";
import { TextInput } from "@/components/forms";
import { AuthCard, Button } from "@/components/ui";

export default function SignInPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
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

    // Client-side validation using shared Zod schema (AGENTS.md 3.3 / PRD 7.2)
    const result = signInSchema.safeParse(formData);
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
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      const data = await res.json();

      if (!res.ok) {
        // One generic message regardless of which field was wrong (AGENTS.md 3.1 / PRD 5.2)
        setGlobalError(data.error || "Invalid email or password.");
        setIsLoading(false);
        return;
      }

      // Successful sign in -> redirect to dashboard
      router.push("/dashboard");
      router.refresh();
    } catch {
      setGlobalError("A network error occurred. Please check your connection.");
      setIsLoading(false);
    }
  };

  return (
    <AuthCard>
      <div className="text-center mb-6">
        <h1 className="text-headline-small font-semibold text-on-surface">
          Sign In
        </h1>
        <p className="text-body-medium text-on-surface-variant mt-1">
          Enter your credentials to access your account
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

        <div>
          <TextInput
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="current-password"
            required
            value={formData.password}
            onChange={handleChange}
            error={fieldErrors.password}
            placeholder="••••••••"
          />
          <div className="text-right mt-sm">
            <Link
              href="/forgot-password"
              className="text-body-small text-primary font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button type="submit" isLoading={isLoading} className="mt-2">
          Sign In
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-outline-variant text-center text-body-medium text-on-surface-variant">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-primary font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
        >
          Sign up
        </Link>
      </div>
    </AuthCard>
  );
}