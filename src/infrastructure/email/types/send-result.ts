export type SendResult =
  | {
      kind: 'confirmed';
      sentAt: string;
      gmailMessageId: string;
      gmailThreadId: string;
    }
  | { kind: 'definite'; message: string; submissionPrevented?: boolean }
  | { kind: 'uncertain'; message: string };
