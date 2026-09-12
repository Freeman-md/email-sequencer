import 'server-only';
import { responseSchema } from './schemas';

import type { ITextGenerator } from '../text-generation/interfaces/generator.interface';

export class OpenAIClient implements ITextGenerator {
  constructor(
    private readonly config: { apiKey: string; model: string },
    private readonly request: typeof fetch = fetch,
  ) {}

  async generate(instructions: string, input: string) {
    if (!this.config.apiKey || !this.config.model)
      throw new Error(
        'Configure EMAIL_SEQUENCER_OPENAI_API_KEY and EMAIL_SEQUENCER_OPENAI_MODEL for follow-up generation.',
      );
    // Bound request size without silently dropping campaign or conversation context.
    if (input.length > 100000)
      throw new Error('Follow-up context exceeds the supported size.');

    try {
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
            store: false,
          }),
          signal: AbortSignal.timeout(60000),
          redirect: 'error',
        },
      );
      if (!response.ok) throw new Error('Generation request failed');
      const data = responseSchema.parse(await response.json());
      if (
        data.output.some((item) =>
          item.content?.some((part) => part.type === 'refusal'),
        )
      )
        throw new Error('Generation refused');
      const text = data.output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === 'output_text')
        .map((part) => part.text ?? '')
        .join('')
        .trim();
      if (!text) throw new Error('Empty generation');

      return text;
    } catch {
      throw new Error(
        'Follow-up generation failed. Check the configured OpenAI model, access and availability. No automatic retry was made.',
      );
    }
  }
}
