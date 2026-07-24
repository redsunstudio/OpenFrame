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

/**
 * Resolve a stored thumbnail URL for rendering. Bunny Stream poster thumbnails are
 * persisted against the shared `vz-thumbnail.b-cdn.net` host, which does not serve
 * a given library's frames — the client must swap in that library's own pull-zone
 * host (NEXT_PUBLIC_BUNNY_CDN_URL, via resolvePublicBunnyCdnHostname()). Without
 * this rewrite the pipeline board rendered every Bunny poster as a broken image.
 * Relative proxy paths (`/api/videos/...`) and any other host pass through
 * unchanged.
 */
export function resolveThumbnailUrl(
  url: string | null | undefined,
  bunnyCdnHostname: string | null
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'vz-thumbnail.b-cdn.net' && bunnyCdnHostname) {
      parsed.hostname = bunnyCdnHostname;
      return parsed.toString();
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
