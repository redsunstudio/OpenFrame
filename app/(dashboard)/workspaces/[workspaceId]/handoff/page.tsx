import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { hasModule } from '@/lib/workspace-features';
import { ModuleNav } from '@/components/workspace/module-nav';

interface HandoffPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function HandoffPage({ params }: HandoffPageProps) {
  const session = await auth();
  const { workspaceId } = await params;

  if (!session?.user?.id) {
    redirect('/login');
  }

  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: { members: { where: { userId: session.user.id }, select: { role: true } } },
  });
  if (!workspace) notFound();

  const access = await checkWorkspaceAccess(
    { id: workspace.id, ownerId: workspace.ownerId },
    session.user.id
  );
  if (!access.hasAccess || !hasModule(workspace, 'handoff')) {
    redirect(`/workspaces/${workspaceId}`);
  }

  return (
    <div className="px-6 lg:px-8 py-8 w-full">
      <div className="mb-6">
        <Link
          href="/workspaces"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          All Workspaces
        </Link>
      </div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{workspace.name}</h1>
      </div>

      <ModuleNav workspace={workspace} active="handoff" />

      <Card>
        <CardContent className="py-14 flex flex-col items-center text-center gap-3">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Footage Handoff is moving in here</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            The native drop zone lands in this tab shortly. Until then, send footage through
            the Footage Handoff page on your dashboard — everything sent there is already
            logged and picked up by the team.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
