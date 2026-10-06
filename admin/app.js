/* Eden Farm admin panel (staff only; the server refuses this file without a session). */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const qar = n => 'QAR ' + Number(n).toFixed(2);
  const icon = id => `<svg class="ic"><use href="#${id}"/></svg>`;
  const STATUS = { new: 'New', confirmed: 'Confirmed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
  const NEXT = { new: ['confirmed', 'Confirm order'], confirmed: ['out_for_delivery', 'Out for delivery'], out_for_delivery: ['delivered', 'Mark delivered'] };
  const PAY = { cash: 'Cash', card: 'Card', transfer: 'Bank transfer' };
  const SUB_STATUS = { active: 'Active', paused: 'Paused', cancelled: 'Stopped' };

  /* ---------- API ---------- */
  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res;
    try { res = await fetch(url, opts); } catch { return { ok: false, status: 0, body: { message: "Couldn't reach the server. Check your connection." } }; }
    if (res.status === 401) { location.href = '/admin/login'; return new Promise(() => {}); }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: data };
  }

  let toastTimer;
  const toast = (msg, isErr = false) => {
    const t = $('#toast'); t.textContent = msg; t.classList.toggle('is-err', isErr); t.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), isErr ? 4500 : 2600);
  };

  const ago = iso => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: 'numeric', month: 'short' });
  };
  const clock = iso => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Qatar', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const fmtDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const qatarToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(new Date());
  const mapsLink = (loc, c) => loc
    ? `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`
    : `https://www.google.com/maps/search/${encodeURIComponent(`${[c.zone && 'Zone ' + c.zone, c.street && 'Street ' + c.street, c.building && 'Building ' + c.building].filter(Boolean).join(', ')} ${c.area} Qatar`)}`;
  const lines = v => v.split('\n').map(s => s.trim()).filter(Boolean);

  /* ---------- Tabs ---------- */
  const state = {
    tab: 'orders',
    orders: { status: 'open', day: 'all', q: '', repeat: '' },
    repeatStatus: 'active',
    products: [], categories: [], bundles: [], productShow: 'all', productQ: '',
    newCount: null,
    slotWindows: null,
  };
  const loaders = { orders: loadOrders, repeat: loadRepeat, products: loadProducts, bundles: loadBundles, settings: loadSettings };

  function showTab(tab) {
    if (!loaders[tab]) tab = 'orders';
    state.tab = tab;
    $$('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
    $$('.main > .view').forEach(v => { v.hidden = v.id !== `tab-${tab}`; });
    history.replaceState(null, '', `#${tab}`);
    loaders[tab]();
  }
  $('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });

  $('#logout').addEventListener('click', async () => {
    await api('POST', '/api/admin/logout');
    location.href = '/admin/login';
  });

  // Segmented chip groups
  function seg(el, onChange) {
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      $$('button', el).forEach(x => x.setAttribute('aria-pressed', x === b));
      onChange(b.dataset.v);
    });
  }

  /* ================= ORDERS ================= */
  async function loadSummary() {
    const { ok, body: s } = await api('GET', '/api/admin/summary');
    if (!ok) return;
    $('#tiles').innerHTML = `
      <div class="tile${s.newOrders ? ' tile--alert' : ''}"><small>New orders</small><b>${s.newOrders}</b></div>
      <div class="tile"><small>Deliveries today</small><b>${s.todayDeliveries}</b><span class="muted num" style="font-size:12px">${s.tomorrowDeliveries} tomorrow</span></div>
      <div class="tile${s.repeatDue ? ' tile--alert' : ''}"><small>Repeat orders due</small><b>${s.repeatDue}</b><span class="muted num" style="font-size:12px">${s.repeatActive} regular customer${s.repeatActive === 1 ? '' : 's'}</span></div>
      <div class="tile"><small>Ordered today</small><b>${qar(s.todaySales).replace('QAR ', '')}</b><span class="muted num" style="font-size:12px">QAR · ${s.todayOrders} order${s.todayOrders === 1 ? '' : 's'}</span></div>`;
    const c = $('#new-count'); c.textContent = s.newOrders; c.hidden = !s.newOrders;
    const r = $('#repeat-count'); r.textContent = s.repeatDue; r.hidden = !s.repeatDue;
    document.title = (s.newOrders ? `(${s.newOrders}) ` : '') + 'Eden Farm Admin';
    if (state.newCount != null && s.newOrders > state.newCount) {
      toast(`New order received (${s.newOrders} waiting)`);
      chime();
      if (state.tab === 'orders' && !$('#orders').contains(document.activeElement)) loadOrders(false);
    }
    state.newCount = s.newOrders;
  }

  // Short tone for new orders (browsers allow sound only after the page has been clicked once).
  let audio;
  document.addEventListener('pointerdown', () => { audio ??= new (window.AudioContext || window.webkitAudioContext)(); }, { once: true });
  function chime() {
    if (!audio) return;
    const now = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audio.createOscillator(); const g = audio.createGain();
      o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, now + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.25);
      o.start(now + i * 0.18); o.stop(now + i * 0.18 + 0.3);
    });
  }

  async function loadOrders(withSummary = true) {
    if (withSummary) loadSummary();
    const p = new URLSearchParams(Object.entries(state.orders).filter(([, v]) => v !== ''));
    const { ok, body } = await api('GET', `/api/admin/orders?${p}`);
    if (!ok) { $('#orders').innerHTML = `<p class="alert alert--error">${esc(body.message || 'Could not load orders.')}</p>`; return; }
    $('#orders').innerHTML = body.orders.length ? body.orders.map(orderCard).join('') : `
      <div class="empty"><b>No orders here</b>${state.orders.status === 'open' ? 'Nothing waiting. New orders appear here automatically.' : 'Try another filter.'}</div>`;
  }

  function orderCard(o) {
    const c = o.customer;
    const digits = c.phone.replace(/\D/g, '');
    const addr = [c.zone && `Zone ${c.zone}`, c.street && `Street ${c.street}`, c.building && `Building ${c.building}`].filter(Boolean).join(', ');
    const wa = `https://wa.me/${digits}?text=${encodeURIComponent(o.lang === 'ar'
      ? `مرحبًا ${c.name.split(' ')[0]}، معك مزرعة عدن بخصوص طلبك ${o.code}. `
      : `Hello ${c.name.split(' ')[0]}, this is Eden Farm about your order ${o.code}. `)}`;
    const next = NEXT[o.status];
    const track = `${location.origin}${o.lang === 'ar' ? '/ar' : ''}/track.html?o=${encodeURIComponent(o.code)}&k=${encodeURIComponent(o.track || '')}`;
    return `
    <article class="order${o.repeat ? ' order--regular' : ''}" data-status="${o.status}" data-id="${o.id}">
      <div class="order__head">
        <span class="order__code">${esc(o.code)}</span>
        <span class="pill pill--${o.status}">${STATUS[o.status]}</span>
        ${o.repeat ? `<span class="pill pill--regular">${icon('i-star')}Regular · every ${o.repeat.everyDays} days</span>` : ''}
        ${o.lang === 'ar' ? '<span class="pill pill--hidden" title="Ordered on the Arabic site">عربي</span>' : ''}
        <span class="order__time" title="${esc(clock(o.createdAt))}">${ago(o.createdAt)}</span>
      </div>
      <div class="order__grid">
        <div class="order__block">
          <small>Customer</small><b>${esc(c.name)}</b><span class="num">${esc(c.phone)}</span>
          <div class="order__contact">
            <a class="b b--ghost b--sm" href="tel:+${digits}">${icon('i-phone')}Call</a>
            <a class="b b--ghost b--sm" href="${wa}" target="_blank" rel="noopener">${icon('i-wa')}WhatsApp</a>
          </div>
        </div>
        <div class="order__block">
          <small>Deliver to</small><b>${esc(c.area)}</b>${addr ? `<span>${esc(addr)}</span>` : ''}${c.details ? `<span class="muted">${esc(c.details)}</span>` : ''}
          <a class="link" style="font-size:13px;justify-self:start" href="${mapsLink(o.location, c)}" target="_blank" rel="noopener">${o.location ? 'Open exact pin in Maps' : 'Open in Maps'}</a>
        </div>
        <div class="order__block">
          <small>Delivery slot</small><b>${esc(o.slot.label)}</b>
          <small style="margin-top:6px">Rider collects</small><b>${PAY[o.payment]} · ${qar(o.total)}</b>
        </div>
      </div>
      <ul class="order__items">
        ${o.items.map(i => `<li><span>${i.qty} × ${esc(i.name)} <span class="muted">(${esc(i.unit)})</span></span><span>${qar(i.total)}</span></li>`).join('')}
      </ul>
      <div class="order__total"><span>Total <span class="muted" style="font-weight:600">· delivery ${o.delivery ? qar(o.delivery) : 'free'}</span></span><span>${qar(o.total)}</span></div>
      ${o.notes ? `<p class="order__note"><b>Customer note:</b> ${esc(o.notes)}</p>` : ''}
      <details class="order__rider"${o.rider.name || o.rider.phone || o.status === 'out_for_delivery' ? ' open' : ''}>
        <summary>Rider &amp; tracking ${o.rider.name ? `· ${esc(o.rider.name)}` : ''}</summary>
        <div class="order__rider-grid">
          <label class="f"><span class="f__label">Rider name</span><input class="in" data-rider="riderName" value="${esc(o.rider.name)}" maxlength="60" placeholder="e.g. Ahmed"></label>
          <label class="f"><span class="f__label">Rider phone</span><input class="in" data-rider="riderPhone" value="${esc(o.rider.phone)}" maxlength="24" inputmode="tel" placeholder="5512 3456"></label>
          <label class="f order__rider-wide"><span class="f__label">Live location link <small>optional</small></span><input class="in" data-rider="riderLink" value="${esc(o.rider.link)}" maxlength="500" placeholder="Paste a Google Maps or WhatsApp live-location link"></label>
        </div>
        <p class="f__hint">The customer sees the rider's name, phone and live-location button on their tracking page once the order is out for delivery. <a class="link" href="${track}" target="_blank" rel="noopener">Open tracking page</a> · <button class="link" type="button" data-copy="${esc(track)}">Copy link</button></p>
      </details>
      <div class="order__actions">
        ${next ? `<button class="b b--primary b--sm" type="button" data-set="${next[0]}">${next[1]}</button>` : ''}
        <label class="sr" for="st-${o.id}">Change status</label>
        <select class="in" id="st-${o.id}" data-status-select style="flex:0 1 180px;height:34px;font-size:14px">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${v}</option>`).join('')}
        </select>
        <label class="sr" for="note-${o.id}">Staff note</label>
        <input class="in" id="note-${o.id}" data-note value="${esc(o.adminNote)}" placeholder="Staff note" maxlength="500">
      </div>
    </article>`;
  }

  async function setOrder(id, patch, label, reload = true) {
    const { ok, body } = await api('PATCH', `/api/admin/orders/${id}`, patch);
    if (!ok) { toast(body.fields ? Object.values(body.fields)[0] : body.message || 'Could not update the order.', true); return false; }
    if (label) toast(label);
    if (reload) loadOrders();
    return true;
  }

  $('#orders').addEventListener('click', async e => {
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Tracking link copied. Send it to the customer.'); }
      catch { toast('Copy failed. Open the tracking page and copy its address.', true); }
      return;
    }
    const b = e.target.closest('[data-set]'); if (!b) return;
    const card = b.closest('.order');
    b.disabled = true;
    setOrder(card.dataset.id, { status: b.dataset.set }, `${card.querySelector('.order__code').textContent}: ${STATUS[b.dataset.set]}`);
  });
  $('#orders').addEventListener('change', e => {
    const card = e.target.closest('.order'); if (!card) return;
    const code = card.querySelector('.order__code').textContent;
    if (e.target.matches('[data-status-select]')) setOrder(card.dataset.id, { status: e.target.value }, `${code}: ${STATUS[e.target.value]}`);
    if (e.target.matches('[data-note]')) setOrder(card.dataset.id, { adminNote: e.target.value }, 'Note saved', false);
    if (e.target.matches('[data-rider]')) setOrder(card.dataset.id, { [e.target.dataset.rider]: e.target.value.trim() }, 'Rider details saved', false);
  });
  $('#orders').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-note], [data-rider]')) e.target.blur(); });

  seg($('#order-status'), v => { state.orders.status = v; loadOrders(false); });
  seg($('#order-day'), v => { state.orders.day = v; loadOrders(false); });
  seg($('#order-kind'), v => { state.orders.repeat = v; loadOrders(false); });
  let qTimer;
  $('#order-q').addEventListener('input', e => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.orders.q = e.target.value.trim(); loadOrders(false); }, 250); });

  // Keep the order count fresh while the panel is open.
  setInterval(() => { if (!document.hidden) loadSummary(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadSummary(); });

  /* ================= REPEAT ORDERS ================= */
  async function slotWindows() {
    if (state.slotWindows) return state.slotWindows;
    const { ok, body } = await api('GET', '/api/admin/settings');
    state.slotWindows = ok ? [...new Set([...body.settings.slotsToday, ...body.settings.slotsTomorrow])] : [];
    return state.slotWindows;
  }

  async function loadRepeat() {
    loadSummary();
    const { ok, body } = await api('GET', `/api/admin/subscriptions?status=${state.repeatStatus}`);
    if (!ok) { $('#repeat-list').innerHTML = `<p class="alert alert--error">Could not load repeat orders.</p>`; return; }
    const windows = await slotWindows();
    $('#repeat-list').innerHTML = body.subscriptions.length ? body.subscriptions.map(s => repeatCard(s, windows)).join('') : `
      <div class="empty"><b>No repeat orders here</b>When a customer chooses "Repeat this order" at checkout, they appear here.</div>`;
  }

  function repeatCard(s, windows) {
    const c = s.customer;
    const digits = c.phone.replace(/\D/g, '');
    const today = qatarToday();
    const overdue = s.status === 'active' && s.nextDate < today;
    const nextDefault = s.nextDate < today ? today : s.nextDate;
    const wins = windows.includes(s.window) ? windows : [s.window, ...windows];
    return `
    <article class="order order--regular${s.due ? ' order--due' : ''}" data-status="${s.status === 'active' ? 'confirmed' : 'delivered'}" data-sub="${s.id}">
      <div class="order__head">
        <span class="order__code">${icon('i-star')} ${esc(c.name)}</span>
        <span class="pill ${s.status === 'active' ? 'pill--confirmed' : s.status === 'paused' ? 'pill--new' : 'pill--cancelled'}">${SUB_STATUS[s.status]}</span>
        <span class="pill pill--regular">Every ${s.everyDays} days</span>
        ${s.status === 'active' ? `<span class="order__time${s.due ? ' is-due' : ''}">${overdue ? 'Overdue · ' : s.due ? 'Due · ' : 'Next · '}${fmtDate(s.nextDate)}</span>` : ''}
      </div>
      <div class="order__grid">
        <div class="order__block">
          <small>Customer</small><b class="num">${esc(c.phone)}</b>
          <div class="order__contact">
            <a class="b b--ghost b--sm" href="tel:+${digits}">${icon('i-phone')}Call</a>
            <a class="b b--ghost b--sm" href="https://wa.me/${digits}" target="_blank" rel="noopener">${icon('i-wa')}WhatsApp</a>
          </div>
        </div>
        <div class="order__block">
          <small>Deliver to</small><b>${esc(c.area)}</b>
          <a class="link" style="font-size:13px;justify-self:start" href="${mapsLink(s.location, c)}" target="_blank" rel="noopener">Open in Maps</a>
        </div>
        <div class="order__block">
          <small>Usual slot</small><b>${esc(s.window)}</b>
          <small style="margin-top:6px">Pays by</small><b>${PAY[s.payment] || s.payment}</b>
        </div>
      </div>
      <ul class="order__items">
        ${s.items.map(i => `<li><span>${i.qty} × ${esc(i.name)} <span class="muted">(${esc(i.unit)})</span></span><span class="muted">${s.orders} order${s.orders === 1 ? '' : 's'} so far</span></li>`).slice(0, 1).join('')}
        ${s.items.slice(1).map(i => `<li><span>${i.qty} × ${esc(i.name)} <span class="muted">(${esc(i.unit)})</span></span><span></span></li>`).join('')}
      </ul>
      ${s.notes ? `<p class="order__note"><b>Customer note:</b> ${esc(s.notes)}</p>` : ''}
      ${s.status === 'active' ? `
      <div class="order__actions repeat__make">
        <label class="f"><span class="f__label">Deliver on</span><input class="in" type="date" data-make-date value="${nextDefault}" min="${today}"></label>
        <label class="f"><span class="f__label">Slot</span><select class="in" data-make-window>${wins.map(w => `<option${w === s.window ? ' selected' : ''}>${esc(w)}</option>`).join('')}</select></label>
        <button class="b b--primary b--sm" type="button" data-make>Create next order</button>
      </div>` : ''}
      <div class="order__actions">
        <label class="f" style="flex:0 1 130px"><span class="f__label">Every (days)</span><input class="in" type="number" min="3" max="90" data-every value="${s.everyDays}"></label>
        ${s.status === 'active' ? `<label class="f" style="flex:0 1 170px"><span class="f__label">Next delivery</span><input class="in" type="date" data-next value="${s.nextDate}"></label>` : ''}
        <span style="flex:1"></span>
        ${s.status === 'active' ? '<button class="b b--ghost b--sm" type="button" data-sub-status="paused">Pause</button>' : ''}
        ${s.status !== 'active' ? '<button class="b b--ghost b--sm" type="button" data-sub-status="active">Resume</button>' : ''}
        ${s.status !== 'cancelled' ? '<button class="b b--danger-ghost b--sm" type="button" data-sub-status="cancelled">Stop</button>' : ''}
      </div>
    </article>`;
  }

  $('#repeat-list').addEventListener('click', async e => {
    const card = e.target.closest('[data-sub]'); if (!card) return;
    const id = card.dataset.sub;
    const st = e.target.closest('[data-sub-status]');
    if (st) {
      const { ok, body } = await api('PATCH', `/api/admin/subscriptions/${id}`, { status: st.dataset.subStatus });
      if (!ok) return toast(body.message || 'Could not update.', true);
      toast({ paused: 'Repeat order paused', active: 'Repeat order resumed', cancelled: 'Repeat order stopped' }[st.dataset.subStatus]);
      return loadRepeat();
    }
    if (e.target.closest('[data-make]')) {
      const btn = e.target.closest('[data-make]'); btn.disabled = true;
      const date = card.querySelector('[data-make-date]').value;
      const window = card.querySelector('[data-make-window]').value;
      const { ok, body } = await api('POST', `/api/admin/subscriptions/${id}/order`, { date, window });
      btn.disabled = false;
      if (!ok) return toast(body.message || (body.fields && Object.values(body.fields)[0]) || 'Could not create the order.', true);
      state.newCount = null; // staff made this order: no "new order received" alert for it
      toast(`${body.order.code} created for ${fmtDate(date)}${body.unavailable?.length ? ` (${body.unavailable.length} item${body.unavailable.length > 1 ? 's' : ''} no longer sold, left out)` : ''}`);
      loadRepeat();
    }
  });
  $('#repeat-list').addEventListener('change', async e => {
    const card = e.target.closest('[data-sub]'); if (!card) return;
    let patch = null;
    if (e.target.matches('[data-every]')) patch = { everyDays: Number(e.target.value) };
    if (e.target.matches('[data-next]')) patch = { nextDate: e.target.value };
    if (!patch) return;
    const { ok, body } = await api('PATCH', `/api/admin/subscriptions/${card.dataset.sub}`, patch);
    if (!ok) return toast((body.fields && Object.values(body.fields)[0]) || body.message || 'Could not save.', true);
    toast('Saved');
    loadRepeat();
  });
  seg($('#repeat-status'), v => { state.repeatStatus = v; loadRepeat(); });

  /* ================= PRODUCTS ================= */
  async function loadProducts() {
    const [c, p] = await Promise.all([api('GET', '/api/admin/categories'), api('GET', '/api/admin/products')]);
    if (!c.ok || !p.ok) { $('#plist').innerHTML = `<p class="alert alert--error">Could not load products.</p>`; return; }
    state.categories = c.body.categories; state.products = p.body.products;
    renderProducts();
  }
  const catName = id => state.categories.find(c => c.id === id)?.name || id;
  const saleLabel = p => p.discountPct > 0 ? `−${p.discountPct}%${p.discountUntil ? ` until ${new Date(p.discountUntil + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}` : '';
  const salePrice = (price, pct) => Math.round(price * (100 - pct)) / 100;

  function renderProducts() {
    const q = state.productQ.toLowerCase();
    const list = state.products.filter(p =>
      (!q || (p.name + ' ' + p.nameAr + ' ' + catName(p.cat)).toLowerCase().includes(q)) &&
      (state.productShow === 'all' || (state.productShow === 'live' && p.active) || (state.productShow === 'hidden' && !p.active) || (state.productShow === 'sale' && p.discountLive)));
    if (!list.length) {
      $('#plist').innerHTML = `<div class="empty"><b>No products match</b>Clear the search or add a new product.</div>`;
      return;
    }
    let html = ''; let lastCat = null;
    for (const p of list) {
      if (p.cat !== lastCat) { html += `<h2 class="cat-h">${esc(catName(p.cat))}</h2>`; lastCat = p.cat; }
      const prices = p.units.map(u => p.discountLive
        ? `${esc(u.l)}: <b>${qar(salePrice(u.p, p.discountPct))}</b> <s>${qar(u.was || u.p)}</s>`
        : `${esc(u.l)}: <b>${qar(u.p)}</b>${u.was ? ` <s>${qar(u.was)}</s>` : ''}`).join(' · ');
      html += `
      <article class="prow${p.active ? '' : ' is-hidden'}" data-id="${esc(p.id)}">
        <img class="prow__img${p.cut ? ' is-cut' : ''}" src="${esc(p.img)}" alt="" loading="lazy">
        <div class="prow__main">
          <span class="prow__name">${esc(p.name)}${p.nameAr ? ` <span class="prow__ar" lang="ar" dir="rtl">${esc(p.nameAr)}</span>` : ' <span class="pill pill--hidden" title="Arabic shop shows the English name">No Arabic</span>'}</span>
          <span class="prow__meta">
            <span class="pill ${p.active ? 'pill--live' : 'pill--hidden'}">${p.active ? 'In shop' : 'Hidden'}</span>
            ${p.discountPct ? `<span class="pill ${p.discountLive ? 'pill--sale' : 'pill--hidden'}">${esc(saleLabel(p))}${p.discountLive ? '' : ' · ended'}</span>` : ''}
            ${p.badge ? `<span>“${esc(p.badge)}”</span>` : ''}
          </span>
          <span class="prow__prices">${prices}</span>
        </div>
        <div class="prow__actions">
          <label class="switch"><input type="checkbox" data-toggle ${p.active ? 'checked' : ''}><i></i><span>In shop</span></label>
          <button class="b b--ghost b--sm" type="button" data-discount>Discount</button>
          <button class="b b--primary b--sm" type="button" data-edit>Edit</button>
        </div>
      </article>`;
    }
    $('#plist').innerHTML = html;
  }

  $('#plist').addEventListener('change', async e => {
    if (!e.target.matches('[data-toggle]')) return;
    const id = e.target.closest('.prow').dataset.id;
    const active = e.target.checked;
    const { ok, body } = await api('PATCH', `/api/admin/products/${encodeURIComponent(id)}`, { active });
    if (!ok) { e.target.checked = !active; toast(body.message || 'Could not update.', true); return; }
    replaceProduct(body.product);
    toast(active ? `${body.product.name} is back in the shop` : `${body.product.name} is hidden from the shop`);
  });
  $('#plist').addEventListener('click', e => {
    const row = e.target.closest('.prow'); if (!row) return;
    const p = state.products.find(x => x.id === row.dataset.id);
    if (e.target.closest('[data-edit]')) productSheet(p);
    if (e.target.closest('[data-discount]')) discountSheet(p);
  });
  const replaceProduct = p => {
    const i = state.products.findIndex(x => x.id === p.id);
    if (i >= 0) state.products[i] = p; else state.products.push(p);
    renderProducts();
  };
  $('#add-product').addEventListener('click', () => productSheet(null));
  $('#product-q').addEventListener('input', e => { state.productQ = e.target.value.trim(); renderProducts(); });
  seg($('#product-show'), v => { state.productShow = v; renderProducts(); });

  /* ---------- Sheet (side panel / full screen on phones) ---------- */
  const sheet = $('#sheet'); const sheetForm = $('#sheet-form'); const sheetFoot = $('#sheet-foot');
  let sheetSubmit = null;
  function openSheet(title, bodyHtml, footHtml, onSubmit) {
    $('#sheet-title').textContent = title;
    sheetForm.innerHTML = bodyHtml;
    sheetFoot.innerHTML = footHtml;
    sheetSubmit = onSubmit;
    sheet.hidden = false; $('#scrim').hidden = false;
    document.body.style.overflow = 'hidden';
    sheetForm.scrollTop = 0;
    setTimeout(() => sheetForm.querySelector('input:not([type="file"]):not([type="checkbox"]), select, textarea')?.focus({ preventScroll: true }), 50);
  }
  function closeSheet() {
    sheet.hidden = true; $('#scrim').hidden = true;
    document.body.style.overflow = '';
    sheetForm.innerHTML = ''; sheetFoot.innerHTML = ''; sheetSubmit = null;
  }
  $$('[data-sheet-close]').forEach(b => b.addEventListener('click', closeSheet));
  sheetFoot.addEventListener('click', e => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
  sheetForm.addEventListener('submit', e => { e.preventDefault(); sheetSubmit?.(); });

  function showErrors(fields, message) {
    $$('.is-invalid', sheetForm).forEach(el => el.classList.remove('is-invalid'));
    $$('[data-err]', sheetForm).forEach(el => { el.textContent = ''; });
    let first = null;
    for (const [path, msg] of Object.entries(fields || {})) {
      const input = sheetForm.querySelector(`[data-path="${CSS.escape(path)}"]`);
      const slot = sheetForm.querySelector(`[data-err="${CSS.escape(path)}"]`) || sheetForm.querySelector(`[data-err="${CSS.escape(path.split('.')[0])}"]`);
      if (input) { input.classList.add('is-invalid'); first ??= input; }
      if (slot) slot.textContent = msg;
    }
    const top = $('#sheet-error'); if (top) { top.textContent = message || ''; top.hidden = !message; }
    (first || top)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function uploadPhoto(fileInput, { wide = false } = {}) {
    const file = fileInput.files[0]; if (!file) return null;
    const fd = new FormData(); fd.append('photo', file);
    const { ok, body } = await api('POST', `/api/admin/images${wide ? '?wide=1' : ''}`, fd);
    if (!ok) { toast(body.message || 'Upload failed.', true); return null; }
    return body.url;
  }

  // Photo picker block: preview + upload button + hidden value.
  const photoField = (name, url, { label = 'Photo', wide = false, hint = '' } = {}) => `
    <div class="f">
      <span class="f__label">${label}</span>
      <div class="photo">
        <img class="photo__prev${wide ? ' photo__prev--wide' : ''}" data-prev="${name}" src="${esc(url || '')}" alt="" ${url ? '' : 'hidden'}>
        <div class="photo__ctl">
          <label class="b b--ghost b--sm">${icon('i-upload')}<span data-up-label="${name}">${url ? 'Replace photo' : 'Upload photo'}</span>
            <input type="file" accept="image/*" data-upload="${name}" ${wide ? 'data-wide="1"' : ''}></label>
          ${hint ? `<span class="f__hint">${hint}</span>` : ''}
          <input type="hidden" name="${name}" value="${esc(url || '')}" data-path="${name}">
          <span class="f__err" data-err="${name}"></span>
        </div>
      </div>
    </div>`;

  // Arabic text input
  const arField = (id, name, label, value, { area = false, max = 80, placeholder = '' } = {}) => `
    <div class="f"><label for="${id}">${label} <small>Arabic</small></label>
      ${area
        ? `<textarea id="${id}" name="${name}" data-path="${name}" maxlength="${max}" dir="rtl" lang="ar" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input id="${id}" name="${name}" data-path="${name}" value="${esc(value)}" maxlength="${max}" dir="rtl" lang="ar" placeholder="${esc(placeholder)}">`}</div>`;

  sheetForm.addEventListener('change', async e => {
    const up = e.target.closest('[data-upload]');
    if (up) {
      const name = up.dataset.upload;
      const label = sheetForm.querySelector(`[data-up-label="${name}"]`);
      label.textContent = 'Uploading…';
      const url = await uploadPhoto(up, { wide: !!up.dataset.wide });
      up.value = '';
      label.textContent = url || sheetForm.elements[name].value ? 'Replace photo' : 'Upload photo';
      if (!url) return;
      sheetForm.elements[name].value = url;
      const prev = sheetForm.querySelector(`[data-prev="${name}"]`);
      prev.src = url; prev.hidden = false;
      return;
    }
    if (e.target.name === 'cat') sheetForm.querySelector('[data-wide-field]')?.toggleAttribute('hidden', e.target.value !== 'mushrooms');
  });

  /* ---------- Product editor ---------- */
  const unitRow = (u, i) => `
    <div class="units-ed__row" data-unit-row>
      <input type="hidden" data-u="id" value="${u.id ?? ''}">
      <div class="f"><label for="u-l-${i}">Pack size</label><input id="u-l-${i}" data-u="l" data-path="units.${i}.l" value="${esc(u.l ?? '')}" placeholder="e.g. 500 g" maxlength="30"></div>
      <div class="f"><label for="u-a-${i}">Arabic</label><input id="u-a-${i}" data-u="lAr" data-path="units.${i}.lAr" value="${esc(u.lAr ?? '')}" placeholder="500 غ" maxlength="30" dir="rtl" lang="ar"></div>
      <div class="f"><label for="u-p-${i}">Price (QAR)</label><input id="u-p-${i}" data-u="p" data-path="units.${i}.p" type="number" inputmode="decimal" step="0.25" min="0" value="${u.p ?? ''}" placeholder="0.00"></div>
      <div class="f"><label for="u-w-${i}">Was</label><input id="u-w-${i}" data-u="was" data-path="units.${i}.was" type="number" inputmode="decimal" step="0.25" min="0" value="${u.was ?? ''}" placeholder="—"></div>
      <button class="b b--ghost b--icon" type="button" data-unit-del aria-label="Remove pack size">${icon('i-trash')}</button>
    </div>`;

  function productSheet(p) {
    const isNew = !p;
    p ||= { name: '', nameAr: '', cat: state.categories[1]?.id || state.categories[0]?.id, origin: 'Eden Farm, Qatar', originAr: 'مزرعة عدن، قطر', badge: '', badgeAr: '', star: false, cut: false, img: '', wide: '', pack: '', packAr: '', taste: '', tasteAr: '', uses: [], usesAr: [], discountPct: 0, discountUntil: null, active: true, units: [{ l: '', lAr: '', p: '' }] };
    const body = `
      <p class="alert alert--error" id="sheet-error" hidden></p>
      <div class="sec">
        ${photoField('img', p.img, { hint: 'Square photos look best. JPG, PNG or WebP.' })}
        <div data-wide-field ${p.cat === 'mushrooms' ? '' : 'hidden'}>${photoField('wide', p.wide, { label: 'Wide photo <small>mushroom spotlight</small>', wide: true })}</div>
      </div>
      <div class="sec">
        <div class="f-row">
          <div class="f"><label for="p-name">Name</label><input id="p-name" name="name" data-path="name" value="${esc(p.name)}" maxlength="80" required><span class="f__err" data-err="name"></span></div>
          ${arField('p-name-ar', 'nameAr', 'Name', p.nameAr, { placeholder: 'اسم المنتج' })}
        </div>
        <div class="f-row">
          <div class="f"><label for="p-cat">Category</label><select id="p-cat" name="cat" data-path="cat">${state.categories.map(c => `<option value="${esc(c.id)}"${c.id === p.cat ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="star" ${p.star ? 'checked' : ''}><span>Our speciality<small>Gold star on the photo</small></span></label>
        </div>
        <div class="f-row">
          <div class="f"><label for="p-origin">Origin</label><input id="p-origin" name="origin" data-path="origin" value="${esc(p.origin)}" maxlength="60"></div>
          ${arField('p-origin-ar', 'originAr', 'Origin', p.originAr, { max: 60 })}
        </div>
        <div class="f-row">
          <div class="f"><label for="p-badge">Photo label <small>optional</small></label><input id="p-badge" name="badge" data-path="badge" value="${esc(p.badge)}" maxlength="30" placeholder="e.g. Picked today"></div>
          ${arField('p-badge-ar', 'badgeAr', 'Photo label', p.badgeAr, { max: 30, placeholder: 'قُطف اليوم' })}
        </div>
        <div class="f-row">
          <div class="f"><label for="p-pack">Pack note <small>optional</small></label><input id="p-pack" name="pack" data-path="pack" value="${esc(p.pack)}" maxlength="40" placeholder="e.g. 250 g pack"></div>
          ${arField('p-pack-ar', 'packAr', 'Pack note', p.packAr, { max: 40, placeholder: 'عبوة 250 غ' })}
        </div>
        <div class="f"><label for="p-taste">Description <small>shown on mushroom spotlight cards</small></label><textarea id="p-taste" name="taste" data-path="taste" maxlength="400">${esc(p.taste)}</textarea></div>
        ${arField('p-taste-ar', 'tasteAr', 'Description', p.tasteAr, { area: true, max: 400 })}
        <div class="f-row">
          <div class="f"><label for="p-uses">Best for <small>comma separated</small></label><input id="p-uses" name="uses" data-path="uses" value="${esc(p.uses.join(', '))}" placeholder="Salads, Pasta, Grilling"></div>
          ${arField('p-uses-ar', 'usesAr', 'Best for', (p.usesAr || []).join('، '), { max: 300, placeholder: 'السلطات، المعكرونة' })}
        </div>
      </div>
      <div class="sec">
        <h3 class="sec__title">Pack sizes &amp; prices</h3>
        <div class="units-ed" id="units-ed">${p.units.map(unitRow).join('')}</div>
        <span class="f__err" data-err="units"></span>
        <button class="b b--ghost b--sm" type="button" id="unit-add" style="justify-self:start">${icon('i-plus')}Add pack size</button>
        <p class="f__hint">Arabic pack names are optional: "500 g", "1 kg", "2 packs" are translated automatically. "Was" shows a crossed-out price; for a time-limited sale use the discount below.</p>
      </div>
      <div class="sec">
        <h3 class="sec__title">Discount</h3>
        <div class="f-row">
          <div class="f"><label for="p-disc">Discount %</label><input id="p-disc" name="discountPct" data-path="discountPct" type="number" min="0" max="90" step="1" inputmode="numeric" value="${p.discountPct || 0}"></div>
          <div class="f"><label for="p-until">Ends after <small>optional</small></label><input id="p-until" name="discountUntil" data-path="discountUntil" type="date" value="${p.discountUntil || ''}"></div>
        </div>
        <p class="sale-preview" id="sale-preview"></p>
      </div>
      <div class="sec">
        <label class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><i></i><span>Show in shop</span></label>
      </div>
      ${isNew ? '' : `<div class="sec" id="del-zone"><button class="b b--danger-ghost b--sm" type="button" id="p-del" style="justify-self:start">${icon('i-trash')}Delete product</button></div>`}`;
    const foot = `<button class="b b--ghost" type="button" data-sheet-close>Cancel</button><span class="grow"></span><button class="b b--primary" type="submit" form="sheet-form" id="sheet-save">${isNew ? 'Add product' : 'Save changes'}</button>`;

    openSheet(isNew ? 'New product' : `Edit ${p.name}`, body, foot, async () => {
      const f = sheetForm.elements;
      const units = $$('[data-unit-row]', sheetForm).map(r => {
        const v = k => r.querySelector(`[data-u="${k}"]`).value.trim();
        return { ...(v('id') ? { id: Number(v('id')) } : {}), l: v('l'), lAr: v('lAr'), p: v('p') === '' ? 0 : Number(v('p')), was: v('was') === '' ? null : Number(v('was')) };
      });
      const list = v => v.split(/[,،]/).map(s => s.trim()).filter(Boolean);
      const payload = {
        name: f.name.value, nameAr: f.nameAr.value, cat: f.cat.value, origin: f.origin.value, originAr: f.originAr.value,
        badge: f.badge.value, badgeAr: f.badgeAr.value, pack: f.pack.value, packAr: f.packAr.value,
        star: f.star.checked, cut: false, img: f.img.value, wide: f.wide?.value || '',
        taste: f.taste.value, tasteAr: f.tasteAr.value, uses: list(f.uses.value), usesAr: list(f.usesAr.value),
        discountPct: Number(f.discountPct.value || 0), discountUntil: f.discountUntil.value || null,
        active: f.active.checked, units,
      };
      const save = $('#sheet-save'); save.disabled = true; save.textContent = 'Saving…';
      const res = isNew ? await api('POST', '/api/admin/products', payload) : await api('PUT', `/api/admin/products/${encodeURIComponent(p.id)}`, payload);
      save.disabled = false; save.textContent = isNew ? 'Add product' : 'Save changes';
      if (!res.ok) { showErrors(res.body.fields, res.body.message || 'Could not save.'); return; }
      replaceProduct(res.body.product);
      closeSheet();
      toast(isNew ? `${res.body.product.name} added to the shop` : 'Changes saved. The shop is updated.');
    });

    const preview = () => {
      const pct = Number(sheetForm.elements.discountPct.value || 0);
      const el = $('#sale-preview');
      if (!pct) { el.textContent = 'No discount. Enter a percentage to put this product on sale.'; return; }
      const rows = $$('[data-unit-row]', sheetForm).map(r => {
        const l = r.querySelector('[data-u="l"]').value || 'Pack'; const price = Number(r.querySelector('[data-u="p"]').value || 0);
        return price ? `${esc(l)}: <s>${qar(price)}</s> → <b>${qar(salePrice(price, pct))}</b>` : '';
      }).filter(Boolean);
      el.innerHTML = `Customers see −${pct}%. ${rows.join(' · ')}`;
    };
    preview();
    sheetForm.oninput = e => { if (e.target.matches('[data-u], [name="discountPct"]')) preview(); };
    $('#unit-add').onclick = () => {
      const ed = $('#units-ed');
      if (ed.children.length >= 8) return toast('Up to 8 pack sizes.', true);
      ed.insertAdjacentHTML('beforeend', unitRow({ l: '', lAr: '', p: '' }, ed.children.length));
      ed.lastElementChild.querySelector('[data-u="l"]').focus();
    };
    $('#units-ed').onclick = e => {
      if (!e.target.closest('[data-unit-del]')) return;
      if ($('#units-ed').children.length === 1) return toast('Keep at least one pack size.', true);
      e.target.closest('[data-unit-row]').remove(); preview();
    };
    $('#p-del')?.addEventListener('click', () => {
      $('#del-zone').innerHTML = `
        <div class="confirm">
          <p>Delete ${esc(p.name)} for good? Past orders keep their details. To take it off the shop for now, switch off "Show in shop" instead.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="b b--danger b--sm" type="button" id="p-del-yes">Yes, delete</button><button class="b b--ghost b--sm" type="button" id="p-del-no">Keep it</button></div>
        </div>`;
      $('#p-del-no').onclick = () => { closeSheet(); productSheet(p); };
      $('#p-del-yes').onclick = async () => {
        const { ok, body } = await api('DELETE', `/api/admin/products/${encodeURIComponent(p.id)}`);
        if (!ok) return toast(body.message || 'Could not delete.', true);
        state.products = state.products.filter(x => x.id !== p.id);
        renderProducts(); closeSheet(); toast(`${p.name} deleted`);
      };
    });
  }

  function discountSheet(p) {
    const body = `
      <p class="alert alert--error" id="sheet-error" hidden></p>
      <div class="sec">
        <p>${esc(p.name)}: ${p.units.map(u => `${esc(u.l)} ${qar(u.p)}`).join(' · ')}</p>
        <div class="f-row">
          <div class="f"><label for="d-pct">Discount %</label><input id="d-pct" name="discountPct" data-path="discountPct" type="number" min="0" max="90" step="1" inputmode="numeric" value="${p.discountPct || ''}" placeholder="e.g. 15"></div>
          <div class="f"><label for="d-until">Ends after <small>optional</small></label><input id="d-until" name="discountUntil" data-path="discountUntil" type="date" value="${p.discountUntil || ''}"></div>
        </div>
        <p class="sale-preview" id="sale-preview"></p>
        <p class="f__hint">Leave "Ends after" empty to keep the discount until you remove it.</p>
      </div>`;
    const foot = `${p.discountPct ? '<button class="b b--danger-ghost" type="button" id="d-clear">Remove discount</button>' : ''}<span class="grow"></span><button class="b b--ghost" type="button" data-sheet-close>Cancel</button><button class="b b--primary" type="submit" form="sheet-form">Save discount</button>`;
    const send = async (discountPct, discountUntil) => {
      const { ok, body: b } = await api('PATCH', `/api/admin/products/${encodeURIComponent(p.id)}`, { discountPct, discountUntil });
      if (!ok) { showErrors(b.fields, b.message || 'Could not save.'); return; }
      replaceProduct(b.product); closeSheet();
      toast(discountPct ? `${p.name}: −${discountPct}% is live` : `${p.name}: discount removed`);
    };
    openSheet('Discount', body, foot, () => send(Number(sheetForm.elements.discountPct.value || 0), sheetForm.elements.discountUntil.value || null));
    const preview = () => {
      const pct = Number(sheetForm.elements.discountPct.value || 0);
      $('#sale-preview').innerHTML = pct ? p.units.map(u => `${esc(u.l)}: <s>${qar(u.p)}</s> → <b>${qar(salePrice(u.p, pct))}</b>`).join(' · ') : 'Enter a percentage to see the sale prices.';
    };
    preview();
    sheetForm.oninput = preview;
    $('#d-clear')?.addEventListener('click', () => send(0, null));
  }

  /* ================= BUNDLES ================= */
  async function loadBundles() {
    const { ok, body } = await api('GET', '/api/admin/bundles');
    if (!ok) { $('#blist').innerHTML = `<p class="alert alert--error">Could not load bundles.</p>`; return; }
    state.bundles = body.bundles;
    renderBundles();
  }
  function renderBundles() {
    $('#blist').innerHTML = state.bundles.length ? state.bundles.map(b => `
      <article class="prow${b.active ? '' : ' is-hidden'}" data-id="${esc(b.id)}">
        <img class="prow__img" src="${esc(b.img)}" alt="" loading="lazy">
        <div class="prow__main">
          <span class="prow__name">${esc(b.name)}${b.nameAr ? ` <span class="prow__ar" lang="ar" dir="rtl">${esc(b.nameAr)}</span>` : ''}</span>
          <span class="prow__meta"><span class="pill ${b.active ? 'pill--live' : 'pill--hidden'}">${b.active ? 'In shop' : 'Hidden'}</span>${b.tag ? `<span>“${esc(b.tag)}”</span>` : ''}</span>
          <span class="prow__prices"><b>${qar(b.price)}</b>${b.was ? ` <s>${qar(b.was)}</s>` : ''} · ${esc(b.size)}</span>
        </div>
        <div class="prow__actions">
          <label class="switch"><input type="checkbox" data-btoggle ${b.active ? 'checked' : ''}><i></i><span>In shop</span></label>
          <button class="b b--primary b--sm" type="button" data-bedit>Edit</button>
        </div>
      </article>`).join('') : `<div class="empty"><b>No bundles yet</b>Add one to show it in "Boxes from the farm".</div>`;
  }
  const bundlePayload = b => ({ name: b.name, nameAr: b.nameAr, size: b.size, sizeAr: b.sizeAr, serves: b.serves, servesAr: b.servesAr, img: b.img, tag: b.tag, tagAr: b.tagAr, price: b.price, was: b.was, active: b.active });
  $('#blist').addEventListener('change', async e => {
    if (!e.target.matches('[data-btoggle]')) return;
    const b = state.bundles.find(x => x.id === e.target.closest('.prow').dataset.id);
    const { ok, body } = await api('PUT', `/api/admin/bundles/${encodeURIComponent(b.id)}`, { ...bundlePayload(b), active: e.target.checked });
    if (!ok) { e.target.checked = !e.target.checked; return toast(body.message || 'Could not update.', true); }
    Object.assign(b, body.bundle); renderBundles();
    toast(b.active ? `${b.name} is in the shop` : `${b.name} is hidden`);
  });
  $('#blist').addEventListener('click', e => {
    if (!e.target.closest('[data-bedit]')) return;
    bundleSheet(state.bundles.find(x => x.id === e.target.closest('.prow').dataset.id));
  });
  $('#add-bundle').addEventListener('click', () => bundleSheet(null));

  function bundleSheet(b) {
    const isNew = !b;
    b ||= { name: '', nameAr: '', size: '', sizeAr: '', serves: '', servesAr: '', img: '', tag: '', tagAr: '', price: '', was: null, active: true };
    const body = `
      <p class="alert alert--error" id="sheet-error" hidden></p>
      <div class="sec">${photoField('img', b.img, { hint: 'Landscape photos (4:3) look best.' })}</div>
      <div class="sec">
        <div class="f-row">
          <div class="f"><label for="b-name">Name</label><input id="b-name" name="name" data-path="name" value="${esc(b.name)}" maxlength="80"><span class="f__err" data-err="name"></span></div>
          ${arField('b-name-ar', 'nameAr', 'Name', b.nameAr)}
        </div>
        <div class="f-row">
          <div class="f"><label for="b-size">What's inside</label><input id="b-size" name="size" data-path="size" value="${esc(b.size)}" maxlength="80" placeholder="e.g. White, brown & portabella · 3 packs"></div>
          ${arField('b-size-ar', 'sizeAr', "What's inside", b.sizeAr)}
        </div>
        <div class="f-row">
          <div class="f"><label for="b-serves">Second line <small>optional</small></label><input id="b-serves" name="serves" data-path="serves" value="${esc(b.serves)}" maxlength="80"></div>
          ${arField('b-serves-ar', 'servesAr', 'Second line', b.servesAr)}
        </div>
        <div class="f-row">
          <div class="f"><label for="b-tag">Photo label <small>optional</small></label><input id="b-tag" name="tag" data-path="tag" value="${esc(b.tag)}" maxlength="30"></div>
          ${arField('b-tag-ar', 'tagAr', 'Photo label', b.tagAr, { max: 30 })}
        </div>
        <div class="f-row">
          <div class="f"><label for="b-price">Price (QAR)</label><input id="b-price" name="price" data-path="price" type="number" step="0.25" min="0" inputmode="decimal" value="${b.price}"><span class="f__err" data-err="price"></span></div>
          <div class="f"><label for="b-was">Was <small>optional</small></label><input id="b-was" name="was" data-path="was" type="number" step="0.25" min="0" inputmode="decimal" value="${b.was ?? ''}"><span class="f__err" data-err="was"></span></div>
        </div>
        <label class="switch"><input type="checkbox" name="active" ${b.active ? 'checked' : ''}><i></i><span>Show in shop</span></label>
      </div>
      ${isNew ? '' : `<div class="sec" id="del-zone"><button class="b b--danger-ghost b--sm" type="button" id="b-del" style="justify-self:start">${icon('i-trash')}Delete bundle</button></div>`}`;
    const foot = `<button class="b b--ghost" type="button" data-sheet-close>Cancel</button><span class="grow"></span><button class="b b--primary" type="submit" form="sheet-form" id="sheet-save">${isNew ? 'Add bundle' : 'Save changes'}</button>`;
    openSheet(isNew ? 'New bundle' : `Edit ${b.name}`, body, foot, async () => {
      const f = sheetForm.elements;
      const payload = {
        name: f.name.value, nameAr: f.nameAr.value, size: f.size.value, sizeAr: f.sizeAr.value, serves: f.serves.value, servesAr: f.servesAr.value,
        img: f.img.value, tag: f.tag.value, tagAr: f.tagAr.value,
        price: Number(f.price.value || 0), was: f.was.value === '' ? null : Number(f.was.value), active: f.active.checked,
      };
      const res = isNew ? await api('POST', '/api/admin/bundles', payload) : await api('PUT', `/api/admin/bundles/${encodeURIComponent(b.id)}`, payload);
      if (!res.ok) { showErrors(res.body.fields, res.body.message || 'Could not save.'); return; }
      closeSheet(); toast(isNew ? 'Bundle added' : 'Bundle saved'); loadBundles();
    });
    $('#b-del')?.addEventListener('click', () => {
      $('#del-zone').innerHTML = `<div class="confirm"><p>Delete ${esc(b.name)} for good? You can also just switch off "Show in shop".</p>
        <div style="display:flex;gap:8px"><button class="b b--danger b--sm" type="button" id="b-del-yes">Yes, delete</button></div></div>`;
      $('#b-del-yes').onclick = async () => {
        const { ok, body: r } = await api('DELETE', `/api/admin/bundles/${encodeURIComponent(b.id)}`);
        if (!ok) return toast(r.message || 'Could not delete.', true);
        closeSheet(); toast('Bundle deleted'); loadBundles();
      };
    });
  }

  /* ================= SETTINGS ================= */
  const hourLabel = h => `${h % 12 || 12}:00 ${h < 12 ? 'am' : 'pm'}`;
  const zoneRow = (z, i) => `
    <div class="zone-row" data-zone>
      <div class="f"><label for="z-n-${i}">Area name</label><input class="in" id="z-n-${i}" data-z="name" value="${esc(z.name)}" maxlength="60"></div>
      <div class="f"><label for="z-la-${i}">Centre latitude</label><input class="in" id="z-la-${i}" data-z="lat" type="number" step="0.0001" value="${z.lat}"></div>
      <div class="f"><label for="z-lo-${i}">Centre longitude</label><input class="in" id="z-lo-${i}" data-z="lng" type="number" step="0.0001" value="${z.lng}"></div>
      <div class="f"><label for="z-r-${i}">Radius (km)</label><input class="in" id="z-r-${i}" data-z="radiusKm" type="number" step="0.5" min="0.5" max="80" value="${z.radiusKm}"></div>
      <button class="b b--ghost b--icon" type="button" data-zone-del aria-label="Remove area">${icon('i-trash')}</button>
    </div>`;

  let zoneMap = null; let zoneLayer = null; let activeZone = 0;
  const loadLeaflet = () => new Promise((resolve, reject) => {
    if (window.L) return resolve(window.L);
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = '/vendor/leaflet/leaflet.js'; js.onload = () => resolve(window.L); js.onerror = reject; document.head.append(js);
  });
  const readZones = () => $$('[data-zone]').map(r => ({
    name: r.querySelector('[data-z="name"]').value.trim(),
    lat: Number(r.querySelector('[data-z="lat"]').value), lng: Number(r.querySelector('[data-z="lng"]').value),
    radiusKm: Number(r.querySelector('[data-z="radiusKm"]').value),
  }));
  async function drawZones() {
    const L = await loadLeaflet();
    if (!zoneMap || !document.body.contains(zoneMap.getContainer())) {
      zoneMap = L.map('zone-map').setView([25.29, 51.5], 10);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(zoneMap);
      zoneLayer = L.layerGroup().addTo(zoneMap);
      // Click the map to move the selected area's centre there.
      zoneMap.on('click', e => {
        const row = $$('[data-zone]')[activeZone]; if (!row) return;
        row.querySelector('[data-z="lat"]').value = e.latlng.lat.toFixed(4);
        row.querySelector('[data-z="lng"]').value = e.latlng.lng.toFixed(4);
        drawZones();
      });
    }
    zoneLayer.clearLayers();
    readZones().forEach((z, i) => {
      if (!Number.isFinite(z.lat) || !Number.isFinite(z.lng)) return;
      L.circle([z.lat, z.lng], { radius: z.radiusKm * 1000, color: i === activeZone ? '#1D5B3B' : '#3E8A55', weight: i === activeZone ? 3 : 1.5, fillOpacity: 0.12 })
        .bindTooltip(z.name || `Area ${i + 1}`).addTo(zoneLayer);
    });
    setTimeout(() => zoneMap.invalidateSize(), 50);
  }

  async function loadSettings() {
    const { ok, body } = await api('GET', '/api/admin/settings');
    if (!ok) { $('#settings').innerHTML = `<p class="alert alert--error">Could not load settings.</p>`; return; }
    const s = body.settings;
    state.slotWindows = [...new Set([...s.slotsToday, ...s.slotsTomorrow])];
    $('#settings').innerHTML = `
      <form class="panel" data-panel="ordering" novalidate>
        <h2 class="panel__title">Online ordering</h2>
        <label class="switch"><input type="checkbox" name="orderingOpen" ${s.orderingOpen ? 'checked' : ''}><i></i><span>Taking orders</span></label>
        <div class="f"><label for="s-closed">Message when ordering is paused</label><textarea id="s-closed" name="closedMessage" data-path="closedMessage" maxlength="300">${esc(s.closedMessage)}</textarea></div>
        <div class="f"><label for="s-closed-ar">Same message <small>Arabic</small></label><textarea id="s-closed-ar" name="closedMessageAr" data-path="closedMessageAr" maxlength="300" dir="rtl" lang="ar">${esc(s.closedMessageAr || '')}</textarea></div>
        <button class="b b--primary" type="submit">Save</button>
      </form>
      <form class="panel" data-panel="money" novalidate>
        <h2 class="panel__title">Delivery charges</h2>
        <div class="f-row">
          <div class="f"><label for="s-fee">Delivery fee (QAR)</label><input id="s-fee" name="deliveryFee" data-path="deliveryFee" type="number" min="0" step="0.5" value="${s.deliveryFee}"></div>
          <div class="f"><label for="s-free">Free delivery over (QAR)</label><input id="s-free" name="freeDelivery" data-path="freeDelivery" type="number" min="0" step="1" value="${s.freeDelivery}"></div>
        </div>
        <div class="f"><label for="s-min">Minimum order (QAR)</label><input id="s-min" name="minOrder" data-path="minOrder" type="number" min="0" step="1" value="${s.minOrder}"></div>
        <p class="panel__note" style="margin-top:0">"Free delivery over" also updates the line at the top of the shop.</p>
        <button class="b b--primary" type="submit">Save</button>
      </form>
      <form class="panel panel--wide" data-panel="zones" novalidate>
        <h2 class="panel__title">Where we deliver</h2>
        <p class="panel__note" style="margin-top:0">Customers can only order to a pin inside one of these circles. Select an area below, then click the map to move its centre.</p>
        <div class="zone-map" id="zone-map"></div>
        <div class="zones" id="zones">${s.zones.map(zoneRow).join('')}</div>
        <span class="f__err" data-err="zones"></span>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="b b--ghost b--sm" type="button" id="zone-add">${icon('i-plus')}Add area</button>
          <span style="flex:1"></span>
          <button class="b b--primary" type="submit">Save delivery areas</button>
        </div>
      </form>
      <form class="panel" data-panel="slots" novalidate>
        <h2 class="panel__title">Delivery slots &amp; hours</h2>
        <div class="f"><label for="s-cut">Same-day orders close at</label>
          <select id="s-cut" name="cutoffHour" data-path="cutoffHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === s.cutoffHour ? ' selected' : ''}>${hourLabel(h)}</option>`).join('')}</select></div>
        <div class="f-row">
          <div class="f"><label for="s-today">Today's slots <small>one per line</small></label><textarea id="s-today" name="slotsToday" data-path="slotsToday">${esc(s.slotsToday.join('\n'))}</textarea></div>
          <div class="f"><label for="s-tom">Tomorrow's slots <small>one per line</small></label><textarea id="s-tom" name="slotsTomorrow" data-path="slotsTomorrow">${esc(s.slotsTomorrow.join('\n'))}</textarea></div>
        </div>
        <div class="f-row">
          <div class="f"><label for="s-hours">Delivery hours <small>footer</small></label><input id="s-hours" name="deliveryHours" data-path="deliveryHours" value="${esc(s.deliveryHours || '')}" maxlength="60"></div>
          <div class="f"><label for="s-hours-ar">Delivery hours <small>Arabic</small></label><input id="s-hours-ar" name="deliveryHoursAr" data-path="deliveryHoursAr" value="${esc(s.deliveryHoursAr || '')}" maxlength="60" dir="rtl" lang="ar"></div>
        </div>
        <button class="b b--primary" type="submit">Save</button>
      </form>
      <form class="panel" data-panel="popular" novalidate>
        <h2 class="panel__title">"Popular right now" in search</h2>
        <p class="panel__note" style="margin-top:0">Shown when a shopper taps the search box. One per line, up to 10.</p>
        <div class="f-row">
          <div class="f"><label for="s-pop">English</label><textarea id="s-pop" name="popular" data-path="popular" style="min-height:140px">${esc((s.popular || []).join('\n'))}</textarea></div>
          <div class="f"><label for="s-pop-ar">Arabic</label><textarea id="s-pop-ar" name="popularAr" data-path="popularAr" style="min-height:140px" dir="rtl" lang="ar">${esc((s.popularAr || []).join('\n'))}</textarea></div>
        </div>
        <button class="b b--primary" type="submit">Save</button>
      </form>
      <form class="panel" data-panel="contact" novalidate>
        <h2 class="panel__title">Contact &amp; areas</h2>
        <div class="f"><label for="s-wa">WhatsApp number <small>digits with country code</small></label><input id="s-wa" name="whatsapp" data-path="whatsapp" inputmode="numeric" value="${esc(s.whatsapp)}"></div>
        <div class="f-row">
          <div class="f"><label for="s-areas">Areas suggested at checkout <small>one per line</small></label><textarea id="s-areas" name="areas" data-path="areas" style="min-height:140px">${esc(s.areas.join('\n'))}</textarea></div>
          <div class="f"><label for="s-areas-ar">Arabic</label><textarea id="s-areas-ar" name="areasAr" data-path="areasAr" style="min-height:140px" dir="rtl" lang="ar">${esc((s.areasAr || []).join('\n'))}</textarea></div>
        </div>
        <button class="b b--primary" type="submit">Save</button>
      </form>
      <form class="panel" data-panel="password" novalidate>
        <h2 class="panel__title">Your password</h2>
        <div class="f"><label for="pw-cur">Current password</label><input id="pw-cur" name="current" data-path="current" type="password" autocomplete="current-password"><span class="f__err" data-err="current"></span></div>
        <div class="f"><label for="pw-new">New password <small>10+ characters</small></label><input id="pw-new" name="next" data-path="next" type="password" autocomplete="new-password"><span class="f__err" data-err="next"></span></div>
        <button class="b b--primary" type="submit">Change password</button>
        <p class="panel__note" style="margin-top:0">Changing it signs out every other device.</p>
      </form>`;
    activeZone = 0;
    markActiveZone();
    drawZones().catch(() => { $('#zone-map').innerHTML = '<p class="muted" style="padding:12px">Map unavailable. You can still edit the numbers.</p>'; });
  }

  const markActiveZone = () => $$('[data-zone]').forEach((r, i) => r.classList.toggle('is-active', i === activeZone));
  $('#settings').addEventListener('focusin', e => {
    const row = e.target.closest('[data-zone]'); if (!row) return;
    activeZone = $$('[data-zone]').indexOf(row); markActiveZone(); if (zoneMap) drawZones();
  });
  $('#settings').addEventListener('input', e => { if (e.target.closest('[data-zone]') && zoneMap) drawZones(); });
  $('#settings').addEventListener('click', e => {
    if (e.target.closest('#zone-add')) {
      const box = $('#zones');
      const c = zoneMap ? zoneMap.getCenter() : { lat: 25.2854, lng: 51.531 };
      box.insertAdjacentHTML('beforeend', zoneRow({ name: '', lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4), radiusKm: 5 }, box.children.length));
      activeZone = box.children.length - 1; markActiveZone(); drawZones();
      box.lastElementChild.querySelector('[data-z="name"]').focus();
    }
    const del = e.target.closest('[data-zone-del]');
    if (del) {
      if ($$('[data-zone]').length === 1) return toast('Keep at least one delivery area.', true);
      del.closest('[data-zone]').remove(); activeZone = 0; markActiveZone(); drawZones();
    }
  });

  $('#settings').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target; const f = form.elements;
    $$('.is-invalid', form).forEach(el => el.classList.remove('is-invalid'));
    $$('[data-err]', form).forEach(el => { el.textContent = ''; });
    const btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
    let res;
    if (form.dataset.panel === 'password') {
      res = await api('POST', '/api/admin/password', { current: f.current.value, next: f.next.value });
      if (res.ok) { form.reset(); toast('Password changed'); }
    } else {
      const payload = {
        ordering: () => ({ orderingOpen: f.orderingOpen.checked, closedMessage: f.closedMessage.value, closedMessageAr: f.closedMessageAr.value }),
        money: () => ({ deliveryFee: Number(f.deliveryFee.value), freeDelivery: Number(f.freeDelivery.value), minOrder: Number(f.minOrder.value) }),
        zones: () => ({ zones: readZones() }),
        slots: () => ({ cutoffHour: Number(f.cutoffHour.value), slotsToday: lines(f.slotsToday.value), slotsTomorrow: lines(f.slotsTomorrow.value), deliveryHours: f.deliveryHours.value, deliveryHoursAr: f.deliveryHoursAr.value }),
        popular: () => ({ popular: lines(f.popular.value), popularAr: lines(f.popularAr.value) }),
        contact: () => ({ whatsapp: f.whatsapp.value.replace(/\D/g, ''), areas: lines(f.areas.value), areasAr: lines(f.areasAr.value) }),
      }[form.dataset.panel]();
      res = await api('PUT', '/api/admin/settings', payload);
      if (res.ok) { toast('Saved. The shop is updated.'); state.slotWindows = null; }
    }
    btn.disabled = false;
    if (!res.ok) {
      for (const [path, msg] of Object.entries(res.body.fields || {})) {
        const key = path.split('.')[0];
        form.querySelector(`[data-path="${CSS.escape(key)}"]`)?.classList.add('is-invalid');
        const slot = form.querySelector(`[data-err="${CSS.escape(key)}"]`);
        if (slot) slot.textContent = msg; else toast(msg, true);
      }
      if (!res.body.fields) toast(res.body.message || 'Could not save.', true);
    }
  });

  /* ---------- Start ---------- */
  showTab(location.hash.slice(1) || 'orders');
  if (state.tab !== 'orders' && state.tab !== 'repeat') loadSummary();
})();
