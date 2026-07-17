import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { isAgentRequest } from '@/lib/agent-auth';
import { getR2FileObjectMetadata } from '@/lib/r2';
import { logError } from '@/lib/logger';
import { parseStrategy } from '@/lib/strategy';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

// GET /api/agent/workspaces/[workspaceId] — config detail for automation,
// plus audit fields (cover integrity, item counts) so client data can be
// verified after every update.
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isAgentRequest(request)) return apiErrors.unauthorized();
    const { workspaceId } = await params;
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        slug: true,
        features: true,
        brandAccent: true,
        brandLogoUrl: true,
        publishing: true,
        strategy: true,
        coverKey: true,
      },
    });
    if (!workspace) return apiErrors.notFound('Workspace');

    let coverObjectExists: boolean | null = null;
    if (workspace.coverKey) {
      coverObjectExists = Boolean(
        await getR2FileObjectMetadata(workspace.coverKey).catch(() => null)
      );
    }
    const [total, published, archived, brandAssets] = await Promise.all([
      db.video.count({ where: { project: { workspaceId } } }),
      db.video.count({ where: { project: { workspaceId }, status: 'PUBLISHED' } }),
      db.video.count({ where: { project: { workspaceId }, status: 'ARCHIVED' } }),
      db.workspaceAsset.count({ where: { workspaceId } }),
    ]);

    return withCacheControl(
      successResponse({
        ...workspace,
        strategy: parseStrategy(workspace.strategy),
        audit: {
          hasCover: Boolean(workspace.coverKey),
          coverObjectExists,
          videos: total,
          published,
          archived,
          brandAssets,
        },
      }),
      'private, no-store'
    );
  } catch (error) {
    logError('agent workspace detail failed:', error);
    return apiErrors.internalError('Failed to load the workspace');
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

// PATCH /api/agent/workspaces/[workspaceId] { publishing?, features?, brandAccent?, brandLogoUrl? }
//
// MERGE semantics (data protection): objects are merged into the existing
// config key-by-key — sending { features: { posts: true } } can never wipe
// other flags, and { publishing: { zernio: { linkedinAccountId: ... } } }
// keeps the key + other accounts. A key set to null is removed; the whole
// field set to null clears it (explicit, never accidental).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isAgentRequest(request)) return apiErrors.unauthorized();
    const { workspaceId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiErrors.badRequest('nothing to update');

    const current = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { features: true, publishing: true },
    });
    if (!current) return apiErrors.notFound('Workspace');

    const mergeShallow = (base: unknown, patch: Record<string, unknown>) => {
      const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete out[k];
        else if (isPlainObject(v)) {
          const prev = out[k];
          out[k] = mergeShallow(isPlainObject(prev) ? prev : {}, v);
        } else out[k] = v;
      }
      return out;
    };

    const data: Record<string, unknown> = {};
    if ('publishing' in body) {
      if (body.publishing !== null && !isPlainObject(body.publishing)) {
        return apiErrors.badRequest('publishing must be an object or null');
      }
      data.publishing =
        body.publishing === null
          ? Prisma.DbNull
          : mergeShallow(current.publishing, body.publishing);
    }
    if ('features' in body) {
      if (body.features !== null && !isPlainObject(body.features)) {
        return apiErrors.badRequest('features must be an object or null');
      }
      data.features =
        body.features === null ? Prisma.DbNull : mergeShallow(current.features, body.features);
    }
    if ('brandAccent' in body) {
      if (body.brandAccent !== null && typeof body.brandAccent !== 'string') {
        return apiErrors.badRequest('brandAccent must be a string or null');
      }
      data.brandAccent = body.brandAccent;
    }
    if ('brandLogoUrl' in body) {
      // Rendered in client emails, so it must be publicly reachable.
      if (
        body.brandLogoUrl !== null &&
        (typeof body.brandLogoUrl !== 'string' ||
          body.brandLogoUrl.length > 500 ||
          !/^(https:\/\/|\/)[^\s"'<>]+$/.test(body.brandLogoUrl))
      ) {
        return apiErrors.badRequest('brandLogoUrl must be an https URL, app path, or null');
      }
      data.brandLogoUrl = body.brandLogoUrl;
    }
    if ('strategy' in body) {
      // Whole-object replace (sanitized/clamped). Lets the quarterly-strategy
      // meeting write pillars/recurring ideas/notes straight into the workspace.
      data.strategy =
        body.strategy === null
          ? Prisma.DbNull
          : (parseStrategy(body.strategy) as unknown as Prisma.InputJsonValue);
    }
    if (Object.keys(data).length === 0) return apiErrors.badRequest('nothing to update');

    const workspace = await db.workspace.update({
      where: { id: workspaceId },
      data,
      select: {
        id: true,
        name: true,
        features: true,
        brandAccent: true,
        brandLogoUrl: true,
        publishing: true,
        strategy: true,
      },
    });
    return withCacheControl(successResponse(workspace), 'private, no-store');
  } catch (error) {
    logError('agent workspace patch failed:', error);
    return apiErrors.internalError('Failed to update the workspace');
  }
}
