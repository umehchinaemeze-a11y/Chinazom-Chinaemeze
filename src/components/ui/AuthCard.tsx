import React from "react";

// Shared shell for every authentication screen (signin, signup, forgot-password,
// reset-password, verify). Single source of truth for the centered-card layout so
// the auth family stays visually and structurally consistent — pages must not
// hand-roll their own <main> wrapper (AGENTS.md Section 2.5 / PRD 7.9).
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="auth-card">{children}</div>
    </main>
  );
}