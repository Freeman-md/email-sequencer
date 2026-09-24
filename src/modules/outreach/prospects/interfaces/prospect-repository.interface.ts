import type {
  ProspectContact,
  ProspectContext,
  ProspectQueueContext,
} from '../types';

export interface IProspectContactRepository {
  findContactById(id: string): Promise<ProspectContact>;
  checkConnection(): Promise<void>;
}

export interface IProspectContextRepository {
  findContextById(id: string): Promise<ProspectContext>;
}

export interface IProspectQueueRepository {
  findQueueContextById(id: string): Promise<ProspectQueueContext>;
}

export interface IProspectRepository
  extends
    IProspectContactRepository,
    IProspectContextRepository,
    IProspectQueueRepository {}
