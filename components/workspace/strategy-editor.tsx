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
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ContentPillar, RecurringIdea, WorkspaceStrategy } from '@/lib/strategy';

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

interface StrategyEditorProps {
  workspaceId: string;
  initial: WorkspaceStrategy;
  canEdit: boolean;
  /** Owner/admins can spawn a recurring idea into the pipeline as an IDEA item. */
  canCreatePipeline: boolean;
  accent?: string | null;
}

type PipelineState = 'sending' | 'error';

type Sections = Omit<WorkspaceStrategy, 'rev'>;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p_${Math.random().toString(36).slice(2)}`;
  }
}

export function StrategyEditor({
  workspaceId,
  initial,
  canEdit,
  canCreatePipeline,
  accent,
}: StrategyEditorProps) {
  const [pillars, setPillars] = useState<ContentPillar[]>(initial.pillars);
  const [recurringIdeas, setRecurringIdeas] = useState<RecurringIdea[]>(initial.recurringIdeas);
  const [notes, setNotes] = useState(initial.notes);
  const [save, setSave] = useState<SaveState>('idle');
  const [pipeline, setPipeline] = useState<Record<string, PipelineState>>({});

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Freshest sections for the debounced flush + unload paths.
  const latest = useRef<Sections>({
    pillars: initial.pillars,
    recurringIdeas: initial.recurringIdeas,
    notes: initial.notes,
  });
  // Snapshot of the last successfully saved content — the dirty check.
  const lastSaved = useRef(
    JSON.stringify({
      pillars: initial.pillars,
      recurringIdeas: initial.recurringIdeas,
      notes: initial.notes,
    })
  );
  // Optimistic-lock revision; bumped from each save response.
  const rev = useRef(initial.rev);
  // True while an edit is awaiting a save (drives unmount/pagehide flushes).
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
        lastSaved.current = JSON.stringify(sections);
        pending.current = false;
        setSave('saved');
        if (savedBadgeTimer.current) clearTimeout(savedBadgeTimer.current);
        savedBadgeTimer.current = setTimeout(
          () => setSave((s) => (s === 'saved' ? 'idle' : s)),
          2000
        );
      } else if (res.status === 409) {
        // Someone else saved since we loaded — stop writing, ask for a reload.
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
          // Persist the link on the idea itself (rides the next auto-save),
          // so "In pipeline" survives reloads and blocks duplicate sends.
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

  return (
    <div className="max-w-3xl space-y-8">
      {canEdit && (
        <div className="flex items-center justify-end -mb-4">
          <SaveWhisper state={save} onRetry={flush} />
        </div>
      )}

      {/* Content pillars */}
      <Section
        icon={Compass}
        title="Content pillars"
        blurb="The 3–5 recurring themes this channel is built on. Every video should ladder up to one."
        accent={accent}
        onAdd={
          canEdit
            ? () => setPillars((p) => [...p, { id: newId(), title: '', description: '' }])
            : undefined
        }
        addLabel="Add pillar"
        empty={pillars.length === 0}
        emptyText="No pillars yet. Add the core themes the channel keeps coming back to."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <Card key={pillar.id} className="overflow-hidden">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AutoInput
                    value={pillar.title}
                    onChange={(v) =>
                      setPillars((prev) =>
                        prev.map((p) => (p.id === pillar.id ? { ...p, title: v } : p))
                      )
                    }
                    placeholder="Pillar name"
                    className="font-semibold text-sm"
                    readOnly={!canEdit}
                    maxLength={200}
                  />
                  {canEdit && (
                    <RemoveButton
                      onClick={() => setPillars((prev) => prev.filter((p) => p.id !== pillar.id))}
                    />
                  )}
                </div>
                <AutoTextarea
                  value={pillar.description}
                  onChange={(v) =>
                    setPillars((prev) =>
                      prev.map((p) => (p.id === pillar.id ? { ...p, description: v } : p))
                    )
                  }
                  placeholder="What it covers, why it wins, example angles…"
                  readOnly={!canEdit}
                  rows={3}
                  maxLength={5000}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* Recurring ideas */}
      <Section
        icon={Repeat}
        title="Recurring ideas"
        blurb="Repeatable formats and series to keep making. Ideation pulls straight from this list."
        accent={accent}
        onAdd={
          canEdit
            ? () => setRecurringIdeas((r) => [...r, { id: newId(), title: '', notes: '' }])
            : undefined
        }
        addLabel="Add idea"
        empty={recurringIdeas.length === 0}
        emptyText="No recurring ideas yet. Add formats, series or angles worth repeating."
      >
        <div className="space-y-2">
          {recurringIdeas.map((idea) => (
            <Card key={idea.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AutoInput
                    value={idea.title}
                    onChange={(v) =>
                      setRecurringIdeas((prev) =>
                        prev.map((r) => (r.id === idea.id ? { ...r, title: v } : r))
                      )
                    }
                    placeholder="Idea / format name"
                    className="font-medium text-sm"
                    readOnly={!canEdit}
                    maxLength={200}
                  />
                  {canEdit && (
                    <RemoveButton
                      onClick={() =>
                        setRecurringIdeas((prev) => prev.filter((r) => r.id !== idea.id))
                      }
                    />
                  )}
                </div>
                <AutoTextarea
                  value={idea.notes}
                  onChange={(v) =>
                    setRecurringIdeas((prev) =>
                      prev.map((r) => (r.id === idea.id ? { ...r, notes: v } : r))
                    )
                  }
                  placeholder="Cadence, references, what makes it work…"
                  readOnly={!canEdit}
                  rows={2}
                  maxLength={5000}
                />
                {canCreatePipeline && (
                  <PipelineButton
                    workspaceId={workspaceId}
                    idea={idea}
                    state={pipeline[idea.id]}
                    accent={accent}
                    onClick={() => sendToPipeline(idea)}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      {/* Notes */}
      <Section
        icon={StickyNote}
        title="Notes"
        blurb="Anything else — quarterly plan, positioning, audience, do/don't, links."
        accent={accent}
      >
        <Card>
          <CardContent className="p-3">
            <AutoTextarea
              value={notes}
              onChange={setNotes}
              placeholder="Free-form strategy notes…"
              readOnly={!canEdit}
              rows={8}
              maxLength={20000}
            />
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  blurb,
  accent,
  onAdd,
  addLabel,
  empty,
  emptyText,
  children,
}: {
  icon: typeof Compass;
  title: string;
  blurb: string;
  accent?: string | null;
  onAdd?: () => void;
  addLabel?: string;
  empty?: boolean;
  emptyText?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon className="h-4 w-4" style={{ color: accent || undefined }} />
            {title}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{blurb}</p>
        </div>
        {onAdd && (
          <Button variant="outline" size="sm" onClick={onAdd} className="flex-none">
            <Plus className="h-4 w-4 mr-1.5" />
            {addLabel}
          </Button>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground/70 border border-dashed border-border/60 rounded-lg px-4 py-6 text-center">
          {emptyText}
        </p>
      ) : (
        children
      )}
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

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-none mt-0.5 text-muted-foreground/50 hover:text-destructive transition-colors"
      aria-label="Remove"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function PipelineButton({
  workspaceId,
  idea,
  state,
  accent,
  onClick,
}: {
  workspaceId: string;
  idea: RecurringIdea;
  state?: PipelineState;
  accent?: string | null;
  onClick: () => void;
}) {
  // Persisted on the idea — survives reloads and blocks duplicate sends.
  if (idea.videoId) {
    return (
      <Link
        href={`/workspaces/${workspaceId}/videos/${idea.videoId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || sending}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={!disabled && !sending && accent ? { color: accent } : undefined}
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
    </div>
  );
}

function AutoInput({
  value,
  onChange,
  placeholder,
  className,
  readOnly,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  maxLength?: number;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      maxLength={maxLength}
      className={cn(
        'flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/50',
        !readOnly &&
          'rounded px-1.5 py-1 -mx-1.5 focus:bg-muted/40 focus:ring-1 focus:ring-primary/30 transition',
        className
      )}
    />
  );
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
  readOnly,
  rows = 3,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={rows}
      maxLength={maxLength}
      className={cn(
        'w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50',
        !readOnly &&
          'rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition'
      )}
    />
  );
}
