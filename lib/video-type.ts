// Client-safe metadata for the video type field (mirrors the VideoType enum).
// POST is BETA — only offered in workspaces with the 'posts' feature flag.
export const VIDEO_TYPES = [
  { key: 'PODCAST', label: 'Podcast', emoji: '🎙️', beta: false },
  { key: 'LONGFORM', label: 'Long form', emoji: '🎬', beta: false },
  { key: 'SHORT', label: 'Short', emoji: '📱', beta: false },
  { key: 'POST', label: 'Post', emoji: '📝', beta: true },
] as const;

/** Dropdown label — beta types are marked so testers know the ground they're on. */
export function typeOptionLabel(t: (typeof VIDEO_TYPES)[number]): string {
  return t.beta ? `${t.label} (beta)` : t.label;
}

export type VideoTypeKey = (typeof VIDEO_TYPES)[number]['key'];

export function typeMeta(key: string | null | undefined) {
  return VIDEO_TYPES.find((t) => t.key === key) ?? VIDEO_TYPES[1];
}

/** Image detection tolerant of legacy FILE-kind rows (pre-backfill uploads). */
export function isImageAsset(a: { kind: string; displayName: string }): boolean {
  return a.kind === 'IMAGE' || (a.kind === 'FILE' && /\.(png|jpe?g|webp|gif)$/i.test(a.displayName));
}
