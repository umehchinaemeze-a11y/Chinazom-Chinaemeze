// Swappable email interface (AGENTS.md 2.7 / PRD 12): console implementation only.
//
// A real provider (SendGrid, Resend, SES, ...) can be swapped in later behind this
// interface without touching any call sites. Do NOT integrate a real provider for
// this build (AGENTS.md 2.7).

export interface SendPasswordResetEmailInput {
  to: string;
  /** Full URL including the raw token query parameter (PRD 5.4). */
  resetUrl: string;
}

export interface SendVerificationEmailInput {
  to: string;
  /** 6-digit numeric code the user must enter. */
  code: string;
}

export interface EmailService {
  sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void>;
  sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>;
}

export const emailService: EmailService = {
  async sendPasswordResetEmail({ to, resetUrl }) {
    // Console-logged only for this build. Never log the raw token beyond the URL
    // construction here; the Reset page must load no third-party resources before
    // validating the token and set Referrer-Policy: no-referrer (PRD 5.4 / AGENTS.md 3.2).
    console.log(`[email] Password reset requested for: ${to}`);
    console.log(`[email] Reset link: ${resetUrl}`);
  },

  async sendVerificationEmail({ to, code }) {
    // Console-logged only for this build (AGENTS.md 2.7).
    console.log(`[email] Verification code requested for: ${to}`);
    console.log(`[email] Verification code: ${code}`);
  },
};