import type { ProspectContact, ProspectContext } from '../types';

export interface IProspectContactRepository {
  findContactById(id: string): Promise<ProspectContact>;
  checkConnection(): Promise<void>;
}

export interface IProspectContextRepository {
  findContextById(id: string): Promise<ProspectContext>;
  pageWithInteractions(
    offset?: string,
  ): Promise<{ ids: string[]; offset?: string }>;
}

export interface IProspectRepository
  extends IProspectContactRepository, IProspectContextRepository {}
