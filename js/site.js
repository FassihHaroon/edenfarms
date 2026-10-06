/* Eden Farm: helpers shared by every page (language, money, dates, storage).
   Loaded after /api/catalog.js, which provides window.EDEN (and its Arabic UI strings). */
(() => {
  const EDEN = window.EDEN || {};
  const AR = (EDEN.lang || document.documentElement.lang) === 'ar';
  const T = EDEN.t || {};

  // t('Added {name}', { name }) → the Arabic string when the page is Arabic.
  const t = (s, vars = {}) => (T[s] || s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => Number(n).toFixed(2);
  const qar = n => (AR ? `${money(n)} ر.ق` : `QAR ${money(n)}`);
  const LOCALE = AR ? 'ar-QA-u-nu-latn' : 'en-GB';
  const fmtDay = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString(LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const fmtHour = h => `${h % 12 || 12}:00 ${h < 12 ? (AR ? 'ص' : 'am') : (AR ? 'م' : 'pm')}`;
  const localTimes = s => (AR ? String(s).replace(/\bam\b/gi, 'ص').replace(/\bpm\b/gi, 'م') : s);

  const qatarNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Qatar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
  };

  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('eden:' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('eden:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem('eden:' + k); } catch { /* storage unavailable */ } },
  };

  // Link to another page in the current language.
  const pageUrl = (p = '') => (AR ? '/ar/' : '/') + (p === 'index.html' ? '' : p);

  // Phone numbers for tel: and display, Qatar format.
  const qatarDigits = v => {
    let d = String(v).replace(/\D/g, '');
    if (d.startsWith('00974')) d = d.slice(5); else if (d.startsWith('974') && d.length === 11) d = d.slice(3);
    return d;
  };
  const validPhone = v => /^[3567]\d{7}$/.test(qatarDigits(v));

  // Footer details that staff can change in the admin panel.
  const s = EDEN.settings || {};
  const hours = document.getElementById('delivery-hours');
  if (hours && s.deliveryHours) hours.textContent = s.deliveryHours;
  if (s.whatsapp) document.querySelectorAll('.js-wa').forEach(a => { a.href = `https://wa.me/${s.whatsapp}`; });

  window.EdenSite = { EDEN, AR, t, esc, qar, money, fmtDay, fmtHour, localTimes, qatarNow, store, pageUrl, qatarDigits, validPhone };
})();
