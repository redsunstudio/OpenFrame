'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Channel {
  id: string;
  username: string;
  profileName: string | null;
}

interface PublishingState {
  youtubeAccountId: string | null;
  hasWorkspaceKey: boolean;
  keyHint: string | null;
  agencyKeyAvailable: boolean;
  channels: Channel[];
  channelError: string | null;
}

/** Settings → Publishing: wire the client's YouTube channel (via Zernio). */
export function PublishingSettings({ workspaceId }: { workspaceId: string }) {
  const [state, setState] = useState<PublishingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyDraft, setKeyDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/publishing`);
      if (r.ok) setState((await r.json()).data);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: { apiKey?: string | null; youtubeAccountId?: string | null }) {
    setSaving(true);
    try {
      const r = await fetch(`/api/workspaces/${workspaceId}/publishing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error((await r.json())?.error?.message || 'Could not save');
      toast.success('Publishing settings saved');
      setKeyDraft('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">📺 YouTube publishing</CardTitle>
        <CardDescription>
          Wire this workspace to a YouTube channel connected in Zernio. &quot;Push to YouTube&quot;
          on a video then lands it in that channel&apos;s YouTube Studio as a private draft.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading || !state ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium">Zernio API key</p>
              <p className="text-xs text-muted-foreground">
                {state.hasWorkspaceKey
                  ? `This workspace uses its own key (${state.keyHint}).`
                  : state.agencyKeyAvailable
                    ? 'Using the agency key — only set a key here if this client runs their own Zernio account.'
                    : 'No key available — paste a Zernio API key to enable publishing.'}
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="sk_… (optional override)"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  className="max-w-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || !keyDraft.trim()}
                  onClick={() => void save({ apiKey: keyDraft.trim() })}
                >
                  Save key
                </Button>
                {state.hasWorkspaceKey && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={() => void save({ apiKey: null })}
                  >
                    Use agency key
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Channel</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5"
                  onClick={() => void load()}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              {state.channelError ? (
                <p className="text-xs text-destructive">{state.channelError}</p>
              ) : state.channels.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No YouTube channels found — connect the client&apos;s channel in Zernio, then
                  reload.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {state.channels.map((c) => {
                    const active = c.id === state.youtubeAccountId;
                    return (
                      <button
                        key={c.id}
                        disabled={saving}
                        onClick={() => void save({ youtubeAccountId: active ? null : c.id })}
                        className={cn(
                          'w-full max-w-sm flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          active
                            ? 'border-primary/60 bg-primary/10'
                            : 'hover:border-white/20 hover:bg-white/[0.03]'
                        )}
                      >
                        <span
                          className={cn(
                            'h-2 w-2 rounded-full flex-none',
                            active ? 'bg-primary' : 'bg-white/15'
                          )}
                        />
                        <span className="font-medium truncate">{c.username}</span>
                        {c.profileName && (
                          <span className="text-xs text-muted-foreground truncate ml-auto">
                            {c.profileName}
                          </span>
                        )}
                        {active && <span className="text-xs text-primary flex-none">wired ✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </>
        )}
      </CardContent>
    </Card>
  );
}
