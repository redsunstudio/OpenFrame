import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { buildBillingAccessWhereInput, getBillingOverview } from '@/lib/billing';
import {
  hasCollaboratorBillingBackedAccess,
  requireBillingAccessOrRedirect,
} from '@/lib/route-access';
import { WorkspacesClient } from './workspaces-client';

export default async function WorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const hasCollaboratorAccess = await hasCollaboratorBillingBackedAccess(session.user.id);
  if (!hasCollaboratorAccess) {
    await requireBillingAccessOrRedirect({ userId: session.user.id });
  }

  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams?.page) || 1;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  const [workspaces, totalWorkspaces, billing] = await Promise.all([
    db.workspace.findMany({
      skip,
      take: pageSize,
      where: {
        OR: [
          { ownerId: session.user.id, owner: buildBillingAccessWhereInput() },
          { members: { some: { userId: session.user.id } }, owner: buildBillingAccessWhereInput() },
        ],
      },
      include: {
        owner: { select: { id: true, name: true } },
        _count: {
          select: {
            projects: true,
            members: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.workspace.count({
      where: {
        OR: [
          { ownerId: session.user.id, owner: buildBillingAccessWhereInput() },
          { members: { some: { userId: session.user.id } }, owner: buildBillingAccessWhereInput() },
        ],
      },
    }),
    getBillingOverview(session.user.id),
  ]);

  const totalPages = Math.ceil(totalWorkspaces / pageSize);

  // Blog-card covers: each workspace's freshest item thumbnail + video count
  const wsIds = workspaces.map((w) => w.id);
  const [coverVideos, videoCounts] = await Promise.all([
    db.video.findMany({
      where: { project: { workspaceId: { in: wsIds } }, thumbnailUrl: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { thumbnailUrl: true, project: { select: { workspaceId: true } } },
      take: 100,
    }),
    db.video.groupBy({
      by: ['projectId'],
      where: { project: { workspaceId: { in: wsIds } } },
      _count: { id: true },
    }),
  ]);
  const projectToWs = new Map<string, string>();
  const wsProjects = await db.project.findMany({
    where: { workspaceId: { in: wsIds } },
    select: { id: true, workspaceId: true },
  });
  for (const p of wsProjects) projectToWs.set(p.id, p.workspaceId);
  const coverByWs = new Map<string, string>();
  for (const v of coverVideos) {
    const ws = v.project.workspaceId;
    if (!coverByWs.has(ws) && v.thumbnailUrl) {
      coverByWs.set(ws, v.thumbnailUrl.includes('?') ? v.thumbnailUrl : `${v.thumbnailUrl}?inline=1`);
    }
  }
  const countByWs = new Map<string, number>();
  for (const g of videoCounts) {
    const ws = projectToWs.get(g.projectId);
    if (ws) countByWs.set(ws, (countByWs.get(ws) ?? 0) + g._count.id);
  }

  const serializedWorkspaces = workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    updatedAt: w.updatedAt.toISOString(),
    _count: w._count,
    brandAccent: w.brandAccent,
    coverUrl: w.coverKey ? `/api/workspaces/${w.id}/cover` : (coverByWs.get(w.id) ?? null),
    videoCount: countByWs.get(w.id) ?? 0,
  }));

  return (
    <WorkspacesClient
      workspaces={serializedWorkspaces}
      totalPages={totalPages}
      currentPage={page}
      workspaceCreation={billing.workspaceCreation}
    />
  );
}
