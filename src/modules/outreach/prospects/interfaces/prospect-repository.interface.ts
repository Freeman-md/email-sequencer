import type { ProspectContact, ProspectContext } from '../types';

export interface IProspectContactRepository {
  findContactById(id: string): Promise<ProspectContact>;
  checkConnection(): Promise<void>;
}

export interface IProspectContextRepository {
  findContextById(id: string): Promise<ProspectContext>;
}

export interface IProspectRepository
  extends IProspectContactRepository, IProspectContextRepository {}
