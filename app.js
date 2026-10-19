'use strict';

// ── STORAGE ───────────────────────────────────────────────────────────────────
// Item/category/pin/lang keys are unchanged from earlier versions so existing data loads as-is.
const K = {
  items: 'base-inv-v6', cats: 'base-inv-cats-v6', pinned: 'base-inv-pinned-v6', lang: 'base-inv-lang',
  pack: 'base-inv-pack-v1', prefs: 'base-inv-prefs-v1', collapsed: 'base-inv-collapsed-v1', view: 'base-inv-view-v1',
};

const S = {
  items: [], cats: [], pinned: [], collapsed: [],
  pack: { done: [], prev: {} },          // prev: qty before an item was ticked in Pack, so unticking restores it
  prefs: { theme: 'dark', sort: 'missing', lastExport: 0, hidePacked: false },
  lang: 'he', view: 'inv',
  filter: { status: 'all', loc: '', cat: '', q: '' },
};

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function normalizeItems(list) {
  const seen = new Set();
  let next = Date.now();
  return (Array.isArray(list) ? list : []).filter(i => i && String(i.name || '').trim()).map(i => {
    let id = Number(i.id);
    if (!Number.isFinite(id) || seen.has(id)) id = next++;
    seen.add(id);
    const target = Math.max(1, parseInt(i.target, 10) || 1);
    return {
      id, name: String(i.name).trim(), target,
      qty: Math.max(0, parseInt(i.qty, 10) || 0),
      cat: String(i.cat || ''),
      location: ['bag', 'closet'].includes(i.location) ? i.location : '',
      note: String(i.note || ''),
    };
  });
}

function load() {
  let raw = readJSON(K.items, null);
  if (!raw) {
    // migrate older versions
    for (const key of ['base-inv-v5', 'base-inventory-v4', 'base-inventory-v5']) {
      const old = readJSON(key, null);
      if (old) { raw = old.map(i => ({ ...i, location: i.location || i.bag || '' })); break; }
    }
  }
  S.items = normalizeItems(raw || []);
  S.cats = readJSON(K.cats, []).filter(c => typeof c === 'string' && c);
  healCats();
  S.pinned = readJSON(K.pinned, []).filter(c => S.cats.includes(c));
  S.collapsed = readJSON(K.collapsed, []);
  S.pack = { done: [], prev: {}, ...readJSON(K.pack, {}) };
  S.prefs = { ...S.prefs, ...readJSON(K.prefs, {}) };
  S.lang = localStorage.getItem(K.lang) === 'en' ? 'en' : 'he';
  S.view = ['inv', 'pack', 'settings'].includes(localStorage.getItem(K.view)) ? localStorage.getItem(K.view) : 'inv';
}

// any category referenced by an item but missing from the list gets added back
function healCats() {
  S.items.forEach(it => { if (it.cat && !S.cats.includes(it.cat)) S.cats.push(it.cat); });
}

function save() {
  try {
    localStorage.setItem(K.items, JSON.stringify(S.items));
    localStorage.setItem(K.cats, JSON.stringify(S.cats));
    localStorage.setItem(K.pinned, JSON.stringify(S.pinned));
    localStorage.setItem(K.collapsed, JSON.stringify(S.collapsed));
    localStorage.setItem(K.pack, JSON.stringify(S.pack));
    localStorage.setItem(K.prefs, JSON.stringify(S.prefs));
  } catch {
    toast(t('save_fail'));
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);
const byId = id => S.items.find(i => i.id === id);
const isFull = it => it.qty >= it.target;
const need = it => Math.max(0, it.target - it.qty);
const status = it => it.qty >= it.target ? 'ok' : it.qty === 0 ? 'zero' : 'low';
const collator = () => new Intl.Collator(S.lang === 'he' ? 'he' : 'en', { numeric: true, sensitivity: 'base' });
const sameName = (a, b) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function buzz(ms = 8) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
function newId() { return Math.max(Date.now(), ...S.items.map(i => i.id + 1)); }

function stats() {
  const total = S.items.length;
  const full = S.items.filter(isFull).length;
  return {
    total, full, miss: total - full,
    units: S.items.reduce((s, i) => s + need(i), 0),
    bag: S.items.filter(i => i.location === 'bag').length,
    closet: S.items.filter(i => i.location === 'closet').length,
    pct: total ? Math.round(full / total * 100) : 0,
  };
}

// Group a list by category: pinned first (in pin order), then alphabetical, uncategorised last.
function groupByCat(list) {
  const groups = new Map();
  list.forEach(it => { const g = it.cat || ''; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); });
  const col = collator();
  const order = [...groups.keys()].sort((a, b) => {
    if (!a) return 1; if (!b) return -1;
    const pa = S.pinned.indexOf(a), pb = S.pinned.indexOf(b);
    if (pa >= 0 && pb >= 0) return pa - pb;
    if (pa >= 0) return -1; if (pb >= 0) return 1;
    return col.compare(a, b);
  });
  return order.map(cat => [cat, groups.get(cat)]);
}

