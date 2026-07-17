/**
 * KreatorKit per-workspace channel strategy.
 *
 * `Workspace.strategy` is a JSON blob the creator fills in and the team +
 * ideation skills read as a resource. Three parts:
 *   - pillars        the recurring themes the channel is built on
 *   - recurringIdeas repeatable formats/series to keep making
 *   - notes          free-form strategy notes (quarterly plan, positioning…)
 *
 * Stored as one column (like `features`/`publishing`) so it rides along in the
 * agent workspace payload with no extra tables to query. `rev` is a write
 * counter: the session PUT rejects stale writes (409) so two editors can't
 * silently overwrite each other; every successful write bumps it.
 */

export interface ContentPillar {
  id: string;
  title: string;
  description: string;
}

export interface RecurringIdea {
  id: string;
  title: string;
  notes: string;
  /** Set when the idea was sent to the pipeline — keeps the link across reloads. */
  videoId?: string;
}

export interface WorkspaceStrategy {
  pillars: ContentPillar[];
  recurringIdeas: RecurringIdea[];
  notes: string;
  rev: number;
}

// Guardrails — keep the blob bounded so a client paste can't bloat the row.
const MAX_ITEMS = 100;
const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_NOTES = 20000;

function clampString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 64;
}

/**
 * Parse/validate/clamp an untrusted strategy value into the canonical shape.
 * Always returns a well-formed WorkspaceStrategy — never throws. Items missing
 * a usable id get an index-based one (unique within the array), which is then
 * persisted, so ids stay stable across subsequent reads.
 */
export function parseStrategy(raw: unknown): WorkspaceStrategy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { pillars: [], recurringIdeas: [], notes: '', rev: 0 };
  }
  const obj = raw as Record<string, unknown>;

  const pillars: ContentPillar[] = Array.isArray(obj.pillars)
    ? obj.pillars.slice(0, MAX_ITEMS).map((p, i) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          id: isId(o.id) ? o.id : `p_${i.toString(36)}`,
          title: clampString(o.title, MAX_TITLE),
          description: clampString(o.description, MAX_BODY),
        };
      })
    : [];

  const recurringIdeas: RecurringIdea[] = Array.isArray(obj.recurringIdeas)
    ? obj.recurringIdeas.slice(0, MAX_ITEMS).map((r, i) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return {
          id: isId(o.id) ? o.id : `r_${i.toString(36)}`,
          title: clampString(o.title, MAX_TITLE),
          notes: clampString(o.notes, MAX_BODY),
          ...(isId(o.videoId) ? { videoId: o.videoId } : {}),
        };
      })
    : [];

  const rev =
    typeof obj.rev === 'number' && Number.isFinite(obj.rev) && obj.rev >= 0
      ? Math.floor(obj.rev)
      : 0;

  return {
    pillars,
    recurringIdeas,
    notes: clampString(obj.notes, MAX_NOTES),
    rev,
  };
}

/**
 * Reject-don't-truncate check for write paths: returns a human-readable
 * problem when the payload exceeds the stored limits, else null. Run this
 * BEFORE parseStrategy so oversized input 400s instead of being silently cut.
 */
export function strategyLimitError(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  for (const [key, max, titleMax, bodyKey] of [
    ['pillars', MAX_ITEMS, MAX_TITLE, 'description'],
    ['recurringIdeas', MAX_ITEMS, MAX_TITLE, 'notes'],
  ] as const) {
    const arr = obj[key];
    if (!Array.isArray(arr)) continue;
    if (arr.length > max) return `${key}: at most ${max} items`;
    for (const item of arr) {
      const o = (item ?? {}) as Record<string, unknown>;
      if (typeof o.title === 'string' && o.title.length > titleMax)
        return `${key}: title over ${titleMax} characters`;
      const body = o[bodyKey];
      if (typeof body === 'string' && body.length > MAX_BODY)
        return `${key}: ${bodyKey} over ${MAX_BODY} characters`;
    }
  }
  if (typeof obj.notes === 'string' && obj.notes.length > MAX_NOTES)
    return `notes: over ${MAX_NOTES} characters`;
  return null;
}
