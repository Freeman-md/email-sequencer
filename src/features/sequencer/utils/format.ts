export function dateTime(value: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(value));
}
export function countdown(value: string | null, now: number) {
  const seconds = value
    ? Math.max(0, Math.ceil((Date.parse(value) - now) / 1000))
    : 0;

  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
