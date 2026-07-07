-- KreatorKit: generic file assets (handoff any type) + item thumbnail
ALTER TYPE "VideoAssetKind" ADD VALUE IF NOT EXISTS 'FILE';
ALTER TYPE "VideoAssetProvider" ADD VALUE IF NOT EXISTS 'R2_FILE';
ALTER TABLE "videos" ADD COLUMN "thumbnailUrl" TEXT;
