'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Compass,
  Repeat,
  StickyNote,
  Plus,
  Trash2,
  Check,
  Loader2,
  Send,
  ArrowUpRight,
  GripVertical,
  Pencil,
  Sparkles,
  LayoutTemplate,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { templateStrategy } from '@/lib/strategy';
import type {
  ContentPillar,
  IdeaVideoType,
  RecurringIdea,
  WorkspaceStrategy,
} from '@/lib/strategy';

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface StrategyEditorProps {
  workspaceId: string;
  initial: WorkspaceStrategy;
  canEdit: boolean;
  /** Owner/admins can spawn a recurring idea into the pipeline as an IDEA item. */
  canCreatePipeline: boolean;
  accent?: string | null;
  /** Videos produced per pillar id — the strategy feedback loop. */
  pillarCounts: Record<string, number>;
}

type PipelineState = 'sending' | 'error';

type Sections = Omit<WorkspaceStrategy, 'rev' | 'updatedAt' | 'updatedBy'>;

const TYPE_META: Record<IdeaVideoType, string> = {
  PODCAST: '🎙️ Podcast',
  LONGFORM: '🎬 Long-form',
  SHORT: '📱 Short',
};

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p_${Math.random().toString(36).slice(2)}`;
  }
}

/** Render plain text with URLs as real links — the read view earns its keep. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80 break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function formatUpdated(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// `accent` stays in the props contract but isn't read here — the page sets the
// workspace brand as --primary, so text-primary/bg-primary classes carry it.
export function StrategyEditor({
  workspaceId,
  initial,
  canEdit,
  canCreatePipeline,
  pillarCounts,
}: StrategyEditorProps) {
  const [pillars, setPillars] = useState<ContentPillar[]>(initial.pillars);
  const [recurringIdeas, setRecurringIdeas] = useState<RecurringIdea[]>(initial.recurringIdeas);
  const [notes, setNotes] = useState(initial.notes);
  const [save, setSave] = useState<SaveState>('idle');
  const [pipeline, setPipeline] = useState<Record<string, PipelineState>>({});
  // Which card is in edit mode — 'notes' or an item id. One at a time.
  const [editing, setEditing] = useState<string | null>(null);
  const [meta, setMeta] = useState({ updatedAt: initial.updatedAt, updatedBy: initial.updatedBy });
  const [draftRequested, setDraftRequested] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Sections>({
    pillars: initial.pillars,
    recurringIdeas: initial.recurringIdeas,
    notes: initial.notes,
  });
  const lastSaved = useRef(
    JSON.stringify({
      pillars: initial.pillars,
      recurringIdeas: initial.recurringIdeas,
      notes: initial.notes,
    })
  );
  const rev = useRef(initial.rev);
  const pending = useRef(false);

  const flush = useCallback(async () => {
    if (!canEdit || save === 'conflict') return;
    const sections = latest.current;
    const body = JSON.stringify({ strategy: { ...sections, rev: rev.current } });
    setSave('saving');
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/strategy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (res.ok) {
        const { data } = await res.json().catch(() => ({ data: null }));
        if (typeof data?.strategy?.rev === 'number') rev.current = data.strategy.rev;
        if (data?.strategy?.updatedAt) {
          setMeta({ updatedAt: data.strategy.updatedAt, updatedBy: data.strategy.updatedBy });
        }
        lastSaved.current = JSON.stringify(sections);
        pending.current = false;
        setSave('saved');
        if (savedBadgeTimer.current) clearTimeout(savedBadgeTimer.current);
        savedBadgeTimer.current = setTimeout(
          () => setSave((s) => (s === 'saved' ? 'idle' : s)),
          2000
        );
      } else if (res.status === 409) {
        pending.current = false;
        setSave('conflict');
      } else {
        setSave('error');
      }
    } catch {
      setSave('error');
    }
  }, [workspaceId, canEdit, save]);

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Debounced auto-save on any real edit (dirty check skips mounts and reverts).
  useEffect(() => {
    if (!canEdit) return;
    const sections: Sections = { pillars, recurringIdeas, notes };
    if (JSON.stringify(sections) === lastSaved.current) return;
    latest.current = sections;
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pillars, recurringIdeas, notes, canEdit]);

  // Never drop a pending edit: flush on SPA unmount, keepalive-PUT on tab close.
  useEffect(() => {
    const onPageHide = () => {
      if (!pending.current) return;
      try {
        fetch(`/api/workspaces/${workspaceId}/strategy`, {
          method: 'PUT',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategy: { ...latest.current, rev: rev.current } }),
        });
      } catch {
        // Best-effort — the page is going away.
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      if (pending.current) flushRef.current();
    };
  }, [workspaceId]);

  function removePillar(pillar: ContentPillar) {
    const index = pillars.findIndex((p) => p.id === pillar.id);
    setPillars((prev) => prev.filter((p) => p.id !== pillar.id));
    setEditing(null);
    toast(`Removed "${pillar.title || 'untitled pillar'}"`, {
      action: {
        label: 'Undo',
        onClick: () =>
          setPillars((prev) => {
            const next = [...prev];
            next.splice(Math.min(index, next.length), 0, pillar);
            return next;
          }),
      },
    });
  }

  function removeIdea(idea: RecurringIdea) {
    const index = recurringIdeas.findIndex((r) => r.id === idea.id);
    setRecurringIdeas((prev) => prev.filter((r) => r.id !== idea.id));
    setEditing(null);
    toast(`Removed "${idea.title || 'untitled idea'}"`, {
      action: {
        label: 'Undo',
        onClick: () =>
          setRecurringIdeas((prev) => {
            const next = [...prev];
            next.splice(Math.min(index, next.length), 0, idea);
            return next;
          }),
      },
    });
  }

  function reorder<T>(list: T[], from: number, to: number): T[] {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  async function sendToPipeline(idea: RecurringIdea) {
    const title = idea.title.trim();
    if (!title) return;
    setPipeline((p) => ({ ...p, [idea.id]: 'sending' }));
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.slice(0, 200),
          brief: idea.notes?.trim() || undefined,
          videoType: idea.videoType || 'LONGFORM',
          pillarId: idea.pillarId || undefined,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setPipeline((p) => {
          const rest = { ...p };
          delete rest[idea.id];
          return rest;
        });
        if (data?.id) {
          setRecurringIdeas((prev) =>
            prev.map((r) => (r.id === idea.id ? { ...r, videoId: data.id } : r))
          );
        }
        toast.success('Added to the pipeline as an idea');
      } else {
        setPipeline((p) => ({ ...p, [idea.id]: 'error' }));
      }
    } catch {
      setPipeline((p) => ({ ...p, [idea.id]: 'error' }));
    }
  }

  async function requestDraft() {
    setDraftRequested(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/strategy/draft-request`, {
        method: 'POST',
      });
      if (res.ok) {
        toast.success("Request sent — we'll draft it from your channel and let you know.");
      } else {
        setDraftRequested(false);
        toast.error("Couldn't send the request — try again.");
      }
    } catch {
      setDraftRequested(false);
      toast.error("Couldn't send the request — try again.");
    }
  }

  const isEmpty = pillars.length === 0 && recurringIdeas.length === 0 && notes.trim() === '';
  const updated = formatUpdated(meta.updatedAt);
  const pillarTitle = (id?: string) => pillars.find((p) => p.id === id)?.title?.trim() || null;

  if (isEmpty && !editing) {
    return (
      <div className="max-w-3xl">
        <div className="rounded-xl border border-dashed border-border/70 px-6 py-14 flex flex-col items-center text-center gap-4">
          <Compass className="h-10 w-10 text-primary" aria-hidden />
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">No strategy here yet</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Pillars, recurring formats and channel notes — the doc your ideas and quarterly
              planning run from.
            </p>
          </div>
          {canEdit ? (
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Button
                onClick={() => {
                  const tpl = templateStrategy();
                  setPillars(tpl.pillars);
                  setRecurringIdeas(tpl.recurringIdeas);
                  toast.success('Template added — replace the examples with your own.');
                }}
              >
                <LayoutTemplate className="h-4 w-4 mr-2" />
                Start from a template
              </Button>
              <Button variant="outline" onClick={requestDraft} disabled={draftRequested}>
                <Sparkles className="h-4 w-4 mr-2" />
                {draftRequested ? 'Request sent ✓' : 'Draft it from my channel'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">The team hasn&apos;t logged it yet.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-10">
      {/* Freshness + save state — the first question in any strategy meeting. */}
      <div className="flex items-center justify-between -mb-5 min-h-5">
        <p className="text-xs text-muted-foreground">
          {updated ? (
            <>
              Updated {updated}
              {meta.updatedBy ? ` · ${meta.updatedBy}` : ''}
            </>
          ) : null}
        </p>
        <div aria-live="polite" role="status">
          {canEdit && <SaveWhisper state={save} onRetry={flush} />}
        </div>
      </div>

      {/* Content pillars */}
      <Section
        icon={Compass}
        title="Content pillars"
        blurb="The 3–5 recurring themes this channel is built on. Every video should ladder up to one."
        onAdd={
          canEdit
            ? () => {
                const id = newId();
                setPillars((p) => [...p, { id, title: '', description: '' }]);
                setEditing(id);
              }
            : undefined
        }
        addLabel="Add pillar"
      >
        <div className="space-y-1">
          {pillars.map((pillar, index) =>
            editing === pillar.id ? (
              <div
                key={pillar.id}
                className="rounded-xl border border-primary/40 bg-muted/20 p-4 space-y-3"
              >
                <Input
                  autoFocus
                  value={pillar.title}
                  onChange={(e) =>
                    setPillars((prev) =>
                      prev.map((p) => (p.id === pillar.id ? { ...p, title: e.target.value } : p))
                    )
                  }
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  placeholder="Pillar name"
                  aria-label="Pillar name"
                  maxLength={200}
                  className="text-sm font-semibold"
                />
                <Textarea
                  value={pillar.description}
                  onChange={(e) =>
                    setPillars((prev) =>
                      prev.map((p) =>
                        p.id === pillar.id ? { ...p, description: e.target.value } : p
                      )
                    )
                  }
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  placeholder="What it covers, why it wins, example angles…"
                  aria-label={`Description for ${pillar.title || 'new pillar'}`}
                  maxLength={5000}
                  className="min-h-20"
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => removePillar(pillar)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors p-1.5 -m-1.5"
                    aria-label={`Remove ${pillar.title || 'untitled pillar'}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                  <Button size="sm" onClick={() => setEditing(null)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <ReadRow
                key={pillar.id}
                canEdit={canEdit}
                onEdit={() => setEditing(pillar.id)}
                editLabel={`Edit pillar ${pillar.title || 'untitled'}`}
                draggable={canEdit}
                dragKey={`pillar:${index}`}
                onDropIndex={(from) => setPillars((prev) => reorder(prev, from, index))}
                dragPrefix="pillar"
              >
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <h3 className="text-base font-semibold leading-snug">
                    {pillar.title || (
                      <span className="text-muted-foreground/60">Untitled pillar</span>
                    )}
                  </h3>
                  {pillarCounts[pillar.id] ? (
                    <span className="flex-none rounded-full border border-border/70 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                      {pillarCounts[pillar.id]} video{pillarCounts[pillar.id] === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                {pillar.description && (
                  <p className="mt-1 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                    <Linkified text={pillar.description} />
                  </p>
                )}
              </ReadRow>
            )
          )}
        </div>
      </Section>

      {/* Recurring ideas */}
      <Section
        icon={Repeat}
        title="Recurring ideas"
        blurb="Repeatable formats and series to keep making. Ideation pulls straight from this list."
        onAdd={
          canEdit
            ? () => {
                const id = newId();
                setRecurringIdeas((r) => [...r, { id, title: '', notes: '' }]);
                setEditing(id);
              }
            : undefined
        }
        addLabel="Add idea"
      >
        <div className="space-y-1">
          {recurringIdeas.map((idea, index) =>
            editing === idea.id ? (
              <div
                key={idea.id}
                className="rounded-xl border border-primary/40 bg-muted/20 p-4 space-y-3"
              >
                <Input
                  autoFocus
                  value={idea.title}
                  onChange={(e) =>
                    setRecurringIdeas((prev) =>
                      prev.map((r) => (r.id === idea.id ? { ...r, title: e.target.value } : r))
                    )
                  }
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  placeholder="Idea / format name"
                  aria-label="Idea name"
                  maxLength={200}
                  className="text-sm font-medium"
                />
                <Textarea
                  value={idea.notes}
                  onChange={(e) =>
                    setRecurringIdeas((prev) =>
                      prev.map((r) => (r.id === idea.id ? { ...r, notes: e.target.value } : r))
                    )
                  }
                  onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                  placeholder="Cadence, references, what makes it work…"
                  aria-label={`Notes for ${idea.title || 'new idea'}`}
                  maxLength={5000}
                  className="min-h-16"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={idea.pillarId || 'none'}
                    onValueChange={(v) =>
                      setRecurringIdeas((prev) =>
                        prev.map((r) =>
                          r.id === idea.id ? { ...r, pillarId: v === 'none' ? undefined : v } : r
                        )
                      )
                    }
                  >
                    <SelectTrigger aria-label="Pillar" size="sm">
                      <SelectValue placeholder="Pillar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No pillar</SelectItem>
                      {pillars.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title || 'Untitled pillar'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={idea.videoType || 'LONGFORM'}
                    onValueChange={(v) =>
                      setRecurringIdeas((prev) =>
                        prev.map((r) =>
                          r.id === idea.id ? { ...r, videoType: v as IdeaVideoType } : r
                        )
                      )
                    }
                  >
                    <SelectTrigger aria-label="Format" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_META) as IdeaVideoType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TYPE_META[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex-1" />
                  <button
                    onClick={() => removeIdea(idea)}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors p-1.5 -m-1.5"
                    aria-label={`Remove ${idea.title || 'untitled idea'}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </button>
                  <Button size="sm" onClick={() => setEditing(null)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <ReadRow
                key={idea.id}
                canEdit={canEdit}
                onEdit={() => setEditing(idea.id)}
                editLabel={`Edit idea ${idea.title || 'untitled'}`}
                draggable={canEdit}
                dragKey={`idea:${index}`}
                onDropIndex={(from) => setRecurringIdeas((prev) => reorder(prev, from, index))}
                dragPrefix="idea"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {idea.title || (
                          <span className="text-muted-foreground/60">Untitled idea</span>
                        )}
                      </span>
                      {idea.videoType && idea.videoType !== 'LONGFORM' && (
                        <span className="flex-none text-[11px] text-muted-foreground">
                          {TYPE_META[idea.videoType]}
                        </span>
                      )}
                      {pillarTitle(idea.pillarId) && (
                        <span className="flex-none rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px]">
                          {pillarTitle(idea.pillarId)}
                        </span>
                      )}
                    </div>
                    {idea.notes && (
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                        <Linkified text={idea.notes} />
                      </p>
                    )}
                  </div>
                  {canCreatePipeline && (
                    <div className="flex-none pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <PipelineButton
                        workspaceId={workspaceId}
                        idea={idea}
                        state={pipeline[idea.id]}
                        onClick={() => sendToPipeline(idea)}
                      />
                    </div>
                  )}
                </div>
              </ReadRow>
            )
          )}
        </div>
      </Section>

      {/* Notes */}
      <Section
        icon={StickyNote}
        title="Notes"
        blurb="Anything else — quarterly plan, positioning, audience, do/don't, links."
      >
        {editing === 'notes' ? (
          <div className="rounded-xl border border-primary/40 bg-muted/20 p-4 space-y-3">
            <Textarea
              autoFocus
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
              placeholder="Free-form strategy notes…"
              aria-label="Strategy notes"
              maxLength={20000}
              className="min-h-40"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setEditing(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <ReadRow
            canEdit={canEdit}
            onEdit={() => setEditing('notes')}
            editLabel="Edit notes"
            draggable={false}
          >
            {notes.trim() ? (
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                <Linkified text={notes} />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/60">
                {canEdit ? 'Click to add notes…' : 'No notes yet.'}
              </p>
            )}
          </ReadRow>
        )}
      </Section>
    </div>
  );
}

/**
 * A read-mode block: renders content as document prose; for editors it is
 * click-to-edit (keyboard included) with a hover pencil, and draggable to
 * reorder within its list.
 */
function ReadRow({
  children,
  canEdit,
  onEdit,
  editLabel,
  draggable,
  dragKey,
  dragPrefix,
  onDropIndex,
}: {
  children: React.ReactNode;
  canEdit: boolean;
  onEdit: () => void;
  editLabel: string;
  draggable?: boolean;
  dragKey?: string;
  dragPrefix?: string;
  onDropIndex?: (fromIndex: number) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const interactive = canEdit;
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? editLabel : undefined}
      onClick={interactive ? onEdit : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEdit();
              }
            }
          : undefined
      }
      draggable={draggable && !!dragKey}
      onDragStart={
        draggable && dragKey
          ? (e) => e.dataTransfer.setData(`text/kk-strategy-${dragPrefix}`, dragKey)
          : undefined
      }
      onDragOver={
        draggable && onDropIndex
          ? (e) => {
              if (e.dataTransfer.types.includes(`text/kk-strategy-${dragPrefix}`)) {
                e.preventDefault();
                setDragOver(true);
              }
            }
          : undefined
      }
      onDragLeave={() => setDragOver(false)}
      onDrop={
        draggable && onDropIndex
          ? (e) => {
              setDragOver(false);
              const data = e.dataTransfer.getData(`text/kk-strategy-${dragPrefix}`);
              const from = Number(data.split(':')[1]);
              if (Number.isInteger(from)) onDropIndex(from);
            }
          : undefined
      }
      className={cn(
        'group relative rounded-lg px-3 py-2.5 -mx-3 transition-colors',
        interactive &&
          'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50',
        dragOver && 'ring-1 ring-primary/60 bg-muted/30'
      )}
    >
      {interactive && (
        <span className="absolute right-2 top-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity text-muted-foreground/60">
          {draggable && <GripVertical className="h-3.5 w-3.5" aria-hidden />}
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      {children}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  blurb,
  onAdd,
  addLabel,
  children,
}: {
  icon: typeof Compass;
  title: string;
  blurb: string;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon className="h-4 w-4 text-primary" aria-hidden />
            {title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>
        </div>
        {onAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="flex-none">
            <Plus className="h-4 w-4 mr-1.5" />
            {addLabel}
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function SaveWhisper({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'idle') return null;
  if (state === 'saving')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  if (state === 'saved')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  if (state === 'conflict')
    return (
      <button
        onClick={() => window.location.reload()}
        className="text-xs text-destructive hover:underline"
      >
        Updated elsewhere — reload to get the latest
      </button>
    );
  return (
    <button onClick={onRetry} className="text-xs text-destructive hover:underline">
      Save failed — retry
    </button>
  );
}

function PipelineButton({
  workspaceId,
  idea,
  state,
  onClick,
}: {
  workspaceId: string;
  idea: RecurringIdea;
  state?: PipelineState;
  onClick: () => void;
}) {
  if (idea.videoId) {
    return (
      <Link
        href={`/workspaces/${workspaceId}/videos/${idea.videoId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
      >
        <Check className="h-3.5 w-3.5" />
        In pipeline
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    );
  }
  const disabled = !idea.title.trim();
  const sending = state === 'sending';
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || sending}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap p-1 -m-1"
        title={disabled ? 'Give the idea a name first' : 'Create an IDEA item in the pipeline'}
      >
        {sending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
        Send to pipeline
      </button>
      {state === 'error' && (
        <button onClick={onClick} className="text-xs text-destructive hover:underline">
          failed — retry
        </button>
      )}
    </span>
  );
}
