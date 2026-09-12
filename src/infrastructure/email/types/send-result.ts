export type SendResult =
  | {
      kind: 'confirmed';
      sentAt: string;
      gmailMessageId: string;
      gmailThreadId: string;
    }
  | { kind: 'definite'; message: string }
  | { kind: 'uncertain'; message: string };
