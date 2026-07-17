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
 * agent workspace payload with no extra tables to query.
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
}

export interface WorkspaceStrategy {
  pillars: ContentPillar[];
  recurringIdeas: RecurringIdea[];
  notes: string;
}

export const EMPTY_STRATEGY: WorkspaceStrategy = {
  pillars: [],
  recurringIdeas: [],
  notes: '',
};

// Guardrails — keep the blob bounded so a client paste can't bloat the row.
const MAX_ITEMS = 100;
const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_NOTES = 20000;

function clampString(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function coerceId(v: unknown): string {
  if (typeof v === 'string' && v.length > 0 && v.length <= 64) return v;
  // Deterministic-enough fallback; the client normally supplies a uuid.
  return `p_${Math.abs(hashString(JSON.stringify(v ?? ''))).toString(36)}`;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Parse/validate/clamp an untrusted strategy value into the canonical shape.
 * Always returns a well-formed WorkspaceStrategy — never throws.
 */
export function parseStrategy(raw: unknown): WorkspaceStrategy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_STRATEGY };
  const obj = raw as Record<string, unknown>;

  const pillars: ContentPillar[] = Array.isArray(obj.pillars)
    ? obj.pillars.slice(0, MAX_ITEMS).map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          id: coerceId(o.id),
          title: clampString(o.title, MAX_TITLE),
          description: clampString(o.description, MAX_BODY),
        };
      })
    : [];

  const recurringIdeas: RecurringIdea[] = Array.isArray(obj.recurringIdeas)
    ? obj.recurringIdeas.slice(0, MAX_ITEMS).map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return {
          id: coerceId(o.id),
          title: clampString(o.title, MAX_TITLE),
          notes: clampString(o.notes, MAX_BODY),
        };
      })
    : [];

  return {
    pillars,
    recurringIdeas,
    notes: clampString(obj.notes, MAX_NOTES),
  };
}

/** True when the strategy has nothing worth showing. */
export function isStrategyEmpty(s: WorkspaceStrategy): boolean {
  return s.pillars.length === 0 && s.recurringIdeas.length === 0 && s.notes.trim() === '';
}
