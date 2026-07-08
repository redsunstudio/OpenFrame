-- Item-level notes thread (brief discussion), separate from version review comments
CREATE TABLE "video_notes" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "video_notes_videoId_idx" ON "video_notes"("videoId");
ALTER TABLE "video_notes" ADD CONSTRAINT "video_notes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "video_notes" ADD CONSTRAINT "video_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
