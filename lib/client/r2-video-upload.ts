import { captureVideoThumbnail } from '@/lib/client/video-thumbnail';

export type R2VideoInitResponse = {
  presignedPutUrl: string;
  objectKey: string;
  proxyUrl: string;
  uploadToken: string;
  reservationId: string | null;
  contentType: string;
  thumbnailPresignedPutUrl: string;
  thumbnailObjectKey: string;
  thumbnailProxyUrl: string;
};

export type R2VideoUploadResult = R2VideoInitResponse & {
  duration: number | null;
  thumbnailUrl: string | null;
};

type UploadProgressHandler = (progress: number) => void;

function uploadBytesWithProgress(
  url: string,
  body: Blob | File,
  contentType: string,
  onProgress?: UploadProgressHandler
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () => {
      reject(
        new Error(
          'Network error during upload. If you use direct S3/R2 uploads, configure bucket CORS to allow PUT from this site origin.'
        )
      );
    };
    xhr.onabort = () => reject(new Error('Upload aborted'));

    xhr.send(body);
  });
}

async function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    video.onloadedmetadata = () => {
      const duration =
        Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null;
      cleanup();
      resolve(duration);
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    video.src = objectUrl;
  });
}

export async function initR2VideoUpload(
  projectId: string,
  file: File
): Promise<R2VideoInitResponse> {
  const initRes = await fetch(`/api/projects/${projectId}/videos/r2-init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
  });

  const initPayload = (await initRes.json().catch(() => null)) as {
    data?: R2VideoInitResponse;
    error?: string;
  } | null;
  if (!initRes.ok || !initPayload?.data) {
    throw new Error(initPayload?.error || 'Failed to initialize video upload');
  }

  return initPayload.data;
}

export async function cleanupPendingR2VideoUpload(
  projectId: string,
  input: {
    objectKey: string;
    uploadToken: string;
    reservationId: string | null;
    thumbnailObjectKey?: string | null;
  },
  keepalive = false
): Promise<void> {
  try {
    await fetch(`/api/projects/${projectId}/videos/r2-init`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectKey: input.objectKey,
        uploadToken: input.uploadToken,
        reservationId: input.reservationId,
        thumbnailObjectKey: input.thumbnailObjectKey ?? undefined,
      }),
      keepalive,
    });
  } catch (error) {
    console.error('Failed to cleanup pending R2 video upload:', error);
  }
}

export async function uploadVideoToR2(
  projectId: string,
  file: File,
  options?: { onProgress?: UploadProgressHandler }
): Promise<R2VideoUploadResult> {
  const init = await initR2VideoUpload(projectId, file);

  const cleanupInput = {
    objectKey: init.objectKey,
    uploadToken: init.uploadToken,
    reservationId: init.reservationId,
    thumbnailObjectKey: init.thumbnailObjectKey,
  };

  try {
    await uploadBytesWithProgress(
      init.presignedPutUrl,
      file,
      init.contentType,
      options?.onProgress
    );
  } catch (error) {
    await cleanupPendingR2VideoUpload(projectId, cleanupInput);
    throw error;
  }

  const [duration, thumbnailBlob] = await Promise.all([
    readVideoDuration(file),
    captureVideoThumbnail(file),
  ]);

  let thumbnailUrl: string | null = null;
  if (thumbnailBlob) {
    try {
      await uploadBytesWithProgress(init.thumbnailPresignedPutUrl, thumbnailBlob, 'image/jpeg');
      thumbnailUrl = init.thumbnailProxyUrl;
    } catch (error) {
      console.warn('Failed to upload video thumbnail:', error);
    }
  }

  return { ...init, duration, thumbnailUrl };
}
