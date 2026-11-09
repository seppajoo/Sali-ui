import * as A from './analytics.js';

// ---------- Tila & tallennus ----------
const KEY = 'sali.sets.v1';
const SETTINGS_KEY = 'sali.settings.v1';

let sets = load();
let settings = Object.assign({ weeklyGoal: 3, lastExport: null, haptics: true }, safeJSON(localStorage.getItem(SETTINGS_KEY)) || {});

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function load() { const d = safeJSON(localStorage.getItem(KEY)); return Array.isArray(d) ? d : []; }
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(sets)); }
  catch (e) { toast('Tallennus epäonnistui: ' + e.message); }
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
navigator.storage?.persist?.();

// ---------- Haptiikka ----------
// Android: Vibration API. iOS ei tue sitä, mutta iOS 18+ antaa haptisen napsahduksen
// natiivin switch-kytkimen painalluksesta -> painetaan piilotettua kytkintä ohjelmallisesti.
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function haptic(kind = 'tick') {
  if (!settings.haptics) return;
  if (!IS_IOS && navigator.vibrate) {
    navigator.vibrate(kind === 'tick' ? 8 : kind === 'success' ? [18, 60, 28] : 16);
    return;
  }
  if (IS_IOS) {
    try {
      const l = document.createElement('label');
      l.ariaHidden = 'true';
      l.style.display = 'none';
      const i = document.createElement('input');
      i.type = 'checkbox';
      i.setAttribute('switch', '');
      l.appendChild(i);
      document.head.appendChild(l);
      l.click();
      l.remove();
      if (kind === 'success') setTimeout(() => haptic('tick'), 110);
    } catch { /* ei tukea */ }
  }
}

// ---------- Apurit ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date();
const todayStr = () => A.fmtDate(today());
const nf = (n, d = 1) => Number(n).toLocaleString('fi-FI', { maximumFractionDigits: d });
const signed = (n, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '±') + nf(Math.abs(n), d);
const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const MN = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
const daysBetween = (a, b) => Math.round((A.parseDate(b) - A.parseDate(a)) / 864e5);
function fmtDay(s) {
  const d = A.parseDate(s);
  const diff = daysBetween(s, todayStr());
  if (diff === 0) return 'Tänään';
  if (diff === 1) return 'Eilen';
  return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() !== today().getFullYear() ? d.getFullYear() : ''}`;
}
const shortDate = (s) => { const d = A.parseDate(s); return `${d.getDate()}.${d.getMonth() + 1}.`; };
const shortDateY = (s) => { const d = A.parseDate(s); return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`; };
const chevron = '<svg viewBox="0 0 24 24" class="ico-s"><path d="M6 9l6 6 6-6"/></svg>';
const row = (k, v, ks = '', vs = '', cls = '') =>
  `<div class="row"><div class="k">${k}${ks ? `<small>${ks}</small>` : ''}</div><div class="v ${cls}">${v}${vs ? `<small>${vs}</small>` : ''}</div></div>`;
const toneOf = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
const bestSet = (ss, bw) => ss.reduce((b, x) => (bw ? x.reps > b.reps : A.e1rm(x.weight, x.reps) > A.e1rm(b.weight, b.reps)) ? x : b);

let toastTimer;
function toast(msg, action, hot = false) {
  const t = $('#toast');
  t.classList.toggle('hot', hot);
  t.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); t.classList.remove('show'); };
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2000);
}

// ---------- Navigaatio ----------
let currentView = 'log';
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.view !== currentView) haptic('tick');
  show(b.dataset.view);
}));
function show(view) {
  currentView = view;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  render();
  window.scrollTo(0, 0);
}
function render() {
  ({ log: renderLog, progress: renderProgress, activity: renderActivity, history: renderHistory })[currentView]();
}
let resizeT;
let lastW = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; if (currentView === 'progress' || currentView === 'activity') render(); } }, 150);
});

// ---------- Interaktiivinen kaavio ----------
let chartSeq = 0;
/**
 * points: [{x, y, ...}] (line: x = aikaleima; bar: x = indeksi)
 * onScrub(point|null, index)
 */
