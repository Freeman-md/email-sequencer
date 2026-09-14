import type { PreparationState } from '../../types/preparation';

export interface IFollowUpsService {
  start(limit?: number): PreparationState;
  stop(): PreparationState;
  snapshot(): PreparationState;
}
