import { OAuth2Client } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';

import { GmailClient } from '@/infrastructure/gmail/client';
import { GmailService } from '@/infrastructure/gmail/service';

function createSender(
  accessToken: () => Promise<string>,
  request: typeof fetch,
  now = () => new Date(),
) {
  const client = new GmailClient(
    'test-client',
    () => new OAuth2Client(),
    request,
    now,
  );
  vi.spyOn(client, 'accessToken').mockImplementation(accessToken);
  const service = new GmailService(client, {
    read: vi.fn().mockResolvedValue({
      refreshToken: 'fake-refresh',
      email: 'operator@example.com',
    }),
    write: vi.fn(),
  });

  return service.send.bind(service);
}

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
      .mockResolvedValue(
        Response.json({ id: 'gmail-id', threadId: 'thread-id' }),
      );
    const result = await createSender(
      access,
      send,
      () => new Date('2026-09-09T12:00:01Z'),
    )(email);
    expect(result).toEqual({
      kind: 'confirmed',
      gmailMessageId: 'gmail-id',
      gmailThreadId: 'thread-id',
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
      expect((await createSender(access, send)(email)).kind).toBe('definite');
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it.each([408, 500, 502, 503])(
    'classifies ambiguous HTTP %s as uncertain',
    async (status) => {
      const send = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('', { status }));
      expect((await createSender(access, send)(email)).kind).toBe('uncertain');
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it('treats network loss and malformed success as uncertain', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('Connection lost'));
    expect((await createSender(access, send)(email)).kind).toBe('uncertain');
    send.mockResolvedValue(Response.json({}));
    expect((await createSender(access, send)(email)).kind).toBe('uncertain');
  });
  it('does not submit anything when authorization or recipient validation fails', async () => {
    const send = vi.fn<typeof fetch>();
    expect(
      (
        await createSender(async () => {
          throw new Error('Expired');
        }, send)(email)
      ).kind,
    ).toBe('definite');
    expect(
      (
        await createSender(
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
      const result = await createSender(access, send)(email);
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
      const result = await createSender(access, send)(email);
      expect(result.kind).toBe('definite');
      if (result.kind !== 'confirmed') {
        expect(result.message).toContain('no recognized error reason');
        expect(result.message).not.toContain('untrusted-secret-value');
        expect(result.message).not.toContain('not JSON');
      }
    }
  });
});

function threadFixture() {
  return {
    id: 'thread-id',
    messages: [
      {
        id: 'parent-gmail-id',
        threadId: 'thread-id',
        internalDate: '1788254400000',
        labelIds: ['SENT'],
        payload: {
          headers: [
            { name: 'From', value: 'Operator <operator@example.com>' },
            { name: 'To', value: 'Maya <maya@example.com>' },
            { name: 'Subject', value: '=?UTF-8?Q?Hello_=E2=9C=93?=' },
            { name: 'Message-ID', value: '<parent@example.com>' },
            { name: 'References', value: '<original@example.com>' },
          ],
        },
      },
    ],
  };
}

describe('threaded Gmail sending', () => {
  it('uses RFC reply headers and the Gmail thread ID, including encoded subjects', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(threadFixture()))
      .mockResolvedValueOnce(
        Response.json({ id: 'reply-id', threadId: 'thread-id' }),
      );
    const result = await createSender(
      access,
      request,
    )({ ...email, isFollowUp: true, gmailThreadId: 'thread-id' });
    expect(result).toMatchObject({
      kind: 'confirmed',
      gmailMessageId: 'reply-id',
      gmailThreadId: 'thread-id',
    });
    expect(String(request.mock.calls[0]?.[0])).toContain(
      '/threads/thread-id?format=metadata',
    );
    const body = JSON.parse(request.mock.calls[1]?.[1]?.body as string);
    expect(body.threadId).toBe('thread-id');
    const mime = Buffer.from(body.raw, 'base64url').toString('utf8');
    expect(mime).toContain('In-Reply-To: <parent@example.com>');
    expect(mime).toContain(
      'References: <original@example.com> <parent@example.com>',
    );
    expect(mime).not.toContain('parent-gmail-id');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not submit a follow-up without a thread, with unreadable metadata, or after an inbound reply', async () => {
    const request = vi.fn<typeof fetch>();
    expect(
      (await createSender(access, request)({ ...email, isFollowUp: true }))
        .kind,
    ).toBe('definite');
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce(new Response('', { status: 403 }));
    expect(
      (
        await createSender(
          access,
          request,
        )({ ...email, isFollowUp: true, gmailThreadId: 'thread-id' })
      ).kind,
    ).toBe('definite');
    const thread = threadFixture();
    thread.messages[0]!.payload.headers[0]!.value = 'Maya <maya@example.com>';
    request.mockResolvedValueOnce(Response.json(thread));
    expect(
      (
        await createSender(
          access,
          request,
        )({ ...email, isFollowUp: true, gmailThreadId: 'thread-id' })
      ).kind,
    ).toBe('definite');
    expect(
      request.mock.calls.every(
        (call) => !call[1]?.method || call[1]?.method === 'GET',
      ),
    ).toBe(true);
  });
});