function mountChart(el, { type = 'line', points, tone = '', onScrub = () => {}, goal = null, xLabel = (p) => '' }) {
  const W = Math.max(280, Math.round(el.clientWidth || 343));
  const H = Math.round(el.clientHeight || (type === 'bar' ? 180 : 220));
  if (!points.length) { el.innerHTML = '<div class="chart-empty">Ei dataa tällä aikavälillä</div>'; return; }
  const id = 'c' + (++chartSeq);
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : 'var(--steel)';
  const T = 22, B = 24;
  const ys = points.map((p) => p.y);
  let xs, svg = '';

  if (type === 'line') {
    const PX = 20;
    let x0 = points[0].x, x1 = points[points.length - 1].x;
    if (x0 === x1) { x0 -= 864e5; x1 += 864e5; }
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const span = hi - lo || Math.abs(hi) * 0.1 || 1;
    lo -= span * 0.15; hi += span * 0.15;
    const sx = (x) => PX + ((x - x0) / (x1 - x0)) * (W - 2 * PX);
    const sy = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    xs = points.map((p) => sx(p.x));
    const pys = points.map((p) => sy(p.y));
    const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${pys[i].toFixed(1)}`).join('');
    const area = `${d}L${xs[xs.length - 1].toFixed(1)},${H - B}L${xs[0].toFixed(1)},${H - B}Z`;
    const iMax = ys.indexOf(Math.max(...ys)), iMin = ys.indexOf(Math.min(...ys));
    const lbl = (i, above) => {
      const anchor = xs[i] < 50 ? 'start' : xs[i] > W - 50 ? 'end' : 'middle';
      return `<text x="${xs[i]}" y="${above ? pys[i] - 9 : pys[i] + 17}" text-anchor="${anchor}">${nf(ys[i], 1)}</text>`;
    };
    svg = `
      <defs>
        <linearGradient id="${id}g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style="stop-color:${color};stop-opacity:.22"/>
          <stop offset="1" style="stop-color:${color};stop-opacity:0"/>
        </linearGradient>
        <clipPath id="${id}k"><rect id="${id}r" x="0" y="0" width="${W}" height="${H}"/></clipPath>
      </defs>
      <line x1="0" x2="${W}" y1="${pys[0]}" y2="${pys[0]}" style="stroke:var(--fg-3);stroke-width:1;stroke-dasharray:2 4;opacity:.7"/>
      <path d="${d}" style="fill:none;stroke:var(--surface-3);stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round"/>
      <g clip-path="url(#${id}k)">
        <path d="${area}" fill="url(#${id}g)"/>
        <path d="${d}" style="fill:none;stroke:${color};stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 5px ${color})"/>
      </g>
      ${points.length > 1 ? lbl(iMax, true) + (iMin !== iMax ? lbl(iMin, false) : '') : ''}
      <circle cx="${xs[xs.length - 1]}" cy="${pys[pys.length - 1]}" r="3.5" style="fill:${color}" id="${id}end"/>
      <text x="${PX}" y="${H - 6}" text-anchor="start">${xLabel(points[0])}</text>
      ${points.length > 1 ? `<text x="${W - PX}" y="${H - 6}" text-anchor="end">${xLabel(points[points.length - 1])}</text>` : ''}
      <g id="${id}x" style="display:none">
        <line id="${id}xl" y1="${T - 12}" y2="${H - B}" style="stroke:var(--fg-2);stroke-width:1"/>
        <circle id="${id}xh" r="10" style="fill:${color};opacity:.2"/>
        <circle id="${id}xd" r="5" style="fill:${color};stroke:var(--bg);stroke-width:2"/>
      </g>`;
    el._pys = pys;
  } else {
    const n = points.length;
    const top = Math.max(goal || 0, ...ys, 1);
    const bw = W / n;
    const sy = (v) => T + (1 - v / top) * (H - T - B);
    xs = points.map((_, i) => bw * i + bw / 2);
    const every = Math.ceil(n / 6);
    svg = points.map((p, i) => {
      const h = Math.max(sy(0) - sy(p.y), 3);
      const met = goal ? p.y >= goal : p.y > 0;
      return `<rect class="b" data-i="${i}" x="${xs[i] - bw * 0.31}" y="${sy(0) - h}" width="${bw * 0.62}" height="${h}" rx="${Math.min(4, bw * 0.2)}"
        style="fill:${met ? `url(#${id}m)` : 'var(--surface-3)'};transition:opacity .12s"/>`
        + ((n - 1 - i) % every === 0 ? `<text x="${xs[i]}" y="${H - 6}" text-anchor="middle">${xLabel(p)}</text>` : '');
    }).join('');
    svg = `<defs><linearGradient id="${id}m" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--accent-hi)"/><stop offset="1" style="stop-color:var(--accent-lo)"/></linearGradient></defs>` + svg;
    if (goal) svg += `<line x1="0" x2="${W}" y1="${sy(goal)}" y2="${sy(goal)}" style="stroke:var(--fg-3);stroke-dasharray:3 4"/>
      <text x="${W}" y="${sy(goal) - 6}" text-anchor="end">tavoite ${goal}</text>`;
  }

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${svg}</svg>`;
  const svgEl = el.querySelector('svg');
  let idx = -1, active = false;

  const nearest = (clientX) => {
    const r = svgEl.getBoundingClientRect();
    const x = (clientX - r.left) * (W / r.width);
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
    return best;
  };
  const set = (i, first) => {
    if (i === idx) return;
    idx = i;
    if (type === 'line') {
      const g = el.querySelector(`#${id}x`);
      g.style.display = '';
      el.querySelector(`#${id}xl`).setAttribute('x1', xs[i]);
      el.querySelector(`#${id}xl`).setAttribute('x2', xs[i]);
      for (const c of ['xh', 'xd']) { const e = el.querySelector(`#${id}${c}`); e.setAttribute('cx', xs[i]); e.setAttribute('cy', el._pys[i]); }
      el.querySelector(`#${id}r`).setAttribute('width', xs[i]);
      el.querySelector(`#${id}end`).style.display = 'none';
    } else {
      el.querySelectorAll('rect.b').forEach((r) => (r.style.opacity = Number(r.dataset.i) === i ? 1 : 0.3));
    }
    haptic(first ? 'tap' : 'tick');
    onScrub(points[i], i);
  };
  const clear = () => {
    if (idx === -1) return;
    idx = -1; active = false;
    if (type === 'line') {
      el.querySelector(`#${id}x`).style.display = 'none';
      el.querySelector(`#${id}r`).setAttribute('width', W);
      el.querySelector(`#${id}end`).style.display = '';
    } else el.querySelectorAll('rect.b').forEach((r) => (r.style.opacity = 1));
    onScrub(null, -1);
  };
  svgEl.addEventListener('pointerdown', (e) => { active = true; svgEl.setPointerCapture?.(e.pointerId); set(nearest(e.clientX), true); });
  svgEl.addEventListener('pointermove', (e) => { if (active || e.pointerType === 'mouse') set(nearest(e.clientX), idx === -1); });
  svgEl.addEventListener('pointerup', (e) => { active = false; if (e.pointerType !== 'mouse') clear(); });
  svgEl.addEventListener('pointercancel', clear);
  svgEl.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') clear(); });
}

