import type { PreparationState } from '../../types/preparation';

export interface IFollowUpsService {
  start(): PreparationState;
  snapshot(): PreparationState;
}
