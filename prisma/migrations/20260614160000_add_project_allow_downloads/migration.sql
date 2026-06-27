-- AlterTable: opt-in only — existing projects remain non-downloadable for viewers until enabled.
ALTER TABLE "projects" ADD COLUMN "allowDownloads" BOOLEAN NOT NULL DEFAULT false;
