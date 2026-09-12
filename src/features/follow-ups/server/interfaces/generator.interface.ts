import type { GenerationContext } from '../types';

export interface IFollowUpGenerator {
  generate(context: GenerationContext): Promise<string>;
}
