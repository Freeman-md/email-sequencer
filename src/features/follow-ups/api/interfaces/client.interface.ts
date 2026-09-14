import type { PreparationState } from '../../types/preparation';

export interface IFollowUpsClient {
  getState(signal: AbortSignal): Promise<PreparationState>;
  stop(signal: AbortSignal): Promise<PreparationState>;
  prepare(signal: AbortSignal, limit?: number): Promise<PreparationState>;
}
