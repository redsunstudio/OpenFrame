/**
 * Append a cache-busting `t=<key>` param to a thumbnail URL WITHOUT corrupting
 * an existing query string.
 *
 * Thumbnail srcs are frequently proxy paths that already carry a query, e.g.
 * `/api/videos/{id}/assets/{id}/download?inline=1`. Blindly doing
 * `${url}?t=${key}` produces `...?inline=1?t=123` — a malformed query that the
 * proxy 404s, which turned the retry path into a permanent broken image.
 * Use the correct separator so the retry actually reloads the same object.
 */
export function withThumbnailCacheBust(url: string, key: number): string {
  if (!key) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}t=${key}`;
}
