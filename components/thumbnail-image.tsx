'use client';

import { useState, type ReactNode } from 'react';
import { withThumbnailCacheBust } from '@/lib/thumbnail-url';

// Bunny may still be transcoding a freshly-uploaded thumbnail, so a first miss is
// often transient — retry a couple of times, then fall back to a clean placeholder
// instead of looping forever (the old behaviour showed a perpetual spinner).
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 8000;

interface ThumbnailImageProps {
  src?: string | null;
  alt?: string;
  /** Applied to both the <img> and the fallback tile so they occupy the same box. */
  className?: string;
  /** Rendered when there is no src, or after retries are exhausted. */
  fallback: ReactNode;
}

/**
 * Thumbnail <img> that degrades to a caller-supplied placeholder tile instead of
 * the browser's native broken-image icon. Handles transient load errors with a
 * bounded, correctly cache-busted retry.
 */
export function ThumbnailImage({ src, alt = '', className, fallback }: ThumbnailImageProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset the retry state when the underlying src changes (React's recommended
  // "adjust state during render" pattern — avoids an effect + cascading renders).
  const [lastSrc, setLastSrc] = useState(src);
  if (src !== lastSrc) {
    setLastSrc(src);
    setRetryKey(0);
    setAttempts(0);
    setFailed(false);
  }

  if (!src || failed) {
    return <>{fallback}</>;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={withThumbnailCacheBust(src, retryKey)}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => {
        const next = attempts + 1;
        setAttempts(next);
        if (next > MAX_RETRIES) {
          setFailed(true);
        } else {
          window.setTimeout(() => setRetryKey(Date.now()), RETRY_DELAY_MS);
        }
      }}
    />
  );
}
