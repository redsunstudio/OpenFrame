-- Content Engine parity: changes + rejected stages
ALTER TYPE "VideoStatus" ADD VALUE IF NOT EXISTS 'CHANGES';
ALTER TYPE "VideoStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
