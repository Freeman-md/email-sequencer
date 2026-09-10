import 'server-only';
import { z } from 'zod';

const reasonSchema = z.object({ reason: z.string().optional() });
const errorSchema = z.object({
  error: z.object({
    errors: z.array(reasonSchema).optional(),
    details: z.array(reasonSchema).optional(),
  }),
});

const guidance: Record<string, string> = {
  SERVICE_DISABLED:
    'Enable Gmail API in APIs & Services in the Google Cloud project that owns your OAuth client, then allow time for activation.',
  accessNotConfigured:
    'Enable Gmail API in APIs & Services in the Google Cloud project that owns your OAuth client, then allow time for activation.',
  ACCESS_TOKEN_SCOPE_INSUFFICIENT:
    'Reconnect Gmail and grant the permission to send email on your behalf.',
  insufficientPermissions:
    'Reconnect Gmail and grant the permission to send email on your behalf.',
  domainPolicy:
    'Your Google Workspace administrator must allow this app to access Gmail.',
  dailyLimitExceeded:
    'The project daily API quota was exceeded. Check Gmail API quotas in Google Cloud before another run.',
  userRateLimitExceeded:
    'The Gmail API request rate for this user was exceeded. Wait before another run and check other apps using this mailbox.',
  rateLimitExceeded:
    'The Gmail API request rate was exceeded. Wait before another run and check project API usage.',
};

export async function gmailRejection(response: Response): Promise<string> {
  const prefix = `Gmail rejected the email (HTTP ${response.status}). Draft unchanged.`;
  try {
    const parsed = errorSchema.safeParse(await response.json());
    if (parsed.success) {
      const reasons = [
        ...(parsed.data.error.details ?? []),
        ...(parsed.data.error.errors ?? []),
      ];
      for (const { reason } of reasons) {
        // Only recognized codes and our own text leave the server. Google error
        // messages/metadata may contain request data and are deliberately omitted.
        if (reason && Object.hasOwn(guidance, reason)) {
          return `${prefix} ${reason}: ${guidance[reason]}`;
        }
      }
    }
  } catch {
    // The explicit rejection remains definite even if its body is unreadable.
  }
  return `${prefix} Google supplied no recognized error reason. Check Gmail API enablement, send permission and project quotas.`;
}
