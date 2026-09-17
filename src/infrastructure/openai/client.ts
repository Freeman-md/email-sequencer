import 'server-only';
import { randomUUID } from 'node:crypto';

import { TextGenerationError } from '../text-generation/error';

import { errorSchema, responseSchema } from './schemas';

import type { ITextGenerator } from '../text-generation/interfaces/generator.interface';

export class OpenAIClient implements ITextGenerator {
  constructor(
    private readonly config: { apiKey: string; model: string },
    private readonly request: typeof fetch = fetch,
  ) {}

  async generate(instructions: string, input: string, signal?: AbortSignal) {
    const startedAt = Date.now();
    const attemptId = randomUUID();
    const requestSignal = signal
      ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
      : AbortSignal.timeout(60000);
    let requestId: string | undefined;
    let httpStatus: number | undefined;
    let usage: unknown;
    let responseId: string | undefined;
    let outcome = 'completed';
    let receivedResponse = false;
    const model = safeIdentifier(this.config.model);
    console.info(
      JSON.stringify({ event: 'openai.generation.started', attemptId, model }),
    );

    try {
      requestSignal.throwIfAborted();
      if (!this.config.apiKey || !this.config.model)
        throw new TextGenerationError('configuration');
      if (input.length > 100000)
        throw new TextGenerationError('context_too_large');
      const response = await this.request(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.config.model,
            instructions,
            input,
            max_output_tokens: 2048,
            store: true,
          }),
          signal: requestSignal,
          redirect: 'error',
        },
      );
      receivedResponse = true;
      httpStatus = response.status;
      requestId = safeIdentifier(response.headers.get('x-request-id'));
      if (!response.ok) {
        const error = errorSchema.safeParse(
          await response.json().catch(() => null),
        );
        const code = error.success ? error.data.error.code : undefined;
        throw new TextGenerationError(
          code === 'insufficient_quota'
            ? 'quota'
            : response.status === 401
              ? 'authentication'
              : response.status === 403 || response.status === 404
                ? 'access'
                : response.status === 429
                  ? 'rate_limit'
                  : response.status >= 500
                    ? 'unavailable'
                    : 'request_rejected',
          requestId,
        );
      }
      const data = responseSchema.parse(await response.json());
      usage = data.usage;
      responseId = safeIdentifier(data.id);
      if (data.status !== 'completed')
        throw new TextGenerationError(
          data.incomplete_details?.reason === 'max_output_tokens'
            ? 'output_limit'
            : 'incomplete',
          requestId,
        );
      if (
        data.output.some((item) =>
          item.content?.some((part) => part.type === 'refusal'),
        )
      )
        throw new TextGenerationError('refused', requestId);
      const text = data.output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === 'output_text')
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!text) throw new TextGenerationError('empty', requestId);

      return text;
    } catch (cause) {
      const error =
        cause instanceof TextGenerationError
          ? cause
          : signal?.aborted
            ? new TextGenerationError('cancelled', requestId)
            : requestSignal.aborted
              ? new TextGenerationError('timeout', requestId)
              : new TextGenerationError(
                  receivedResponse ? 'invalid_response' : 'transport',
                  requestId,
                );
      outcome = error.code;
      throw error;
    } finally {
      // Never log prompts, email content, credentials, or raw provider errors.
      const entry = JSON.stringify({
        event: 'openai.generation.finished',
        attemptId,
        model,
        outcome,
        durationMs: Date.now() - startedAt,
        httpStatus,
        requestId,
        responseId,
        usage,
      });
      if (outcome === 'completed' || outcome === 'cancelled')
        console.info(entry);
      else console.error(entry);
    }
  }
}

function safeIdentifier(value: string | null | undefined) {
  return value && /^[a-zA-Z0-9_.:/-]{1,200}$/.test(value) ? value : undefined;
}
