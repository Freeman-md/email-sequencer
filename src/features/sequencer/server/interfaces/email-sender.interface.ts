import type { Email, SendResult } from '@/infrastructure/gmail/send';

export interface EmailSender {
  send(email: Email): Promise<SendResult>;
}
