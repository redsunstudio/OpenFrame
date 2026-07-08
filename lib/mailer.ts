import nodemailer from 'nodemailer';
import { logError } from '@/lib/logger';

/**
 * KreatorKit outbound email.
 *
 * Railway blocks outbound SMTP ports, so the primary path is the Resend HTTP
 * API (RESEND_API_KEY). Plain SMTP remains as a fallback for self-hosters on
 * networks where it works.
 */

const DEFAULT_FROM = 'KreatorKit <noreply@apps.johnisaacson.co.uk>';

export function isEmailDeliveryConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
  );
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<boolean> {
  const from = input.from || process.env.SMTP_FROM || process.env.EMAIL_FROM || DEFAULT_FROM;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
      });
      if (!res.ok) {
        logError('Resend send failed:', new Error(`${res.status} ${await res.text()}`));
        return false;
      }
      return true;
    } catch (err) {
      logError('Resend send failed:', err);
      return false;
    }
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    console.warn('Email delivery not configured — skipping send');
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({ from, to: input.to, subject: input.subject, html: input.html });
    return true;
  } catch (err) {
    logError('Email send failed:', err);
    return false;
  }
}
