-- Strategy feedback loop: tag videos with the content pillar they ladder up to.
-- pillarId references Workspace.strategy pillars[].id (JSON), so no FK.
ALTER TABLE "videos" ADD COLUMN "pillarId" TEXT;
CREATE INDEX "videos_pillarId_idx" ON "videos"("pillarId");
