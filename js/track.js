/* Order tracking page: /track.html?o=EF-1024&k=<private link token>
   Without a token, the shopper finds the order with its number + mobile number. */
(() => {
  const { AR, t, esc, qar, fmtDay, localTimes, store, pageUrl, validPhone } = window.EdenSite;
  const $ = s => document.querySelector(s);
  const icon = id => `<svg class="ic"><use href="#${id}"/></svg>`;
  const params = new URLSearchParams(location.search);
  const PAY = { cash: t('Cash'), card: t('Card'), transfer: t('Bank transfer') };
  const STEPS = [
    ['new', t('Order received'), t('We have your order.')],
    ['confirmed', t('Confirmed'), t("We've confirmed it and are picking it fresh.")],
    ['out_for_delivery', t('Out for delivery'), t('Your rider is on the way.')],
    ['delivered', t('Delivered'), t('Enjoy your harvest!')],
  ];
  let timer;

  const render = o => {
    const idx = STEPS.findIndex(s => s[0] === o.status);
    const cancelled = o.status === 'cancelled';
    const c = o.customer;
    const address = [c.area, c.zone && t('Zone {n}', { n: c.zone }), c.street && t('Street {n}', { n: c.street }), c.building && t('Building {n}', { n: c.building })].filter(Boolean).join(AR ? '، ' : ', ');
    const rider = o.rider;
    const riderDigits = (rider?.phone || '').replace(/\D/g, '');
    $('#track-card').innerHTML = `
      <div class="tcard__head">
        <div><small>${t('Order')}</small><b>${esc(o.code)}</b></div>
        <span class="tpill tpill--${o.status}">${cancelled ? t('Cancelled') : esc(STEPS[idx]?.[1] || '')}</span>
      </div>
      ${cancelled ? `<p class="tcard__cancel">${t('This order was cancelled. If that is a surprise, message us on WhatsApp and we will help.')}</p>` : `
      <ol class="tsteps">
        ${STEPS.map(([key, label, note], i) => `
          <li class="${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}">
            <span class="tsteps__dot">${i <= idx ? icon('i-check') : ''}</span>
            <div><b>${label}</b>${i === idx ? `<small>${note}</small>` : ''}</div>
          </li>`).join('')}
      </ol>`}
      ${rider ? `
      <div class="tcard__rider">
        ${icon('i-truck')}
        <div><small>${t('Your rider')}</small><b>${esc(rider.name || t('Eden Farm rider'))}</b></div>
        ${riderDigits ? `<a class="btn btn--ghost" href="tel:+${riderDigits.length === 8 ? '974' + riderDigits : riderDigits}">${icon('i-phone')}${t('Call')}</a>` : ''}
        ${rider.link ? `<a class="btn btn--primary" href="${esc(rider.link)}" target="_blank" rel="noopener">${icon('i-pin')}${t('Live location')}</a>` : ''}
      </div>` : ''}
      <dl class="tcard__facts">
        <div><dt>${t('Delivery')}</dt><dd>${esc(fmtDay(o.slot.date))} · ${esc(localTimes(o.slot.window))}</dd></div>
        <div><dt>${t('Address')}</dt><dd>${esc(address)}</dd></div>
        <div><dt>${t('Pay the rider')}</dt><dd>${PAY[o.payment]} · ${qar(o.total)}</dd></div>
        ${o.repeatEvery ? `<div><dt>${t('Repeats')}</dt><dd>${t('Every {n} days, same basket', { n: o.repeatEvery })}</dd></div>` : ''}
      </dl>
      <details class="tcard__items">
        <summary>${o.items.length === 1 ? t('1 item') : t('{n} items', { n: o.items.reduce((s, i) => s + i.qty, 0) })} · ${qar(o.total)}</summary>
        <ul>${o.items.map(i => `<li><span>${i.qty} × ${esc(i.name)} <small>(${esc(i.unit)})</small></span><span>${qar(i.total)}</span></li>`).join('')}
          <li class="tcard__del"><span>${t('Delivery')}</span><span>${o.delivery ? qar(o.delivery) : t('Free')}</span></li></ul>
      </details>
      <p class="tcard__foot">${t('This page updates by itself.')} <a class="js-wa" href="https://wa.me/${esc(window.EDEN?.settings?.whatsapp || '97466431863')}" target="_blank" rel="noopener">${t('Questions? WhatsApp us')}</a></p>`;
    $('#track-card').hidden = false;
  };

  const load = async (code, k, quiet = false) => {
    try {
      const r = await fetch(`/api/track/${encodeURIComponent(code)}?k=${encodeURIComponent(k)}`);
      if (!r.ok) {
        if (!quiet) { $('#track-form').hidden = false; showError(t("We couldn't find that order. Check the link, or search with your order number and mobile number.")); }
        return;
      }
      const { order } = await r.json();
      render(order);
      $('#track-form').hidden = true;
      clearTimeout(timer);
      if (!['delivered', 'cancelled'].includes(order.status)) timer = setTimeout(() => load(code, k, true), 30000);
    } catch {
      if (!quiet) showError(t("We couldn't reach the shop. Check your connection and try again."));
      else timer = setTimeout(() => load(code, k, true), 60000);
    }
  };

  const showError = msg => { const el = $('#track-error'); el.textContent = msg; el.hidden = !msg; };

  $('#track-form').addEventListener('submit', async e => {
    e.preventDefault();
    showError('');
    const code = $('#track-code').value.trim().toUpperCase();
    const phone = $('#track-phone').value;
    if (!/^EF-?\d+$/.test(code)) return showError(t('Enter your order number, for example EF-1024.'));
    if (!validPhone(phone)) return showError(t('Please enter an 8-digit Qatar mobile number.'));
    const btn = $('#track-go'); btn.disabled = true;
    try {
      const r = await fetch('/api/track/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.replace(/^EF(\d)/, 'EF-$1'), phone }) });
      if (r.status === 429) return showError(t('Too many attempts. Please wait a few minutes.'));
      if (!r.ok) return showError(t("We couldn't find an order with that number and mobile number."));
      const { code: c, token } = await r.json();
      history.replaceState(null, '', `${pageUrl('track.html')}?o=${encodeURIComponent(c)}&k=${encodeURIComponent(token)}`);
      remember(c, token);
      load(c, token);
    } catch {
      showError(t("We couldn't reach the shop. Check your connection and try again."));
    } finally {
      btn.disabled = false;
    }
  });

  const remember = (code, k) => {
    const list = store.get('orders', []).filter(o => o.code !== code);
    list.unshift({ code, k, at: Date.now() });
    store.set('orders', list.slice(0, 10));
  };

  // Orders placed from this device, newest first.
  const recent = store.get('orders', []);
  if (recent.length) {
    $('#track-recent').hidden = false;
    $('#track-recent-list').innerHTML = recent.map(o => `
      <li><a href="${pageUrl('track.html')}?o=${encodeURIComponent(o.code)}&k=${encodeURIComponent(o.k)}">
        <b>${esc(o.code)}</b><span>${new Date(o.at).toLocaleDateString(AR ? 'ar-QA-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>${icon('i-arrow')}
      </a></li>`).join('');
  }

  const code = params.get('o'); const k = params.get('k');
  if (code && k) { remember(code, k); load(code, k); }
  else $('#track-form').hidden = false;
})();
