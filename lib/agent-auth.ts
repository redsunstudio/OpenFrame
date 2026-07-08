import { timingSafeEqual } from 'crypto';
import { NextRequest } from 'next/server';

/**
 * KreatorKit agent access: automation (Claude Code / Agency OS) authenticates
 * with the AGENT_API_KEY env via the X-Agent-Key header. Admin-equivalent —
 * scope the key like a root credential.
 */
export function isAgentRequest(request: NextRequest): boolean {
  const configured = process.env.AGENT_API_KEY;
  const provided = request.headers.get('x-agent-key');
  if (!configured || !provided) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
