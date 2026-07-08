import { VideoPageContent } from '@/components/video-page-content';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { isDirectFileUploadEnabled, isS3VideoUploadsEnabled } from '@/lib/feature-flags';
import { requireVideoProjectAccessOrRedirect } from '@/lib/route-access';

interface VideoPageProps {
  params: Promise<{ projectId: string; videoId: string }>;
}

export default async function VideoPage({ params }: VideoPageProps) {
  const { projectId, videoId } = await params;
  const session = await auth();

  await requireVideoProjectAccessOrRedirect({
    projectId,
    videoId,
    userId: session?.user?.id,
    intent: 'view',
    allowPublicView: true,
  });

  // Back from a review goes straight to the workspace pipeline — the
  // projects layer is an internal implementation detail.
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  return (
    <VideoPageContent
      mode="dashboard"
      videoId={videoId}
      projectId={projectId}
      backHrefOverride={project?.workspaceId ? `/workspaces/${project.workspaceId}` : undefined}
      directUploadsEnabled={isDirectFileUploadEnabled()}
      directUploadProvider={isS3VideoUploadsEnabled() ? 'r2' : 'bunny'}
    />
  );
}
