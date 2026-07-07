const FALLBACK_SITE_URL = 'https://openframe.net';

function normalizeSiteUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return FALLBACK_SITE_URL;
  }

  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return FALLBACK_SITE_URL;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export function getSiteUrl(): string {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL);
}

export const seoConfig = {
  name: 'KreatorKit',
  title: 'Client Review Platform',
  description:
    'KreatorKit — the JID client platform: review your cuts with timestamped feedback, hand off footage, and see everything we run for you in one place.',
  keywords: [
    'open source video review platform',
    'video review tool',
    'timestamped video feedback',
    'video collaboration',
    'video annotation',
    'creative review workflow',
  ],
  url: getSiteUrl(),
  ogImage: '/meta.webp',
  logoPath: '/icon.svg',
  logo: '/icon.svg?v=2',
  githubUrl: 'https://github.com/yusufipk/KreatorKit',
} as const;
