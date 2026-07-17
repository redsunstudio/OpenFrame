import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseStrategy } from '@/lib/strategy';

interface Ctx {
  params: Promise<{ workspaceId: string }>;
}

// GET — the workspace's channel strategy (any member can read).
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { workspaceId } = await params;
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true, strategy: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await checkWorkspaceAccess(
    { id: workspace.id, ownerId: workspace.ownerId },
    session.user.id
  );
  if (!access.hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ data: { strategy: parseStrategy(workspace.strategy) } });
}

// PUT — replace the whole strategy blob. Any member may edit: the creator logs
// their own strategy here, and the team + ideation skills read it back.
export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { workspaceId } = await params;
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true },
  });
  if (!workspace) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await checkWorkspaceAccess(
    { id: workspace.id, ownerId: workspace.ownerId },
    session.user.id
  );
  // Members (creators + team), not just admins — this is their strategy doc.
  if (!access.hasAccess || (!access.isOwner && !access.isMember)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Sanitize + clamp before persisting (never trust the payload shape/size).
  const strategy = parseStrategy((body as Record<string, unknown>).strategy ?? body);

  await db.workspace.update({
    where: { id: workspaceId },
    data: { strategy: strategy as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ data: { strategy } });
}
