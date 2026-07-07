'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, MessageSquare, Film, Loader2, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  { key: 'EDITING', label: 'Editing' },
  { key: 'REVIEW', label: 'In review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'PUBLISHED', label: 'Published' },
] as const;

type StageKey = (typeof PIPELINE_STAGES)[number]['key'];

const STAGE_DOT: Record<StageKey, string> = {
  IDEA: 'bg-muted-foreground',
  FILMED: 'bg-amber-500',
  EDITING: 'bg-orange-500',
  REVIEW: 'bg-primary',
  APPROVED: 'bg-green-500',
  PUBLISHED: 'bg-green-700',
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PIPELINE_STAGES.map((stage) => {
          const items = videos.filter((v) => v.status === stage.key);
          if (items.length === 0 && stage.key !== 'IDEA') return null;
          return (
            <Card key={stage.key}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('h-2 w-2 rounded-full', STAGE_DOT[stage.key])} />
                  <span className="text-sm font-medium">{stage.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto font-mono">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      Nothing here yet{canEdit ? ' — add the next video idea.' : '.'}
                    </p>
                  )}
                  {items.map((v) => (
                    <div key={v.id} className="rounded-lg border p-3 bg-background">
                      {v.currentVersion > 0 ? (
                        <Link
                          href={`/projects/${projectId}/videos/${v.id}`}
                          className="text-sm font-medium hover:underline block truncate"
                        >
                          {v.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium block truncate">{v.title}</span>
                      )}
                      {v.brief && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.brief}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {v.currentVersion > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Film className="h-3 w-3" />v{v.currentVersion}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <Lightbulb className="h-3 w-3" />
                            no cut yet
                          </span>
                        )}
                        {v.commentCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {v.commentCount}
                          </span>
                        )}
                        {canEdit && (
                          <span className="ml-auto">
                            {movingId === v.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Select
                                value={v.status}
                                onValueChange={(next) => moveStatus(v.id, next)}
                              >
                                <SelectTrigger className="h-6 w-[110px] text-xs px-2">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {PIPELINE_STAGES.map((s) => (
                                    <SelectItem key={s.key} value={s.key} className="text-xs">
                                      {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
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
