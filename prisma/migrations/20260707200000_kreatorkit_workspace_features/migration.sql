-- KreatorKit: per-workspace module flags + client branding
ALTER TABLE "workspaces" ADD COLUMN "features" JSONB;
ALTER TABLE "workspaces" ADD COLUMN "brandAccent" TEXT;
ALTER TABLE "workspaces" ADD COLUMN "brandLogoUrl" TEXT;
