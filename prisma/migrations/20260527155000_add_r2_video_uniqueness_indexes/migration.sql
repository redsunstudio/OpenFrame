-- Ensure a finalized R2 object key and proxy URL can only be claimed once.
CREATE UNIQUE INDEX "video_versions_r2_videoid_unique"
ON "video_versions" ("videoId")
WHERE "providerId" = 'r2';

CREATE UNIQUE INDEX "video_versions_r2_originalurl_unique"
ON "video_versions" ("originalUrl")
WHERE "providerId" = 'r2' AND "originalUrl" LIKE '/api/upload/video/%';

CREATE UNIQUE INDEX "video_versions_r2_thumbnail_unique"
ON "video_versions" ("thumbnailUrl")
WHERE "providerId" = 'r2' AND "thumbnailUrl" LIKE '/api/upload/image/%';
