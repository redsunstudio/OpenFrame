import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { collectVideoMediaUrls, deleteMediaFilesBestEffort } from '@/lib/r2-cleanup';
import { cleanupBunnyStreamVideosBestEffort } from '@/lib/bunny-stream-cleanup';
import { buildCleanupWarnings, type CleanupWarnings } from '@/lib/cleanup-warnings';

type BunnyRef = {
  providerId: string;
  videoId: string;
};

export async function deleteProjectVideosWithCleanup(
  projectId: string,
  videoIds: string[]
): Promise<{
  deletedCount: number;
  cleanupWarnings: CleanupWarnings | undefined;
  cleanupInput: {
    bunny: Awaited<ReturnType<typeof cleanupBunnyStreamVideosBestEffort>>;
    r2: Awaited<ReturnType<typeof deleteMediaFilesBestEffort>>;
  };
}> {
  const uniqueVideoIds = [...new Set(videoIds)];
  if (uniqueVideoIds.length === 0) {
    throw new Error('EMPTY_VIDEO_IDS');
  }

  const videos = await db.video.findMany({
    where: {
      projectId,
      id: { in: uniqueVideoIds },
    },
    include: {
      versions: {
        select: {
          providerId: true,
          videoId: true,
        },
      },
      assets: {
        select: {
          provider: true,
          providerVideoId: true,
        },
      },
    },
  });

  if (videos.length !== uniqueVideoIds.length) {
    throw new Error('VIDEO_NOT_FOUND');
  }

  const bunnyRefs: BunnyRef[] = [];
  const mediaUrlSets = await Promise.all(videos.map((video) => collectVideoMediaUrls(video.id)));
  const mediaUrls = [...new Set(mediaUrlSets.flat())];

  for (const video of videos) {
    bunnyRefs.push(
      ...video.versions,
      ...video.assets
        .filter((asset) => asset.provider === 'BUNNY' && !!asset.providerVideoId)
        .map((asset) => ({
          providerId: 'bunny',
          videoId: asset.providerVideoId as string,
        }))
    );
  }

  await db.video.deleteMany({
    where: {
      projectId,
      id: { in: uniqueVideoIds },
    },
  });

  revalidatePath(`/projects/${projectId}`);

  const [bunnyCleanupResult, r2CleanupResult] = await Promise.all([
    cleanupBunnyStreamVideosBestEffort(bunnyRefs),
    deleteMediaFilesBestEffort(mediaUrls),
  ]);

  const cleanupInput = {
    bunny: bunnyCleanupResult,
    r2: r2CleanupResult,
  };

  return {
    deletedCount: videos.length,
    cleanupWarnings: buildCleanupWarnings(cleanupInput),
    cleanupInput,
  };
}
