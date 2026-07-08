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
    let channels: { id: string; platform: string; username: string; profileName: string | null }[] =
      [];
    let channelError: string | null = null;
    if (cfg.apiKey) {
      // Channels are ONLY ever listed with this workspace's own key — a
      // workspace can never see (or be wired to) another client's channels.
      try {
        channels = (await zernioListAccounts(cfg.apiKey))
          .filter((a) => ['youtube', 'linkedin'].includes(a.platform))
          .map(({ id, platform, username, profileName }) => ({
            id,
            platform,
            username,
            profileName,
          }));
      } catch (e) {
        channelError = e instanceof Error ? e.message.slice(0, 200) : 'could not reach Zernio';
      }
    }
    return withCacheControl(
      successResponse({
        youtubeAccountId: cfg.youtubeAccountId,
        linkedinAccountId: cfg.linkedinAccountId,
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
    const accounts: Record<'youtubeAccountId' | 'linkedinAccountId', string | null> = {
      youtubeAccountId: cfg.youtubeAccountId,
      linkedinAccountId: cfg.linkedinAccountId,
    };
    const platformOf = { youtubeAccountId: 'youtube', linkedinAccountId: 'linkedin' } as const;

    if ('apiKey' in body) {
      if (body.apiKey !== null && typeof body.apiKey !== 'string') {
        return apiErrors.badRequest('apiKey must be a string or null');
      }
      apiKey = body.apiKey ? String(body.apiKey).trim() : null;
      if (apiKey && !/^sk_[A-Za-z0-9]{16,}$/.test(apiKey)) {
        return apiErrors.badRequest('that does not look like a Zernio API key (sk_…)');
      }
    }
    for (const field of ['youtubeAccountId', 'linkedinAccountId'] as const) {
      if (field in body) {
        const raw = (body as Record<string, unknown>)[field];
        if (raw !== null && typeof raw !== 'string') {
          return apiErrors.badRequest(`${field} must be a string or null`);
        }
        accounts[field] = raw ? String(raw).trim() : null;
        if (accounts[field] && !/^[a-f0-9]{24}$/.test(accounts[field]!)) {
          return apiErrors.badRequest(`${field} must be a Zernio account id`);
        }
      }
    }

    // Isolation rules: no key -> nothing wired; an account can only be wired if
    // it's visible to THIS workspace's own key (cross-client wiring impossible).
    // Changing the key silently drops carried-over accounts the new key can't see.
    if (!apiKey) {
      accounts.youtubeAccountId = null;
      accounts.linkedinAccountId = null;
    } else if (accounts.youtubeAccountId || accounts.linkedinAccountId) {
      let visible: { id: string; platform: string }[] | null = null;
      try {
        visible = await zernioListAccounts(apiKey);
      } catch {
        if ('apiKey' in body) {
          return apiErrors.badRequest('The Zernio key was rejected — check it and try again');
        }
        return apiErrors.badRequest('Could not verify the account against the Zernio key');
      }
      for (const field of ['youtubeAccountId', 'linkedinAccountId'] as const) {
        const id = accounts[field];
        if (!id) continue;
        if (!visible.some((a) => a.id === id && a.platform === platformOf[field])) {
          if (field in body) {
            return apiErrors.badRequest(
              "That account isn't visible to this workspace's Zernio key"
            );
          }
          accounts[field] = null; // stale account from a previous key — unwire it
        }
      }
    }

    const zernio: Record<string, string> = {};
    if (apiKey) zernio.apiKey = apiKey;
    if (accounts.youtubeAccountId) zernio.youtubeAccountId = accounts.youtubeAccountId;
    if (accounts.linkedinAccountId) zernio.linkedinAccountId = accounts.linkedinAccountId;
    await db.workspace.update({
      where: { id: workspaceId },
      data: {
        publishing: Object.keys(zernio).length > 0 ? { zernio } : Prisma.DbNull,
      },
    });
    return withCacheControl(
      successResponse({
        youtubeAccountId: accounts.youtubeAccountId,
        linkedinAccountId: accounts.linkedinAccountId,
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
