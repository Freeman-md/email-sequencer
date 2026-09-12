import type { Email } from '../types/email';
import type { SendResult } from '../types/send-result';

export interface EmailSender {
  send(email: Email): Promise<SendResult>;
}
