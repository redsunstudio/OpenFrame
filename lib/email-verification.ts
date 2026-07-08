import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { sendEmail, isEmailDeliveryConfigured } from '@/lib/mailer';
import {
  brandedEmailTemplate,
  emailButton,
  emailHeading,
  emailRow,
  escapeHtml,
  EMAIL_COLORS,
} from '@/lib/email-brand';
import { logError } from '@/lib/logger';

// Reduce window to 2 hours — shorter exposure in access logs and backups.
const TOKEN_EXPIRY_HOURS = 2;

/** Hash a raw token before persisting so the DB stores only the digest. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Returns true when SMTP is fully configured and email sending should be enforced.
 * When SMTP is not configured, email verification is bypassed so self-hosted deployments
 * without a mail server continue to function.
 */
export function isEmailVerificationEnabled(): boolean {
  // Verification gates on OPT-IN, not on delivery being available — otherwise
  // enabling the Resend key would silently lock out new registrations.
  return process.env.OPENFRAME_ENABLE_EMAIL_VERIFICATION === 'true' && isEmailDeliveryConfigured();
}

/**
 * Generate a secure random verification token, persist only its SHA-256 digest,
 * and return the raw token (sent to the user via email).
 * Any existing tokens for this email are deleted first (at most one live token).
 */
export async function createVerificationToken(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expires = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  // Delete existing tokens for this identifier before creating a new one
  await db.verificationToken.deleteMany({ where: { identifier: email } });

  await db.verificationToken.create({
    data: { identifier: email, token: tokenHash, expires },
  });

  // Return the raw (unhashed) token — only ever sent to the user, never stored.
  return token;
}

/**
 * Consume a verification token: hash the raw token, look it up, mark the user
 * email as verified, and delete the DB record atomically.
 * Returns the user's email on success, or null on any failure (invalid, expired,
 * already verified, or deleted account).
 */
export async function consumeVerificationToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const record = await db.verificationToken.findUnique({ where: { token: tokenHash } });

  if (!record) return null;
  if (record.expires < new Date()) {
    await db.verificationToken.delete({ where: { token: tokenHash } }).catch(() => null);
    return null;
  }

  // Atomically mark email as verified and delete the token
  const [user] = await db.$transaction([
    db.user.updateMany({
      where: { email: record.identifier, emailVerified: null },
      data: { emailVerified: new Date() },
    }),
    db.verificationToken.delete({ where: { token: tokenHash } }),
  ]);

  // count === 0 means the user was already verified or has been deleted.
  // Return null so a replayed/stale token never produces a misleading success redirect.
  if (user.count === 0) return null;

  return record.identifier;
}

// ---------------------------------------------------------------------------
// Email sending
// ---------------------------------------------------------------------------


export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  if (!isEmailDeliveryConfigured()) return;

  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    // A missing NEXTAUTH_URL means the verification link will be malformed and the
    // user will be permanently locked out with no visible failure. Treat as fatal.
    logError(
      'NEXTAUTH_URL is not set — cannot build a valid verification link.',
      new Error('Set NEXTAUTH_URL to your deployment origin (e.g. https://app.example.com).')
    );
    return;
  }

  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const html = brandedEmailTemplate(
    `
        <tr>${emailHeading('✉', 'Verify your email address')}</tr>
        <tr><td style="padding:20px;">
          <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
            ${emailRow('Account', escapeHtml(email), true)}
            ${emailRow('Expires in', `${TOKEN_EXPIRY_HOURS} hours`)}
          </table>
          <p style="margin:0 0 20px;font-size:14px;color:${EMAIL_COLORS.textSecondary};line-height:1.6;">
            Click the button below to verify your email address and activate your KreatorKit account.
            If you did not create an account, you can safely ignore this email.
          </p>
          ${emailButton('Verify Email Address  &#8594;', verifyUrl)}
        </td></tr>
        `,
    {
      footerText: `This link expires in ${TOKEN_EXPIRY_HOURS} hours.`,
    }
  );

  const ok = await sendEmail({
    to: email,
    subject: 'Verify your KreatorKit email address',
    html,
  });
  if (!ok) logError('Failed to send verification email:', new Error('mailer returned false'));
}
