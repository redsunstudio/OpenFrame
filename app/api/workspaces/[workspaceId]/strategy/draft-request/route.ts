import { NextRequest } from 'next/server';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiErrors, successResponse } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { sendEmail } from '@/lib/mailer';
import { brandedEmailTemplate, escapeHtml } from '@/lib/email-brand';
import { logError } from '@/lib/logger';

interface Ctx {
  params: Promise<{ workspaceId: string }>;
}

// POST — "Draft my strategy from my channel": the empty-state client action.
// Emails the workspace owner + admins; the agency drafts pillars/ideas from the
// channel's published content (via the agent rail) and the client edits from there.
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const limited = await rateLimit(req, 'mutate');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();

    const { workspaceId } = await params;
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        brandAccent: true,
        brandLogoUrl: true,
        owner: { select: { id: true, email: true, name: true } },
      },
    });
    if (!workspace) return apiErrors.notFound('Workspace');

    const access = await checkWorkspaceAccess(
      { id: workspace.id, ownerId: workspace.ownerId },
      session.user.id
    );
    if (!access.hasAccess) return apiErrors.forbidden();

    const admins = await db.workspaceMember.findMany({
      where: { workspaceId, role: 'ADMIN' },
      select: { user: { select: { id: true, email: true, name: true } } },
    });
    const recipients = new Map<string, string>();
    if (workspace.owner?.email) recipients.set(workspace.owner.id, workspace.owner.email);
    for (const a of admins) if (a.user?.email) recipients.set(a.user.id, a.user.email);

    const requester = session.user.name?.trim() || session.user.email || 'A workspace member';
    const subject = `Strategy draft requested — ${workspace.name}`;
    const html = brandedEmailTemplate(
      `<p style="margin:0 0 12px;"><strong>${escapeHtml(requester)}</strong> asked for a first draft of the channel strategy for <strong>${escapeHtml(workspace.name)}</strong>.</p>
       <p style="margin:0;">Draft pillars and recurring ideas from the channel's published content, then they'll review and edit on the Strategy tab.</p>`,
      {
        brand: {
          name: workspace.name,
          accentColor: workspace.brandAccent,
          logoUrl: workspace.brandLogoUrl,
        },
      }
    );
    const results = await Promise.allSettled(
      [...recipients.values()].map((to) => sendEmail({ to, subject, html }))
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;

    return successResponse({ requested: true, notified: sent });
  } catch (error) {
    logError('strategy draft request failed:', error);
    return apiErrors.internalError('Failed to request the draft');
  }
}