// ---------- Kirjaus ----------
const fDate = $('#f-date'), fEx = $('#f-exercise'), fW = $('#f-weight'), fR = $('#f-reps');
fDate.value = todayStr();

document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const inp = b.dataset.step === 'weight' ? fW : fR;
  inp.value = Math.max(b.dataset.step === 'reps' ? 1 : 0, (Number(inp.value) || 0) + Number(b.dataset.delta));
  haptic('tick');
}));
fEx.addEventListener('change', () => { prefill(); renderLog(); });
fDate.addEventListener('change', () => { if (!fDate.value) fDate.value = todayStr(); renderLog(); });

function prefill() {
  const ex = A.normalizeName(fEx.value);
  if (!ex) return;
  const own = sets.filter((s) => s.exercise === ex && s.date <= fDate.value)
    .sort((a, b) => (a.date === b.date ? (a.ts ?? 0) - (b.ts ?? 0) : a.date < b.date ? -1 : 1));
  const last = own[own.length - 1];
  if (last) { fW.value = last.weight; fR.value = last.reps; }
}

$('#log-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const ex = A.normalizeName(fEx.value);
  const weight = Number(String(fW.value).replace(',', '.'));
  const reps = Math.round(Number(fR.value));
  if (!ex || !(weight >= 0) || !(reps >= 1) || !fDate.value) return toast('Tarkista kentät');
  const existing = A.exerciseList(sets).find((n) => n.toLowerCase() === ex.toLowerCase());
  const name = existing || ex;
  const prevBest = Math.max(0, ...sets.filter((s) => s.exercise === name && s.date < fDate.value).map((s) => A.e1rm(s.weight, s.reps)));
  sets.push({ id: uid(), date: fDate.value, exercise: name, weight, reps, ts: Date.now() });
  save();
  fEx.value = name;
  const isPR = prevBest > 0 && A.e1rm(weight, reps) > prevBest;
  toast(isPR ? 'Uusi ennätys' : 'Sarja lisätty', null, isPR);
  haptic(isPR ? 'success' : 'tap');
  renderLog();
});

function deleteSet(id) {
  const idx = sets.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const [removed] = sets.splice(idx, 1);
  save();
  haptic('tap');
  render();
  toast('Sarja poistettu', { label: 'Kumoa', fn: () => { sets.push(removed); save(); render(); } });
}

document.addEventListener('click', (e) => {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const del = t.closest('[data-del]');
  if (del) return deleteSet(del.dataset.del);
  const pick = t.closest('[data-pick]');
  if (pick) { fEx.value = pick.dataset.pick; haptic('tick'); prefill(); return renderLog(); }
  const fill = t.closest('[data-fill]');
  if (fill) { const [w, r] = fill.dataset.fill.split('|'); fW.value = w; fR.value = r; haptic('tick'); return; }
  const go = t.closest('[data-goto-ex]');
  if (go) { progressEx = go.dataset.gotoEx; haptic('tick'); show('progress'); }
});

