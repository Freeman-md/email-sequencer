import 'server-only';
import { randomUUID } from 'node:crypto';

import { TextGenerationError } from '../text-generation/error';

import { errorSchema, responseSchema } from './schemas';

import type { ITextGenerator } from '../text-generation/interfaces/generator.interface';

type GenerationDiagnostics = {
  attemptId: string;
  model: string | undefined;
  requestId: string | undefined;
  httpStatus: number | undefined;
  usage: unknown;
  responseId: string | undefined;
  outcome: string;
  receivedResponse: boolean;
};

export class OpenAIClient implements ITextGenerator {
  constructor(
    private readonly config: { apiKey: string; model: string },
    private readonly request: typeof fetch = fetch,
  ) {}

  async generate(instructions: string, input: string, signal?: AbortSignal) {
    const startedAt = Date.now();
    const requestSignal = this.createRequestSignal(signal);
    const diagnostics = this.startDiagnostics();

    try {
      requestSignal.throwIfAborted();
      this.validateGenerationInput(input);
      const response = await this.request(
        'https://api.openai.com/v1/responses',
        this.buildRequest(instructions, input, requestSignal),
      );
      diagnostics.receivedResponse = true;

      return await this.interpretResponse(response, diagnostics);
    } catch (cause) {
      const error = this.classifyFailure(
        cause,
        signal,
        requestSignal,
        diagnostics,
      );
      diagnostics.outcome = error.code;
      throw error;
    } finally {
      this.finishDiagnostics(diagnostics, Date.now() - startedAt);
    }
  }

  private createRequestSignal(signal?: AbortSignal) {
    const timeout = AbortSignal.timeout(60000);

    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }

  private startDiagnostics(): GenerationDiagnostics {
    const diagnostics: GenerationDiagnostics = {
      attemptId: randomUUID(),
      model: this.safeIdentifier(this.config.model),
      requestId: undefined,
      httpStatus: undefined,
      usage: undefined,
      responseId: undefined,
      outcome: 'completed',
      receivedResponse: false,
    };
    console.info(
      JSON.stringify({
        event: 'openai.generation.started',
        attemptId: diagnostics.attemptId,
        model: diagnostics.model,
      }),
    );

    return diagnostics;
  }

  private validateGenerationInput(input: string) {
    if (!this.config.apiKey || !this.config.model) {
      throw new TextGenerationError('configuration');
    }
    if (input.length > 100000) {
      throw new TextGenerationError('context_too_large');
    }
  }

  private buildRequest(
    instructions: string,
    input: string,
    signal: AbortSignal,
  ) {
    return {
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
      signal,
      redirect: 'error' as const,
    };
  }

  private async interpretResponse(
    response: Response,
    diagnostics: GenerationDiagnostics,
  ) {
    diagnostics.httpStatus = response.status;
    diagnostics.requestId = this.safeIdentifier(
      response.headers.get('x-request-id'),
    );
    if (!response.ok) {
      throw await this.classifyHttpError(response, diagnostics.requestId);
    }

    const data = responseSchema.parse(await response.json());
    diagnostics.usage = data.usage;
    diagnostics.responseId = this.safeIdentifier(data.id);
    this.assertCompletedResponse(data, diagnostics.requestId);

    return this.extractText(data, diagnostics.requestId);
  }

  private async classifyHttpError(response: Response, requestId?: string) {
    const result = errorSchema.safeParse(
      await response.json().catch(() => null),
    );
    const providerCode = result.success ? result.data.error.code : undefined;

    if (providerCode === 'insufficient_quota') {
      return new TextGenerationError('quota', requestId);
    }
    if (response.status === 401) {
      return new TextGenerationError('authentication', requestId);
    }
    if (response.status === 403 || response.status === 404) {
      return new TextGenerationError('access', requestId);
    }
    if (response.status === 429) {
      return new TextGenerationError('rate_limit', requestId);
    }
    if (response.status >= 500) {
      return new TextGenerationError('unavailable', requestId);
    }

    return new TextGenerationError('request_rejected', requestId);
  }

  private assertCompletedResponse(
    data: ReturnType<typeof responseSchema.parse>,
    requestId?: string,
  ) {
    if (data.status === 'completed') {
      return;
    }
    if (data.incomplete_details?.reason === 'max_output_tokens') {
      throw new TextGenerationError('output_limit', requestId);
    }

    throw new TextGenerationError('incomplete', requestId);
  }

  private extractText(
    data: ReturnType<typeof responseSchema.parse>,
    requestId?: string,
  ) {
    if (
      data.output.some((item) =>
        item.content?.some((part) => part.type === 'refusal'),
      )
    ) {
      throw new TextGenerationError('refused', requestId);
    }

    const text = data.output
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === 'output_text')
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!text) {
      throw new TextGenerationError('empty', requestId);
    }

    return text;
  }

  private classifyFailure(
    cause: unknown,
    signal: AbortSignal | undefined,
    requestSignal: AbortSignal,
    diagnostics: GenerationDiagnostics,
  ) {
    if (cause instanceof TextGenerationError) {
      return cause;
    }
    if (signal?.aborted) {
      return new TextGenerationError('cancelled', diagnostics.requestId);
    }
    if (requestSignal.aborted) {
      return new TextGenerationError('timeout', diagnostics.requestId);
    }
    if (diagnostics.receivedResponse) {
      return new TextGenerationError('invalid_response', diagnostics.requestId);
    }

    return new TextGenerationError('transport', diagnostics.requestId);
  }

  private finishDiagnostics(
    diagnostics: GenerationDiagnostics,
    durationMs: number,
  ) {
    // Never log prompts, email content, credentials, or raw provider errors.
    const entry = JSON.stringify({
      event: 'openai.generation.finished',
      attemptId: diagnostics.attemptId,
      model: diagnostics.model,
      outcome: diagnostics.outcome,
      durationMs,
      httpStatus: diagnostics.httpStatus,
      requestId: diagnostics.requestId,
      responseId: diagnostics.responseId,
      usage: diagnostics.usage,
    });
    if (
      diagnostics.outcome === 'completed' ||
      diagnostics.outcome === 'cancelled'
    ) {
      console.info(entry);

      return;
    }
    console.error(entry);
  }

  private safeIdentifier(value: string | null | undefined) {
    return value && /^[a-zA-Z0-9_.:/-]{1,200}$/.test(value) ? value : undefined;
  }
}
