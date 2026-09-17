import type { GenerationContext } from '../types/follow-up';

export interface IFollowUpGenerator {
  generate(context: GenerationContext, signal?: AbortSignal): Promise<string>;
}
