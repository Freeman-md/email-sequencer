export type InteractionSummary = {
  id: string;
  prospect: string;
  company: string;
  email: string;
  subject: string;
  createdAt: string;
};

export type SentInteraction = InteractionSummary & { sentAt: string };
