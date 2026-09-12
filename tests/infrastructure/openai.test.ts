import { expect, it, vi } from 'vitest';

import { OpenAIClient } from '@/infrastructure/openai/client';

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
    store: false,
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
      'generation failed',
    );
  }
  expect(request).toHaveBeenCalledTimes(3);
});
