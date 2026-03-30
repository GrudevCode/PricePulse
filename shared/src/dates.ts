/** Civil calendar date YYYY-MM-DD in Europe/London (menu schedule + public QR `forDate` default). */
export function calendarDateLondon(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

/** 24h clock "HH:mm" in Europe/London. */
export function clockTimeLondon(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}
