import type { PreparationState } from '../../types/preparation';

export interface IFollowUpPreparationService {
  start(limit?: number): PreparationState;
  stop(): PreparationState;
  snapshot(): PreparationState;
}
