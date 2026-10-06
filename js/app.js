/* Eden Farm Qatar — storefront interactions.
   The catalogue (products, prices, delivery settings) comes from the server as
   window.EDEN (/api/catalog.js). Orders go to /api/orders, which re-prices
   everything itself. Basket, favourites and delivery location live in this browser. */
(() => {
  const { AR, t, esc, qar, money, fmtDay, fmtHour, localTimes, qatarNow, store, pageUrl, validPhone } = window.EdenSite;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const icon = id => `<svg class="ic"><use href="#${id}"/></svg>`;
  const priceHtml = n => (AR ? `${money(n)}<small> ر.ق</small>` : `<small>QAR</small>${money(n)}`);

  store.del('cart'); // basket format before the server existed (keyed by position, not pack id)

  const toast = (() => {
    let timer;
    return msg => {
      const el = $('#toast'); el.textContent = msg; el.classList.add('is-on');
      clearTimeout(timer); timer = setTimeout(() => el.classList.remove('is-on'), 3000);
    };
  })();

  /* ---------- Catalogue ---------- */
  let CATEGORIES = [], PRODUCTS = [], BOXES = [], SETTINGS = {};
  const ITEMS = new Map();
  const applyCatalog = cat => {
    CATEGORIES = cat.categories; PRODUCTS = cat.products; BOXES = cat.boxes; SETTINGS = cat.settings;
    ITEMS.clear();
    PRODUCTS.forEach(p => ITEMS.set(p.id, p));
    BOXES.forEach(b => ITEMS.set(b.id, { ...b, cat: 'boxes' }));
  };

  const state = {
    cart: store.get('cart2', {}),          // { "productId|packId": qty }
    wish: new Set(store.get('wish', [])),  // favourites
    loc: store.get('loc', null),           // { lat, lng, label, area, ok }
    unit: {},                              // selected pack index per product
    filter: 'all',
    showAll: false,
    slot: null,                            // "YYYY-MM-DD|window"
    view: 'cart',                          // cart | checkout | done
    orderKey: null,                        // idempotency key for the order being placed
    placing: false,
    repeatPreset: 0,
  };

  const unitOf = (item, unitId) => item?.units.find(u => String(u.id) === String(unitId));
  // Drop basket lines whose product or pack no longer exists (e.g. removed in the admin panel).
  const pruneCart = () => {
    let dropped = 0;
    for (const k of Object.keys(state.cart)) {
      const [id, u] = k.split('|');
      if (!unitOf(ITEMS.get(id), u)) { delete state.cart[k]; dropped++; }
    }
    if (dropped) store.set('cart2', state.cart);
    return dropped;
  };

  const saveCart = () => store.set('cart2', state.cart);
  const keyFor = (p, ui) => `${p.id}|${p.units[ui]?.id}`;
  const qtyOf = (p, ui) => state.cart[keyFor(p, ui)] || 0;
  const setQty = (key, q) => {
    if (q <= 0) delete state.cart[key]; else state.cart[key] = Math.min(99, q);
    state.orderKey = null; // basket changed: the next order attempt is a new order
    saveCart(); updateCartUI();
  };

  /* ---------- Categories & menu ---------- */
  const renderCategories = () => {
    $('#cats').innerHTML = CATEGORIES.map(c => `
      <a class="cat${c.star ? ' cat--star' : ''}" href="${c.id === 'boxes' ? '#boxes' : '#shop'}" data-jump="${esc(c.id)}">
        <div class="cat__img${c.cut ? ' cat__img--cut' : ''}"><img src="${esc(c.img)}" alt="" loading="lazy"></div>
        <div><b>${esc(c.name)}</b><small>${esc(c.note)}</small></div>
      </a>`).join('');

    $('#menu-list').innerHTML = CATEGORIES.map(c => `
      <a href="${c.id === 'boxes' ? '#boxes' : '#shop'}" data-jump="${esc(c.id)}" data-close>
        <img src="${esc(c.img)}" alt=""${c.cut ? ' class="is-cut"' : ''}><span>${esc(c.name)}<small>${esc(c.note)}</small></span>${icon('i-chev')}
      </a>`).join('') + `
      <a href="#story" data-close><img src="/assets/img/eden/ig-shop.webp" alt=""><span>${t('Our farm shop')}<small>${t('Visit us in Doha')}</small></span>${icon('i-chev')}</a>`;
  };

  /* ---------- Product cards ---------- */
  const matches = p => state.filter === 'all' || (state.filter === 'saved' ? state.wish.has(p.id) : p.cat === state.filter);

  // Unit picker + price + add/stepper, shared by grid cards and the mushroom spotlight.
  const buyBlock = p => {
    const ui = Math.min(state.unit[p.id] ?? 0, p.units.length - 1);
    const u = p.units[ui];
    const q = qtyOf(p, ui);
    return `
        <div class="units" role="group" aria-label="${t('Pack size')}">
          ${p.units.map((x, i) => `<button type="button" data-act="unit" data-i="${i}" aria-pressed="${i === ui}">${esc(x.l)}</button>`).join('')}
        </div>
        <div class="card__foot">
          <p class="price${u.was ? ' price--sale' : ''}"><b>${priceHtml(u.p)}</b>${u.was ? `<s>${qar(u.was)}</s>` : `<small class="sr">${t('per {unit}', { unit: esc(u.l) })}</small>`}</p>
          ${q
            ? `<div class="stepper"><button type="button" data-act="dec" aria-label="${t('Remove one')}">${icon('i-minus')}</button><span aria-live="polite">${q}</span><button type="button" data-act="inc" aria-label="${t('Add one')}">${icon('i-plus')}</button></div>`
            : `<button type="button" class="add" data-act="add" aria-label="${t('Add {name}, {unit}, to basket', { name: esc(p.name), unit: esc(u.l) })}">${icon('i-plus')}</button>`}
        </div>`;
  };

  const cardInner = p => {
    const u = p.units[Math.min(state.unit[p.id] ?? 0, p.units.length - 1)];
    const off = u.was ? Math.round((1 - u.p / u.was) * 100) : 0;
    const badge = off ? `<span class="badge badge--sale">−${off}%</span>`
      : p.badge ? `<span class="badge${p.star ? ' badge--star' : ''}">${esc(p.badge)}</span>` : '';
    const wished = state.wish.has(p.id);
    return `
      <div class="card__img${p.cut ? ' card__img--cut' : ''}">
        <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" width="560" height="560">
        ${badge}
        <button class="wish${wished ? ' is-on' : ''}" data-act="wish" aria-pressed="${wished}" aria-label="${t('Save {name} to favourites', { name: esc(p.name) })}">${icon('i-heart')}</button>
      </div>
      <div class="card__body">
        <p class="card__origin">${icon('i-leaf')}${esc(p.origin)}</p>
        <h3 class="card__name">${esc(p.name)}</h3>
        ${p.pack ? `<p class="card__pack">${esc(p.pack)}</p>` : ''}
        ${buyBlock(p)}
      </div>`;
  };

  const mcardInner = p => `
      <div class="mcard__img">
        <img src="${esc(p.wide || p.img)}" alt="${esc(p.name)}" loading="lazy" width="1400" height="933">
        ${p.pack ? `<span class="mcard__pack">${esc(p.pack)}</span>` : ''}
      </div>
      <div class="mcard__body">
        <p class="card__origin">${icon('i-leaf')}${esc(p.origin)}</p>
        <h3 class="mcard__name">${esc(p.name)}</h3>
        ${p.taste ? `<p class="mcard__taste">${esc(p.taste)}</p>` : ''}
        ${p.uses?.length ? `<ul class="mcard__uses" aria-label="${t('Best for')}">${p.uses.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="mcard__buy">${buyBlock(p)}</div>
      </div>`;

  const gridEl = $('#grid');
  const mushEl = $('#mush-cards');
  const colCount = () => getComputedStyle(gridEl).gridTemplateColumns.split(' ').length || 4;

  const renderGrid = () => {
    const list = PRODUCTS.filter(matches);
    const limit = state.filter === 'all' && !state.showAll ? colCount() * 2 : list.length;
    const empty = state.filter === 'saved'
      ? `<div class="fav-empty"><b>${t('No favourites yet')}</b><p>${t('Tap ♡ on any product to save it here for your next order.')}</p></div>`
      : `<p class="search__empty">${t("Nothing here today. Check back after tomorrow's harvest.")}</p>`;
    gridEl.innerHTML = list.slice(0, limit).map(p => `<article class="card" data-id="${esc(p.id)}">${cardInner(p)}</article>`).join('') || empty;
    $('#show-more').hidden = list.length <= limit;
    $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.filter === state.filter));
    $$('.catnav a[data-filter]').forEach(a => a.classList.toggle('is-on', a.dataset.filter === state.filter));
  };
  const renderSpotlight = () => {
    mushEl.innerHTML = PRODUCTS.filter(p => p.cat === 'mushrooms')
      .map(p => `<article class="mcard" data-id="${esc(p.id)}">${mcardInner(p)}</article>`).join('');
  };
  // A product can be on screen twice (spotlight + grid); keep both in sync.
  const refreshCard = id => {
    const item = ITEMS.get(id);
    if (!item || !item.units || item.cat === 'boxes') return;
    $$(`.card[data-id="${CSS.escape(id)}"], .mcard[data-id="${CSS.escape(id)}"]`).forEach(el => {
      el.innerHTML = (el.classList.contains('mcard') ? mcardInner : cardInner)(item);
    });
  };

  const onCardClick = e => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = btn.closest('[data-id]'); const p = ITEMS.get(card.dataset.id);
    if (!p) return;
    const ui = Math.min(state.unit[p.id] ?? 0, p.units.length - 1);
    switch (btn.dataset.act) {
      case 'unit': state.unit[p.id] = +btn.dataset.i; break;
      case 'add': setQty(keyFor(p, ui), 1); toast(t('Added {name} · {unit}', { name: p.name, unit: p.units[ui].l })); break;
      case 'inc': setQty(keyFor(p, ui), qtyOf(p, ui) + 1); break;
      case 'dec': setQty(keyFor(p, ui), qtyOf(p, ui) - 1); break;
      case 'wish':
        state.wish.has(p.id) ? state.wish.delete(p.id) : state.wish.add(p.id);
        store.set('wish', [...state.wish]); updateWish();
        toast(state.wish.has(p.id) ? t('Saved {name} to favourites', { name: p.name }) : t('Removed {name} from favourites', { name: p.name }));
        if (state.filter === 'saved') { renderGrid(); return; }
        break;
    }
    refreshCard(p.id);
  };
  gridEl.addEventListener('click', onCardClick);
  mushEl.addEventListener('click', onCardClick);

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.filter = b.dataset.filter; state.showAll = false; renderGrid();
  });
  $('#show-more').addEventListener('click', () => { state.showAll = true; renderGrid(); });

  // Any link with data-filter / data-jump sets the grid filter.
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-filter]:not([role="tab"]), [data-jump]'); if (!a) return;
    const f = a.dataset.filter || a.dataset.jump;
    if (f === 'boxes') return;
    state.filter = f; state.showAll = false; renderGrid();
  });

  /* ---------- Favourites ---------- */
  const updateWish = () => {
    const n = state.wish.size;
    ['#wish-count', '#wish-count-m'].forEach(s => { const d = $(s); if (d) { d.textContent = n; d.hidden = !n; } });
    $('#tab-fav').hidden = !n && state.filter !== 'saved';
  };
  const openFavourites = () => {
    close(true);
    state.filter = 'saved'; state.showAll = true;
    $('#tab-fav').hidden = false;
    renderGrid();
    $('#shop').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#fav-open').addEventListener('click', openFavourites);
  $('#tab-saved').addEventListener('click', openFavourites);

  /* ---------- Bundles ---------- */
  const renderBoxes = () => {
    $('#box-list').innerHTML = BOXES.map(b => `
      <article class="box" data-id="${esc(b.id)}">
        <div class="box__img"><img src="${esc(b.img)}" alt="${esc(b.name)}" loading="lazy">${b.tag ? `<span class="box__tag">${esc(b.tag)}</span>` : ''}</div>
        <div class="box__body">
          <h3 class="box__name">${esc(b.name)}</h3>
          ${b.size ? `<p class="box__meta">${esc(b.size)}</p>` : ''}
          ${b.serves ? `<p class="box__meta">${esc(b.serves)}</p>` : ''}
          <p class="box__price"><b>${qar(b.price)}</b>${b.was ? `<s>${qar(b.was)}</s><span>${t('Save {n}%', { n: Math.round((1 - b.price / b.was) * 100) })}</span>` : ''}</p>
          <div class="box__actions">
            <button class="btn btn--ghost" type="button" data-box="once">${t('Order once')}</button>
            <button class="btn btn--primary" type="button" data-box="repeat">${icon('i-repeat')}${t('Every week')}</button>
          </div>
        </div>
      </article>`).join('');
  };
  $('#box-list').addEventListener('click', e => {
    const b = e.target.closest('[data-box]'); if (!b) return;
    const item = ITEMS.get(b.closest('.box').dataset.id); if (!item) return;
    const key = `${item.id}|${item.units[0].id}`;
    setQty(key, (state.cart[key] || 0) + 1);
    if (b.dataset.box === 'repeat') {
      state.repeatPreset = 7;
      toast(t('Added {name}. It will repeat every week. You can change this at checkout.', { name: item.name }));
    } else {
      toast(t('Added {name}', { name: item.name }));
    }
  });

  /* ---------- Basket ---------- */
  const cartLines = () => Object.entries(state.cart).map(([k, q]) => {
    const [id, u] = k.split('|'); const item = ITEMS.get(id); const unit = unitOf(item, u);
    return item && unit ? { k, id, q, item, unit, total: unit.p * q } : null;
  }).filter(Boolean);

  const round2 = n => Math.round(n * 100) / 100;
  const totals = () => {
    const lines = cartLines();
    const sub = round2(lines.reduce((s, l) => s + l.total, 0));
    const del = sub >= SETTINGS.freeDelivery || sub === 0 ? 0 : SETTINGS.deliveryFee;
    return { lines, sub, del, total: round2(sub + del), count: lines.reduce((s, l) => s + l.q, 0) };
  };

  const updateCartUI = () => {
    const { lines, sub, del, total, count } = totals();

    ['#cart-count', '#cart-count-m'].forEach(s => { const d = $(s); d.textContent = count; d.hidden = !count; });
    $('#cart-total-h').textContent = qar(sub);

    const left = Math.max(0, SETTINGS.freeDelivery - sub);
    $('#freebar-msg').innerHTML = left ? t('Add <b>{amount}</b> more for free delivery', { amount: qar(left) }) : t('You’ve unlocked <b>free delivery</b>');
    $('#freebar-fill').style.width = Math.min(100, SETTINGS.freeDelivery ? (sub / SETTINGS.freeDelivery) * 100 : 100) + '%';
    $('#freebar').classList.toggle('is-done', !left);

    $('#cart-items').innerHTML = lines.length ? lines.map(l => `
      <div class="line" data-k="${esc(l.k)}">
        <img src="${esc(l.item.img)}" alt=""${l.item.cut ? ' class="is-cut"' : ''}>
        <div><b>${esc(l.item.name)}</b><small>${esc(l.unit.l)}</small><span class="line__price">${qar(l.total)}</span></div>
        <div class="stepper"><button type="button" data-d="-1" aria-label="${t('Remove one')}">${icon('i-minus')}</button><span>${l.q}</span><button type="button" data-d="1" aria-label="${t('Add one')}">${icon('i-plus')}</button></div>
      </div>`).join('') : `
      <div class="cart-empty">
        <img class="logo__mark" src="/assets/img/logo-mark.png" alt="">
        <b>${t('Your basket is empty')}</b>
        <p>${t("Today's harvest is waiting. Add a few things and we'll pick them fresh for you.")}</p>
        <a class="btn btn--primary" href="#shop" data-close>${t('Start shopping')}</a>
      </div>`;
    if (state.view === 'cart') $('#cart-foot').hidden = !lines.length;
    $('#t-sub').textContent = qar(sub);
    $('#t-del').textContent = del ? qar(del) : t('Free');
    $('#t-total').textContent = qar(total);

    const closed = !SETTINGS.orderingOpen;
    const short = sub < SETTINGS.minOrder;
    $('#checkout').disabled = closed || short;
    $('#cart-note').textContent = closed ? SETTINGS.closedMessage
      : short ? t('The minimum order is {amount}.', { amount: qar(SETTINGS.minOrder) })
      : t('No payment now. Pay the rider by cash, card or bank transfer when your order arrives.');
    $('#cart-note').classList.toggle('is-warn', closed || short);

    if (state.view === 'checkout') renderCheckoutSummary();
  };

  $('#cart-items').addEventListener('click', e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    const k = b.closest('.line').dataset.k;
    setQty(k, (state.cart[k] || 0) + +b.dataset.d);
    refreshCard(k.split('|')[0]);
  });

  /* ---------- Delivery slots ---------- */
  // The server sends the slot list; recheck "open" against Qatar time in case the page has been open for a while.
  const slotList = () => {
    const q = qatarNow();
    return (SETTINGS.slots || []).map(s => {
      const closed = s.date < q.date || (s.date === q.date && q.hour >= SETTINGS.cutoffHour);
      const day = s.date === q.date ? t('Today') : s.date > q.date ? t('Tomorrow') : fmtDay(s.date);
      return { ...s, key: `${s.date}|${s.window}`, day, open: s.open && !closed };
    });
  };
  const chosenSlot = () => slotList().find(s => s.key === state.slot && s.open);

  const renderSlots = () => {
    const slots = slotList();
    if (!slots.some(s => s.key === state.slot && s.open)) state.slot = slots.find(s => s.open)?.key ?? null;
    $('#slots').innerHTML = slots.map(s =>
      `<button type="button" data-slot="${esc(s.key)}" aria-pressed="${s.key === state.slot}" ${s.open ? '' : 'disabled'}><b>${s.day}</b>${esc(localTimes(s.window))}</button>`).join('');
  };
  $('#slots').addEventListener('click', e => {
    const b = e.target.closest('[data-slot]'); if (!b || b.disabled) return;
    state.slot = b.dataset.slot; renderSlots();
  });

  /* ================= DELIVERY LOCATION ================= */
  const DOHA = { lat: 25.2854, lng: 51.5310 };
  const rad = d => (d * Math.PI) / 180;
  const distanceKm = (a, b) => {
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  const zoneFor = p => (SETTINGS.zones || []).find(z => distanceKm(p, z) <= z.radiusKm) || null;
  const locName = l => l?.area || l?.label || t('Pinned location');

  const updateLocUI = () => {
    const l = state.loc;
    $('#deliver-small').textContent = l ? (l.ok ? t('Deliver to') : t('No delivery to')) : t('Deliver to');
    $('#deliver-area').textContent = l ? locName(l) : t('Set your location');
    $('#deliver-btn').classList.toggle('is-bad', !!l && !l.ok);
    $('#loc-chip-txt').textContent = l ? locName(l) : t('Set location');
    $('#loc-chip').classList.toggle('is-ok', !!l?.ok);
    $('#loc-chip').classList.toggle('is-bad', !!l && !l.ok);
    if (state.view === 'checkout') renderCheckoutLoc();
  };

  // Look up a readable place name for a point (server proxies OpenStreetMap).
  const reverse = async p => {
    try {
      const r = await fetch(`/api/geo/reverse?lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}&lang=${AR ? 'ar' : 'en'}`);
      return r.ok ? await r.json() : {};
    } catch { return {}; }
  };

  let L_ready = null;
  const loadLeaflet = () => L_ready ??= new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css';
    document.head.append(css);
    const js = document.createElement('script'); js.src = '/vendor/leaflet/leaflet.js';
    js.onload = () => resolve(window.L); js.onerror = reject;
    document.head.append(js);
  });

  let map = null, candidate = null, lookupTimer = null, lookupSeq = 0;
  const locStatus = (kind, html) => {
    const el = $('#loc-status');
    el.className = `loc__status${kind ? ' is-' + kind : ''}`;
    el.innerHTML = html;
  };

  const checkCandidate = () => {
    const c = map.getCenter();
    const p = { lat: c.lat, lng: c.lng };
    const zone = zoneFor(p);
    candidate = { ...p, ok: !!zone, area: '', label: '' };
    $('#loc-confirm').disabled = !zone;
    locStatus(zone ? 'ok' : 'bad', zone
      ? `${icon('i-check')}<span><b>${t('We deliver here')}</b><small>${t('Finding the address…')}</small></span>`
      : `${icon('i-close')}<span><b>${t("Sorry, we don't deliver here yet")}</b><small>${t('Move the pin inside Doha, or <a href="{wa}" target="_blank" rel="noopener">message us on WhatsApp</a>.', { wa: `https://wa.me/${SETTINGS.whatsapp}` })}</small></span>`);
    clearTimeout(lookupTimer);
    const seq = ++lookupSeq;
    lookupTimer = setTimeout(async () => {
      const r = await reverse(p);
      if (seq !== lookupSeq) return;
      candidate.area = r.area || ''; candidate.label = r.label || '';
      const name = esc(r.label || r.area || t('Pinned location'));
      locStatus(zone ? 'ok' : 'bad', zone
        ? `${icon('i-check')}<span><b>${t('We deliver here')}</b><small>${name}</small></span>`
        : `${icon('i-close')}<span><b>${t("Sorry, we don't deliver here yet")}</b><small>${name} · ${t('Move the pin inside Doha, or <a href="{wa}" target="_blank" rel="noopener">message us on WhatsApp</a>.', { wa: `https://wa.me/${SETTINGS.whatsapp}` })}</small></span>`);
    }, 650);
  };

  const openLoc = async ({ gps = false } = {}) => {
    $('#locprompt').hidden = true;
    $('#loc').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#loc-results').hidden = true;
    locStatus('', t('Loading map…'));
    try {
      const L = await loadLeaflet();
      const start = state.loc || DOHA;
      if (!map) {
        map = L.map('loc-map', { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], state.loc ? 16 : 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        }).addTo(map);
        for (const z of SETTINGS.zones || []) {
          L.circle([z.lat, z.lng], { radius: z.radiusKm * 1000, color: '#3E8A55', weight: 1.5, fillColor: '#CFE8B4', fillOpacity: 0.12, interactive: false }).addTo(map);
        }
        map.on('moveend', checkCandidate);
      } else {
        map.setView([start.lat, start.lng], state.loc ? 16 : 12);
      }
      setTimeout(() => { map.invalidateSize(); checkCandidate(); }, 60);
      if (gps) locateMe();
    } catch {
      locStatus('bad', t("The map couldn't load. Check your connection and try again."));
    }
  };
  const closeLoc = () => { $('#loc').hidden = true; document.body.style.overflow = openDrawer ? 'hidden' : ''; };

  const gpsError = err => {
    if (!window.isSecureContext) return t('Your browser only shares location on secure (https) pages. Move the map to your location instead.');
    if (err?.code === 1) return t('Location is turned off for this site. Allow it in your browser settings, or move the map to your location.');
    return t("We couldn't find your location. Move the map to your location instead.");
  };
  const locateMe = () => {
    if (!navigator.geolocation) { locStatus('bad', gpsError()); return; }
    locStatus('', `${icon('i-gps')}<span>${t('Finding your location…')}</span>`);
    navigator.geolocation.getCurrentPosition(
      pos => map.setView([pos.coords.latitude, pos.coords.longitude], 17),
      err => locStatus('bad', gpsError(err)),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };

  $('#loc-gps').addEventListener('click', locateMe);
  $$('[data-loc-close]').forEach(b => b.addEventListener('click', closeLoc));
  $('#loc').addEventListener('click', e => { if (e.target.id === 'loc') closeLoc(); });
  $('#loc-confirm').addEventListener('click', () => {
    if (!candidate?.ok) return;
    state.loc = { ...candidate };
    store.set('loc', state.loc);
    updateLocUI();
    closeLoc();
    toast(t('We deliver to {place}', { place: locName(state.loc) }));
    if (state.view === 'checkout' && !$('#co-area').value && state.loc.area) $('#co-area').value = state.loc.area;
  });
  $('#loc-search').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#loc-q').value.trim(); if (q.length < 2) return;
    const box = $('#loc-results');
    box.hidden = false; box.innerHTML = `<p class="loc__empty">${t('Searching…')}</p>`;
    try {
      const r = await fetch(`/api/geo/search?q=${encodeURIComponent(q)}&lang=${AR ? 'ar' : 'en'}`);
      const { results = [] } = r.ok ? await r.json() : {};
      box.innerHTML = results.length
        ? results.map((x, i) => `<button type="button" data-res="${i}">${icon('i-pin')}<span>${esc(x.label)}</span></button>`).join('')
        : `<p class="loc__empty">${t('No places found. Try another name, or move the map.')}</p>`;
      box.onclick = ev => {
        const b = ev.target.closest('[data-res]'); if (!b) return;
        const x = results[+b.dataset.res];
        box.hidden = true;
        map.setView([x.lat, x.lng], 16);
      };
    } catch {
      box.innerHTML = `<p class="loc__empty">${t('Search is unavailable right now. Move the map instead.')}</p>`;
    }
  });
  $('#deliver-btn').addEventListener('click', () => openLoc());
  $('#loc-chip').addEventListener('click', () => openLoc());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#loc').hidden) closeLoc(); });

  // First visit: check delivery automatically if the browser already allows location,
  // otherwise offer a one-tap check (browsers always ask the shopper first).
  const firstVisitCheck = async () => {
    if (state.loc || store.get('locPromptDismissed', false)) return;
    let perm = 'prompt';
    try { perm = (await navigator.permissions?.query({ name: 'geolocation' }))?.state || 'prompt'; } catch { /* not supported */ }
    if (perm === 'granted' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const ok = !!zoneFor(p);
        const r = await reverse(p);
        state.loc = { ...p, ok, area: r.area || '', label: r.label || '' };
        store.set('loc', state.loc);
        updateLocUI();
        toast(ok ? t('We deliver to {place}', { place: locName(state.loc) }) : t("Sorry, we don't deliver to {place} yet", { place: locName(state.loc) }));
      }, () => { $('#locprompt').hidden = false; }, { timeout: 10000, maximumAge: 300000 });
      return;
    }
    setTimeout(() => { if (!state.loc && $('#loc').hidden) $('#locprompt').hidden = false; }, 2500);
  };
  $('#locprompt-go').addEventListener('click', () => openLoc({ gps: true }));
  $('#locprompt-x').addEventListener('click', () => { $('#locprompt').hidden = true; store.set('locPromptDismissed', true); });

  /* ================= CHECKOUT ================= */
  const form = $('#checkout-form');
  const PAY = { cash: t('Cash'), card: t('Card'), transfer: t('Bank transfer') };

  const setView = view => {
    state.view = view;
    const hasLines = cartLines().length;
    $('#freebar').hidden = view !== 'cart';
    $('#cart-items').hidden = view !== 'cart';
    $('#cart-foot').hidden = view !== 'cart' || !hasLines;
    $('#checkout-view').hidden = view !== 'checkout';
    $('#checkout-foot').hidden = view !== 'checkout';
    $('#done-view').hidden = view !== 'done';
    $('#co-back').hidden = view !== 'checkout';
    $('#cart-title').textContent = { cart: t('Your basket'), checkout: t('Delivery details'), done: t('Order placed') }[view];
    $('#checkout-view').scrollTop = 0;
  };

  const renderCheckoutLoc = () => {
    const l = state.loc;
    $('#co-loc').innerHTML = l?.ok
      ? `${icon('i-pin')}<span><small>${t('Delivery location')}</small><b>${esc(l.label || l.area || t('Pinned location'))}</b></span><button type="button" class="co-link" data-set-loc>${t('Change')}</button>`
      : `<button type="button" class="btn btn--ghost btn--block co-loc__set" data-set-loc>${icon('i-gps')}${l ? t('Choose a location we deliver to') : t('Set delivery location on the map')}</button>`;
    $('#co-loc').classList.toggle('is-set', !!l?.ok);
  };
  $('#co-loc').addEventListener('click', e => { if (e.target.closest('[data-set-loc]')) openLoc({ gps: !state.loc }); });

  const repeatValue = () => {
    const v = form.querySelector('input[name="repeat"]:checked')?.value || '0';
    if (v === 'custom') return Number(form.elements.every.value || 0);
    return Number(v);
  };
  const syncRepeat = () => {
    const v = form.querySelector('input[name="repeat"]:checked')?.value;
    $('#repeat-custom').hidden = v !== 'custom';
    $('#repeat-note').hidden = v === '0';
  };
  $('#repeat').addEventListener('change', syncRepeat);

  const renderCheckoutSummary = () => {
    const { total, count } = totals();
    const slot = chosenSlot();
    $('#co-slot').innerHTML = slot
      ? `${icon('i-truck')}<span><small>${t('Delivery')}</small><b>${slot.day}, ${fmtDay(slot.date)} · ${esc(localTimes(slot.window))}</b></span><button type="button" class="co-link" data-goto="cart">${t('Change')}</button>`
      : `${icon('i-truck')}<span><small>${t('Delivery')}</small><b>${t('Choose a delivery slot')}</b></span><button type="button" class="co-link" data-goto="cart">${t('Choose')}</button>`;
    $('#co-count').textContent = count === 1 ? t('1 item') : t('{n} items', { n: count });
    $('#co-total').textContent = qar(total);
    $('#place-order').innerHTML = state.placing ? t('Placing your order…') : t('Place order · {amount}', { amount: qar(total) });
    $('#place-order').disabled = state.placing;
  };

  // Remember delivery details for next time (this device only).
  const FIELDS = ['name', 'phone', 'area', 'zone', 'street', 'building', 'details'];
  const fillForm = () => {
    const saved = store.get('customer', {});
    FIELDS.forEach(f => { if (saved[f] && !form.elements[f].value) form.elements[f].value = saved[f]; });
    if (!form.elements.area.value && state.loc?.ok && state.loc.area) form.elements.area.value = state.loc.area;
    const pay = saved.payment && form.querySelector(`input[name="payment"][value="${CSS.escape(saved.payment)}"]`);
    if (pay) pay.checked = true;
    if (state.repeatPreset) {
      form.querySelector(`input[name="repeat"][value="${state.repeatPreset}"]`).checked = true;
      state.repeatPreset = 0;
    }
    syncRepeat();
    $('#co-areas').innerHTML = (SETTINGS.areas || []).map(a => `<option value="${esc(a)}"></option>`).join('');
    renderCheckoutLoc();
  };

  const showFormError = msg => { const el = $('#co-error'); el.innerHTML = msg; el.hidden = !msg; if (msg) el.scrollIntoView({ block: 'nearest' }); };
  const clearFieldErrors = () => {
    $$('[data-err]', form).forEach(el => { el.textContent = ''; });
    $$('.is-invalid', form).forEach(el => { el.classList.remove('is-invalid'); el.removeAttribute('aria-invalid'); });
  };
  const fieldError = (path, msg) => {
    const slot = form.querySelector(`[data-err="${CSS.escape(path)}"]`);
    const input = path === 'location' ? $('#co-loc') : form.elements[path.replace('customer.', '')];
    if (slot) slot.textContent = msg;
    if (input && input.classList) { input.classList.add('is-invalid'); input.setAttribute?.('aria-invalid', 'true'); }
    return input;
  };

  $('#checkout').addEventListener('click', () => {
    if (!cartLines().length) return;
    if (!chosenSlot()) { renderSlots(); toast(t('Please choose a delivery slot first')); return; }
    fillForm();
    setView('checkout');
    renderCheckoutSummary();
    setTimeout(() => {
      if (!state.loc?.ok) return;
      const first = FIELDS.map(f => form.elements[f]).find(i => i && !i.value && i.required);
      first?.focus({ preventScroll: true });
    }, 360);
  });
  const backToCart = () => { setView('cart'); renderSlots(); updateCartUI(); };
  $('#co-back').addEventListener('click', backToCart);
  $('#checkout-view').addEventListener('click', e => { if (e.target.closest('[data-goto="cart"]')) backToCart(); });
  $('#checkout-foot').addEventListener('click', e => { if (e.target.closest('[data-goto="cart"]')) backToCart(); });

  // Server rejected the basket (prices/availability/slot): take the fresh catalogue and send the shopper back to check it.
  const refreshFrom = (catalog, message) => {
    if (catalog) {
      applyCatalog(catalog);
      const dropped = pruneCart();
      renderAll();
      if (dropped) message += ' ' + (dropped > 1 ? t('{n} items were removed.', { n: dropped }) : t('1 item was removed.'));
    }
    backToCart();
    toast(message);
  };

  const postOrder = async payload => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal,
      });
      let body = {};
      try { body = await res.json(); } catch { /* non-JSON error page */ }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  };

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (state.placing) return;
    clearFieldErrors(); showFormError('');

    const v = Object.fromEntries(FIELDS.map(f => [f, form.elements[f].value.trim()]));
    const payment = form.querySelector('input[name="payment"]:checked')?.value || 'cash';
    const repeatEvery = repeatValue();
    let firstBad = null;
    if (!state.loc?.ok) firstBad ??= fieldError('location', t('Please set a delivery location we deliver to.'));
    if (v.name.length < 2) firstBad ??= fieldError('customer.name', t('Please enter your name.'));
    if (!validPhone(v.phone)) firstBad ??= fieldError('customer.phone', t('Please enter an 8-digit Qatar mobile number.'));
    if (v.area.length < 2) firstBad ??= fieldError('customer.area', t('Please choose your area.'));
    if (repeatEvery && (repeatEvery < 3 || repeatEvery > 90)) firstBad ??= fieldError('repeatEvery', t('Choose a repeat between 3 and 90 days.'));
    if (firstBad) { (firstBad.focus ? firstBad : firstBad.querySelector?.('button'))?.focus?.(); firstBad.scrollIntoView?.({ block: 'center' }); return; }

    const slot = chosenSlot();
    if (!slot) { refreshFrom(null, t('That delivery slot has closed. Please choose another one.')); return; }
    const { lines, total } = totals();
    if (!lines.length) { setView('cart'); return; }

    state.orderKey ??= uuid();
    const payload = {
      idempotencyKey: state.orderKey,
      items: lines.map(l => ({ id: l.id, unit: l.unit.id, qty: l.q })),
      slot: { date: slot.date, window: slot.window },
      location: { lat: state.loc.lat, lng: state.loc.lng, label: (state.loc.label || '').slice(0, 200) },
      customer: v,
      payment,
      repeatEvery,
      notes: form.elements.notes.value.trim(),
      lang: AR ? 'ar' : 'en',
      expectedTotal: total,
      website: form.elements.website.value,
    };
    store.set('customer', { ...v, payment });

    state.placing = true; renderCheckoutSummary();
    let result;
    try { result = await postOrder(payload); } catch { result = null; }
    state.placing = false; renderCheckoutSummary();

    if (!result) {
      // Same idempotency key on retry, so tapping again can never create a second order.
      showFormError(t("We couldn't reach the shop. Check your connection and tap Place order again. You won't be double-ordered."));
      return;
    }
    const { status, body } = result;
    if (status === 200 || status === 201) return orderDone(body.order, lines, repeatEvery);
    if (status === 422 && body.fields) {
      let first = null;
      for (const [path, msg] of Object.entries(body.fields)) first ??= fieldError(path, msg);
      showFormError(esc(body.message));
      first?.focus?.();
      return;
    }
    if (['PRICES_CHANGED', 'ITEMS_UNAVAILABLE', 'SLOT_CLOSED'].includes(body.error)) return refreshFrom(body.catalog, body.message);
    showFormError(esc(body.message || t('Something went wrong. Please try again, or order on WhatsApp.')));
  });

  const orderDone = (order, lines, repeatEvery) => {
    // Keep the order on this device so the tracking page can list it.
    const recent = store.get('orders', []).filter(o => o.code !== order.code);
    recent.unshift({ code: order.code, k: order.track, at: Date.now() });
    store.set('orders', recent.slice(0, 10));

    state.cart = {}; state.orderKey = null; saveCart();
    form.elements.notes.value = '';
    form.querySelector('input[name="repeat"][value="0"]').checked = true; syncRepeat();
    renderGrid(); renderSpotlight(); updateCartUI();

    const first = order.customer.name.split(' ')[0];
    const trackUrl = `${pageUrl('track.html')}?o=${encodeURIComponent(order.code)}&k=${encodeURIComponent(order.track)}`;
    const slotText = `${fmtDay(order.slot.date)} · ${localTimes(order.slot.window)}`;
    const itemText = lines.map(l => `• ${l.q} × ${l.item.name} (${l.unit.l})`).join('\n');
    const waText = [
      t('Hello Eden Farm, I just placed order {code}.', { code: order.code }),
      itemText,
      t('Total: {amount} ({method} on delivery)', { amount: qar(order.total), method: PAY[order.payment] }),
      t('Delivery: {slot}', { slot: slotText }),
      repeatEvery ? t('Repeat every {n} days', { n: repeatEvery }) : '',
      order.customer.area,
    ].filter(Boolean).join('\n');
    const address = [order.customer.area, order.customer.zone && t('Zone {n}', { n: order.customer.zone }), order.customer.street && t('Street {n}', { n: order.customer.street }), order.customer.building && t('Building {n}', { n: order.customer.building })].filter(Boolean).join(AR ? '، ' : ', ');
    $('#done-view').innerHTML = `
      <div class="done__badge">${icon('i-check')}</div>
      <h3 class="h3">${t('Thank you, {name}!', { name: esc(first) })}</h3>
      <p class="done__lede">${t("Your order <b>{code}</b> is in. We'll call or WhatsApp you on <b>{phone}</b> to confirm.", { code: esc(order.code), phone: `<span dir="ltr">${esc(order.customer.phone)}</span>` })}</p>
      <dl class="done__facts">
        <div><dt>${t('Delivery')}</dt><dd>${esc(slotText)}</dd></div>
        <div><dt>${t('Address')}</dt><dd>${esc(address)}</dd></div>
        <div><dt>${t('Pay the rider')}</dt><dd>${PAY[order.payment]} · ${qar(order.total)}</dd></div>
        ${repeatEvery ? `<div><dt>${t('Repeats')}</dt><dd>${t('Every {n} days, same basket', { n: repeatEvery })}</dd></div>` : ''}
      </dl>
      <div class="done__actions">
        <a class="btn btn--primary btn--block" href="${trackUrl}">${icon('i-truck')}${t('Track your order')}</a>
        <a class="btn btn--wa btn--block" href="https://wa.me/${esc(SETTINGS.whatsapp)}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener">${icon('i-wa')}${t('Send order on WhatsApp')}</a>
        <button class="btn btn--ghost btn--block" type="button" data-close>${t('Continue shopping')}</button>
      </div>`;
    setView('done');
  };

  /* ---------- Drawers ---------- */
  const scrim = $('#scrim');
  let openDrawer = null;
  const open = el => {
    if (openDrawer) close(true);
    openDrawer = el; el.hidden = false; scrim.hidden = false;
    requestAnimationFrame(() => { el.classList.add('is-open'); scrim.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
    el.querySelector('[data-close]')?.focus({ preventScroll: true });
  };
  const close = instant => {
    if (!openDrawer) return;
    const el = openDrawer; openDrawer = null;
    el.classList.remove('is-open'); scrim.classList.remove('is-open');
    document.body.style.overflow = '';
    const hide = () => {
      if (openDrawer !== el) el.hidden = true;
      if (!openDrawer) scrim.hidden = true;
      if (el.id === 'cart' && state.view === 'done') setView('cart');
    };
    instant === true ? hide() : setTimeout(hide, 350);
  };
  const openCart = () => {
    if (state.view !== 'checkout') setView('cart');
    renderSlots(); updateCartUI(); open($('#cart'));
  };
  $('#menu-open').addEventListener('click', () => open($('#menu')));
  $('#cart-open').addEventListener('click', openCart);
  $('#tab-cart').addEventListener('click', openCart);
  scrim.addEventListener('click', close);
  document.addEventListener('click', e => { if (e.target.closest('.drawer [data-close]')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#loc').hidden) { close(); hideDrop(); } });

  /* ---------- Search ---------- */
  const input = $('#search-input'); const drop = $('#search-drop');
  const hideDrop = () => { drop.hidden = true; };
  const showDrop = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      const tags = SETTINGS.popular || [];
      drop.innerHTML = tags.length
        ? `<div class="search__tags"><p>${t('Popular right now')}</p>${tags.map(x => `<button type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`
        : '';
      drop.hidden = !tags.length;
      return;
    }
    const hits = PRODUCTS.filter(p => (p.name + ' ' + p.cat + ' ' + p.origin).toLowerCase().includes(q)).slice(0, 6);
    drop.innerHTML = hits.length ? hits.map(p => `
      <button type="button" class="sugg" data-pick="${esc(p.id)}"><img src="${esc(p.img)}" alt=""${p.cut ? ' class="is-cut"' : ''}><span><b>${esc(p.name)}</b><small>${esc(p.pack || p.units[0].l)} · ${esc(p.origin)}</small></span><em>${qar(p.units[0].p)}</em></button>`).join('')
      : `<p class="search__empty">${t('No produce matches “{q}”. Try mushrooms, peppers or honey.', { q: esc(input.value.trim()) })}</p>`;
    drop.hidden = false;
  };
  const pick = id => {
    const p = ITEMS.get(id); if (!p) return;
    hideDrop(); input.value = ''; input.blur();
    state.filter = p.cat; state.showAll = true; renderGrid();
    const card = gridEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card?.animate([{ boxShadow: '0 0 0 3px var(--date)' }, { boxShadow: '0 0 0 3px transparent' }], { duration: 1600, easing: 'ease-out' });
  };
  input.addEventListener('focus', showDrop);
  input.addEventListener('input', showDrop);
  drop.addEventListener('mousedown', e => e.preventDefault());
  drop.addEventListener('click', e => {
    const tg = e.target.closest('[data-q]'); if (tg) { input.value = tg.dataset.q; showDrop(); input.focus(); return; }
    const s = e.target.closest('[data-pick]'); if (s) pick(s.dataset.pick);
  });
  input.addEventListener('blur', () => setTimeout(hideDrop, 120));
  $('#search-form').addEventListener('submit', e => {
    e.preventDefault();
    const first = drop.querySelector('[data-pick]'); if (first) pick(first.dataset.pick);
  });

  /* ---------- Header compact on mobile scroll ---------- */
  const header = $('.header');
  $('#tab-search').addEventListener('click', () => {
    header.classList.add('search-open');
    input.focus();
  });
  let lastY = 0, compact = false;
  addEventListener('scroll', () => {
    const y = scrollY;
    // Hysteresis: the header shrinks ~100px, so enter and exit at different points to avoid flicker.
    if (!compact && y > 320) compact = true; else if (compact && y < 80) compact = false;
    header.classList.toggle('is-compact', compact);
    if (!compact || Math.abs(y - lastY) > 60) { if (document.activeElement !== input) header.classList.remove('search-open'); lastY = y; }
  }, { passive: true });

  /* ---------- Same-day cutoff + harvest date (Qatar time) ---------- */
  const tick = () => {
    const q = qatarNow();
    const mins = SETTINGS.cutoffHour * 60 - (q.hour * 60 + q.minute);
    $('#cutoff').textContent = mins > 0
      ? t('· {h}h {m}m left', { h: Math.floor(mins / 60), m: String(mins % 60).padStart(2, '0') })
      : t('· now taking orders for tomorrow');
    $('#harvest-date').textContent = fmtDay(q.date);
  };

  // Text on the page that follows the admin settings and catalogue.
  const syncCopy = () => {
    const cut = $('.announce__msg b'); if (cut) cut.textContent = fmtHour(SETTINGS.cutoffHour);
    const free = $('.announce__msg--side'); if (free) free.textContent = t('Free delivery over {amount}', { amount: qar(SETTINGS.freeDelivery).replace('.00', '') });
    const more = PRODUCTS.filter(p => p.cat !== 'mushrooms').length;
    const harvest = $('#harvest-more'); if (harvest) { harvest.textContent = t('+ {n} more from the farm', { n: more }); harvest.hidden = !more; }
    const trio = BOXES.find(b => b.id === 'box-trio');
    const save = $('#trio-save');
    if (save) save.textContent = trio?.was ? ' · ' + t('save {n}%', { n: Math.round((1 - trio.price / trio.was) * 100) }) : '';
  };

  /* ---------- Init ---------- */
  const renderAll = () => { renderCategories(); renderSpotlight(); renderGrid(); renderBoxes(); syncCopy(); };

  if (!window.EDEN) {
    // Catalogue failed to load: keep the page usable and point people to WhatsApp.
    const msg = `<p class="search__empty">${t("We couldn't load today's produce. Please refresh the page, or order on WhatsApp: +974 6643 1863.")}</p>`;
    gridEl.innerHTML = msg; mushEl.innerHTML = msg; $('#show-more').hidden = true;
    SETTINGS = { freeDelivery: 100, deliveryFee: 15, minOrder: 0, cutoffHour: 14, orderingOpen: false, closedMessage: t('Online ordering is unavailable right now. Please order on WhatsApp.'), slots: [], zones: [] };
  } else {
    applyCatalog(window.EDEN);
    pruneCart();
    renderAll();
    firstVisitCheck();
  }
  tick(); setInterval(tick, 30000);
  updateCartUI(); updateWish(); updateLocUI();
  let rw; addEventListener('resize', () => { clearTimeout(rw); rw = setTimeout(() => { if (state.filter === 'all' && !state.showAll && window.EDEN) renderGrid(); }, 200); });
})();
