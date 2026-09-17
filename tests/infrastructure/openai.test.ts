import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { OpenAIClient } from '@/infrastructure/openai/client';

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it('requests bounded text generation without tools and rejects incomplete or refused output', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
    Response.json({
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: 'A relevant follow-up.' }],
        },
      ],
    }),
  );
  const client = new OpenAIClient(
    { apiKey: 'synthetic-test-key', model: 'configured-model' },
    request,
  );
  expect(await client.generate('Write a body.', 'Existing context')).toBe(
    'A relevant follow-up.',
  );
  const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string);
  expect(body).toMatchObject({
    instructions: 'Write a body.',
    input: 'Existing context',
    model: 'configured-model',
    store: true,
    max_output_tokens: 2048,
  });
  expect(body.tools).toBeUndefined();
  for (const response of [
    { status: 'incomplete', output: [] },
    {
      status: 'completed',
      output: [
        {
          type: 'message',
          content: [{ type: 'refusal', refusal: 'private reason' }],
        },
      ],
    },
  ]) {
    request.mockResolvedValueOnce(Response.json(response));
    await expect(client.generate('Write.', 'Context')).rejects.toThrow(
      /complete generation|refused generation/,
    );
  }
  expect(request).toHaveBeenCalledTimes(3);
});

it('propagates cancellation to the generation request', async () => {
  const cancellation = new AbortController();
  const request = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => reject(new Error('Cancelled')),
          { once: true },
        );
      }),
  );
  const client = new OpenAIClient(
    { apiKey: 'synthetic-test-key', model: 'configured-model' },
    request,
  );
  const generation = client.generate(
    'Write.',
    'Existing context',
    cancellation.signal,
  );
  const outcome = expect(generation).rejects.toThrow('cancelled');
  cancellation.abort();
  await outcome;
  expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});

it.each([
  [401, 'invalid_api_key', 'authentication'],
  [403, 'permission_denied', 'access'],
  [429, 'insufficient_quota', 'quota'],
  [429, 'rate_limit_exceeded', 'rate_limit'],
  [500, 'server_error', 'unavailable'],
])(
  'classifies HTTP %s safely without retrying',
  async (status, code, expected) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code,
            message: 'PRIVATE provider details synthetic-test-key',
          },
        },
        { status, headers: { 'x-request-id': 'req_test' } },
      ),
    );
    const client = new OpenAIClient(
      { apiKey: 'synthetic-test-key', model: 'test-model' },
      request,
    );
    await expect(
      client.generate('PRIVATE prompt', 'PRIVATE body'),
    ).rejects.toMatchObject({ code: expected, requestId: 'req_test' });
    expect(request).toHaveBeenCalledTimes(1);
    const logs = JSON.stringify([
      vi.mocked(console.info).mock.calls,
      vi.mocked(console.error).mock.calls,
    ]);
    expect(logs).not.toContain('PRIVATE');
    expect(logs).not.toContain('synthetic-test-key');
    expect(
      JSON.parse(vi.mocked(console.error).mock.calls[0]![0]),
    ).toMatchObject({
      outcome: expected,
      requestId: 'req_test',
      httpStatus: status,
    });
  },
);

it('logs usage and identifies output exhaustion separately from malformed responses', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
    Response.json({
      id: 'resp_test',
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
      usage: { input_tokens: 12, output_tokens: 2048, total_tokens: 2060 },
    }),
  );
  const client = new OpenAIClient(
    { apiKey: 'synthetic-test-key', model: 'test-model' },
    request,
  );
  await expect(client.generate('Write.', 'Context')).rejects.toMatchObject({
    code: 'output_limit',
  });
  expect(JSON.parse(vi.mocked(console.error).mock.calls[0]![0])).toMatchObject({
    responseId: 'resp_test',
    usage: { input_tokens: 12, output_tokens: 2048, total_tokens: 2060 },
  });
  request.mockResolvedValueOnce(Response.json({ unexpected: 'PRIVATE' }));
  await expect(client.generate('Write.', 'Context')).rejects.toMatchObject({
    code: 'invalid_response',
  });
});

it('distinguishes timeouts from network failures', async () => {
  vi.useFakeTimers();
  const timeout = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
  const request = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => reject(new Error('PRIVATE')),
          { once: true },
        );
      }),
  );

  try {
    const client = new OpenAIClient(
      { apiKey: 'synthetic-test-key', model: 'test-model' },
      request,
    );
    const outcome = expect(
      client.generate('Write.', 'Context'),
    ).rejects.toMatchObject({ code: 'timeout' });
    timeout.abort();
    await outcome;
    vi.mocked(AbortSignal.timeout).mockReturnValue(
      new AbortController().signal,
    );
    request.mockRejectedValueOnce(new Error('PRIVATE network detail'));
    await expect(client.generate('Write.', 'Context')).rejects.toMatchObject({
      code: 'transport',
    });
  } finally {
    vi.useRealTimers();
  }
});
