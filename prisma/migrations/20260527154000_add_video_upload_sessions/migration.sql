-- CreateEnum
CREATE TYPE "UploadSessionStatus" AS ENUM ('INITIATED', 'FINALIZED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "video_upload_sessions" (
    "id" TEXT NOT NULL,
    "upload_jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "billed_user_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "thumbnail_object_key" TEXT NOT NULL,
    "declared_size_bytes" BIGINT NOT NULL,
    "content_type" TEXT NOT NULL,
    "reservation_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "UploadSessionStatus" NOT NULL DEFAULT 'INITIATED',
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_sessions_upload_jti_key" ON "video_upload_sessions"("upload_jti");

-- CreateIndex
CREATE UNIQUE INDEX "video_upload_sessions_object_key_key" ON "video_upload_sessions"("object_key");

-- CreateIndex
CREATE INDEX "video_upload_sessions_projectId_status_idx" ON "video_upload_sessions"("projectId", "status");

-- CreateIndex
CREATE INDEX "video_upload_sessions_userId_status_idx" ON "video_upload_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "video_upload_sessions_billed_user_id_idx" ON "video_upload_sessions"("billed_user_id");

-- CreateIndex
CREATE INDEX "video_upload_sessions_expires_at_idx" ON "video_upload_sessions"("expires_at");
