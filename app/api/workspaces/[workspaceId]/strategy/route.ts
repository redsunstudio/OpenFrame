import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { parseStrategy, strategyLimitError } from '@/lib/strategy';

interface Ctx {
  params: Promise<{ workspaceId: string }>;
}

// PUT — replace the strategy blob. Any member may edit: the creator logs
// their own strategy here, and the team + ideation skills read it back.
// The payload must be { strategy: {...} } and carry the rev the editor loaded;
// a stale rev gets 409 so concurrent editors can't silently overwrite each other.
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const limited = await rateLimit(req, 'mutate');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();

    const { workspaceId } = await params;
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, ownerId: true, strategy: true },
    });
    if (!workspace) return apiErrors.notFound('Workspace');

    const access = await checkWorkspaceAccess(
      { id: workspace.id, ownerId: workspace.ownerId },
      session.user.id
    );
    // hasAccess already means billing-active owner or member — the member
    // write gate is deliberate (this is the creator's own strategy doc).
    if (!access.hasAccess) return apiErrors.forbidden();

    const body = await req.json().catch(() => null);
    const rawStrategy = body && typeof body === 'object' ? body.strategy : undefined;
    // Strict shape: a mis-wrapped payload must 400, never persist as empty.
    if (!rawStrategy || typeof rawStrategy !== 'object' || Array.isArray(rawStrategy)) {
      return apiErrors.badRequest(
        'body must be { strategy: { pillars, recurringIdeas, notes, rev } }'
      );
    }
    const limitError = strategyLimitError(rawStrategy);
    if (limitError) return apiErrors.badRequest(limitError);

    const current = parseStrategy(workspace.strategy);
    const incoming = parseStrategy(rawStrategy);
    // Optimistic lock: only enforced when the caller sends a rev (the editor
    // always does; rev 0 on a fresh blob matches EMPTY parse).
    if (typeof rawStrategy.rev === 'number' && incoming.rev !== current.rev) {
      return apiErrors.conflict('Strategy was updated elsewhere — reload to get the latest');
    }

    const strategy = { ...incoming, rev: current.rev + 1 };
    await db.workspace.update({
      where: { id: workspaceId },
      data: { strategy: strategy as unknown as Prisma.InputJsonValue },
    });

    return withCacheControl(successResponse({ strategy }), 'private, no-store');
  } catch (error) {
    logError('strategy update failed:', error);
    return apiErrors.internalError('Failed to save the strategy');
  }
}
