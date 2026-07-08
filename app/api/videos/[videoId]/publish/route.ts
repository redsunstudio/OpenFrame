import { NextRequest } from 'next/server';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import {
  publishVideoToYouTube,
  PublishError,
  publishChecks,
  isWorkspacePublishReady,
  type PublishMode,
} from '@/lib/publish-video';
import { logError } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ videoId: string }>;
}

async function videoWorkspaceAccess(videoId: string, userId: string) {
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: {
      project: {
        select: { workspace: { select: { id: true, ownerId: true, publishing: true } } },
      },
      versions: {
        where: { isActive: true },
        take: 1,
        select: { providerId: true, videoId: true },
      },
    },
  });
  if (!video) return null;
  const workspace = video.project.workspace;
  return { video, workspace, access: await checkWorkspaceAccess(workspace, userId) };
}

// GET — publish readiness: is the rail wired, and are title/description/thumbnail in?
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();
    const { videoId } = await params;
    const ctx = await videoWorkspaceAccess(videoId, session.user.id);
    if (!ctx) return apiErrors.notFound('Video');
    if (!ctx.access.hasAccess) return apiErrors.forbidden('Access denied');
    return withCacheControl(
      successResponse({
        configured: isWorkspacePublishReady(ctx.workspace.publishing),
        canPublish: ctx.access.canEdit,
        checks: publishChecks(ctx.video),
      }),
      'private, no-store'
    );
  } catch (error) {
    logError('publish readiness check failed:', error);
    return apiErrors.internalError('Failed to check publish readiness');
  }
}

// POST { mode?: 'studio'|'draft'|'live' } — hand the active cut to Zernio for YouTube.
// 'studio' (the Push to YouTube button) lands as a PRIVATE video in YouTube Studio.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();
    const { videoId } = await params;
    const ctx = await videoWorkspaceAccess(videoId, session.user.id);
    if (!ctx) return apiErrors.notFound('Video');
    if (!ctx.access.canEdit) return apiErrors.forbidden('Only workspace admins can publish');

    const body = await request.json().catch(() => null);
    const mode: PublishMode = ['studio', 'draft', 'live'].includes(body?.mode)
      ? body.mode
      : body?.publishNow === true // back-compat with the first rail
        ? 'live'
        : 'studio';
    const result = await publishVideoToYouTube(videoId, {
      mode,
      actorName: session.user.name ?? undefined,
    });
    return withCacheControl(successResponse(result), 'private, no-store');
  } catch (error) {
    if (error instanceof PublishError) {
      return error.statusCode === 404
        ? apiErrors.notFound('Video')
        : apiErrors.badRequest(error.message);
    }
    logError('publish failed:', error);
    return apiErrors.internalError(
      'Publishing failed — the cut may be too large or Zernio may be down'
    );
  }
}
