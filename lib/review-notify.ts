import { db } from '@/lib/db';
import { sendEmail } from '@/lib/mailer';
import {
  EMAIL_COLORS,
  EmailBrand,
  brandedEmailTemplate,
  emailButton,
  emailHeading,
  emailHighlight,
  emailRow,
  escapeHtml,
} from '@/lib/email-brand';
import { logError } from '@/lib/logger';

/**
 * "A cut is ready for your review" — the client-facing loop-closer.
 *
 * Transactional by design: commentator members (the clients) are emailed
 * whenever a video enters REVIEW, regardless of NotificationSetting.
 * Clients never visit the settings page, and emailEnabled defaults to
 * false, so preference-gating this email means nobody ever receives it.
 * Owners/admins are excluded — they get the preference-gated new_version
 * notification instead.
 */

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
}

interface ReviewReadyInput {
  videoId: string;
  /** Skip emailing this user (whoever caused the transition). */
  actorUserId?: string | null;
  /** Shown in the email as who sent the cut. */
  actorName?: string | null;
  versionLabel?: string | null;
}

export async function notifyReviewReady(input: ReviewReadyInput): Promise<void> {
  try {
    const video = await db.video.findUnique({
      where: { id: input.videoId },
      select: {
        id: true,
        title: true,
        projectId: true,
        project: {
          select: {
            name: true,
            ownerId: true,
            workspaceId: true,
            members: {
              where: { role: 'COMMENTATOR' },
              select: { userId: true, user: { select: { email: true, name: true } } },
            },
            workspace: {
              select: {
                name: true,
                brandAccent: true,
                brandLogoUrl: true,
                members: {
                  where: { role: 'COMMENTATOR' },
                  select: { userId: true, user: { select: { email: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!video?.project) return;

    const seen = new Set<string>();
    const recipients: { email: string; name: string | null }[] = [];
    const candidates = [...(video.project.workspace?.members ?? []), ...video.project.members];
    for (const member of candidates) {
      if (member.userId === video.project.ownerId) continue;
      if (input.actorUserId && member.userId === input.actorUserId) continue;
      if (!member.user.email || seen.has(member.userId)) continue;
      seen.add(member.userId);
      recipients.push({ email: member.user.email, name: member.user.name });
    }
    if (recipients.length === 0) return;

    const brand: EmailBrand = {
      name: video.project.workspace?.name,
      accentColor: video.project.workspace?.brandAccent,
      logoUrl: video.project.workspace?.brandLogoUrl,
    };
    const reviewUrl = `${appBaseUrl()}/projects/${video.projectId}/videos/${video.id}`;
    const from = input.actorName?.trim() || 'the editing team';
    const subject = `${brand.name?.trim() || 'KreatorKit'}: "${video.title}" is ready for your review`;

    const html = brandedEmailTemplate(
      `
      <tr>${emailHeading('&#9654;', 'Ready for your review', brand)}</tr>
      <tr><td style="padding:20px;">
        ${emailHighlight(`A new cut of <strong>${escapeHtml(video.title)}</strong> is waiting for you. Watch it, leave timestamped comments, then approve it or send it back to the editor.`)}
        <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;">
          ${emailRow('Video', escapeHtml(video.title), true)}
          ${input.versionLabel ? emailRow('Cut', escapeHtml(input.versionLabel)) : ''}
          ${emailRow('From', escapeHtml(from))}
        </table>
        ${emailButton('Review now  &#8594;', reviewUrl, brand)}
        <p style="margin:16px 0 0;font-size:12px;color:${EMAIL_COLORS.textDim};">Sign in with your email — we&rsquo;ll send you a code, no password needed.</p>
      </td></tr>
      `,
      {
        brand,
        footerText: 'You received this because you review videos in this workspace.',
      }
    );

    await Promise.allSettled(recipients.map((r) => sendEmail({ to: r.email, subject, html })));
  } catch (err) {
    logError('review-ready notification failed:', err);
  }
}

/**
 * Owner + workspace ADMIN user ids for a project — the "team" side of the
 * loop. Used to widen client-comment/verdict notifications beyond the owner
 * (preference-gated via notifyUsers, unlike the transactional email above).
 */
export async function teamUserIds(
  projectOwnerId: string,
  workspaceId: string | null | undefined
): Promise<string[]> {
  const ids = [projectOwnerId];
  if (workspaceId) {
    try {
      const admins = await db.workspaceMember.findMany({
        where: { workspaceId, role: 'ADMIN' },
        select: { userId: true },
      });
      ids.push(...admins.map((a) => a.userId));
    } catch (err) {
      logError('team lookup failed:', err);
    }
  }
  return Array.from(new Set(ids));
}
