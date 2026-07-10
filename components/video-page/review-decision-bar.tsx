'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Decision = 'approve' | 'request-changes';

/**
 * The reviewer's verdict bar — makes it obvious what happens after a review.
 * Shown on the watch page while the item is in REVIEW: finish the round and
 * send it back to the editor, or approve the video outright.
 */
export function ReviewDecisionBar({
  videoId,
  status,
  guestName,
  onDecided,
}: {
  videoId: string;
  status: string;
  guestName: string;
  onDecided: (nextStatus: string) => void;
}) {
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (status !== 'REVIEW') {
    if (status === 'APPROVED') {
      return (
        <div className="border-b border-border bg-green-500/10 px-4 py-2 text-center text-sm font-medium text-green-600 dark:text-green-400">
          ✓ This video is approved and ready for upload
        </div>
      );
    }
    return null;
  }

  async function decide(decision: Decision) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/videos/${videoId}/review-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, name: guestName || undefined }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      const nextStatus = data?.data?.status ?? (decision === 'approve' ? 'APPROVED' : 'EDITING');
      setConfirming(null);
      if (decision === 'request-changes') {
        setMessage('Review complete — the editor has been notified and will work on the next version.');
      }
      onDecided(nextStatus);
    } catch {
      setMessage('That didn’t go through — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="border-b border-border bg-card px-3 py-2.5 sm:px-4">
        {message ? (
          <p className="mb-2 text-center text-sm text-muted-foreground">{message}</p>
        ) : null}
        <div className="mx-auto flex w-full max-w-xl gap-2">
          <button
            onClick={() => setConfirming('request-changes')}
            disabled={busy}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            🔁 Complete review & send to editor
          </button>
          <button
            onClick={() => setConfirming('approve')}
            disabled={busy}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            ✅ Approve video
          </button>
        </div>
      </div>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === 'approve' ? 'Approve this video?' : 'Finished with this review?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === 'approve'
                ? 'Please confirm this video is approved and ready for upload.'
                : 'Are you sure you’re finished with this review? This will send the video back to the editor to work on the next version.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (confirming) void decide(confirming);
              }}
              className={
                confirming === 'approve' ? 'bg-green-600 text-white hover:bg-green-700' : undefined
              }
            >
              {busy ? 'Saving…' : confirming === 'approve' ? 'Approve video' : 'Send to editor'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