function renderLog() {
  const list = A.exerciseList(sets);
  const date = fDate.value;
  const ex = A.normalizeName(fEx.value);
  $('#date-label').textContent = fmtDay(date);
  $('#exercise-options').innerHTML = list.map((n) => `<option value="${esc(n)}">`).join('');
  const STARTERS = ['Penkkipunnerrus', 'Takakyykky', 'Maastaveto', 'Pystypunnerrus', 'Kulmasoutu', 'Leuanveto', 'Dipit', 'Hauiskääntö'];
  const chipList = list.length ? list.slice(0, 12) : STARTERS;
  $('#recent-chips').innerHTML = chipList
    .map((n) => `<button type="button" data-pick="${esc(n)}" class="${n === ex ? 'on' : ''}">${esc(n)}</button>`).join('');

  const lt = $('#last-time');
  const last = ex ? A.lastSession(sets, ex, date) : null;
  if (last) {
    lt.className = 'prev';
    lt.innerHTML = `<div class="prev-head">Edellinen kerta · ${fmtDay(last.date).toLowerCase()}</div>
      <div class="prev-sets">${last.sets.map((s) => `<button type="button" data-fill="${s.weight}|${s.reps}">${nf(s.weight, 2)} × ${s.reps}</button>`).join('')}</div>`;
  } else lt.className = 'hidden';

  const day = sets.filter((s) => s.date === date);
  if (!sets.length) {
    $('#today-list').innerHTML = `<h2 class="sec">Aloitus</h2><div class="group">
      ${row('1. Valitse liike', '', 'Kirjoita nimi tai napauta pikavalintaa')}
      ${row('2. Paino ja toistot', '', 'Säädä +/− tai kirjoita numero')}
      ${row('3. Lisää sarja', '', 'Jokainen sarja kirjataan erikseen')}
    </div><p class="note">Analytiikka rakentuu kirjausten pohjalta: kehityskäyrät näkyvät, kun liikkeellä on muutama kerta takana.</p>`;
    return;
  }
  $('#today-list').innerHTML = day.length
    ? `<div class="day-head"><h3>${fmtDay(date)}</h3><span>${day.length} ${day.length === 1 ? 'sarja' : 'sarjaa'}</span></div><div class="group">${dayBlocks(day)}</div>`
    : '';
}

function dayBlocks(daySets) {
  const byEx = new Map();
  for (const s of [...daySets].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))) {
    if (!byEx.has(s.exercise)) byEx.set(s.exercise, []);
    byEx.get(s.exercise).push(s);
  }
  let html = '';
  for (const [ex, ss] of byEx) {
    const date = ss[0].date;
    const prevBest = Math.max(0, ...sets.filter((s) => s.exercise === ex && s.date < date).map((s) => A.e1rm(s.weight, s.reps)));
    const bestToday = Math.max(...ss.map((s) => A.e1rm(s.weight, s.reps)));
    const vol = ss.reduce((a, s) => a + s.weight * s.reps, 0);
    html += `<div class="ex-block"><div class="ex-title"><b data-goto-ex="${esc(ex)}">${esc(ex)}</b><span>${vol ? nf(vol, 0) + ' kg' : ss.reduce((a, s) => a + s.reps, 0) + ' toistoa'}</span></div>`;
    let marked = false;
    ss.forEach((s, i) => {
      const v = A.e1rm(s.weight, s.reps);
      const pr = !marked && prevBest > 0 && v > prevBest && v === bestToday;
      if (pr) marked = true;
      html += `<div class="set"><span class="n">${i + 1}</span><span class="w">${nf(s.weight, 2)} kg × ${s.reps}${pr ? '<span class="pr">PR</span>' : ''}</span>
        <button class="x" data-del="${s.id}" aria-label="Poista sarja">×</button></div>`;
    });
    html += '</div>';
  }
  return html;
}

// ---------- Kehitys ----------
const METRICS = {
  bestE1rm: { label: 'Arvioitu 1RM', tab: '1RM', unit: 'kg', dec: 1 },
  maxWeight: { label: 'Raskain sarja', tab: 'Paino', unit: 'kg', dec: 2 },
  volume: { label: 'Volyymi per kerta', tab: 'Volyymi', unit: 'kg', dec: 0 },
  maxReps: { label: 'Eniten toistoja', tab: 'Max', unit: 'toistoa', dec: 0 },
  totalReps: { label: 'Toistot per kerta', tab: 'Yhteensä', unit: 'toistoa', dec: 0 },
};
const RANGES = [[30, '1 kk'], [90, '3 kk'], [180, '6 kk'], [365, '1 v'], [0, 'Kaikki']];
let progressEx = null, progressRange = 180, progressMetric = null, showAllSessions = false;

