import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { isAgentRequest } from '@/lib/agent-auth';
import { logError } from '@/lib/logger';

// GET /api/agent/workspaces — client roster for automation (resolve slug -> id).
export async function GET(request: NextRequest) {
  try {
    if (!isAgentRequest(request)) return apiErrors.unauthorized();
    const workspaces = await db.workspace.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        features: true,
        brandAccent: true,
        _count: { select: { projects: true, members: true } },
      },
    });
    return withCacheControl(successResponse({ workspaces }), 'private, no-store');
  } catch (error) {
    logError('agent workspaces list failed:', error);
    return apiErrors.internalError('Failed to list workspaces');
  }
}
