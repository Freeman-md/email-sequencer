import { FOLLOW_UP_INSTRUCTIONS, followUpContext } from '../prompts/follow-up';

import type { IFollowUpGenerator } from '../interfaces/generator.interface';
import type { GenerationContext } from '../types';
import type { ITextGenerator } from '@/infrastructure/text-generation/interfaces/generator.interface';

export class FollowUpGenerator implements IFollowUpGenerator {
  constructor(private readonly client: ITextGenerator) {}

  generate(context: GenerationContext, signal?: AbortSignal) {
    return this.client.generate(
      FOLLOW_UP_INSTRUCTIONS,
      followUpContext(context),
      signal,
    );
  }
}