function renderProgress() {
  const body = $('#progress-body');
  const list = A.exerciseList(sets);
  if (!list.length) {
    body.innerHTML = '<header class="vh"><h1>Kehitys</h1></header><div class="empty">Kirjaa ensimmäiset sarjat, niin kehitys näkyy täällä.</div>';
    return;
  }
  if (!progressEx || !list.includes(progressEx)) progressEx = list[0];
  const all = A.exerciseSessions(sets, progressEx);
  const bw = A.isBodyweight(all);
  const keys = bw ? ['maxReps', 'totalReps'] : ['bestE1rm', 'maxWeight', 'volume'];
  if (!keys.includes(progressMetric)) progressMetric = keys[0];
  const M = METRICS[progressMetric];
  const since = progressRange ? A.fmtDate(A.addDays(today(), -progressRange)) : '0000';
  const shown = all.filter((s) => s.date >= since);
  const rangeName = RANGES.find((r) => r[0] === progressRange)[1];
  const first = shown[0], last = shown[shown.length - 1];
  const totalDelta = shown.length > 1 ? last[progressMetric] - first[progressMetric] : 0;

  // Tilastot
  const pr = A.personalRecords(all);
  const mainMetric = bw ? 'maxReps' : 'bestE1rm';
  const tr = A.trend(all, today(), 28, mainMetric);
  const slope = A.slopePerWeek(all.slice(-12), mainMetric);
  const u = bw ? 'toistoa' : 'kg';
  let stats = '';
  if (bw) stats += row('Eniten toistoja', `${pr.maxReps.value}`, '', shortDateY(pr.maxReps.date));
  else {
    stats += row('Paras arvioitu 1RM', `${nf(pr.bestE1rm.value, 1)} kg`, '', shortDateY(pr.bestE1rm.date));
    stats += row('Raskain paino', `${nf(pr.maxWeight.value, 2)} kg`, '', shortDateY(pr.maxWeight.date));
    stats += row('Suurin volyymi', `${nf(pr.maxVolume.value, 0)} kg`, '', shortDateY(pr.maxVolume.date));
  }
  stats += row('Muutos 4 viikossa', tr ? `${signed(tr.pct, 1)} %` : '–', 'Verrattuna edellisiin 4 viikkoon', tr ? `${nf(tr.prev)} → ${nf(tr.recent)} ${u}` : 'Liian vähän dataa', tr ? toneOf(tr.pct) : '');
  stats += row('Kehitysvauhti', slope !== null ? `${signed(slope, 2)} ${u}/vko` : '–', 'Trendi 12 viimeisestä kerrasta', '', slope !== null ? toneOf(slope) : '');
  stats += row('Kerrat', `${all.length}`, '', `viimeksi ${fmtDay(all[all.length - 1].date).toLowerCase()}`);

  // Kerrat
  const sessList = [...all].reverse();
  const visible = showAllSessions ? sessList : sessList.slice(0, 8);
  const sessions = visible.map((s) => {
    const b = bestSet(s.sets, bw);
    return row(fmtDay(s.date), `${nf(s[progressMetric], M.dec)} <span class="faint">${M.unit}</span>`,
      `${s.setCount} ${s.setCount === 1 ? 'sarja' : 'sarjaa'} · paras ${nf(b.weight, 2)} × ${b.reps}`);
  }).join('');

  const sorted = [...list].sort((a, b) => a.localeCompare(b, 'fi'));
  body.innerHTML = `
    <header class="vh">
      <div class="ex-select"><h1>${esc(progressEx)}</h1>${chevron}
        <select id="p-exercise" aria-label="Valitse liike">${sorted.map((n) => `<option ${n === progressEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      </div>
    </header>
    <div class="hero">
      <div class="hero-label">${M.label}</div>
      <div class="hero-value" id="p-value"></div>
      <div class="hero-sub" id="p-sub"></div>
    </div>
    <div class="chart-wrap" id="p-chart"></div>
    <div class="seg" id="p-range">${RANGES.map(([d, l]) => `<button data-range="${d}" class="${d === progressRange ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="seg sub" id="p-metric">${keys.map((k) => `<button data-metric="${k}" class="${k === progressMetric ? 'on' : ''}">${METRICS[k].tab}</button>`).join('')}</div>
    <h2 class="sec">Tilastot</h2>
    <div class="group">${stats}</div>
    <h2 class="sec">Kerrat</h2>
    <div class="group">${sessions}</div>
    ${sessList.length > 8 && !showAllSessions ? `<button class="more" id="p-more">Näytä kaikki ${sessList.length} kertaa</button>` : ''}
    ${bw ? '' : '<p class="note" style="padding:16px 4px 0">Arvioitu 1RM = paino × (1 + toistot / 30). Tekee eri toistomäärillä tehdyistä sarjoista vertailukelpoisia. Luotettavin 1–10 toiston sarjoilla.</p>'}`;

  const vEl = $('#p-value'), sEl = $('#p-sub');
  const heroDefault = () => {
    if (!last) { vEl.innerHTML = '–'; sEl.innerHTML = `<span class="faint">Ei kertoja · ${rangeName}</span>`; return; }
    vEl.innerHTML = `${nf(last[progressMetric], M.dec)}<span class="u">${M.unit}</span>`;
    if (shown.length > 1) {
      const pct = first[progressMetric] ? (totalDelta / first[progressMetric]) * 100 : 0;
      sEl.innerHTML = `<span class="${toneOf(totalDelta)}">${signed(totalDelta, M.dec)} ${M.unit} (${signed(pct, 1)} %)</span> <span class="faint">· ${rangeName}</span>`;
    } else sEl.innerHTML = `<span class="faint">${fmtDay(last.date)}</span>`;
  };
  heroDefault();

  mountChart($('#p-chart'), {
    type: 'line',
    tone: shown.length > 1 ? toneOf(totalDelta) : '',
    points: shown.map((s) => ({ x: A.parseDate(s.date).getTime(), y: s[progressMetric], s })),
    xLabel: (p) => shortDateY(p.s.date),
    onScrub: (p) => {
      if (!p) return heroDefault();
      const d = p.y - first[progressMetric];
      const pct = first[progressMetric] ? (d / first[progressMetric]) * 100 : 0;
      const b = bestSet(p.s.sets, bw);
      vEl.innerHTML = `${nf(p.y, M.dec)}<span class="u">${M.unit}</span>`;
      sEl.innerHTML = `<span class="${toneOf(d)}">${signed(d, M.dec)} (${signed(pct, 1)} %)</span> <span class="muted">· ${fmtDay(p.s.date)} · ${nf(b.weight, 2)} × ${b.reps}</span>`;
    },
  });

  $('#p-exercise').addEventListener('change', (e) => { progressEx = e.target.value; showAllSessions = false; haptic('tick'); renderProgress(); });
  body.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => { progressRange = Number(b.dataset.range); haptic('tick'); renderProgress(); }));
  body.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => { progressMetric = b.dataset.metric; haptic('tick'); renderProgress(); }));
  $('#p-more')?.addEventListener('click', () => { showAllSessions = true; renderProgress(); });
}