function ring(pct, size = 72, stroke = 8) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring${pct === 100 ? ' ring-done' : ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle class="ring-bg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

function locBadge(loc) {
  if (!loc) return '';
  return `<span class="loc-badge ${loc}">${loc === 'bag' ? '🎒' : '🗄️'} ${t(loc === 'bag' ? 'loc_bag' : 'loc_closet')}</span>`;
}

// ── INVENTORY VIEW ────────────────────────────────────────────────────────────
function renderTop() {
  const st = stats();
  $('#topSub').textContent = st.total ? t('sub', st.full, st.total) : t('sub_empty');
  document.body.classList.toggle('is-empty', !st.total);
}

function renderHero() {
  const st = stats(), el = $('#hero');
  if (!st.total) {
    el.innerHTML = `<div class="hero hero-welcome">
      <div class="hero-emoji">👋</div>
      <h2>${t('welcome_t')}</h2>
      <p>${t('welcome_d')}</p>
      <ul class="howto">
        <li><b>🗄️ ${t('loc_closet_long')}</b> — ${t('loc_closet_desc')}</li>
        <li><b>🎒 ${t('loc_bag_long')}</b> — ${t('loc_bag_desc')}</li>
        <li><b>🧳 ${t('tab_pack')}</b> — ${t('welcome_pack')}</li>
      </ul>
      <div class="hero-actions">
        <button class="btn btn-primary" data-action="add">+ ${t('add_first')}</button>
        <button class="btn btn-soft" data-action="starter">✨ ${t('starter')}</button>
      </div>
    </div>`;
    return;
  }
  const done = st.miss === 0;
  el.innerHTML = `<div class="hero ${done ? 'hero-done' : ''}">
    <div class="hero-ring">${ring(st.pct)}<span class="hero-pct">${st.pct}%</span></div>
    <div class="hero-body">
      <div class="hero-title">${done ? t('hero_full_t') : t('hero_miss_t', st.miss)}</div>
      <div class="hero-sub">${done ? t('hero_full_d') : t('hero_miss_d', st.units)}</div>
      <div class="hero-meta">
        <button class="mini-stat" data-action="loc" data-v="closet">🗄️ ${st.closet}</button>
        <button class="mini-stat" data-action="loc" data-v="bag">🎒 ${st.bag}</button>
        <span class="mini-stat plain">✓ ${st.full}/${st.total}</span>
      </div>
    </div>
    ${done ? '' : `<button class="hero-cta" data-action="view" data-v="pack" aria-label="${esc(t('go_pack'))}">🧳<span>${t('go_pack')}</span></button>`}
  </div>`;
}

function renderFilters() {
  const f = S.filter, st = stats();
  document.querySelectorAll('#statusSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === f.status));
  document.querySelectorAll('.chip-loc').forEach(b => b.classList.toggle('active', b.dataset.v === f.loc));
  $('#cntMissing').textContent = st.miss ? st.miss : '';
  $('.search-clear').hidden = !f.q;
  $('#toolbar').hidden = !st.total;

  const missByCat = {};
  S.items.forEach(i => { if (!isFull(i)) missByCat[i.cat] = (missByCat[i.cat] || 0) + 1; });
  const cats = groupByCat(S.items).map(([c]) => c).filter(Boolean);
  $('#catChips').innerHTML = cats.length < 2 ? '' : cats.map(c => `
    <button class="chip${f.cat === c ? ' active' : ''}" data-action="cat" data-v="${esc(c)}">
      ${S.pinned.includes(c) ? '📌 ' : ''}${esc(c)}${missByCat[c] ? `<span class="chip-dot">${missByCat[c]}</span>` : ''}
    </button>`).join('');
}

function filtered() {
  const f = S.filter, q = f.q.trim().toLocaleLowerCase();
  return S.items.filter(i =>
    (f.status !== 'missing' || !isFull(i)) &&
    (f.status !== 'full' || isFull(i)) &&
    (!f.loc || i.location === f.loc) &&
    (!f.cat || i.cat === f.cat) &&
    (!q || i.name.toLocaleLowerCase().includes(q) || i.note.toLocaleLowerCase().includes(q)));
}

function itemHTML(it) {
  const st = status(it), n = need(it);
  const pct = Math.min(100, Math.round(it.qty / it.target * 100));
  return `<div class="item s-${st}" data-id="${it.id}">
    <button class="item-main" data-action="edit" data-id="${it.id}">
      <span class="item-name">${esc(it.name)}</span>
      <span class="item-meta">
        ${n ? `<span class="need-pill">${t('need', n)}</span>` : ''}
        ${it.qty > it.target ? `<span class="spare-pill">${t('spare', it.qty - it.target)}</span>` : ''}
        ${locBadge(it.location)}
        ${it.note ? `<span class="note">📝 ${esc(it.note)}</span>` : ''}
      </span>
    </button>
    <div class="stepper">
      <button class="step-btn" data-action="dec" data-id="${it.id}" aria-label="-1"${it.qty === 0 ? ' disabled' : ''}>−</button>
      <button class="step-val" data-action="qty-input" data-id="${it.id}" aria-label="${esc(t('f_qty'))}"><b>${it.qty}</b><small>/${it.target}</small></button>
      <button class="step-btn" data-action="inc" data-id="${it.id}" aria-label="+1">+</button>
    </div>
    <div class="item-bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

function groupHeadHTML(cat, list, collapsed) {
  const full = list.filter(isFull).length, miss = list.length - full;
  return `<button class="group-head${collapsed ? ' collapsed' : ''}" data-action="toggle-group" data-v="${esc(cat)}" aria-expanded="${!collapsed}">
    <span class="chev" aria-hidden="true">▾</span>
    <span class="group-name">${S.pinned.includes(cat) ? '📌 ' : ''}${esc(cat || t('no_cat'))}</span>
    <span class="group-stat ${miss ? 'bad' : 'ok'}">${miss ? t('need_items', miss) : '✓'}</span>
    <span class="group-count">${full}/${list.length}</span>
  </button>`;
}

function renderList() {
  const el = $('#list');
  if (!S.items.length) { el.innerHTML = ''; return; }
  const list = filtered();
  if (!list.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔎</div><p>${t('empty_filter')}</p>
      <button class="btn btn-soft" data-action="clear-filters">${t('clear_filters')}</button></div>`;
    return;
  }
  const col = collator();
  const searching = !!S.filter.q.trim();
  el.innerHTML = groupByCat(list).map(([cat, arr]) => {
    arr.sort((a, b) => {
      if (S.prefs.sort === 'missing') { const d = Number(isFull(a)) - Number(isFull(b)); if (d) return d; }
      return col.compare(a.name, b.name);
    });
    const collapsed = !searching && S.collapsed.includes(cat);
    return `<section class="group">${groupHeadHTML(cat, arr, collapsed)}
      <div class="group-body"${collapsed ? ' hidden' : ''}>${arr.map(itemHTML).join('')}</div></section>`;
  }).join('');
}

// Update a single item row in place (no re-sort, so rows don't jump under your thumb).
function patchItem(id) {
  const it = byId(id), el = document.querySelector(`.item[data-id="${id}"]`);
  if (it && el) {
    el.outerHTML = itemHTML(it);
    const group = document.querySelector(`.item[data-id="${id}"]`).closest('.group');
    const ids = [...group.querySelectorAll('.item')].map(e => Number(e.dataset.id));
    const head = group.querySelector('.group-head');
    head.outerHTML = groupHeadHTML(it.cat, ids.map(byId).filter(Boolean), false);
  }
  renderTop(); renderHero(); renderFilters(); renderBadge();
}

function renderInv() { renderTop(); renderHero(); renderFilters(); renderList(); renderBadge(); }

function flashItem(id) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`.item[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1300);
  });
}

function changeQty(id, d) {
  const it = byId(id); if (!it) return;
  const v = Math.max(0, it.qty + d);
  if (v === it.qty) return;
  it.qty = v; buzz(); save(); patchItem(id);
  if (d > 0 && it.qty === it.target) {
    const el = document.querySelector(`.item[data-id="${id}"]`);
    if (el) { el.classList.add('pop'); }
  }
}

function startQtyEdit(btn, id) {
  const it = byId(id); if (!it) return;
  const inp = document.createElement('input');
  inp.type = 'number'; inp.inputMode = 'numeric'; inp.min = '0'; inp.className = 'step-input'; inp.value = it.qty;
  btn.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = ok => {
    if (done) return; done = true;
    const v = parseInt(inp.value, 10);
    if (ok && !isNaN(v) && v >= 0) { it.qty = v; save(); }
    patchItem(id);
  };
  inp.addEventListener('blur', () => commit(true));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    if (e.key === 'Escape') commit(false);
  });
}

// ── PACK VIEW ─────────────────────────────────────────────────────────────────
// "Bring" = not in the bag and short at base (or already ticked this trip).
// "Bag"   = everything tagged 🎒 — a checklist you run every trip.
function packData() {
  const done = new Set(S.pack.done.filter(id => byId(id)));
  const bring = S.items.filter(i => i.location !== 'bag' && (!isFull(i) || done.has(i.id)));
  const bag = S.items.filter(i => i.location === 'bag');
  const all = [...bring, ...bag];
  return { done, bring, bag, total: all.length, packed: all.filter(i => done.has(i.id)).length };
}

function renderBadge() {
  const p = packData(), left = p.total - p.packed, b = $('#packBadge');
  b.hidden = !left; b.textContent = left;
}

function packItemHTML(it, done, kind) {
  const n = done ? 0 : need(it);
  const pill = kind === 'bring'
    ? (n ? `<span class="pill pill-need">${t('bring_n', n)}</span>` : '')
    : (n ? `<span class="pill pill-need">${t('need', n)}</span>` : it.target > 1 ? `<span class="pill">×${it.target}</span>` : '');
  const sub = it.note ? esc(it.note) : '';  // category is already the section header
  return `<button class="pack-item${done ? ' done' : ''} k-${kind}" data-action="pack-toggle" data-id="${it.id}" aria-pressed="${done}">
    <span class="check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
    <span class="pi-main"><span class="pi-name">${esc(it.name)}</span>${sub ? `<span class="pi-sub">${sub}</span>` : ''}</span>
    ${pill}
  </button>`;
}

function packSection(kind, list, done) {
  const col = collator();
  const shown = S.prefs.hidePacked ? list.filter(i => !done.has(i.id)) : list;
  const packed = list.filter(i => done.has(i.id)).length;
  const head = `<div class="pack-sec-head">
    <div><h3>${kind === 'bring' ? '📦 ' + t('pack_bring') : '🎒 ' + t('pack_bag')}</h3>
    <p>${kind === 'bring' ? t('pack_bring_d') : t('pack_bag_d')}</p></div>
    ${list.length ? `<span class="pack-sec-count">${packed}/${list.length}</span>` : ''}
  </div>`;
  if (!list.length) {
    return `<section class="pack-sec">${head}<div class="pack-empty">${kind === 'bring' ? t('pack_empty_bring') : t('pack_empty_bag')}</div></section>`;
  }
  if (!shown.length) {
    return `<section class="pack-sec">${head}<div class="pack-empty">✓ ${t('pack_sec_done')}</div></section>`;
  }
  const sorted = [...shown].sort((a, b) => col.compare(a.name, b.name));
  const body = groupByCat(sorted).map(([cat, arr]) =>
    `<div class="pack-cat">${esc(cat || t('no_cat'))}</div>` + arr.map(i => packItemHTML(i, done.has(i.id), kind)).join('')
  ).join('');
  return `<section class="pack-sec">${head}${body}</section>`;
}

function renderPack() {
  const p = packData();
  const pct = p.total ? Math.round(p.packed / p.total * 100) : 100;
  const ready = p.total > 0 && p.packed === p.total;
  $('#packHero').innerHTML = `<div class="hero pack-hero${ready ? ' hero-done' : ''}">
    <div class="hero-ring">${ring(pct)}<span class="hero-pct">${p.packed}/${p.total}</span></div>
    <div class="hero-body">
      <div class="hero-title">${!p.total ? t('pack_nothing_t') : ready ? t('pack_ready_t') : t('pack_left', p.total - p.packed)}</div>
      <div class="hero-sub">${!p.total ? t('pack_nothing_d') : ready ? t('pack_ready_d') : t('pack_hint')}</div>
    </div>
  </div>
  <div class="pack-tools">
    <button class="btn btn-soft btn-sm" data-action="pack-share">📤 ${t('pack_share')}</button>
    <button class="btn btn-soft btn-sm" data-action="pack-reset"${p.packed ? '' : ' disabled'}>↺ ${t('pack_reset')}</button>
    <label class="switch"><input type="checkbox" id="hidePacked"${S.prefs.hidePacked ? ' checked' : ''}><span class="switch-ui"></span>${t('pack_hide')}</label>
  </div>`;
  $('#packList').innerHTML = S.items.length
    ? packSection('bring', p.bring, p.done) + packSection('bag', p.bag, p.done)
    : `<div class="empty"><div class="empty-ico">🧳</div><p>${t('pack_no_items')}</p>
       <button class="btn btn-primary" data-action="add">+ ${t('add_first')}</button></div>`;
  renderBadge();
}

function packToggle(id) {
  const it = byId(id); if (!it) return;
  const done = new Set(S.pack.done);
  if (done.has(id)) {
    done.delete(id);
    if (id in S.pack.prev) { it.qty = S.pack.prev[id]; delete S.pack.prev[id]; }
  } else {
    done.add(id);
    // ticking something that's short means you now have the full amount
    if (it.qty < it.target) { S.pack.prev[id] = it.qty; it.qty = it.target; }
    buzz(12);
  }
  S.pack.done = [...done];
  save();
  const before = packData();
  renderPack(); renderTop();
  if (before.total && before.packed === before.total) { buzz([30, 40, 30]); }
}

function packReset() {
  const snap = JSON.parse(JSON.stringify(S.pack));
  S.pack = { done: [], prev: {} };
  save(); renderPack();
  toast(t('pack_reset_done'), () => { S.pack = snap; save(); renderPack(); });
}

function listText(kind) {
  const lines = [];
  const date = new Date().toLocaleDateString(S.lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'numeric' });
  if (kind === 'pack') {
    const p = packData();
    lines.push(t('share_head', date));
    const sec = (title, list, kind2) => {
      const left = list.filter(i => !p.done.has(i.id));
      if (!left.length) return;
      lines.push('', title);
      left.forEach(i => {
        const n = kind2 === 'bring' ? need(i) : (need(i) || (i.target > 1 ? i.target : 0));
        lines.push(`☐ ${i.name}${n ? ` ×${n}` : ''}${i.note ? ` (${i.note})` : ''}`);
      });
    };
    sec('📦 ' + t('pack_bring'), p.bring, 'bring');
    sec('🎒 ' + t('pack_bag'), p.bag, 'bag');
    if (lines.length === 1) lines.push('', t('pack_ready_t'));
  } else {
    lines.push(`🎖️ ${t('title')} — ${date}`);
    groupByCat(S.items).forEach(([cat, arr]) => {
      lines.push('', `▸ ${cat || t('no_cat')}`);
      arr.forEach(i => lines.push(`${isFull(i) ? '✓' : '✗'} ${i.name} ${i.qty}/${i.target}${i.location ? ' ' + (i.location === 'bag' ? '🎒' : '🗄️') : ''}`));
    });
  }
  return lines.join('\n');
}

async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast(t('copied')); }
  catch { toast(t('copy_fail')); }
}

// ── SETTINGS VIEW ─────────────────────────────────────────────────────────────
function segHTML(action, current, opts) {
  return `<div class="seg">${opts.map(([v, label]) =>
    `<button data-action="${action}" data-v="${v}" class="${v === current ? 'active' : ''}">${label}</button>`).join('')}</div>`;
}

function renderSettings() {
  const counts = {};
  S.items.forEach(i => { counts[i.cat] = (counts[i.cat] || 0) + 1; });
  const col = collator();
  const cats = [...S.cats].sort((a, b) => {
    const pa = S.pinned.indexOf(a), pb = S.pinned.indexOf(b);
    if (pa >= 0 && pb >= 0) return pa - pb;
    if (pa >= 0) return -1; if (pb >= 0) return 1;
    return col.compare(a, b);
  });
  const last = S.prefs.lastExport;
  const stale = !last || Date.now() - last > 30 * 864e5;
  const backup = last
    ? t('backup_last', new Date(last).toLocaleDateString(S.lang === 'he' ? 'he-IL' : 'en-GB'))
    : t('backup_never');

  $('#view-settings').innerHTML = `
  <div class="card">
    <h3 class="card-title">${t('set_display')}</h3>
    <div class="set-row"><span>${t('set_lang')}</span>${segHTML('set-lang', S.lang, [['he', 'עברית'], ['en', 'English']])}</div>
    <div class="set-row"><span>${t('set_theme')}</span>${segHTML('set-theme', S.prefs.theme, [['dark', '🌙 ' + t('th_dark')], ['light', '☀️ ' + t('th_light')], ['auto', t('th_auto')]])}</div>
    <div class="set-row"><span>${t('set_sort')}</span>${segHTML('set-sort', S.prefs.sort, [['missing', t('sort_missing')], ['az', t('sort_az')]])}</div>
  </div>

  <div class="card">
    <h3 class="card-title">${t('set_cats')}</h3>
    <form class="inline-form" data-form="add-cat">
      <input class="input" id="newCat" autocomplete="off" placeholder="${esc(t('cat_ph'))}">
      <button class="btn btn-soft" type="submit">${t('add')}</button>
    </form>
    <div class="cat-list">
      ${cats.length ? cats.map(c => `
        <div class="cat-row" data-cat="${esc(c)}">
          <button class="pin${S.pinned.includes(c) ? ' on' : ''}" data-action="cat-pin" data-v="${esc(c)}" aria-label="${esc(t('pin'))}" title="${esc(t('pin'))}">📌</button>
          <button class="cat-name" data-action="cat-rename" data-v="${esc(c)}" title="${esc(t('rename'))}">${esc(c)} <span class="pencil">✎</span></button>
          <span class="cat-count">${t('n_items', counts[c] || 0)}</span>
          <button class="icon-btn icon-btn-sm danger" data-action="cat-del" data-v="${esc(c)}" aria-label="${esc(t('delete'))}">🗑</button>
        </div>`).join('') : `<p class="muted">${t('no_cats')}</p>`}
    </div>
    <p class="hint">${t('cats_hint')}</p>
  </div>

  <div class="card">
    <h3 class="card-title">${t('set_data')}</h3>
    <div class="backup-note${stale && S.items.length ? ' warn' : ''}">${stale && S.items.length ? '⚠️ ' : '💾 '}${backup}</div>
    <div class="btn-grid">
      <button class="btn btn-soft" data-action="export">📤 ${t('export')}</button>
      <button class="btn btn-soft" data-action="import">📥 ${t('import')}</button>
      <button class="btn btn-soft" data-action="copy-text">📋 ${t('copy_text')}</button>
      <button class="btn btn-soft" data-action="starter">✨ ${t('starter')}</button>
    </div>
  </div>

  <div class="card card-danger">
    <h3 class="card-title">${t('set_danger')}</h3>
    <div class="btn-grid">
      <button class="btn btn-danger-ghost" data-action="reset-qty">🔄 ${t('reset_qty')}</button>
      <button class="btn btn-danger-ghost" data-action="wipe">🗑 ${t('wipe')}</button>
    </div>
  </div>
  <p class="about">${t('about')}</p>`;
}

function renameCat(btn, oldName) {
  const inp = document.createElement('input');
  inp.className = 'input input-sm'; inp.value = oldName;
  btn.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const commit = ok => {
    if (done) return; done = true;
    const v = inp.value.trim();
    if (ok && v && v !== oldName) {
      if (S.cats.includes(v)) { toast(t('cat_exists')); }
      else {
        const swap = arr => arr.map(c => c === oldName ? v : c);
        S.cats = swap(S.cats); S.pinned = swap(S.pinned); S.collapsed = swap(S.collapsed);
        S.items.forEach(i => { if (i.cat === oldName) i.cat = v; });
        if (S.filter.cat === oldName) S.filter.cat = v;
        save();
      }
    }
    renderSettings();
  };
  inp.addEventListener('blur', () => commit(true));
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    if (e.key === 'Escape') commit(false);
  });
}

async function deleteCat(c) {
  const n = S.items.filter(i => i.cat === c).length;
  const ok = await confirmDialog(t('cat_del_c', c), n ? t('cat_del_s', n) : '', t('delete'));
  if (!ok) return;
  S.cats = S.cats.filter(x => x !== c);
  S.pinned = S.pinned.filter(x => x !== c);
  S.collapsed = S.collapsed.filter(x => x !== c);
  S.items.forEach(i => { if (i.cat === c) i.cat = ''; });
  if (S.filter.cat === c) S.filter.cat = '';
  save(); renderSettings();
}

// ── STARTER LIST ──────────────────────────────────────────────────────────────
const STARTER = [
  // [he name, en name, he cat, en cat, target, location]
  ['מדים', 'Uniform set', 'ביגוד', 'Clothing', 3, 'closet'],
  ['חולצה לבנה', 'T-shirt', 'ביגוד', 'Clothing', 5, 'closet'],
  ['גרביים', 'Socks', 'ביגוד', 'Clothing', 7, 'closet'],
  ['תחתונים', 'Underwear', 'ביגוד', 'Clothing', 7, 'closet'],
  ['פליז', 'Fleece', 'ביגוד', 'Clothing', 1, 'closet'],
  ['מכנסי ספורט', 'Sweatpants', 'ביגוד', 'Clothing', 1, 'closet'],
  ['מגבת', 'Towel', 'היגיינה', 'Hygiene', 2, 'closet'],
  ['כפכפים', 'Flip-flops', 'היגיינה', 'Hygiene', 1, 'closet'],
  ['שמפו', 'Shampoo', 'היגיינה', 'Hygiene', 1, 'closet'],
  ['סבון', 'Soap', 'היגיינה', 'Hygiene', 1, 'closet'],
  ['מברשת שיניים', 'Toothbrush', 'היגיינה', 'Hygiene', 1, 'closet'],
  ['משחת שיניים', 'Toothpaste', 'היגיינה', 'Hygiene', 1, 'closet'],
  ['דאודורנט', 'Deodorant', 'היגיינה', 'Hygiene', 1, 'closet'],
  ['מטען לטלפון', 'Phone charger', 'אלקטרוניקה', 'Electronics', 1, 'bag'],
  ['סוללה ניידת', 'Power bank', 'אלקטרוניקה', 'Electronics', 1, 'bag'],
  ['אוזניות', 'Headphones', 'אלקטרוניקה', 'Electronics', 1, 'bag'],
  ['חוגר', 'Military ID', 'מסמכים', 'Documents', 1, 'bag'],
  ['ארנק', 'Wallet', 'מסמכים', 'Documents', 1, 'bag'],
  ['מפתחות', 'Keys', 'מסמכים', 'Documents', 1, 'bag'],
];

function addStarter() {
  const he = S.lang === 'he';
  let added = 0, id = newId();
  STARTER.forEach(([hn, en, hc, ec, target, location]) => {
    const name = he ? hn : en, cat = he ? hc : ec;
    if (S.items.some(i => sameName(i.name, name))) return;
    // bag items are things you own and carry; base items start empty so you count them
    S.items.push({ id: id++, name, target, qty: location === 'bag' ? target : 0, cat, location, note: '' });
    if (!S.cats.includes(cat)) S.cats.push(cat);
    added++;
  });
  save(); renderAll();
  toast(added ? t('starter_added', added) : t('starter_none'));
}

// ── ITEM SHEET ────────────────────────────────────────────────────────────────
let form = null;   // { mode: 'add'|'edit', id, cat, loc }
const last = { cat: null, loc: '' };

function openItemSheet(id) {
  fillForm(id);
  openOverlay('itemSheet');
  if (form.mode === 'add') setTimeout(() => $('#fName').focus(), 260);
}

function fillForm(id) {
  const it = id != null ? byId(id) : null;
  const defCat = S.filter.cat || (last.cat !== null && (last.cat === '' || S.cats.includes(last.cat)) ? last.cat : (S.cats[0] || ''));
  form = {
    mode: it ? 'edit' : 'add', id: it ? it.id : null,
    cat: it ? it.cat : defCat,
    loc: it ? it.location : (S.filter.loc || last.loc || ''),
  };
  $('#isTitle').textContent = it ? t('sh_edit') : t('sh_add');
  $('#fName').value = it ? it.name : '';
  $('#fTarget').value = it ? it.target : 1;
  $('#fQty').value = it ? it.qty : 0;
  $('#fNote').value = it ? it.note : '';
  $('#fNewCatRow').hidden = true; $('#fNewCat').value = '';
  $('#dupHint').hidden = true;
  $('#fName').classList.remove('invalid');
  renderFormCats(); renderFormLoc(); renderQtyHint();
  $('#sheetActions').innerHTML = it
    ? `<button class="btn btn-danger-ghost" data-action="f-delete">🗑 ${t('delete')}</button>
       <button class="btn btn-primary grow" data-action="f-save">${t('save')}</button>`
    : `<button class="btn btn-soft" data-action="f-save" data-more="1">${t('add_more')}</button>
       <button class="btn btn-primary grow" data-action="f-save">${t('add')}</button>`;
}

function renderFormCats() {
  const opts = [...S.cats, ''];
  $('#fCats').innerHTML = opts.map(c =>
    `<button class="pick${form.cat === c ? ' active' : ''}" data-action="f-cat" data-v="${esc(c)}">${esc(c || t('no_cat'))}</button>`
  ).join('') + `<button class="pick pick-new" data-action="f-newcat">+ ${t('f_new_cat')}</button>`;
}

function renderFormLoc() {
  const opts = [
    ['closet', '🗄️', t('loc_closet_long'), t('loc_closet_desc')],
    ['bag', '🎒', t('loc_bag_long'), t('loc_bag_desc')],
    ['', '—', t('loc_none'), t('loc_none_desc')],
  ];
  $('#fLoc').innerHTML = opts.map(([v, ico, title, desc]) =>
    `<button class="loc-opt ${v || 'none'}${form.loc === v ? ' active' : ''}" data-action="f-loc" data-v="${v}" aria-pressed="${form.loc === v}">
      <span class="loc-ico">${ico}</span><span class="loc-title">${title}</span><span class="loc-desc">${desc}</span>
    </button>`).join('');
}

function formNums() {
  return {
    target: Math.max(1, parseInt($('#fTarget').value, 10) || 1),
    qty: Math.max(0, parseInt($('#fQty').value, 10) || 0),
  };
}

function renderQtyHint() {
  const { target, qty } = formNums(), n = target - qty;
  const el = $('#qtyHint');
  el.className = 'qty-hint ' + (n > 0 ? 'bad' : 'ok');
  el.innerHTML = n > 0
    ? `${t('hint_need', n)} <button class="link" data-action="f-fill">✓ ${t('f_fill')}</button>`
    : n < 0 ? `✓ ${t('hint_spare', -n)}` : `✓ ${t('hint_full')}`;
}

function checkDup() {
  const name = $('#fName').value.trim(), el = $('#dupHint');
  const dup = name && S.items.find(i => sameName(i.name, name) && i.id !== form.id);
  el.hidden = !dup;
  if (dup) {
    el.innerHTML = `⚠️ ${t('dup', esc(dup.name))}` +
      (form.mode === 'add' ? ` <button class="link" data-action="dup-edit" data-id="${dup.id}">${t('dup_edit')}</button>` : '');
  }
}

function submitForm(more) {
  const nameEl = $('#fName'), name = nameEl.value.trim();
  if (!name) {
    nameEl.classList.remove('invalid'); void nameEl.offsetWidth; nameEl.classList.add('invalid');
    nameEl.focus(); return;
  }
  const { target, qty } = formNums();
  const note = $('#fNote').value.trim();
  last.cat = form.cat; last.loc = form.loc;
  if (form.mode === 'edit') {
    const it = byId(form.id); if (!it) return;
    Object.assign(it, { name, target, qty, cat: form.cat, location: form.loc, note });
    save(); closeOverlay('itemSheet'); renderAll(); flashItem(it.id);
    return;
  }
  const it = { id: newId(), name, target, qty, cat: form.cat, location: form.loc, note };
  S.items.push(it);
  save(); renderAll();
  if (more) {
    nameEl.value = ''; $('#fNote').value = ''; $('#fTarget').value = 1; $('#fQty').value = 0;
    $('#dupHint').hidden = true; renderQtyHint();
    nameEl.focus();
    toast(t('added', name));
  } else {
    closeOverlay('itemSheet');
    if (S.view !== 'inv') setView('inv');
    flashItem(it.id);
    toast(t('added', name));
  }
}

function deleteItem(id) {
  const idx = S.items.findIndex(i => i.id === id); if (idx < 0) return;
  const [it] = S.items.splice(idx, 1);
  const packSnap = JSON.parse(JSON.stringify(S.pack));
  S.pack.done = S.pack.done.filter(x => x !== id); delete S.pack.prev[id];
  save(); closeOverlay('itemSheet'); renderAll();
  toast(t('deleted', it.name), () => {
    S.items.splice(idx, 0, it); S.pack = packSnap; healCats(); save(); renderAll(); flashItem(it.id);
  });
}

// ── OVERLAYS (with Android back-button support) ───────────────────────────────
function openOverlay(id) {
  const o = document.getElementById(id);
  clearTimeout(o._t);
  o.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
  document.body.classList.add('locked');
  if (id === 'itemSheet' && !(history.state && history.state.ov)) history.pushState({ ov: id }, '');
}
function hideOverlay(id) {
  const o = document.getElementById(id);
  o.classList.remove('show');
  o._t = setTimeout(() => {
    o.hidden = true;
    if (!document.querySelector('.overlay.show')) document.body.classList.remove('locked');
  }, 220);
}
function closeOverlay(id) {
  if (id === 'itemSheet' && history.state && history.state.ov === id) history.back();  // popstate hides it
  else hideOverlay(id);
}
window.addEventListener('popstate', () => {
  if ($('#confirm').classList.contains('show')) confirmDone(false);
  if ($('#itemSheet').classList.contains('show')) hideOverlay('itemSheet');
});

let confirmCb = null;
function confirmDialog(msg, sub, okLabel) {
  return new Promise(resolve => {
    confirmCb = resolve;
    $('#confirmMsg').textContent = msg;
    $('#confirmSub').textContent = sub || '';
    $('#confirmYes').textContent = okLabel || t('confirm');
    $('#confirmNo').textContent = t('cancel');
    openOverlay('confirm');
    setTimeout(() => $('#confirmNo').focus(), 50);
  });
}
function confirmDone(v) {
  hideOverlay('confirm');
  if (confirmCb) { const cb = confirmCb; confirmCb = null; cb(v); }
}

// ── TOAST (with undo) ─────────────────────────────────────────────────────────
let toastTimer = null, toastUndo = null;
function toast(msg, undo) {
  $('#toastMsg').textContent = msg;
  toastUndo = undo || null;
  const u = $('#toastUndo'); u.hidden = !undo; u.textContent = t('undo');
  const el = $('#toast'); el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); toastUndo = null; }, undo ? 5000 : 2400);
}

// ── DATA ──────────────────────────────────────────────────────────────────────
function exportData() {
  const data = { version: 3, exported: new Date().toISOString(), items: S.items, cats: S.cats, pinned: S.pinned };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `base-inventory-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  S.prefs.lastExport = Date.now(); save(); renderSettings();
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!Array.isArray(data.items)) throw new Error('bad');
      const incoming = normalizeItems(data.items);
      const ok = await confirmDialog(t('import_c'), t('import_s', S.items.length, incoming.length), t('import_ok_btn'));
      if (!ok) return;
      const snap = snapshot();
      S.items = incoming;
      S.cats = Array.isArray(data.cats) ? data.cats.filter(c => typeof c === 'string' && c) : [];
      healCats();
      S.pinned = (Array.isArray(data.pinned) ? data.pinned : S.pinned).filter(c => S.cats.includes(c));
      S.pack = { done: [], prev: {} };
      save(); renderAll();
      toast(t('imported', S.items.length), () => restore(snap));
    } catch {
      toast(t('import_bad'));
    }
  };
  reader.readAsText(file);
}

