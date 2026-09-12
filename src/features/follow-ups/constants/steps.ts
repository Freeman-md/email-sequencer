export const FOLLOW_UP_STEPS = [
  {
    number: 1,
    waitDays: 3,
    guidance:
      'Briefly reference the previous email. Restate the core relevance in one sentence. Use a low-friction CTA. Do not introduce a new offer.',
  },
  {
    number: 2,
    waitDays: 4,
    guidance:
      'Reference the prior thread. Add one useful piece of existing context or clarify the offer from a different angle. Keep it concise. Ask one easy question. Avoid “just checking in”.',
  },
  {
    number: 3,
    waitDays: 5,
    guidance:
      'Keep it extremely short. Acknowledge this is the final follow-up. Reconfirm the relevant offer. Give the prospect an easy out, with no guilt or pressure.',
  },
] as const;
export type FollowUpStep = {
  number: number;
  waitDays: number;
  guidance: string;
};
