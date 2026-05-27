import type { VideoProvider, VideoMetadata, EmbedOptions } from './types';

const R2_VIDEO_PROXY_PATH = /^\/api\/upload\/video\/[0-9a-f-]{36}\.[a-z0-9]+$/i;

export const r2Provider: VideoProvider = {
  id: 'r2',
  name: 'Self-hosted',
  icon: 'Upload',

  canHandle(url: string): boolean {
    return R2_VIDEO_PROXY_PATH.test(url);
  },

  extractVideoId(url: string): string | null {
    if (this.canHandle(url)) {
      return url;
    }
    return null;
  },

  getEmbedUrl(videoId: string, options: EmbedOptions = {}): string {
    const params = new URLSearchParams();
    if (options.startTime) params.set('t', String(Math.floor(options.startTime)));
    const queryString = params.toString();
    return `${videoId}${queryString ? `?${queryString}` : ''}`;
  },

  getThumbnailUrl(_videoId: string): string {
    void _videoId;
    return '/placeholder-video-thumbnail.png';
  },

  async getMetadata(videoId: string): Promise<VideoMetadata> {
    const filename = videoId.split('/').pop() || 'Video';
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    return {
      title: nameWithoutExt,
      thumbnailUrl: this.getThumbnailUrl(videoId),
    };
  },
};