function snapshot() { return JSON.parse(JSON.stringify({ items: S.items, cats: S.cats, pinned: S.pinned, pack: S.pack })); }
function restore(snap) { Object.assign(S, snap); save(); renderAll(); }

async function resetQty() {
  const ok = await confirmDialog(t('reset_c'), t('reset_s'), t('reset_btn'));
  if (!ok) return;
  const snap = snapshot();
  S.items.forEach(i => { i.qty = 0; });
  S.pack = { done: [], prev: {} };
  save(); renderAll();
  toast(t('reset_done'), () => restore(snap));
}

async function wipeAll() {
  const ok = await confirmDialog(t('wipe_c'), t('wipe_s'), t('delete'));
  if (!ok) return;
  const snap = snapshot();
  S.items = []; S.cats = []; S.pinned = []; S.pack = { done: [], prev: {} };
  S.filter = { status: 'all', loc: '', cat: '', q: '' }; $('#q').value = '';
  save(); renderAll();
  toast(t('wiped'), () => restore(snap));
}

// ── VIEW / THEME / LANG ───────────────────────────────────────────────────────
function setView(v) {
  S.view = v;
  try { localStorage.setItem(K.view, v); } catch {}
  ['inv', 'pack', 'settings'].forEach(x => { $('#view-' + x).hidden = x !== v; });
  document.querySelectorAll('.tab').forEach(b => {
    const on = b.dataset.v === v;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  document.body.dataset.view = v;
  renderAll();
  window.scrollTo(0, 0);
}

function renderAll() {
  renderTop(); renderBadge();
  if (S.view === 'inv') renderInv();
  else if (S.view === 'pack') renderPack();
  else renderSettings();
}

function applyTheme() {
  const th = S.prefs.theme;
  document.documentElement.dataset.theme = th;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0b0d14' : '#f4f5fb');
}

function applyLang() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = t('dir');
  document.title = t('title');
  $('#langBtn').textContent = t('lang_btn');
  document.querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = t(e.dataset.i18nPh); });
}