// ---------- Aktiivisuus ----------
const WEEK_RANGES = [[12, '12 vk'], [26, '6 kk'], [52, '1 v']];
let activityWeeks = 12;

function renderActivity() {
  const body = $('#activity-body');
  if (!sets.length) {
    body.innerHTML = '<header class="vh"><h1>Aktiivisuus</h1></header><div class="empty">Ei vielä treenejä.</div>';
    return;
  }
  const t = today();
  const goal = settings.weeklyGoal;
  const sum = A.activitySummary(sets, t);
  const streak = A.weekStreak(sets, t, goal);
  const wk = A.weeklyCounts(sets, t, activityWeeks);
  const thisWeek = wk[wk.length - 1].count;
  const avg = wk.reduce((a, w) => a + w.count, 0) / wk.length;

  // Lämpökartta 26 vk, taso sarjamäärän mukaan
  const perDay = new Map();
  for (const s of sets) perDay.set(s.date, (perDay.get(s.date) || 0) + 1);
  const maxDay = Math.max(...perDay.values());
  const start = A.addDays(A.weekStart(t), -7 * 25);
  const ts = todayStr();
  let cells = '';
  for (let i = 0; i < 26 * 7; i++) {
    const d = A.fmtDate(A.addDays(start, i));
    const c = perDay.get(d) || 0;
    const lvl = c ? (c / maxDay > 0.66 ? 3 : c / maxDay > 0.33 ? 2 : 1) : 0;
    cells += `<div class="${lvl ? 'l' + lvl : ''}${d === ts ? ' today' : ''}${d > ts ? ' future' : ''}"></div>`;
  }

  const ms = A.monthlyStats(sets, t, 6).reverse();
  const maxM = Math.max(1, ...ms.map((m) => m.sessions));
  const months = ms.map((m) => `<div class="row"><div class="k" style="flex:1">${MN[Number(m.month.slice(5)) - 1]}
      <div class="meter"><i style="width:${(m.sessions / maxM) * 100}%"></i></div></div>
      <div class="v">${m.sessions} <span class="faint">krt</span><small>${nf(m.volume, 0)} kg</small></div></div>`).join('');

  const since = A.fmtDate(A.addDays(t, -89));
  const cnt = new Map();
  for (const s of sets) if (s.date >= since) cnt.set(s.exercise, (cnt.get(s.exercise) || 0) + 1);
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topMax = top.length ? top[0][1] : 1;
  const tops = top.map(([ex, n]) => `<button class="row" data-goto-ex="${esc(ex)}"><div class="k" style="flex:1">${esc(ex)}
      <div class="meter"><i style="width:${(n / topMax) * 100}%"></i></div></div><div class="v">${n} <span class="faint">sarjaa</span></div></button>`).join('');

  body.innerHTML = `
    <header class="vh"><h1>Aktiivisuus</h1></header>
    <div class="hero">
      <div class="hero-label" id="a-label">Tällä viikolla</div>
      <div class="hero-value" id="a-value"></div>
      <div class="hero-sub" id="a-sub"></div>
    </div>
    <div class="chart-wrap bars" id="a-chart"></div>
    <div class="seg" id="a-range">${WEEK_RANGES.map(([w, l]) => `<button data-weeks="${w}" class="${w === activityWeeks ? 'on' : ''}">${l}</button>`).join('')}</div>

    <h2 class="sec">Yhteenveto</h2>
    <div class="group">
      ${row('Viikkoputki', `${streak} vk`, `Peräkkäiset viikot, joilla ≥ ${goal} käyntiä`, '', streak > 0 ? 'up' : '')}
      ${row('Keskimäärin', `${nf(avg, 1)} / vk`, `Viimeiset ${activityWeeks} viikkoa`)}
      ${row('Viimeiset 30 päivää', `${sum.last30} käyntiä`)}
      ${row('Edellinen käynti', sum.daysSince === 0 ? 'Tänään' : sum.daysSince === 1 ? 'Eilen' : `${sum.daysSince} pv sitten`, '', '', sum.daysSince > 4 ? 'down' : '')}
      ${row('Käynnit yhteensä', `${sum.totalSessions}`)}
    </div>

    <h2 class="sec">Viimeiset 6 kuukautta</h2>
    <div class="group"><div class="heat">${cells}</div>
      <div class="heat-legend"><span>Rivit ma–su</span><span>Tummempi = enemmän sarjoja</span></div></div>

    <h2 class="sec">Kuukausittain</h2>
    <div class="group">${months}</div>

    ${tops ? `<h2 class="sec">Eniten sarjoja · 90 pv</h2><div class="group">${tops}</div>` : ''}`;

  const lEl = $('#a-label'), vEl = $('#a-value'), sEl = $('#a-sub');
  const heroDefault = () => {
    lEl.textContent = 'Tällä viikolla';
    vEl.innerHTML = `${thisWeek}<span class="of"> / ${goal}</span><span class="u">käyntiä</span>`;
    const segs = Array.from({ length: Math.max(goal, thisWeek) }, (_, i) => `<i class="${i < thisWeek ? 'on' : ''}"></i>`).join('');
    sEl.innerHTML = (thisWeek >= goal ? '<span class="up">Viikkotavoite täynnä</span>' : `<span class="muted">${goal - thisWeek} käyntiä tavoitteeseen</span>`)
      + `<div class="goalbar">${segs}</div>`;
  };
  heroDefault();

  mountChart($('#a-chart'), {
    type: 'bar',
    goal,
    points: wk.map((w, i) => ({ x: i, y: w.count, w })),
    xLabel: (p) => shortDate(p.w.weekStart),
    onScrub: (p) => {
      if (!p) return heroDefault();
      const ws = A.parseDate(p.w.weekStart);
      const we = A.addDays(ws, 6);
      lEl.textContent = `Viikko ${A.isoWeek(ws)}`;
      vEl.innerHTML = `${p.y}<span class="of"> / ${goal}</span><span class="u">käyntiä</span>`;
      sEl.innerHTML = `<span class="muted">${ws.getDate()}.${ws.getMonth() + 1}. – ${we.getDate()}.${we.getMonth() + 1}.${we.getFullYear()}</span>`
        + (p.y >= goal ? ' <span class="up">· tavoite täynnä</span>' : '');
    },
  });

  body.querySelectorAll('[data-weeks]').forEach((b) => b.addEventListener('click', () => { activityWeeks = Number(b.dataset.weeks); haptic('tick'); renderActivity(); }));
}

