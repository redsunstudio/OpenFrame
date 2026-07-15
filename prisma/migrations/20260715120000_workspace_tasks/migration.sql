-- Per-workspace to-do list for the team (admin-only CRUD)
CREATE TABLE "workspace_tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspace_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "workspace_tasks_workspaceId_sortOrder_idx" ON "workspace_tasks"("workspaceId", "sortOrder");
ALTER TABLE "workspace_tasks" ADD CONSTRAINT "workspace_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