function setLang(l) {
  S.lang = l;
  try { localStorage.setItem(K.lang, l); } catch {}
  applyLang(); renderAll();
}

// ── EVENTS ────────────────────────────────────────────────────────────────────
const ACTIONS = {
  'view': el => setView(el.dataset.v),
  'toggle-lang': () => setLang(S.lang === 'he' ? 'en' : 'he'),
  'add': () => openItemSheet(null),
  'edit': (el, id) => openItemSheet(id),
  'inc': (el, id) => changeQty(id, 1),
  'dec': (el, id) => changeQty(id, -1),
  'qty-input': (el, id) => startQtyEdit(el, id),

  'status': el => { S.filter.status = el.dataset.v; renderInv(); },
  'loc': el => {
    S.filter.loc = S.filter.loc === el.dataset.v ? '' : el.dataset.v;
    if (S.view !== 'inv') setView('inv'); else renderInv();
  },
  'cat': el => { S.filter.cat = S.filter.cat === el.dataset.v ? '' : el.dataset.v; renderInv(); },
  'clear-q': () => { S.filter.q = ''; $('#q').value = ''; renderInv(); $('#q').focus(); },
  'clear-filters': () => { S.filter = { status: 'all', loc: '', cat: '', q: '' }; $('#q').value = ''; renderInv(); },
  'toggle-group': el => {
    const c = el.dataset.v, i = S.collapsed.indexOf(c);
    if (i >= 0) S.collapsed.splice(i, 1); else S.collapsed.push(c);
    save(); renderList();
  },

  'pack-toggle': (el, id) => packToggle(id),
  'pack-reset': () => packReset(),
  'pack-share': () => shareText(listText('pack')),

  'close-sheet': () => closeOverlay('itemSheet'),
  'f-step': el => {
    const inp = el.dataset.f === 'target' ? $('#fTarget') : $('#fQty');
    const min = el.dataset.f === 'target' ? 1 : 0;
    inp.value = Math.max(min, (parseInt(inp.value, 10) || 0) + Number(el.dataset.d));
    buzz(); renderQtyHint();
  },
  'f-fill': () => { $('#fQty').value = formNums().target; buzz(); renderQtyHint(); },
  'f-cat': el => { form.cat = el.dataset.v; $('#fNewCatRow').hidden = true; renderFormCats(); },
  'f-newcat': () => { $('#fNewCatRow').hidden = false; $('#fNewCat').focus(); },
  'f-newcat-ok': () => addCatFromForm(),
  'f-loc': el => { form.loc = el.dataset.v; renderFormLoc(); },
  'f-save': el => submitForm(!!el.dataset.more),
  'f-delete': () => deleteItem(form.id),
  'dup-edit': (el, id) => fillForm(id),

  'confirm-yes': () => confirmDone(true),
  'confirm-no': () => confirmDone(false),
  'undo': () => {
    const fn = toastUndo; toastUndo = null;
    $('#toast').classList.remove('show');
    if (fn) fn();
  },

  'set-lang': el => setLang(el.dataset.v),
  'set-theme': el => { S.prefs.theme = el.dataset.v; save(); applyTheme(); renderSettings(); },
  'set-sort': el => { S.prefs.sort = el.dataset.v; save(); renderSettings(); },
  'cat-pin': el => {
    const c = el.dataset.v, i = S.pinned.indexOf(c);
    if (i >= 0) S.pinned.splice(i, 1); else S.pinned.push(c);
    save(); renderSettings();
  },
  'cat-rename': el => renameCat(el, el.dataset.v),
  'cat-del': el => deleteCat(el.dataset.v),
  'export': () => exportData(),
  'import': () => $('#importFile').click(),
  'copy-text': () => shareText(listText('all')),
  'starter': () => addStarter(),
  'reset-qty': () => resetQty(),
  'wipe': () => wipeAll(),
};