// ---------- Historia & asetukset ----------
let historyLimit = 14;
function renderHistory() {
  const days = A.groupByDate(sets);
  let backupNote;
  if (!settings.lastExport) backupNote = sets.length ? '<span class="down">Varmuuskopiota ei ole vielä viety.</span>' : 'Data on tallessa vain tällä laitteella.';
  else {
    const d = daysBetween(settings.lastExport, todayStr());
    backupNote = `Viimeisin vienti ${fmtDay(settings.lastExport).toLowerCase()}.${d > 14 ? ' <span class="down">Yli 2 viikkoa sitten.</span>' : ''}`;
  }
  const hapticNote = IS_IOS
    ? 'iPhonessa värinäpalaute vaatii iOS 18:n tai uudemman ja toimii parhaiten kotinäytölle asennettuna.'
    : navigator.vibrate ? 'Värisee kevyesti, kun liu\'ut sormella kaavion yli.' : 'Tämä laite tai selain ei tue värinäpalautetta.';

  let html = `
    <header class="vh"><h1>Historia</h1></header>
    <div class="group">
      <div class="row"><div class="k">Viikkotavoite<small>Käyntiä viikossa</small></div>
        <div class="mini-stp"><button data-goal="-1" aria-label="Vähennä">−</button><span>${settings.weeklyGoal}</span><button data-goal="1" aria-label="Lisää">+</button></div></div>
      <div class="row"><div class="k">Värinäpalaute</div><input type="checkbox" class="toggle" id="haptics-toggle" ${settings.haptics ? 'checked' : ''} aria-label="Värinäpalaute"></div>
    </div>
    <p class="note">${hapticNote}</p>

    <h2 class="sec">Varmuuskopio</h2>
    <div class="group">
      <button class="row" id="btn-export-json"><span class="k">Vie varmuuskopio<small>JSON, palautettavissa tähän sovellukseen</small></span><span class="faint">↗</span></button>
      <button class="row" id="btn-export-csv"><span class="k">Vie taulukkona<small>CSV, avautuu Excelissä</small></span><span class="faint">↗</span></button>
      <button class="row" id="btn-import"><span class="k">Tuo tiedosto<small>JSON tai CSV, duplikaatit ohitetaan</small></span><span class="faint">↙</span></button>
    </div>
    <p class="note">${backupNote}</p>`;

  if (!days.length) html += '<div class="empty">Ei kirjauksia.</div>';
  for (const d of days.slice(0, historyLimit)) {
    html += `<div class="day-head"><h3>${fmtDay(d.date)}</h3><span>${d.sets.length} sarjaa</span></div><div class="group">${dayBlocks(d.sets)}</div>`;
  }
  if (days.length > historyLimit) html += `<button class="more" id="h-more">Näytä lisää</button>`;
  const body = $('#history-body');
  body.innerHTML = html;

  body.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', () => {
    settings.weeklyGoal = Math.min(7, Math.max(1, settings.weeklyGoal + Number(b.dataset.goal)));
    saveSettings(); haptic('tick'); renderHistory();
  }));
  $('#haptics-toggle').addEventListener('change', (e) => { settings.haptics = e.target.checked; saveSettings(); haptic('tap'); });
  $('#btn-export-json').addEventListener('click', () =>
    download(`sali-${todayStr()}.json`, JSON.stringify({ app: 'salipaivakirja', version: 1, exported: new Date().toISOString(), sets }, null, 1), 'application/json'));
  $('#btn-export-csv').addEventListener('click', () => download(`sali-${todayStr()}.csv`, A.toCSV(sets), 'text/csv'));
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#h-more')?.addEventListener('click', () => { historyLimit += 14; renderHistory(); });
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  settings.lastExport = todayStr();
  saveSettings();
  renderHistory();
}

