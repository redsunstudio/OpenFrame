import { NextRequest } from 'next/server';
import { auth, checkProjectAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ videoId: string }>;
}

async function videoWithAccess(videoId: string, userId: string | undefined) {
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { project: true },
  });
  if (!video) return { video: null, hasAccess: false };
  const access = await checkProjectAccess(video.project, userId);
  return { video, hasAccess: access.hasAccess };
}

// GET /api/videos/[videoId]/notes — the item's discussion thread
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();
    const { videoId } = await params;
    const { video, hasAccess } = await videoWithAccess(videoId, session.user.id);
    if (!video) return apiErrors.notFound('Video');
    if (!hasAccess) return apiErrors.forbidden('Access denied');

    const notes = await db.videoNote.findMany({
      where: { videoId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { author: { select: { id: true, name: true, image: true } } },
    });
    return withCacheControl(successResponse({ notes }), 'private, no-store');
  } catch (error) {
    logError('notes list failed:', error);
    return apiErrors.internalError('Failed to load notes');
  }
}

// POST /api/videos/[videoId]/notes { body }
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();
    const { videoId } = await params;
    const { video, hasAccess } = await videoWithAccess(videoId, session.user.id);
    if (!video) return apiErrors.notFound('Video');
    if (!hasAccess) return apiErrors.forbidden('Access denied');

    const payload = await request.json().catch(() => null);
    const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
    if (!body) return apiErrors.badRequest('Write something first');
    if (body.length > 4000) return apiErrors.badRequest('Notes are capped at 4000 characters');

    const note = await db.videoNote.create({
      data: { videoId, authorId: session.user.id, body },
      include: { author: { select: { id: true, name: true, image: true } } },
    });
    return withCacheControl(successResponse(note, 201), 'private, no-store');
  } catch (error) {
    logError('note create failed:', error);
    return apiErrors.internalError('Failed to add the note');
  }
}
