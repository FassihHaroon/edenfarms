// All delivery rules run on Qatar time (UTC+3, no daylight saving), whatever
// time zone the server or the customer's phone is set to.
const TZ = 'Asia/Qatar';

export function qatarNow(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function formatDay(isoDate) {
  return new Date(isoDate + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}

// Delivery slots offered right now. Today's slots close at the cutoff hour.
export function availableSlots(settings, now = new Date()) {
  const q = qatarNow(now);
  const todayOpen = q.hour < settings.cutoff_hour;
  const tomorrow = addDays(q.date, 1);
  return [
    ...settings.slots_today.map(w => ({ date: q.date, day: 'Today', window: w, open: todayOpen })),
    ...settings.slots_tomorrow.map(w => ({ date: tomorrow, day: 'Tomorrow', window: w, open: true })),
  ];
}

export function slotLabel(isoDate, window, now = new Date()) {
  const q = qatarNow(now);
  const rel = isoDate === q.date ? 'Today, ' : isoDate === addDays(q.date, 1) ? 'Tomorrow, ' : '';
  return `${rel}${formatDay(isoDate)} · ${window}`;
}
