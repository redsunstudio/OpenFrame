const VIDEO_MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogg',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
};

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

const ALLOWED_VIDEO_EXTENSIONS = new Set(Object.keys(EXT_TO_MIME));

export function normalizeVideoMime(mime: string | undefined): string | null {
  if (!mime) return null;
  const normalized = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!normalized.startsWith('video/')) return null;
  return normalized;
}

export function getVideoExtensionFromMime(mime: string): string | null {
  return VIDEO_MIME_TO_EXT[mime] ?? null;
}

export function getVideoExtensionFromFileName(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_VIDEO_EXTENSIONS.has(ext)) return null;
  return ext;
}

export function resolveVideoContentType(fileName: string, mime: string | undefined): string | null {
  const normalizedMime = normalizeVideoMime(mime);
  if (normalizedMime) {
    const extFromMime = getVideoExtensionFromMime(normalizedMime);
    const extFromName = getVideoExtensionFromFileName(fileName);
    if (extFromMime && extFromName && extFromMime !== extFromName) {
      return EXT_TO_MIME[extFromName] ?? normalizedMime;
    }
    return normalizedMime;
  }

  const ext = getVideoExtensionFromFileName(fileName);
  if (!ext) return null;
  return EXT_TO_MIME[ext] ?? null;
}

export function isAllowedVideoFile(fileName: string, mime: string | undefined): boolean {
  return resolveVideoContentType(fileName, mime) !== null;
}

export const VIDEO_OBJECT_KEY_PREFIX = 'videos/';

const SAFE_VIDEO_BASENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

export function buildVideoObjectKey(filename: string): string {
  return `${VIDEO_OBJECT_KEY_PREFIX}${filename}`;
}

export function videoProxyPathFromFilename(filename: string): string {
  return `/api/upload/video/${filename}`;
}

export function videoProxyPathToObjectKey(proxyPath: string): string | null {
  const prefix = '/api/upload/video/';
  if (!proxyPath.startsWith(prefix)) return null;
  const filename = proxyPath.slice(prefix.length);
  if (!SAFE_VIDEO_BASENAME.test(filename)) return null;
  return buildVideoObjectKey(filename);
}

export function objectKeyToVideoProxyPath(objectKey: string): string | null {
  if (!objectKey.startsWith(VIDEO_OBJECT_KEY_PREFIX)) return null;
  const filename = objectKey.slice(VIDEO_OBJECT_KEY_PREFIX.length);
  if (!SAFE_VIDEO_BASENAME.test(filename)) return null;
  return videoProxyPathFromFilename(filename);
}

export { SAFE_VIDEO_BASENAME };
