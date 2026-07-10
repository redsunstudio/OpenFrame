import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { isAgentRequest } from '@/lib/agent-auth';
import { logError } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ videoId: string }>;
}

const commentSelect = {
  id: true,
  content: true,
  timestamp: true,
  timestampEnd: true,
  isResolved: true,
  resolvedAt: true,
  voiceUrl: true,
  imageUrl: true,
  annotationData: true,
  guestName: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
  tag: { select: { name: true, color: true } },
} as const;

function shapeComment(c: {
  id: string;
  content: string | null;
  timestamp: number;
  timestampEnd: number | null;
  isResolved: boolean;
  resolvedAt: Date | null;
  voiceUrl: string | null;
  imageUrl: string | null;
  annotationData: string | null;
  guestName: string | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string | null } | null;
  tag: { name: string; color: string } | null;
}) {
  return {
    id: c.id,
    content: c.content,
    timestamp: c.timestamp,
    timestampEnd: c.timestampEnd,
    isResolved: c.isResolved,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    hasVoice: !!c.voiceUrl,
    hasImage: !!c.imageUrl,
    hasAnnotation: !!c.annotationData,
    authorName: c.author?.name ?? c.guestName ?? 'Guest',
    isTeam: !!c.author, // registered users are team; guests came via a share link
    tag: c.tag,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

// GET /api/agent/videos/[videoId]/comments — full review threads for automation.
// Comments hang off versions; returns every version's threads plus a rollup so
// the Agency OS can tell which items have feedback waiting.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isAgentRequest(request)) return apiErrors.unauthorized();
    const { videoId } = await params;

    const video = await db.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        title: true,
        status: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          select: {
            id: true,
            versionNumber: true,
            isActive: true,
            comments: {
              where: { parentId: null },
              orderBy: { timestamp: 'asc' },
              select: {
                ...commentSelect,
                replies: { orderBy: { createdAt: 'asc' }, select: commentSelect },
              },
            },
          },
        },
      },
    });
    if (!video) return apiErrors.notFound('Video');

    const versions = video.versions.map((v) => ({
      versionId: v.id,
      versionNumber: v.versionNumber,
      isActive: v.isActive,
      comments: v.comments.map((c) => ({
        ...shapeComment(c),
        replies: c.replies.map(shapeComment),
      })),
    }));

    const all = versions.flatMap((v) => v.comments);
    const open = all.filter((c) => !c.isResolved);
    // A thread is awaiting the team when it's unresolved and the last word
    // belongs to the client/guest (no team reply after it).
    const awaitingReply = open.filter((c) => {
      const last = c.replies[c.replies.length - 1];
      return last ? !last.isTeam : !c.isTeam;
    });

    return withCacheControl(
      successResponse({
        id: video.id,
        title: video.title,
        status: video.status,
        totalComments: all.length,
        openComments: open.length,
        awaitingReply: awaitingReply.length,
        versions,
      }),
      'private, no-store'
    );
  } catch (error) {
    logError('agent video comments failed:', error);
    return apiErrors.internalError('Failed to load comments');
  }
}
