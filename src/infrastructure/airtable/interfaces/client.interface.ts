export interface IAirtableClient {
  request(path: string, init?: RequestInit): Promise<unknown>;
}
