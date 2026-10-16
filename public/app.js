// Single-page app: hash routes for buyer, seller, inspector and admin screens.
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $('#view');
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const state = { token: store.get('token', null), user: store.get('user', null), lang: store.get('lang', 'en'), catalog: null };

  const t = (k) => (I18N[state.lang] && I18N[state.lang][k]) || I18N.en[k] || k;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  const lakh = (n) => (n >= 100000 ? '₹' + (n / 100000).toFixed(2).replace(/\.?0+$/, '') + ' lakh' : inr(n));
  const toast = (msg) => { if (msg === 'stale') return; const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2800); };

  // Each render bumps this; replies that arrive after the user moved to another screen are dropped.
  let renderSeq = 0;
  const STALE = new Error('stale');

  async function api(path, { method = 'GET', body } = {}) {
    const seq = renderSeq;
    const res = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (seq !== renderSeq) throw STALE;
    if (res.status === 401 && state.token) { setSession(null, null); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  function setSession(token, user) {
    state.token = token; state.user = user; store.set('token', token); store.set('user', user); renderTabbar();
  }
  const requireLogin = () => {
    if (state.user) return true;
    toast(t('loginNeeded'));
    location.hash = '#/login?next=' + encodeURIComponent(location.hash.slice(1));
    return false;
  };
  async function getCatalog() { return state.catalog || (state.catalog = await api('/api/catalog')); }
  const brands = (cat) => [...new Set(cat.models.map((m) => m.brand))];

  // ---------- shared pieces ----------
  const ownersText = (n) => (n == 1 ? t('owner1') : `${n} ${t('ownerN')}`);
  const gradeBadge = (g) => (g ? `<span class="badge ${g === 'A' ? 'ok' : g === 'B' ? '' : 'warn'}">✔ ${t('inspected')} · ${t('grade')} ${esc(g)}</span>` : '');
  const statusBadge = (s) => {
    const cls = { live: 'ok', booked: 'warn', sold: 'bad', pending: '', rejected: 'bad', paid: 'ok', requested: '', confirmed: 'ok', refunded: 'warn', cancelled: 'bad', done: 'ok', assigned: '', completed: 'ok', filed: '' }[s] ?? '';
    return `<span class="badge ${cls}">${esc(t(s) !== s ? t(s) : s)}</span>`;
  };
  const carCard = (c) => `
    <a class="card car-card" href="#/car/${c.id}">
      <div class="thumb" ${c.photo ? `style="background-image:url('${esc(c.photo)}')"` : ''}>${c.photo ? '' : '🚘'}
        ${c.status === 'booked' ? `<span class="badge warn">${t('booked')}</span>` : c.status === 'sold' ? `<span class="badge bad">${t('sold')}</span>` : ''}</div>
      <div class="body">
        <h3>${esc(c.year)} ${esc(c.brand)} ${esc(c.model)} <span class="muted">${esc(c.variant || '')}</span></h3>
        <div class="price">${lakh(c.asking_price)}</div>
        <div class="specs muted"><span>${Number(c.km_driven).toLocaleString('en-IN')} km</span><span>${esc(c.fuel)}</span><span>${esc(c.transmission)}</span><span>${ownersText(c.owners)}</span></div>
        <div style="margin-top:8px">${gradeBadge(c.grade)}</div>
      </div>
    </a>`;
  const listOrEmpty = (items, fn) => (items.length ? items.map(fn).join('') : `<div class="empty">${t('noItems')}</div>`);
  const options = (list, selected, anyLabel) =>
    (anyLabel ? `<option value="">${esc(anyLabel)}</option>` : '') + list.map((v) => {
      const [val, label] = Array.isArray(v) ? v : [v, v];
      return `<option value="${esc(val)}" ${String(val) === String(selected ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
  const formData = (form) => Object.fromEntries(new FormData(form));

  // ---------- views ----------
  const routes = {
    async '/'() {
      const [{ listings }, cat] = await Promise.all([api('/api/listings?sort=new'), getCatalog()]);
      const budgets = [[0, 300000, 'Under ₹3 lakh'], [300000, 500000, '₹3–5 lakh'], [500000, 800000, '₹5–8 lakh'], [800000, 1200000, '₹8–12 lakh'], [1200000, '', 'Above ₹12 lakh']];
      view.innerHTML = `
        <section class="hero">
          <h1>${t('heroTitle')}</h1><p>${t('heroSub')}</p>
          <div class="row"><a class="btn accent" href="#/buy">🔍 ${t('buyCar')}</a><a class="btn secondary" href="#/sell">💰 ${t('sellCar')}</a></div>
        </section>
        <h2>${t('byBudget')}</h2>
        <div class="chips">${budgets.map(([a, b, l]) => `<a class="chip" href="#/buy?minPrice=${a}&maxPrice=${b}">${l}</a>`).join('')}</div>
        <h2>${t('popularBrands')}</h2>
        <div class="chips">${brands(cat).map((b) => `<a class="chip" href="#/buy?brand=${encodeURIComponent(b)}">${esc(b)}</a>`).join('')}</div>
        <div class="section-head"><h2>${t('recent')}</h2><a href="#/buy">${t('viewAll')} →</a></div>
        <div class="grid">${listOrEmpty(listings.slice(0, 6), carCard)}</div>`;
    },

    async '/buy'(params) {
      const cat = await getCatalog();
      const qs = new URLSearchParams(params).toString();
      const { listings } = await api('/api/listings?' + qs);
      const models = cat.models.filter((m) => !params.brand || m.brand === params.brand).map((m) => m.model);
      const compare = store.get('compare', []);
      view.innerHTML = `
        <form id="search" class="row" style="margin-bottom:12px">
          <input name="q" placeholder="${t('search')}" value="${esc(params.q || '')}" style="flex:1;margin:0">
          <button class="btn" type="submit">🔍</button>
          <button class="btn secondary" type="button" id="toggleFilters">⚙ ${t('filters')}</button>
        </form>
        <form id="filters" class="panel filters ${Object.keys(params).length > 1 ? 'open' : ''}">
          <div class="form-grid">
            <label>${t('brand')}<select name="brand">${options(brands(cat), params.brand, t('any'))}</select></label>
            <label>${t('model')}<select name="model">${options(models, params.model, t('any'))}</select></label>
            <label>${t('minPrice')}<input name="minPrice" type="number" min="0" step="10000" value="${esc(params.minPrice || '')}"></label>
            <label>${t('maxPrice')}<input name="maxPrice" type="number" min="0" step="10000" value="${esc(params.maxPrice || '')}"></label>
            <label>${t('minYear')}<input name="minYear" type="number" min="1990" value="${esc(params.minYear || '')}"></label>
            <label>${t('maxKm')}<input name="maxKm" type="number" min="0" step="5000" value="${esc(params.maxKm || '')}"></label>
            <label>${t('fuel')}<select name="fuel">${options(cat.fuels, params.fuel, t('any'))}</select></label>
            <label>${t('transmission')}<select name="transmission">${options(cat.transmissions, params.transmission, t('any'))}</select></label>
            <label>${t('owners')}<select name="owners">${options([[1, t('owner1')], [2, '≤ 2'], [3, '≤ 3']], params.owners, t('any'))}</select></label>
            <label>${t('sort')}<select name="sort">${options([['new', t('newest')], ['price_asc', t('priceLow')], ['price_desc', t('priceHigh')], ['km', t('lowKm')], ['year', t('newer')]], params.sort)}</select></label>
          </div>
          <button class="btn" type="submit">${t('apply')}</button>
        </form>
        ${compare.length ? `<div class="panel row" style="justify-content:space-between"><span>${t('compare')}: ${compare.length}/3</span>
          <span class="row"><a class="btn small" href="#/compare">${t('compare')}</a><button class="btn small secondary" id="clearCompare">${t('clearCompare')}</button></span></div>` : ''}
        <p class="muted">${listings.length} cars</p>
        <div class="grid">${listings.length ? listings.map(carCard).join('') : `<div class="empty">${t('noCars')}</div>`}</div>`;
      const go = () => {
        const all = { ...formData($('#filters')), q: $('#search').q.value };
        const clean = Object.fromEntries(Object.entries(all).filter(([, v]) => v !== ''));
        location.hash = '#/buy?' + new URLSearchParams(clean);
      };
      $('#search').onsubmit = (e) => { e.preventDefault(); go(); };
      $('#filters').onsubmit = (e) => { e.preventDefault(); go(); };
      $('#filters').brand.onchange = (e) => {
        $('#filters').model.innerHTML = options(cat.models.filter((m) => !e.target.value || m.brand === e.target.value).map((m) => m.model), '', t('any'));
      };
      $('#toggleFilters').onclick = () => $('#filters').classList.toggle('open');
      const cc = $('#clearCompare'); if (cc) cc.onclick = () => { store.set('compare', []); render(); };
    },

    async '/car/:id'({ id }) {
      const d = await api('/api/listings/' + id);
      const l = d.listing;
      const title = `${l.year} ${l.brand} ${l.model} ${l.variant || ''}`.trim();
      const shareUrl = location.origin + '/#/car/' + l.id;
      const waText = encodeURIComponent(`${title} – ${lakh(l.asking_price)}\n${shareUrl}`);
      const compare = store.get('compare', []);
      const inCompare = compare.includes(l.id);
      const groups = {};
      (d.inspection?.items || []).forEach((i) => (groups[i.category] ||= []).push(i));
      const available = l.status === 'live';
      view.innerHTML = `
        <a href="javascript:history.back()" class="muted">← ${t('back')}</a>
        <div class="detail" style="margin-top:10px">
          <div>
            <div class="gallery">${d.photos.length ? d.photos.map((p) => `<img src="${esc(p.url)}" alt="${esc(title)}" loading="lazy">`).join('') : '<div class="ph">🚘</div>'}</div>
            <div class="panel" style="margin-top:14px">
              <h1 style="font-size:1.3rem">${esc(title)}</h1>
              <div class="row"><span class="price" style="font-size:1.5rem">${lakh(l.asking_price)}</span>${statusBadge(l.status)}${gradeBadge(d.inspection?.grade)}</div>
              ${d.estimate ? `<p class="muted">${t('fairPrice')}: ${lakh(d.estimate.min)} – ${lakh(d.estimate.max)}</p>` : ''}
              <div class="row" style="margin-top:10px">
                <a class="btn wa" id="wa" href="https://wa.me/${esc(d.supportPhone)}?text=${waText}" target="_blank" rel="noopener">💬 ${t('whatsapp')}</a>
                ${d.supportPhone ? `<a class="btn secondary" id="call" href="tel:${esc(d.supportPhone)}">📞 ${t('call')}</a>` : ''}
                <button class="btn secondary" id="wish">${d.wishlisted ? '❤️ ' + t('saved') : '🤍 ' + t('wishlist')}</button>
                <button class="btn secondary" id="cmp">${inCompare ? '✔ ' + t('inCompare') : '⚖ ' + t('addCompare')}</button>
                <button class="btn secondary" id="share">🔗 ${t('share')}</button>
              </div>
            </div>
            <div class="panel"><h2>${t('specs')}</h2>
              <div class="kv">
                <div><b>${t('year')}</b>${esc(l.year)}</div><div><b>${t('km')}</b>${Number(l.km_driven).toLocaleString('en-IN')} km</div>
                <div><b>${t('fuel')}</b>${esc(l.fuel)}</div><div><b>${t('transmission')}</b>${esc(l.transmission)}</div>
                <div><b>${t('owners')}</b>${ownersText(l.owners)}</div><div><b>${t('city')}</b>${esc(l.city || '')}</div>
                <div><b>Reg.</b>${esc(l.reg_number || '')}</div><div><b>${t('color')}</b>${esc(l.color || '—')}</div>
                <div><b>${t('accident')}</b>${l.accident ? t('yes') : t('no')}</div><div><b>${t('rcVerified')}</b>${l.rc_status === 'verified' ? '✔ ' + t('yes') : t('no')}</div>
              </div>
              ${l.description ? `<h3 style="margin-top:14px">${t('description')}</h3><p>${esc(l.description)}</p>` : ''}
              <p class="muted">${t('seller')}: ${esc(d.seller.name)}, ${esc(d.seller.city || '')}</p>
            </div>
            ${d.inspection ? `<div class="panel"><h2>${t('inspectionReport')}</h2>
              <p>${t('grade')} <b>${esc(d.inspection.grade)}</b> · ${t('score')} <b>${esc(d.inspection.score)}/100</b></p>
              ${Object.entries(groups).map(([cat, items]) => `<details><summary><b>${esc(cat)}</b> <span class="muted">(${items.length})</span></summary>
                ${items.map((i) => `<div class="check-item"><span><span class="dot ${esc(i.condition)}"></span>${esc(i.item)}${i.note ? ` <span class="muted">– ${esc(i.note)}</span>` : ''}</span><span class="muted">${t(i.condition)}</span></div>`).join('')}
              </details>`).join('')}
            </div>` : ''}
          </div>
          <div>
            <div class="panel"><h2>${t('emi')}</h2>
              <form id="emi">
                <label>${t('loanAmount')}<input name="p" type="number" value="${Math.round(l.asking_price * 0.8)}"></label>
                <div class="form-grid"><label>${t('interest')}<input name="r" type="number" step="0.1" value="11"></label>
                <label>${t('tenure')}<select name="n">${options([12, 24, 36, 48, 60], 48)}</select></label></div>
              </form>
              <div class="price" id="emiOut"></div>
            </div>
            ${available ? `
            <div class="panel"><h2>🚗 ${t('testDrive')}</h2>
              <form id="td"><label>${t('slot')}<input name="slotTime" type="datetime-local" required></label>
                <label class="check"><input type="checkbox" name="atHome">${t('atHome')}</label>
                <button class="btn block" type="submit">${t('book')}</button></form>
            </div>
            <div class="panel"><h2>🔒 ${t('token')}</h2><p class="muted">${t('tokenNote')}</p>
              <form id="tok"><label>₹<select name="amount">${options([[1000, '₹1,000'], [2000, '₹2,000'], [5000, '₹5,000']], 2000)}</select></label>
                <button class="btn accent block" type="submit">${t('pay')}</button></form>
            </div>` : ''}
          </div>
        </div>`;
      const emi = () => {
        const f = formData($('#emi')); const p = +f.p, r = +f.r / 1200, n = +f.n;
        const v = r ? (p * r * (1 + r) ** n) / ((1 + r) ** n - 1) : p / n;
        $('#emiOut').textContent = inr(Math.round(v)) + ' ' + t('perMonth');
      };
      $('#emi').oninput = emi; emi();
      const lead = (source) => api(`/api/listings/${l.id}/lead`, { method: 'POST', body: { source } }).catch(() => {});
      $('#wa').onclick = () => lead('whatsapp');
      if ($('#call')) $('#call').onclick = () => lead('call');
      $('#share').onclick = async () => {
        if (navigator.share) navigator.share({ title, url: shareUrl }).catch(() => {});
        else { await navigator.clipboard?.writeText(shareUrl); toast('Link copied'); }
      };
      $('#wish').onclick = async () => {
        if (!requireLogin()) return;
        const r = await api(`/api/listings/${l.id}/wishlist`, { method: 'POST' });
        $('#wish').textContent = r.wishlisted ? '❤️ ' + t('saved') : '🤍 ' + t('wishlist');
      };
      $('#cmp').onclick = () => {
        let c = store.get('compare', []);
        if (c.includes(l.id)) c = c.filter((x) => x !== l.id);
        else if (c.length >= 3) return toast('Compare up to 3 cars');
        else c.push(l.id);
        store.set('compare', c); render();
      };
      if (available) {
        $('#td').onsubmit = async (e) => {
          e.preventDefault(); if (!requireLogin()) return;
          const f = formData(e.target);
          try { await api(`/api/listings/${l.id}/test-drive`, { method: 'POST', body: { slotTime: f.slotTime, atHome: !!f.atHome } }); toast('✔ Test drive requested'); location.hash = '#/account'; }
          catch (err) { toast(err.message); }
        };
        $('#tok').onsubmit = async (e) => {
          e.preventDefault(); if (!requireLogin()) return;
          if (!confirm(`${t('pay')} ${inr(e.target.amount.value)}?`)) return;
          try { await api(`/api/listings/${l.id}/token`, { method: 'POST', body: { amount: Number(e.target.amount.value) } }); toast('✔ Car reserved'); location.hash = '#/account'; }
          catch (err) { toast(err.message); }
        };
      }
    },

    async '/compare'() {
      const ids = store.get('compare', []);
      const cars = (await Promise.all(ids.map((id) => api('/api/listings/' + id).catch(() => null)))).filter(Boolean);
      const rowsDef = [
        ['Price', (d) => lakh(d.listing.asking_price)], [t('year'), (d) => d.listing.year], [t('km'), (d) => Number(d.listing.km_driven).toLocaleString('en-IN')],
        [t('fuel'), (d) => d.listing.fuel], [t('transmission'), (d) => d.listing.transmission], [t('owners'), (d) => d.listing.owners],
        [t('grade'), (d) => d.inspection?.grade || '—'], [t('score'), (d) => d.inspection?.score ?? '—'], [t('accident'), (d) => (d.listing.accident ? t('yes') : t('no'))],
      ];
      view.innerHTML = `<h2>${t('compare')}</h2>${cars.length ? `<div class="panel table-wrap"><table>
        <tr><th></th>${cars.map((d) => `<th><a href="#/car/${d.listing.id}">${esc(d.listing.year)} ${esc(d.listing.brand)} ${esc(d.listing.model)}</a></th>`).join('')}</tr>
        ${rowsDef.map(([label, fn]) => `<tr><td class="muted">${esc(label)}</td>${cars.map((d) => `<td>${esc(fn(d))}</td>`).join('')}</tr>`).join('')}
        </table></div>` : `<div class="empty">${t('noItems')}</div>`}`;
    },

    async '/sell'() {
      if (!requireLogin()) return;
      const cat = await getCatalog();
      const year = new Date().getFullYear();
      view.innerHTML = `
        <h2>${t('sellTitle')}</h2>
        <form id="sell" class="panel">
          <h3>${t('step')} 1 · Car details</h3>
          <label>${t('regNumber')}<input name="regNumber" required maxlength="13" style="text-transform:uppercase" placeholder="GJ01AB1234"></label>
          <div class="form-grid">
            <label>${t('brand')}<select name="brand" required>${options(brands(cat), '', '—')}</select></label>
            <label>${t('model')}<select name="model" required><option value="">—</option></select></label>
            <label>${t('variant')}<input name="variant" maxlength="40"></label>
            <label>${t('year')}<select name="year" required>${options(Array.from({ length: 20 }, (_, i) => year - i), year - 4)}</select></label>
            <label>${t('fuel')}<select name="fuel">${options(cat.fuels, 'Petrol')}</select></label>
            <label>${t('transmission')}<select name="transmission">${options(cat.transmissions, 'Manual')}</select></label>
            <label>${t('km')}<input name="kmDriven" type="number" min="0" required value="40000"></label>
            <label>${t('owners')}<select name="owners">${options([1, 2, 3, 4], 1)}</select></label>
            <label>${t('color')}<input name="color" maxlength="30"></label>
            <label>${t('city')}<input name="city" maxlength="60" value="${esc(state.user.city || '')}"></label>
          </div>
          <label class="check"><input type="checkbox" name="accident">${t('hadAccident')}</label>
          <button class="btn secondary" type="button" id="est">${t('getPrice')}</button>
          <div id="estOut"></div>
          <h3 style="margin-top:16px">${t('step')} 2 · Photos & price</h3>
          <label>${t('photos')}<input type="file" id="photos" accept="image/*" multiple></label>
          <div class="previews" id="previews"></div>
          <label>${t('askingPrice')}<input name="askingPrice" type="number" min="10000" step="1000"></label>
          <label>${t('description')}<textarea name="description" rows="3" maxlength="1000"></textarea></label>
          <div class="field">${t('saleType')}
            <label class="check"><input type="radio" name="type" value="marketplace" checked>${t('marketplace')}</label>
            <label class="check"><input type="radio" name="type" value="instant">${t('instant')}</label>
          </div>
          <h3 style="margin-top:16px">${t('step')} 3 · Free inspection</h3>
          <div class="form-grid">
            <label>${t('inspSlot')}<input name="inspectionSlot" type="datetime-local" required></label>
            <label>${t('inspAddress')}<input name="inspectionAddress" required maxlength="300"></label>
          </div>
          <button class="btn block" type="submit">${t('submitListing')}</button>
        </form>`;
      const form = $('#sell');
      const photos = [];
      form.brand.onchange = () => {
        form.model.innerHTML = options(cat.models.filter((m) => m.brand === form.brand.value).map((m) => m.model), '', '—');
      };
      const body = () => {
        const f = formData(form);
        return { ...f, regNumber: f.regNumber.toUpperCase().replace(/\s+/g, ''), accident: !!f.accident, year: +f.year, kmDriven: +f.kmDriven, owners: +f.owners,
          askingPrice: f.askingPrice ? +f.askingPrice : undefined };
      };
      $('#est').onclick = async () => {
        try {
          const b = body();
          const e = await api('/api/estimate', { method: 'POST', body: b });
          $('#estOut').innerHTML = `<div class="estimate"><div class="muted">${t('estimate')}</div><div class="price">${lakh(e.min)} – ${lakh(e.max)}</div><div class="muted">${t('estNote')}</div></div>`;
          if (!form.askingPrice.value) form.askingPrice.value = e.price;
        } catch (err) { toast(err.message); }
      };
      $('#photos').onchange = async (e) => {
        for (const file of [...e.target.files].slice(0, 8 - photos.length)) photos.push(await compressImage(file));
        $('#previews').innerHTML = photos.map((p) => `<img src="${p}" alt="">`).join('');
        e.target.value = '';
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('[type=submit]'); btn.disabled = true;
        try {
          await api('/api/sell', { method: 'POST', body: { ...body(), photos } });
          toast(t('listingSubmitted')); location.hash = '#/account';
        } catch (err) { toast(err.message); btn.disabled = false; }
      };
    },

    async '/login'(params) {
      if (state.user) { location.hash = '#' + (params.next || '/account'); return; }
      view.innerHTML = `
        <div class="panel" style="max-width:420px;margin:20px auto">
          <h2>${t('login')}</h2>
          <form id="otpForm"><label>${t('mobile')}<input name="mobile" inputmode="numeric" pattern="[6-9][0-9]{9}" maxlength="10" required placeholder="98XXXXXXXX"></label>
            <button class="btn block" type="submit">${t('sendOtp')}</button></form>
          <form id="verifyForm" style="display:none;margin-top:14px">
            <div id="devOtp" class="estimate" style="display:none"></div>
            <label>${t('otp')}<input name="otp" inputmode="numeric" maxlength="6" required></label>
            <label>${t('yourName')}<input name="name" maxlength="80"></label>
            <label>${t('city')}<input name="city" maxlength="60"></label>
            <button class="btn block" type="submit">${t('verify')}</button></form>
          <p class="muted" style="margin-top:14px">Demo accounts: admin 9999999999 · inspector 8888888888 · seller 7777777777</p>
        </div>`;
      let mobile;
      $('#otpForm').onsubmit = async (e) => {
        e.preventDefault(); mobile = e.target.mobile.value;
        try {
          const r = await api('/api/auth/otp', { method: 'POST', body: { mobile } });
          $('#verifyForm').style.display = 'block';
          if (r.devOtp) { $('#devOtp').style.display = 'block'; $('#devOtp').textContent = `${t('devOtp')}: ${r.devOtp}`; $('#verifyForm').otp.value = r.devOtp; }
        } catch (err) { toast(err.message); }
      };
      $('#verifyForm').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await api('/api/auth/verify', { method: 'POST', body: { mobile, ...formData(e.target) } });
          setSession(r.token, r.user);
          const home = { admin: '/admin', inspector: '/inspector' }[r.user.role] || '/account';
          location.hash = '#' + (params.next || home);
        } catch (err) { toast(err.message); }
      };
    },

    async '/account'() {
      if (!requireLogin()) return;
      const [{ listings }, { bookings }, { listings: wish }] = await Promise.all([api('/api/my/listings'), api('/api/my/bookings'), api('/api/my/wishlist')]);
      view.innerHTML = `
        <div class="panel row" style="justify-content:space-between">
          <div><h2 style="margin:0">${esc(state.user.name)}</h2><span class="muted">+91 ${esc(state.user.mobile)} · ${esc(state.user.role)}</span></div>
          <button class="btn secondary small" id="logout">${t('logout')}</button>
        </div>
        <h2>${t('myListings')}</h2>
        <div class="panel table-wrap">${listings.length ? `<table><tr><th>Car</th><th>Price</th><th>${t('status')}</th><th>${t('inspections')}</th><th>${t('leads')}</th></tr>
          ${listings.map((l) => `<tr><td><a href="#/car/${l.id}">${esc(l.year)} ${esc(l.brand)} ${esc(l.model)}</a><div class="muted">${esc(l.type)}</div></td><td>${lakh(l.asking_price)}${l.final_price ? `<div class="muted">sold ${lakh(l.final_price)}</div>` : ''}</td>
            <td>${statusBadge(l.status)}</td><td>${l.inspection ? statusBadge(l.inspection.status) + (l.inspection.grade ? ' ' + esc(l.inspection.grade) : '') : '—'}</td><td>${l.leads} · ${l.bookings} bookings</td></tr>`).join('')}</table>`
          : `<div class="empty">${t('noItems')} <a href="#/sell">${t('sellCar')} →</a></div>`}</div>
        <h2>${t('myBookings')}</h2>
        <div class="panel table-wrap">${bookings.length ? `<table><tr><th>Car</th><th>Type</th><th>${t('status')}</th><th></th></tr>
          ${bookings.map((b) => `<tr><td><a href="#/car/${b.listing_id}">${esc(b.year)} ${esc(b.brand)} ${esc(b.model)}</a></td>
            <td>${b.type === 'token' ? 'Token ' + inr(b.amount) : 'Test drive' + (b.at_home ? ' (home)' : '')}<div class="muted">${esc((b.slot_time || b.created_at || '').replace('T', ' '))}</div></td>
            <td>${statusBadge(b.status)}</td>
            <td>${['requested', 'confirmed', 'paid'].includes(b.status) && b.listing_status !== 'sold' ? `<button class="btn small danger" data-cancel="${b.id}">${t('cancel')}</button>` : ''}</td></tr>`).join('')}</table>`
          : `<div class="empty">${t('noItems')}</div>`}</div>
        <h2>${t('wishlist')}</h2><div class="grid">${listOrEmpty(wish, carCard)}</div>`;
      $('#logout').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); setSession(null, null); location.hash = '#/'; };
      view.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => {
        if (!confirm(t('cancel') + '?')) return;
        try { await api(`/api/bookings/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('✔'); render(); } catch (err) { toast(err.message); }
      }));
    },

    async '/inspector'() {
      if (!requireLogin()) return;
      const { jobs } = await api('/api/inspector/jobs');
      view.innerHTML = `<h2>${t('todayJobs')}</h2>${listOrEmpty(jobs, (j) => `
        <div class="panel"><div class="row" style="justify-content:space-between">
          <div><h3 style="margin:0">${esc(j.year)} ${esc(j.brand)} ${esc(j.model)} ${esc(j.variant || '')}</h3>
            <div class="muted">${esc(j.reg_number)} · ${esc(j.fuel)} · ${Number(j.km_driven).toLocaleString('en-IN')} km</div>
            ${j.slot_time || j.address ? `<div class="muted">🕒 ${esc((j.slot_time || '').replace('T', ' '))} · 📍 ${esc(j.address || '')}</div>` : ''}
            <div class="muted">👤 ${esc(j.seller_name)} · <a href="tel:${esc(j.seller_mobile)}">${esc(j.seller_mobile)}</a>
              ${j.address ? ` · <a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.address)}">Map</a>` : ''}</div></div>
          ${j.status === 'done' ? `${statusBadge('done')} ${t('grade')} ${esc(j.grade)} (${esc(j.score)})` : `<a class="btn" href="#/inspect/${j.id}">${t('startInspection')}</a>`}
        </div></div>`)}`;
    },

    async '/inspect/:id'({ id }) {
      if (!requireLogin()) return;
      const { checklist } = await api('/api/checklist');
      let n = 0;
      view.innerHTML = `<a href="#/inspector" class="muted">← ${t('back')}</a><h2 style="margin-top:10px">${t('inspectionReport')} #${esc(id)}</h2>
        <form id="insp">${Object.entries(checklist).map(([cat, items]) => `<div class="panel"><h3>${esc(cat)}</h3>
          ${items.map((item) => { const k = n++; return `<div class="check-item" data-cat="${esc(cat)}" data-item="${esc(item)}" data-k="${k}">
            <span style="flex:1">${esc(item)}<input name="note${k}" placeholder="note" maxlength="300" style="margin-top:4px;padding:6px 8px"></span>
            <span class="opts">${['good', 'fair', 'poor'].map((c) => `<label><input type="radio" name="c${k}" value="${c}" ${c === 'good' ? 'checked' : ''}><span class="dot ${c}"></span>${t(c)}</label>`).join('')}</span></div>`; }).join('')}
          </div>`).join('')}
          <div class="panel">
            <label class="check"><input type="checkbox" name="accident">${t('hadAccident')}</label>
            <label class="check"><input type="checkbox" name="rcVerified" checked>${t('rcChecked')}</label>
            <label>${t('summary')}<textarea name="summary" rows="3" maxlength="1000"></textarea></label>
            <button class="btn block" type="submit">${t('submitReport')}</button>
          </div></form>`;
      $('#insp').onsubmit = async (e) => {
        e.preventDefault();
        const f = formData(e.target);
        const items = [...view.querySelectorAll('.check-item')].map((el) => ({
          category: el.dataset.cat, item: el.dataset.item, condition: f['c' + el.dataset.k], note: f['note' + el.dataset.k] || undefined }));
        try {
          const r = await api(`/api/inspector/jobs/${id}`, { method: 'POST', body: { items, accident: !!f.accident, rcVerified: !!f.rcVerified, summary: f.summary } });
          toast(`✔ ${t('grade')} ${r.grade} · ${r.score}/100 · ${lakh(r.estimate.min)}–${lakh(r.estimate.max)}`);
          location.hash = '#/inspector';
        } catch (err) { toast(err.message); }
      };
    },

    async '/admin'(params) {
      if (!requireLogin()) return;
      const tab = params.tab || 'dashboard';
      const tabs = ['dashboard', 'listings', 'inspections', 'bookings', 'rc', 'users'];
      const label = { dashboard: t('dashboard'), listings: t('listings'), inspections: t('inspections'), bookings: t('bookings'), rc: t('rcTransfers'), users: t('users') };
      const head = `<h2>${t('admin')}</h2><div class="tabs">${tabs.map((x) => `<a href="#/admin?tab=${x}" class="${x === tab ? 'active' : ''}">${label[x]}</a>`).join('')}</div>`;
      const act = async (path, body, msg = '✔') => { try { await api(path, { method: 'POST', body }); toast(msg); render(); } catch (err) { toast(err.message); } };

      if (tab === 'dashboard') {
        const s = await api('/api/admin/stats');
        const tiles = [['Live cars', s.listings.live || 0], ['Pending approval', s.listings.pending || 0], ['Booked', s.listings.booked || 0], ['Sold', s.listings.sold || 0],
          [t('leads'), s.leads], ['Test drives', s.testDrives], ['Pending inspections', s.pendingInspections], [t('pendingRc'), s.pendingRc],
          [t('escrow'), lakh(s.escrowHeld)], [t('revenue'), lakh(s.revenue)], [t('salesValue'), lakh(s.salesValue)], [t('users'), s.users]];
        view.innerHTML = head + `<div class="stats">${tiles.map(([k, v]) => `<div class="stat"><span class="muted">${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
      }
      if (tab === 'listings') {
        const status = params.status || 'pending';
        const { listings } = await api('/api/admin/listings?status=' + status);
        view.innerHTML = head + `<div class="tabs">${['pending', 'live', 'booked', 'sold', 'rejected'].map((s) => `<a href="#/admin?tab=listings&status=${s}" class="${s === status ? 'active' : ''}">${s}</a>`).join('')}</div>
          <div class="panel table-wrap">${listings.length ? `<table><tr><th>Car</th><th>Seller</th><th>Price</th><th>${t('grade')}</th><th></th></tr>
          ${listings.map((l) => `<tr><td><a href="#/car/${l.id}">#${l.id} ${esc(l.year)} ${esc(l.brand)} ${esc(l.model)}</a><div class="muted">${esc(l.reg_number)} · ${esc(l.type)}</div></td>
            <td>${esc(l.seller_name)}<div class="muted">${esc(l.seller_mobile)}</div></td><td>${lakh(l.asking_price)}${l.final_price ? `<div class="muted">sold ${lakh(l.final_price)}</div>` : ''}</td><td>${esc(l.grade || '—')}</td>
            <td class="row">${['pending', 'rejected'].includes(l.status) ? `<button class="btn small" data-approve="${l.id}">${t('approve')}</button>` : ''}
              ${l.status === 'live' ? `<button class="btn small secondary" data-feature="${l.id}">★ 7d</button>` : ''}
              ${l.status === 'pending' || l.status === 'live' ? `<button class="btn small danger" data-reject="${l.id}">${t('reject')}</button>` : ''}
              ${['live', 'booked'].includes(l.status) ? `<button class="btn small accent" data-sold="${l.id}" data-price="${l.asking_price}">${t('markSold')}</button>` : ''}</td></tr>`).join('')}</table>`
          : `<div class="empty">${t('noItems')}</div>`}</div>`;
        view.querySelectorAll('[data-approve]').forEach((b) => (b.onclick = () => act(`/api/admin/listings/${b.dataset.approve}/status`, { status: 'live' })));
        view.querySelectorAll('[data-feature]').forEach((b) => (b.onclick = () => act(`/api/admin/listings/${b.dataset.feature}/status`, { status: 'live', featuredDays: 7 })));
        view.querySelectorAll('[data-reject]').forEach((b) => (b.onclick = () => confirm(t('reject') + '?') && act(`/api/admin/listings/${b.dataset.reject}/status`, { status: 'rejected' })));
        view.querySelectorAll('[data-sold]').forEach((b) => (b.onclick = () => {
          const price = prompt(t('finalPrice'), b.dataset.price); if (!price) return;
          const rto = prompt('RTO office', 'GJ01 Ahmedabad') || undefined;
          act(`/api/admin/listings/${b.dataset.sold}/sold`, { finalPrice: Number(price), rtoOffice: rto }, '✔ Sold – payment held in escrow');
        }));
      }
      if (tab === 'inspections') {
        const { inspections, inspectors } = await api('/api/admin/inspections');
        view.innerHTML = head + `<div class="panel table-wrap">${inspections.length ? `<table><tr><th>Car</th><th>Slot / address</th><th>${t('status')}</th><th>Inspector</th></tr>
          ${inspections.map((i) => `<tr><td>${esc(i.year)} ${esc(i.brand)} ${esc(i.model)}<div class="muted">${esc(i.reg_number)}</div></td>
            <td>${esc((i.slot_time || '—').replace('T', ' '))}<div class="muted">${esc(i.address || '')}</div></td>
            <td>${statusBadge(i.status)} ${i.grade ? esc(i.grade) + ' (' + esc(i.score) + ')' : ''}</td>
            <td>${i.status === 'done' ? esc(i.inspector_name || '') : `<div class="row"><select data-sel="${i.id}" style="width:auto;margin:0">${options(inspectors.map((x) => [x.id, x.name]), i.inspector_id)}</select>
              <button class="btn small" data-assign="${i.id}">${t('assign')}</button></div>`}</td></tr>`).join('')}</table>` : `<div class="empty">${t('noItems')}</div>`}</div>`;
        view.querySelectorAll('[data-assign]').forEach((b) => (b.onclick = () =>
          act(`/api/admin/inspections/${b.dataset.assign}/assign`, { inspectorId: Number(view.querySelector(`[data-sel="${b.dataset.assign}"]`).value) })));
      }
      if (tab === 'bookings') {
        const { bookings } = await api('/api/admin/bookings');
        view.innerHTML = head + `<div class="panel table-wrap">${bookings.length ? `<table><tr><th>Car</th><th>Buyer</th><th>Type</th><th>${t('status')}</th><th></th></tr>
          ${bookings.map((b) => `<tr><td><a href="#/car/${b.listing_id}">${esc(b.year)} ${esc(b.brand)} ${esc(b.model)}</a></td><td>${esc(b.buyer_name)}<div class="muted">${esc(b.buyer_mobile)}</div></td>
            <td>${b.type === 'token' ? 'Token ' + inr(b.amount) : 'Test drive' + (b.at_home ? ' (home)' : '')}<div class="muted">${esc((b.slot_time || '').replace('T', ' '))}</div></td><td>${statusBadge(b.status)}</td>
            <td class="row">${b.type === 'test_drive' && b.status === 'requested' ? `<button class="btn small" data-confirm="${b.id}">${t('confirm')}</button>` : ''}
              ${['requested', 'confirmed', 'paid'].includes(b.status) ? `<button class="btn small danger" data-cancel="${b.id}">${b.type === 'token' ? 'Refund' : t('cancel')}</button>` : ''}</td></tr>`).join('')}</table>` : `<div class="empty">${t('noItems')}</div>`}</div>`;
        view.querySelectorAll('[data-confirm]').forEach((b) => (b.onclick = () => act(`/api/admin/bookings/${b.dataset.confirm}/confirm`)));
        view.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = () => confirm('Sure?') && act(`/api/bookings/${b.dataset.cancel}/cancel`)));
      }
      if (tab === 'rc') {
        const { transfers } = await api('/api/admin/rc');
        view.innerHTML = head + `<p class="muted">Seller is paid (price − commission) once RC transfer is filed. File within 7 days of delivery.</p>
          <div class="panel table-wrap">${transfers.length ? `<table><tr><th>Car</th><th>RTO</th><th>${t('status')}</th><th></th></tr>
          ${transfers.map((r) => `<tr><td>${esc(r.brand)} ${esc(r.model)}<div class="muted">${esc(r.reg_number)} · ${lakh(r.final_price)}</div></td><td>${esc(r.rto_office || '—')}<div class="muted">${esc(r.filed_on || '')}</div></td>
            <td>${statusBadge(r.status)}</td><td class="row">${r.status === 'pending' ? `<button class="btn small" data-rc="${r.id}" data-s="filed">${t('filed')}</button>` : ''}
            ${r.status !== 'completed' ? `<button class="btn small secondary" data-rc="${r.id}" data-s="completed">${t('completed')}</button>` : ''}</td></tr>`).join('')}</table>` : `<div class="empty">${t('noItems')}</div>`}</div>`;
        view.querySelectorAll('[data-rc]').forEach((b) => (b.onclick = () => act(`/api/admin/rc/${b.dataset.rc}`, { status: b.dataset.s })));
      }
      if (tab === 'users') {
        const { users } = await api('/api/admin/users');
        view.innerHTML = head + `<div class="panel table-wrap"><table><tr><th>Name</th><th>${t('mobile')}</th><th>Role</th><th>${t('city')}</th></tr>
          ${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.mobile)}</td><td>${esc(u.role)}</td><td>${esc(u.city || '')}</td></tr>`).join('')}</table></div>`;
      }
    },
  };

  // Resize photos in the browser so uploads stay small on 4G.
  function compressImage(file, max = 1280) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // ---------- router ----------
  function renderTabbar() {
    const role = state.user?.role;
    const items = [['/', '🏠', t('home')], ['/buy', '🔍', t('buy')], ['/sell', '💰', t('sell')]];
    if (role === 'inspector') items.push(['/inspector', '🛠', t('inspector')]);
    if (role === 'admin') items.push(['/admin', '📊', t('admin')], ['/inspector', '🛠', t('inspector')]);
    items.push([state.user ? '/account' : '/login', '👤', state.user ? t('account') : t('login')]);
    const current = location.hash.slice(1).split('?')[0] || '/';
    $('#tabbar').innerHTML = items.map(([href, icon, label]) => `<a href="#${href}" class="${current === href ? 'active' : ''}"><span>${icon}</span>${esc(label)}</a>`).join('');
  }

  async function render() {
    const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
    const params = Object.fromEntries(new URLSearchParams(query));
    let handler = routes[path];
    if (!handler) {
      for (const [pattern, fn] of Object.entries(routes)) {
        const m = new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$').exec(path);
        if (m && pattern.includes(':')) { handler = fn; Object.assign(params, m.groups); break; }
      }
    }
    renderTabbar();
    document.documentElement.lang = state.lang;
    if (!handler) { view.innerHTML = `<div class="empty">Page not found. <a href="#/">${t('home')}</a></div>`; return; }
    renderSeq++;
    view.innerHTML = '<div class="empty">…</div>';
    try { await handler(params); window.scrollTo(0, 0); }
    catch (err) { if (err === STALE) return; view.innerHTML = `<div class="empty">${esc(err.message)}<br><a href="#/">${t('home')}</a></div>`; }
  }

  $('#lang').value = state.lang;
  $('#lang').onchange = (e) => { state.lang = e.target.value; store.set('lang', state.lang); render(); };
  window.addEventListener('hashchange', render);
  render();
})();
