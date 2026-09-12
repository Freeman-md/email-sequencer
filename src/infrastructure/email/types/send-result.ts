export type SendResult =
  | { kind: 'confirmed'; sentAt: string }
  | { kind: 'definite'; message: string }
  | { kind: 'uncertain'; message: string };
