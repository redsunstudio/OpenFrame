import { Loader2 } from 'lucide-react';

/**
 * Streaming boundary for the workspace segment — tab switches paint instantly
 * with this skeleton instead of blocking on the server render.
 */
export default function WorkspaceLoading() {
  return (
    <div className="px-6 lg:px-8 py-8 w-full">
      <div className="mb-6 h-4 w-32 rounded bg-muted/40 animate-pulse" />
      <div className="flex items-center gap-4 mb-8">
        <div className="h-16 w-16 rounded-2xl bg-muted/40 animate-pulse flex-none" />
        <div className="space-y-2">
          <div className="h-7 w-56 rounded bg-muted/40 animate-pulse" />
          <div className="h-4 w-36 rounded bg-muted/30 animate-pulse" />
        </div>
      </div>
      <div className="mb-8 flex items-center gap-6 border-b pb-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-20 rounded bg-muted/30 animate-pulse" />
        ))}
      </div>
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    </div>
  );
}
