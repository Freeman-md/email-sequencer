import type { GenerationContext } from '../types';

export interface IFollowUpGenerator {
  generate(context: GenerationContext, signal?: AbortSignal): Promise<string>;
}
