'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

/** Admin control: set the workspace's square cover art (podcast-style). */
export function CoverButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('The cover needs to be an image');
      return;
    }
    setBusy(true);
    try {
      const initRes = await fetch(`/api/workspaces/${workspaceId}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          init: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
        }),
      });
      if (!initRes.ok)
        throw new Error((await initRes.json())?.error?.message || 'Could not start the upload');
      const init = (await initRes.json()).data;
      const put = await fetch(init.presignedPutUrl, {
        method: 'PUT',
        headers: { 'Content-Type': init.contentType },
        body: file,
      });
      if (!put.ok) throw new Error('Storage rejected the image');
      const commit = await fetch(`/api/workspaces/${workspaceId}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commit: { objectKey: init.objectKey } }),
      });
      if (!commit.ok) throw new Error('Could not save the cover');
      toast.success('Cover saved');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cover upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="flex-1 sm:flex-none"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <span className="mr-2">🖼️</span>}
        Cover
      </Button>
    </>
  );
}