function addCatFromForm() {
  const v = $('#fNewCat').value.trim();
  if (!v) { $('#fNewCat').focus(); return; }
  if (!S.cats.includes(v)) { S.cats.push(v); save(); }
  form.cat = v; $('#fNewCat').value = ''; $('#fNewCatRow').hidden = true;
  renderFormCats();
}

function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action]; if (!fn) return;
    const id = el.dataset.id != null ? Number(el.dataset.id) : null;
    fn(el, id, e);
  });

  // tap on the dimmed backdrop closes overlays
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => {
    if (e.target !== o) return;
    if (o.id === 'confirm') confirmDone(false); else closeOverlay(o.id);
  }));

  $('#q').addEventListener('input', e => { S.filter.q = e.target.value; renderFilters(); renderList(); });
  $('#fName').addEventListener('input', () => { $('#fName').classList.remove('invalid'); checkDup(); });
  ['#fTarget', '#fQty'].forEach(s => $(s).addEventListener('input', renderQtyHint));
  ['#fName', '#fNote'].forEach(s => $(s).addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitForm(form.mode === 'add'); }
  }));
  $('#fNewCat').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCatFromForm(); } });
  // select-all on focus makes typing a new number painless
  ['#fTarget', '#fQty'].forEach(s => $(s).addEventListener('focus', e => e.target.select()));

  document.addEventListener('change', e => {
    if (e.target.id === 'hidePacked') { S.prefs.hidePacked = e.target.checked; save(); renderPack(); }
    if (e.target.id === 'importFile') { const f = e.target.files[0]; if (f) importData(f); e.target.value = ''; }
  });
  document.addEventListener('submit', e => {
    if (e.target.dataset.form !== 'add-cat') return;
    e.preventDefault();
    const inp = $('#newCat'), v = inp.value.trim();
    if (!v) return;
    if (S.cats.includes(v)) { toast(t('cat_exists')); return; }
    S.cats.push(v); save(); renderSettings(); $('#newCat').focus();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#confirm').classList.contains('show')) confirmDone(false);
    else if ($('#itemSheet').classList.contains('show')) closeOverlay('itemSheet');
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  // keep multiple open tabs in sync
  window.addEventListener('storage', e => { if (e.key && e.key.startsWith('base-inv')) { load(); renderAll(); } });
}

// ── I18N ──────────────────────────────────────────────────────────────────────
const STRINGS = {
  he: {
    dir: 'rtl', lang_btn: 'EN', title: 'ציוד בבסיס',
    tab_inv: 'ציוד', tab_pack: 'אריזה', tab_settings: 'הגדרות', fab: 'פריט',
    sub: (f, n) => `${f} מתוך ${n} במקום`, sub_empty: 'בוא נבנה את הרשימה',
    search_ph: 'חיפוש פריט או הערה...',
    st_all: 'הכל', st_missing: 'חסר', st_full: 'מלא',
    loc_bag: 'תיק', loc_closet: 'ארון', loc_none: 'ללא מיקום',
    loc_bag_long: 'נוסע איתי', loc_bag_desc: 'בתיק בכל יציאה וחזרה',
    loc_closet_long: 'נשאר בבסיס', loc_closet_desc: 'קבוע בארון, לא זז',
    loc_none_desc: 'בלי מיקום קבוע',
    welcome_t: 'ברוך הבא!', welcome_d: 'רשום את הציוד שלך פעם אחת — ותמיד תדע מה חסר בבסיס ומה לארוז לפני יציאה.',
    welcome_pack: 'רשימת אריזה אוטומטית לפני כל יציאה',
    add_first: 'הוסף פריט', starter: 'רשימה בסיסית מוכנה',
    hero_miss_t: n => n === 1 ? 'חסר פריט אחד' : `חסרים ${n} פריטים`,
    hero_miss_d: n => `${n} יחידות להשלים בבסיס`,
    hero_full_t: 'הכל במקום 💪', hero_full_d: 'אין מה להביא כרגע',
    go_pack: 'לאריזה',
    need: n => `חסר ${n}`, spare: n => `+${n} עודף`, need_items: n => `${n} חסרים`,
    no_cat: 'ללא קטגוריה', empty_filter: 'אין פריטים שמתאימים לסינון', clear_filters: 'נקה סינון',
    sh_add: 'פריט חדש', sh_edit: 'עריכת פריט',
    f_name: 'שם הפריט', f_name_ph: 'למשל: גרביים',
    f_target: 'כמה צריך', f_qty: 'כמה יש', f_fill: 'יש לי הכל',
    hint_need: n => `חסר ${n} —`, hint_full: 'בדיוק מה שצריך', hint_spare: n => `${n} עודף`,
    f_cat: 'קטגוריה', f_new_cat: 'חדשה', f_new_cat_ph: 'שם קטגוריה...',
    f_loc: 'איפה זה נמצא?', f_note: 'הערה', f_note_ph: 'למשל: מידה 42, בכיס הצד', optional: '(לא חובה)',
    add: 'הוסף', add_more: 'הוסף ועוד', save: 'שמור', delete: 'מחק', cancel: 'ביטול', confirm: 'אשר', undo: 'בטל',
    dup: n => `"${n}" כבר ברשימה`, dup_edit: 'לערוך אותו',
    added: n => `נוסף: ${n}`, deleted: n => `נמחק: ${n}`,
    pack_bring: 'להביא לבסיס', pack_bring_d: 'חסר בבסיס — לארוז מהבית',
    pack_bag: 'צ׳קליסט תיק', pack_bag_d: 'מה שנוסע איתי בכל פעם',
    pack_left: n => n === 1 ? 'נשאר פריט אחד' : `נשארו ${n} לארוז`,
    pack_hint: 'סימון פריט "להביא" מעדכן את הכמות בבסיס',
    pack_ready_t: '🎉 מוכן לצאת!', pack_ready_d: 'הכל ארוז. דרך צלחה!',
    pack_nothing_t: 'אין מה לארוז', pack_nothing_d: 'הבסיס מלא ואין פריטי תיק',
    bring_n: n => `להביא ${n}`,
    pack_empty_bring: 'אין מה להביא — הבסיס מלא ✓', pack_empty_bag: 'אין פריטי תיק. בעריכת פריט בחר "🎒 נוסע איתי".',
    pack_sec_done: 'הכל ארוז כאן', pack_no_items: 'הרשימה ריקה — הוסף ציוד כדי לקבל רשימת אריזה',
    pack_share: 'שתף', pack_reset: 'יציאה חדשה', pack_hide: 'הסתר ארוזים', pack_reset_done: 'הצ׳קליסט אופס',
    share_head: d => `🧳 רשימת אריזה (${d})`, copied: 'הועתק ללוח 📋', copy_fail: 'ההעתקה נכשלה',
    set_display: 'תצוגה', set_lang: 'שפה', set_theme: 'ערכת צבע', th_dark: 'כהה', th_light: 'בהיר', th_auto: 'אוטו׳',
    set_sort: 'מיון בקטגוריה', sort_missing: 'חסרים קודם', sort_az: 'א-ב',
    set_cats: 'קטגוריות', cat_ph: 'קטגוריה חדשה...', n_items: n => `${n} פריטים`, no_cats: 'אין קטגוריות עדיין',
    cats_hint: '📌 הצמדה מעלה קטגוריה לראש הרשימה · לחיצה על שם משנה אותו',
    pin: 'הצמד למעלה', rename: 'שנה שם', cat_exists: 'קטגוריה בשם הזה כבר קיימת',
    cat_del_c: c => `למחוק את "${c}"?`, cat_del_s: n => `${n} פריטים יעברו ל"ללא קטגוריה"`,
    set_data: 'גיבוי ונתונים', export: 'ייצוא לקובץ', import: 'ייבוא מקובץ', copy_text: 'העתק כטקסט',
    backup_never: 'עוד לא גיבית — הנתונים שמורים רק במכשיר הזה', backup_last: d => `גיבוי אחרון: ${d}`,
    starter_added: n => `נוספו ${n} פריטים נפוצים`, starter_none: 'כל הפריטים הנפוצים כבר ברשימה',
    import_c: 'לייבא רשימה?', import_s: (a, b) => `${a} הפריטים הנוכחיים יוחלפו ב-${b} מהקובץ`, import_ok_btn: 'ייבא',
    imported: n => `יובאו ${n} פריטים`, import_bad: 'קובץ לא תקין',
    set_danger: 'אזור סכנה', reset_qty: 'אפס כמויות ל-0', reset_c: 'לאפס את כל הכמויות ל-0?',
    reset_s: 'שימושי לספירת מלאי מחדש. היעדים נשמרים.', reset_btn: 'אפס', reset_done: 'הכמויות אופסו',
    wipe: 'מחק את כל הרשימה', wipe_c: 'למחוק את כל הפריטים והקטגוריות?', wipe_s: 'אפשר לבטל רק מיד אחרי. מומלץ לייצא קודם.', wiped: 'הרשימה נמחקה',
    save_fail: 'השמירה נכשלה — אין מקום באחסון',
    about: 'הנתונים נשמרים רק בדפדפן הזה. אפשר להוסיף את האפליקציה למסך הבית ולהשתמש בה גם בלי קליטה.',
  },
  en: {
    dir: 'ltr', lang_btn: 'עב', title: 'Base Gear',
    tab_inv: 'Gear', tab_pack: 'Pack', tab_settings: 'Settings', fab: 'Item',
    sub: (f, n) => `${f} of ${n} in place`, sub_empty: "Let's build your list",
    search_ph: 'Search items or notes...',
    st_all: 'All', st_missing: 'Missing', st_full: 'Full',
    loc_bag: 'Bag', loc_closet: 'Closet', loc_none: 'No location',
    loc_bag_long: 'Travels with me', loc_bag_desc: 'In the bag every trip',
    loc_closet_long: 'Stays at base', loc_closet_desc: 'Lives in the closet',
    loc_none_desc: 'No fixed spot',
    welcome_t: 'Welcome!', welcome_d: "List your gear once — always know what's missing at base and what to pack before you leave.",
    welcome_pack: 'an automatic packing list before every trip',
    add_first: 'Add item', starter: 'Starter list',
    hero_miss_t: n => n === 1 ? '1 item missing' : `${n} items missing`,
    hero_miss_d: n => `${n} units to restock at base`,
    hero_full_t: 'All in place 💪', hero_full_d: 'Nothing to bring right now',
    go_pack: 'Pack',
    need: n => `Need ${n}`, spare: n => `+${n} spare`, need_items: n => `${n} missing`,
    no_cat: 'Uncategorized', empty_filter: 'No items match these filters', clear_filters: 'Clear filters',
    sh_add: 'New item', sh_edit: 'Edit item',
    f_name: 'Item name', f_name_ph: 'e.g. Socks',
    f_target: 'How many I need', f_qty: 'How many I have', f_fill: 'I have them all',
    hint_need: n => `Missing ${n} —`, hint_full: 'Exactly what you need', hint_spare: n => `${n} spare`,
    f_cat: 'Category', f_new_cat: 'New', f_new_cat_ph: 'Category name...',
    f_loc: 'Where does it live?', f_note: 'Note', f_note_ph: 'e.g. size 42, side pocket', optional: '(optional)',
    add: 'Add', add_more: 'Add another', save: 'Save', delete: 'Delete', cancel: 'Cancel', confirm: 'Confirm', undo: 'Undo',
    dup: n => `"${n}" is already on the list`, dup_edit: 'Edit it',
    added: n => `Added: ${n}`, deleted: n => `Deleted: ${n}`,
    pack_bring: 'Bring to base', pack_bring_d: 'Missing at base — pack from home',
    pack_bag: 'Bag checklist', pack_bag_d: 'Things that travel with me every time',
    pack_left: n => n === 1 ? '1 item left' : `${n} items left`,
    pack_hint: 'Ticking a "bring" item updates the count at base',
    pack_ready_t: '🎉 Ready to go!', pack_ready_d: 'Everything is packed. Safe trip!',
    pack_nothing_t: 'Nothing to pack', pack_nothing_d: 'Base is fully stocked and no bag items',
    bring_n: n => `Bring ${n}`,
    pack_empty_bring: 'Nothing to bring — base is stocked ✓', pack_empty_bag: 'No bag items. Edit an item and choose "🎒 Travels with me".',
    pack_sec_done: 'All packed here', pack_no_items: 'Your list is empty — add gear to get a packing list',
    pack_share: 'Share', pack_reset: 'New trip', pack_hide: 'Hide packed', pack_reset_done: 'Checklist cleared',
    share_head: d => `🧳 Packing list (${d})`, copied: 'Copied to clipboard 📋', copy_fail: 'Copy failed',
    set_display: 'Display', set_lang: 'Language', set_theme: 'Theme', th_dark: 'Dark', th_light: 'Light', th_auto: 'Auto',
    set_sort: 'Sort in category', sort_missing: 'Missing first', sort_az: 'A–Z',
    set_cats: 'Categories', cat_ph: 'New category...', n_items: n => `${n} items`, no_cats: 'No categories yet',
    cats_hint: '📌 Pin moves a category to the top · tap a name to rename it',
    pin: 'Pin to top', rename: 'Rename', cat_exists: 'A category with that name already exists',
    cat_del_c: c => `Delete "${c}"?`, cat_del_s: n => `${n} items will become uncategorized`,
    set_data: 'Backup & data', export: 'Export file', import: 'Import file', copy_text: 'Copy as text',
    backup_never: "Never backed up — data lives only on this device", backup_last: d => `Last backup: ${d}`,
    starter_added: n => `Added ${n} common items`, starter_none: 'All common items are already on your list',
    import_c: 'Import list?', import_s: (a, b) => `Your ${a} items will be replaced with ${b} from the file`, import_ok_btn: 'Import',
    imported: n => `Imported ${n} items`, import_bad: 'Invalid file',
    set_danger: 'Danger zone', reset_qty: 'Reset counts to 0', reset_c: 'Reset all counts to 0?',
    reset_s: 'Handy for a fresh stock count. Targets are kept.', reset_btn: 'Reset', reset_done: 'Counts reset',
    wipe: 'Delete entire list', wipe_c: 'Delete all items and categories?', wipe_s: 'Undo is only available right after. Export first.', wiped: 'List deleted',
    save_fail: 'Save failed — storage is full',
    about: 'Data is stored only in this browser. Add the app to your home screen to use it offline.',
  },
};

function t(key, ...args) {
  const v = STRINGS[S.lang][key] ?? STRINGS.he[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

// ── INIT ──────────────────────────────────────────────────────────────────────
load();
applyTheme();
applyLang();
bindEvents();
setView(S.view);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
