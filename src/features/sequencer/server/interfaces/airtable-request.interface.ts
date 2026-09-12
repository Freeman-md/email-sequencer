export interface AirtableRequest {
  (path: string, init?: RequestInit): Promise<unknown>;
}
