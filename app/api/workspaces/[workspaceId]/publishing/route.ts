import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { workspaceZernioConfig } from '@/lib/publish-video';
import { zernioListAccounts } from '@/lib/zernio';
import { logError } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

async function adminWorkspace(workspaceId: string, userId: string) {
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerId: true, publishing: true },
  });
  if (!workspace) return null;
  const access = await checkWorkspaceAccess(workspace, userId);
  return { workspace, access };
}

// GET /api/workspaces/[workspaceId]/publishing — config + connected YouTube
// channels visible to the effective key (workspace override, else agency key).
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();
    const { workspaceId } = await params;
    const ctx = await adminWorkspace(workspaceId, session.user.id);
    if (!ctx) return apiErrors.notFound('Workspace');
    if (!ctx.access.canEdit) return apiErrors.forbidden('Workspace admins only');

    const cfg = workspaceZernioConfig(ctx.workspace.publishing);
    let channels: { id: string; username: string; profileName: string | null }[] = [];
    let channelError: string | null = null;
    if (cfg.apiKey) {
      // Channels are ONLY ever listed with this workspace's own key — a
      // workspace can never see (or be wired to) another client's channels.
      try {
        channels = (await zernioListAccounts(cfg.apiKey))
          .filter((a) => a.platform === 'youtube')
          .map(({ id, username, profileName }) => ({ id, username, profileName }));
      } catch (e) {
        channelError = e instanceof Error ? e.message.slice(0, 200) : 'could not reach Zernio';
      }
    }
    return withCacheControl(
      successResponse({
        youtubeAccountId: cfg.youtubeAccountId,
        hasWorkspaceKey: Boolean(cfg.apiKey),
        keyHint: cfg.apiKey ? `····${cfg.apiKey.slice(-4)}` : null,
        channels,
        channelError,
      }),
      'private, no-store'
    );
  } catch (error) {
    logError('publishing settings read failed:', error);
    return apiErrors.internalError('Failed to load publishing settings');
  }
}

// PUT { apiKey?: string|null, youtubeAccountId?: string|null } — admins wire
// the client's channel (and optionally their own Zernio key).
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();
    const { workspaceId } = await params;
    const ctx = await adminWorkspace(workspaceId, session.user.id);
    if (!ctx) return apiErrors.notFound('Workspace');
    if (!ctx.access.canEdit) return apiErrors.forbidden('Workspace admins only');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiErrors.badRequest('nothing to update');

    const cfg = workspaceZernioConfig(ctx.workspace.publishing);
    let apiKey = cfg.apiKey ?? null;
    let youtubeAccountId = cfg.youtubeAccountId;

    if ('apiKey' in body) {
      if (body.apiKey !== null && typeof body.apiKey !== 'string') {
        return apiErrors.badRequest('apiKey must be a string or null');
      }
      apiKey = body.apiKey ? String(body.apiKey).trim() : null;
      if (apiKey && !/^sk_[A-Za-z0-9]{16,}$/.test(apiKey)) {
        return apiErrors.badRequest('that does not look like a Zernio API key (sk_…)');
      }
    }
    if ('youtubeAccountId' in body) {
      if (body.youtubeAccountId !== null && typeof body.youtubeAccountId !== 'string') {
        return apiErrors.badRequest('youtubeAccountId must be a string or null');
      }
      youtubeAccountId = body.youtubeAccountId ? String(body.youtubeAccountId).trim() : null;
      if (youtubeAccountId && !/^[a-f0-9]{24}$/.test(youtubeAccountId)) {
        return apiErrors.badRequest('youtubeAccountId must be a Zernio account id');
      }
    }

    // Isolation rules: no key -> nothing wired; a channel can only be wired if
    // it's visible to THIS workspace's own key (cross-client wiring impossible).
    // Changing the key silently drops a carried-over channel the new key can't see.
    if (!apiKey) {
      youtubeAccountId = null;
    } else if (youtubeAccountId) {
      let visibleIds: string[] | null = null;
      try {
        visibleIds = (await zernioListAccounts(apiKey))
          .filter((a) => a.platform === 'youtube')
          .map((a) => a.id);
      } catch {
        if ('apiKey' in body) {
          return apiErrors.badRequest('The Zernio key was rejected — check it and try again');
        }
        return apiErrors.badRequest('Could not verify the channel against the Zernio key');
      }
      if (!visibleIds.includes(youtubeAccountId)) {
        if ('youtubeAccountId' in body) {
          return apiErrors.badRequest("That channel isn't visible to this workspace's Zernio key");
        }
        youtubeAccountId = null; // stale channel from a previous key — unwire it
      }
    }

    const zernio: Record<string, string> = {};
    if (apiKey) zernio.apiKey = apiKey;
    if (youtubeAccountId) zernio.youtubeAccountId = youtubeAccountId;
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        publishing: Object.keys(zernio).length > 0 ? { zernio } : Prisma.DbNull,
      },
    });
    return withCacheControl(
      successResponse({
        youtubeAccountId,
        hasWorkspaceKey: Boolean(apiKey),
        keyHint: apiKey ? `····${apiKey.slice(-4)}` : null,
      }),
      'private, no-store'
    );
  } catch (error) {
    logError('publishing settings write failed:', error);
    return apiErrors.internalError('Failed to save publishing settings');
  }
}
