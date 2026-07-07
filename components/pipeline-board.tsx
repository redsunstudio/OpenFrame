'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, MessageSquare, Film, Loader2, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const PIPELINE_STAGES = [
  { key: 'IDEA', label: 'Idea' },
  { key: 'FILMED', label: 'Filmed' },
  { key: 'EDITING', label: 'In edit' },
  { key: 'REVIEW', label: 'In review' },
  { key: 'CHANGES', label: 'Changes' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'REJECTED', label: 'Rejected' },
] as const;

type StageKey = (typeof PIPELINE_STAGES)[number]['key'];

const STAGE_DOT: Record<StageKey, string> = {
  IDEA: 'bg-muted-foreground',
  FILMED: 'bg-amber-500',
  EDITING: 'bg-orange-500',
  REVIEW: 'bg-primary',
  CHANGES: 'bg-blue-400',
  APPROVED: 'bg-green-500',
  PUBLISHED: 'bg-green-700',
  REJECTED: 'bg-red-500',
};

interface PipelineVideo {
  id: string;
  title: string;
  status: string;
  brief: string | null;
  currentVersion: number;
  commentCount: number;
}

interface PipelineBoardProps {
  projectId: string;
  videos: PipelineVideo[];
  canEdit: boolean;
}

export function PipelineBoard({ projectId, videos, canEdit }: PipelineBoardProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [creating, setCreating] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  async function createIdea() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planned: true, title: title.trim(), brief: brief.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Could not create the item');
      toast.success('Added to the pipeline');
      setDialogOpen(false);
      setTitle('');
      setBrief('');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the item');
    } finally {
      setCreating(false);
    }
  }

  async function moveStatus(videoId: string, status: string) {
    setMovingId(videoId);
    try {
      const res = await fetch(`/api/projects/${projectId}/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Could not update status');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setMovingId(null);
    }
  }

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Pipeline</h2>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New video idea
          </Button>
        )}
      </div>

      <div className="space-y-6">
        {PIPELINE_STAGES.map((stage) => {
          const items = videos.filter((v) => v.status === stage.key);
          if (items.length === 0 && stage.key !== 'IDEA') return null;
          return (
            <div key={stage.key}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('h-2 w-2 rounded-full', STAGE_DOT[stage.key])} />
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-xs text-muted-foreground font-mono">{items.length}</span>
              </div>
              <div className="rounded-lg border divide-y bg-background">
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground px-4 py-3">
                    Nothing here yet{canEdit ? ' — add the next video idea.' : '.'}
                  </p>
                )}
                {items.map((v) => (
                  <div key={v.id} className="flex items-center gap-4 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    {v.currentVersion > 0 ? (
                      <Link
                        href={`/projects/${projectId}/videos/${v.id}`}
                        className="text-sm font-medium hover:underline truncate flex-1 min-w-0"
                      >
                        {v.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium truncate flex-1 min-w-0">{v.title}</span>
                    )}
                    {v.brief && (
                      <span className="hidden lg:block text-xs text-muted-foreground truncate max-w-[260px]">
                        {v.brief}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1 flex-none w-16">
                      {v.currentVersion > 0 ? (
                        <>
                          <Film className="h-3 w-3" />v{v.currentVersion}
                        </>
                      ) : (
                        <>
                          <Lightbulb className="h-3 w-3" />
                          idea
                        </>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1 flex-none w-10">
                      {v.commentCount > 0 && (
                        <>
                          <MessageSquare className="h-3 w-3" />
                          {v.commentCount}
                        </>
                      )}
                    </span>
                    {canEdit && (
                      <span className="flex-none">
                        {movingId === v.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Select value={v.status} onValueChange={(next) => moveStatus(v.id, next)}>
                            <SelectTrigger className="h-7 w-[120px] text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PIPELINE_STAGES.map((st) => (
                                <SelectItem key={st.key} value={st.key} className="text-xs">
                                  {st.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New video idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder='Working title — e.g. "iPhone 17 vs iPhone 16"'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
            <Textarea
              placeholder="Brief (optional) — the angle, the hook, anything the shoot or edit needs to know"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={4}
              maxLength={5000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={createIdea} disabled={creating || !title.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Add to pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
