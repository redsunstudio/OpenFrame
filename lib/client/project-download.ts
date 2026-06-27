'use client';

const DOWNLOAD_STAGGER_MS = 500;

export type ProjectDownloadManifestFile = {
  fileName: string;
  url: string;
  sizeBytes: number | null;
};

export type ProjectDownloadManifest = {
  projectName: string;
  files: ProjectDownloadManifestFile[];
  totalFiles: number;
  totalBytes: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function triggerBrowserDownload(file: ProjectDownloadManifestFile): void {
  const anchor = document.createElement('a');
  anchor.href = file.url;
  anchor.rel = 'noopener';
  if (file.url.startsWith('/')) {
    anchor.download = file.fileName;
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function runProjectDownloadManifest(manifest: ProjectDownloadManifest): Promise<void> {
  for (let index = 0; index < manifest.files.length; index += 1) {
    triggerBrowserDownload(manifest.files[index]!);
    if (index < manifest.files.length - 1) {
      await sleep(DOWNLOAD_STAGGER_MS);
    }
  }
}