$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    let incoming;
    if (file.name.toLowerCase().endsWith('.csv')) incoming = A.parseCSV(text);
    else {
      const d = JSON.parse(text);
      incoming = Array.isArray(d) ? d : d.sets;
      if (!Array.isArray(incoming)) throw new Error('Tuntematon tiedostomuoto');
      incoming = incoming.filter((s) => s && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.exercise && isFinite(s.weight) && s.reps > 0)
        .map((s) => ({ ...s, exercise: A.normalizeName(String(s.exercise)), weight: Number(s.weight), reps: Number(s.reps) }));
    }
    const key = (s) => `${s.date}|${s.exercise}|${s.weight}|${s.reps}|${s.ts ?? ''}`;
    const have = new Set(sets.map(key));
    const haveIds = new Set(sets.map((s) => s.id));
    const fresh = incoming.filter((s) => !(s.id && haveIds.has(s.id)) && !have.has(key(s)));
    if (!confirm(`Tiedostossa ${incoming.length} sarjaa, joista ${fresh.length} uutta. Lisätäänkö ne?`)) return;
    for (const s of fresh) sets.push({ id: s.id || uid(), date: s.date, exercise: s.exercise, weight: s.weight, reps: s.reps, ts: s.ts ?? 0 });
    save();
    toast(`Tuotu ${fresh.length} sarjaa`);
    render();
  } catch (err) {
    toast('Tuonti epäonnistui: ' + err.message);
  }
});

// Päivitä, jos sovellus palaa taustalta seuraavana päivänä
let lastDay = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayStr() !== lastDay) {
    if (fDate.value === lastDay) fDate.value = todayStr();
    lastDay = todayStr();
    render();
  }
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
