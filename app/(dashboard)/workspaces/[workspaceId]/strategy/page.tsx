import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { hasModule } from '@/lib/workspace-features';
import { ModuleNav } from '@/components/workspace/module-nav';
import { StrategyEditor } from '@/components/workspace/strategy-editor';
import { parseStrategy } from '@/lib/strategy';

export const dynamic = 'force-dynamic';

interface StrategyPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function StrategyPage({ params }: StrategyPageProps) {
  const session = await auth();
  const { workspaceId } = await params;

  if (!session?.user?.id) {
    redirect('/login');
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      features: true,
      brandAccent: true,
      strategy: true,
    },
  });
  if (!workspace) notFound();

  const access = await checkWorkspaceAccess(
    { id: workspace.id, ownerId: workspace.ownerId },
    session.user.id
  );
  if (!access.hasAccess || !hasModule(workspace, 'strategy')) {
    redirect(`/workspaces/${workspaceId}`);
  }

  const canEdit = access.isOwner || access.isMember;
  const strategy = parseStrategy(workspace.strategy);

  return (
    <div
      className="px-6 lg:px-8 py-8 w-full"
      style={
        workspace.brandAccent
          ? ({ '--primary': workspace.brandAccent } as React.CSSProperties)
          : undefined
      }
    >
      <div className="mb-6">
        <Link
          href={`/workspaces/${workspaceId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {workspace.name}
        </Link>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{workspace.name}</h1>
        <p className="text-muted-foreground mt-1">
          The channel&rsquo;s strategy — pillars, recurring ideas and notes the whole team works
          from.
        </p>
      </div>

      <ModuleNav workspace={workspace} active="strategy" />

      <StrategyEditor
        workspaceId={workspaceId}
        initial={strategy}
        canEdit={canEdit}
        canCreatePipeline={access.canEdit}
        accent={workspace.brandAccent}
      />
    </div>
  );
}
