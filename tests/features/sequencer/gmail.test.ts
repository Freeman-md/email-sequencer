import { describe, expect, it, vi } from 'vitest';
import { createGmailSender } from '@/infrastructure/gmail/send';

const email = {
  email: 'maya@example.com',
  subject: 'Hello ✓',
  message: 'Line one\nLine two — welcome',
};
const access = async () => 'fake-test-access';

describe('Gmail outcome boundaries', () => {
  it('encodes the message and accepts a confirmed message ID without retrying', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'gmail-id' }));
    const result = await createGmailSender(
      access,
      send,
      () => new Date('2026-09-09T12:00:01Z'),
    )(email);
    expect(result).toEqual({
      kind: 'confirmed',
      sentAt: '2026-09-09T12:00:01.000Z',
    });
    const raw = JSON.parse(send.mock.calls[0]?.[1]?.body as string).raw;
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('To: maya@example.com');
    expect(mime).toContain('Subject: =?UTF-8?');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([400, 401, 403, 404, 413, 422, 429])(
    'classifies explicit rejection %s as definite',
    async (status) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('', { status }));
      expect((await createGmailSender(access, send)(email)).kind).toBe(
        'definite',
      );
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it.each([408, 500, 502, 503])(
    'classifies ambiguous HTTP %s as uncertain',
    async (status) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('', { status }));
      expect((await createGmailSender(access, send)(email)).kind).toBe(
        'uncertain',
      );
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it('treats network loss and malformed success as uncertain', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Connection lost'));
    expect((await createGmailSender(access, send)(email)).kind).toBe(
      'uncertain',
    );
    send.mockResolvedValue(Response.json({}));
    expect((await createGmailSender(access, send)(email)).kind).toBe(
      'uncertain',
    );
  });
  it('does not submit anything when authorization or recipient validation fails', async () => {
    const send = vi.fn<typeof fetch>();
    expect(
      (
        await createGmailSender(async () => {
          throw new Error('Expired');
        }, send)(email)
      ).kind,
    ).toBe('definite');
    expect(
      (
        await createGmailSender(
          access,
          send,
        )({ ...email, email: 'a@example.com\r\nBcc: b@example.com' })
      ).kind,
    ).toBe('definite');
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    ['SERVICE_DISABLED', 'Enable Gmail API'],
    ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'Reconnect Gmail'],
    ['domainPolicy', 'Workspace administrator'],
    ['dailyLimitExceeded', 'daily API quota'],
  ])(
    'explains a 403 with reason %s without exposing upstream messages',
    async (reason, expected) => {
      const send = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              message: 'private upstream request data',
              errors: [{ reason }],
              details: [{ reason, metadata: { private: 'do-not-display' } }],
            },
          },
          { status: 403 },
        ),
      );
      const result = await createGmailSender(access, send)(email);
      expect(result.kind).toBe('definite');
      if (result.kind !== 'confirmed') {
        expect(result.message).toContain(expected);
        expect(result.message).toContain(reason);
        expect(result.message).not.toContain('private');
        expect(result.message).not.toContain('do-not-display');
      }
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps unknown and malformed 403 responses definite without echoing their bodies', async () => {
    for (const response of [
      Response.json(
        { error: { errors: [{ reason: 'untrusted-secret-value' }] } },
        { status: 403 },
      ),
      new Response('not JSON', { status: 403 }),
    ]) {
      const send = vi.fn<typeof fetch>().mockResolvedValue(response);
      const result = await createGmailSender(access, send)(email);
      expect(result.kind).toBe('definite');
      if (result.kind !== 'confirmed') {
        expect(result.message).toContain('no recognized error reason');
        expect(result.message).not.toContain('untrusted-secret-value');
        expect(result.message).not.toContain('not JSON');
      }
    }
  });
});
