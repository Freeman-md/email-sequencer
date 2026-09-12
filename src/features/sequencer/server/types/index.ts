import type { Connection } from '../../types';

export type InteractionRecord = {
  id: string;
  status: string;
  direction: string;
  channel: string;
  subject: string;
  message: string;
  prospectIds: string[];
  createdAt: string;
};

export type Prospect = {
  id: string;
  name: string;
  company: string;
  email: string;
};

export type ConnectionState = { airtable: Connection; gmail: Connection };
