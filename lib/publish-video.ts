// Publish a KreatorKit video to YouTube through Zernio.
// The active cut is copied from our storage into Zernio's media store, then a
// post is created against the workspace's wired YouTube channel.
//
// Modes:
//   studio — publishNow with visibility PRIVATE: the video lands in the
//            client's YouTube Studio as a private draft they set live. This is
//            the "Push to YouTube" button. Gated on title+description+thumbnail.
//   draft  — parked in Zernio as a draft (automation staging).
//   live   — publishNow public; the item auto-flips to PUBLISHED.

import { db } from '@/lib/db';
import { createPresignedFileGetUrl, createPresignedVideoGetUrl } from '@/lib/r2';
import { isZernioConfigured, zernioCreatePost, zernioUploadFromUrl } from '@/lib/zernio';
import type { ZernioMediaItem } from '@/lib/zernio';

export type PublishMode = 'studio' | 'draft' | 'live';

export class PublishError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
  }
}

export interface ZernioWorkspaceConfig {
  apiKey?: string;
  youtubeAccountId: string | null;
}

/** Parse Workspace.publishing — { zernio: { apiKey?, youtubeAccountId? } }. */
export function workspaceZernioConfig(publishing: unknown): ZernioWorkspaceConfig {
  if (!publishing || typeof publishing !== 'object') return { youtubeAccountId: null };
  const zernio = (publishing as Record<string, unknown>).zernio;
  if (!zernio || typeof zernio !== 'object') return { youtubeAccountId: null };
  const cfg = zernio as Record<string, unknown>;
  return {
    apiKey: typeof cfg.apiKey === 'string' && cfg.apiKey ? cfg.apiKey : undefined,
    youtubeAccountId:
      typeof cfg.youtubeAccountId === 'string' && cfg.youtubeAccountId
        ? cfg.youtubeAccountId
        : null,
  };
}

export function workspaceYouTubeAccountId(publishing: unknown): string | null {
  return workspaceZernioConfig(publishing).youtubeAccountId;
}

/** Does this workspace have a usable publish rail (channel + some key)? */
export function isWorkspacePublishReady(publishing: unknown): boolean {
  const cfg = workspaceZernioConfig(publishing);
  return Boolean(cfg.youtubeAccountId && (cfg.apiKey || isZernioConfigured()));
}

export interface PublishChecks {
  title: boolean;
  description: boolean;
  thumbnail: boolean;
  cut: boolean;
}

export function publishChecks(video: {
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  versions: { providerId: string; videoId: string }[];
}): PublishChecks {
  return {
    title: Boolean(video.title?.trim()),
    description: Boolean(video.description?.trim()),
    thumbnail: Boolean(video.thumbnailUrl),
    cut: video.versions.some((v) => v.providerId === 'r2' && v.videoId),
  };
}

function guessImageContentType(name: string): string {
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return 'image/jpeg';
}

export interface PublishResult {
  mode: PublishMode;
  postId: string | null;
  accountId: string;
  thumbnailAttached: boolean;
}

export async function publishVideoToYouTube(
  videoId: string,
  opts: { mode?: PublishMode; actorName?: string } = {}
): Promise<PublishResult> {
  const mode: PublishMode = opts.mode ?? 'draft';

  const video = await db.video.findUnique({
    where: { id: videoId },
    include: {
      project: {
        select: { workspace: { select: { id: true, name: true, publishing: true } } },
      },
      versions: { where: { isActive: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
    },
  });
  if (!video) throw new PublishError('Video not found', 404);

  const cfg = workspaceZernioConfig(video.project.workspace.publishing);
  if (!cfg.apiKey && !isZernioConfigured()) {
    throw new PublishError(
      'Publishing is not configured (no Zernio API key on the server or this workspace)',
      503
    );
  }
  if (!cfg.youtubeAccountId) {
    throw new PublishError(
      'No YouTube channel is wired to this workspace yet — set it in Settings → Publishing'
    );
  }

  const checks = publishChecks(video);
  if (!checks.cut)
    throw new PublishError('No uploaded cut to publish — upload the final cut first');
  if (mode !== 'draft') {
    const missing = [
      !checks.title && 'a title',
      !checks.description && 'a description',
      !checks.thumbnail && 'a thumbnail',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new PublishError(`Not ready to push — add ${missing.join(', ')} first`);
    }
  }

  const cut = video.versions[0];
  const safeName = video.title.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'video';
  const sourceUrl = await createPresignedVideoGetUrl(cut.videoId, `${safeName}.mp4`, 6 * 3600);
  const mediaUrl = await zernioUploadFromUrl(
    sourceUrl,
    `${safeName}.mp4`,
    'video/mp4',
    cut.sizeBytes ? Number(cut.sizeBytes) : undefined,
    cfg.apiKey
  );

  // Best-effort thumbnail copy (item thumbnails are stored as R2_FILE assets).
  let thumbnailUrl: string | undefined;
  const thumbMatch = video.thumbnailUrl?.match(
    /^\/api\/videos\/[A-Za-z0-9]+\/assets\/([A-Za-z0-9]+)\/download/
  );
  if (thumbMatch) {
    try {
      const asset = await db.videoAsset.findUnique({ where: { id: thumbMatch[1] } });
      if (asset?.provider === 'R2_FILE' && asset.sourceUrl.startsWith('files/')) {
        const thumbSource = await createPresignedFileGetUrl(
          asset.sourceUrl,
          asset.displayName,
          3600
        );
        thumbnailUrl = await zernioUploadFromUrl(
          thumbSource,
          asset.displayName,
          guessImageContentType(asset.displayName),
          asset.sizeBytes ? Number(asset.sizeBytes) : undefined,
          cfg.apiKey
        );
      }
    } catch {
      thumbnailUrl = undefined; // the post still goes out without it
    }
  }

  const mediaItems: ZernioMediaItem[] = [
    { type: 'video', url: mediaUrl, ...(thumbnailUrl ? { thumbnail: thumbnailUrl } : {}) },
  ];
  const { postId } = await zernioCreatePost(
    {
      content: video.description?.trim() || video.brief?.trim() || video.title,
      mediaItems,
      platforms: [
        {
          platform: 'youtube',
          accountId: cfg.youtubeAccountId,
          platformSpecificData: {
            title: video.title,
            visibility: mode === 'studio' ? 'private' : 'public',
            madeForKids: false,
          },
        },
      ],
      ...(mode === 'draft' ? { isDraft: true } : { publishNow: true }),
    },
    cfg.apiKey
  );

  const by = opts.actorName ? ` — by ${opts.actorName}` : '';
  const noteBody =
    mode === 'studio'
      ? `📺 Pushed to YouTube${postId ? ` (Zernio post ${postId})` : ''}${by}. It lands in YouTube Studio as a PRIVATE video — set it live from Studio when ready.`
      : mode === 'live'
        ? `🚀 Published to YouTube via Zernio${postId ? ` (post ${postId})` : ''}${by}`
        : `📤 Sent to Zernio as a YouTube draft${postId ? ` (post ${postId})` : ''}${by}. Confirm the thumbnail in Zernio before publishing.`;
  await db.videoNote.create({ data: { videoId: video.id, body: noteBody } });

  if (mode === 'live') {
    await db.video.update({ where: { id: video.id }, data: { status: 'PUBLISHED' } });
  }

  return {
    mode,
    postId,
    accountId: cfg.youtubeAccountId,
    thumbnailAttached: Boolean(thumbnailUrl),
  };
}
