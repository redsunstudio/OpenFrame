-- Per-workspace channel strategy blob (pillars, recurring ideas, notes).
-- Nullable JSON; parsed/defaulted in app code (lib/strategy.ts).
ALTER TABLE "workspaces" ADD COLUMN "strategy" JSONB;
