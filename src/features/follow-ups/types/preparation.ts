export type PreparationState = {
  status: 'idle' | 'running' | 'stopping' | 'stopped' | 'completed' | 'error';
  startedAt: string | null;
  limit: number | null;
  checked: number;
  eligible: number;
  drafted: number;
  skipped: number;
  reasons: Record<string, number>;
  errors: { prospectId: string; message: string }[];
  errorCount: number;
  error?: string;
};
export const initialPreparationState = (): PreparationState => ({
  status: 'idle',
  startedAt: null,
  limit: null,
  checked: 0,
  eligible: 0,
  drafted: 0,
  skipped: 0,
  reasons: {},
  errors: [],
  errorCount: 0,
});
