import * as A from './analytics.js';

// ---------- Tila & tallennus ----------
const KEY = 'sali.sets.v1';
const SETTINGS_KEY = 'sali.settings.v1';

let sets = load();
let settings = Object.assign({ weeklyGoal: 3, lastExport: null }, safeJSON(localStorage.getItem(SETTINGS_KEY)) || {});

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function load() {
  const d = safeJSON(localStorage.getItem(KEY));
  return Array.isArray(d) ? d : [];
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(sets)); }
  catch (e) { toast('Tallennus epäonnistui: ' + e.message); }
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Pyydä selainta olemaan poistamatta dataa automaattisesti
navigator.storage?.persist?.();

// ---------- Apurit ----------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date();
const todayStr = () => A.fmtDate(today());
const nf = (n, d = 1) => Number(n).toLocaleString('fi-FI', { maximumFractionDigits: d });
const kg = (n) => `${nf(n, 2)} kg`;
const WD = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
function fmtDay(s) {
  const d = A.parseDate(s);
  const diff = Math.round((A.parseDate(todayStr()) - d) / 864e5);
  if (diff === 0) return 'Tänään';
  if (diff === 1) return 'Eilen';
  return `${WD[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear() !== today().getFullYear() ? d.getFullYear() : ''}`;
}
const shortDate = (s) => { const d = A.parseDate(s); return `${d.getDate()}.${d.getMonth() + 1}.`; };

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = esc(msg);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); t.classList.remove('show'); };
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2200);
}

// ---------- Navigaatio ----------
const TITLES = { log: 'Kirjaa', progress: 'Liikkeet', activity: 'Aktiivisuus', history: 'Historia' };
let currentView = 'log';
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => show(b.dataset.view)));
function show(view) {
  currentView = view;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $('#title').textContent = TITLES[view];
  render();
  window.scrollTo(0, 0);
}
function render() {
  ({ log: renderLog, progress: renderProgress, activity: renderActivity, history: renderHistory })[currentView]();
}

// ---------- Kirjaus ----------
const fDate = $('#f-date'), fEx = $('#f-exercise'), fW = $('#f-weight'), fR = $('#f-reps');
fDate.value = todayStr();

document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const inp = b.dataset.step === 'weight' ? fW : fR;
  const v = Math.max(b.dataset.step === 'reps' ? 1 : 0, (Number(inp.value) || 0) + Number(b.dataset.delta));
  inp.value = v;
}));

fEx.addEventListener('change', () => { prefill(); renderLog(); });
fDate.addEventListener('change', renderLog);

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
  // Käytä olemassa olevaa kirjoitusasua, jos liike löytyy eri kirjainkoolla
  const existing = A.exerciseList(sets).find((n) => n.toLowerCase() === ex.toLowerCase());
  const name = existing || ex;
  const prevBest = Math.max(0, ...sets.filter((s) => s.exercise === name && s.date < fDate.value).map((s) => A.e1rm(s.weight, s.reps)));
  const set = { id: uid(), date: fDate.value, exercise: name, weight, reps, ts: Date.now() };
  sets.push(set);
  save();
  fEx.value = name;
  const isPR = prevBest > 0 && A.e1rm(weight, reps) > prevBest;
  toast(isPR ? '🏆 Uusi ennätys!' : 'Sarja lisätty');
  navigator.vibrate?.(isPR ? [30, 50, 30] : 15);
  renderLog();
});

function deleteSet(id) {
  const idx = sets.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const [removed] = sets.splice(idx, 1);
  save();
  render();
  toast('Sarja poistettu', { label: 'Kumoa', fn: () => { sets.push(removed); save(); render(); } });
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]');
  if (b) deleteSet(b.dataset.del);
  const c = e.target.closest('[data-pick]');
  if (c) { fEx.value = c.dataset.pick; prefill(); renderLog(); }
  const g = e.target.closest('[data-goto-ex]');
  if (g) { progressEx = g.dataset.gotoEx; show('progress'); }
});

function renderLog() {
  const list = A.exerciseList(sets);
  $('#exercise-options').innerHTML = list.map((n) => `<option value="${esc(n)}">`).join('');
  $('#recent-chips').innerHTML = list.slice(0, 10)
    .map((n) => `<button type="button" data-pick="${esc(n)}">${esc(n)}</button>`).join('');

  const date = fDate.value;
  const ex = A.normalizeName(fEx.value);
  const lt = $('#last-time');
  const last = ex ? A.lastSession(sets, ex, date) : null;
  if (last) {
    lt.classList.remove('hidden');
    lt.innerHTML = `<div class="small muted">Edellisellä kerralla (${fmtDay(last.date)})</div>
      <div><b>${esc(ex)}</b>: ${last.sets.map((s) => `${nf(s.weight, 2)}×${s.reps}`).join(', ')}</div>
      <div class="small muted">Paras e1RM ${kg(Math.round(last.bestE1rm * 10) / 10)}</div>`;
  } else lt.classList.add('hidden');

  const day = sets.filter((s) => s.date === date);
  if (!day.length) {
    $('#today-list').innerHTML = `<div class="empty">Ei sarjoja päivälle ${fmtDay(date).toLowerCase()}.</div>`;
    return;
  }
  $('#today-list').innerHTML = `<div class="day-head"><h3>${fmtDay(date)}</h3><span class="small muted">${day.length} sarjaa</span></div>`
    + `<div class="card">${dayBlocks(day, true)}</div>`;
}

/** Päivän sarjat liikkeittäin. Merkitsee ennätyssarjat. */
function dayBlocks(daySets, withDelete) {
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
    html += `<div class="ex-block"><div class="ex-name"><span data-goto-ex="${esc(ex)}">${esc(ex)}</span><span class="small muted">${nf(vol, 0)} kg vol.</span></div>`;
    let marked = false;
    for (const s of ss) {
      const v = A.e1rm(s.weight, s.reps);
      const pr = !marked && prevBest > 0 && v > prevBest && v === bestToday;
      if (pr) marked = true;
      html += `<div class="set-line"><span>${nf(s.weight, 2)} kg × ${s.reps}${pr ? '<span class="pr-badge">PR</span>' : ''}</span>
        ${withDelete ? `<button class="x" data-del="${s.id}" aria-label="Poista">×</button>` : ''}</div>`;
    }
    html += '</div>';
  }
  return html;
}

// ---------- Kaaviot (SVG) ----------
function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const t = [];
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(6));
  return t;
}

function lineChart(points, { unit = '', trend = null } = {}) {
  if (points.length === 0) return '';
  const W = 340, H = 180, L = 36, R = 8, T = 10, B = 22;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 864e5 * 3; x1 += 864e5 * 3; }
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => T + (1 - (y - y0) / (y1 - y0 || 1)) * (H - T - B);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  for (const t of ticks) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${L - 4}" y="${sy(t) + 3}" text-anchor="end">${nf(t, 1)}</text>`;
  // x-akselin päivämäärät: alku, keskikohta, loppu
  [x0, (x0 + x1) / 2, x1].forEach((x, i) => {
    const d = new Date(x);
    s += `<text x="${sx(x)}" y="${H - 6}" text-anchor="${['start', 'middle', 'end'][i]}">${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}</text>`;
  });
  if (trend) s += `<line class="trendline" x1="${sx(trend.x0)}" y1="${sy(trend.y0)}" x2="${sx(trend.x1)}" y2="${sy(trend.y1)}"/>`;
  s += `<path class="line" d="${points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('')}"/>`;
  if (points.length <= 40) for (const p of points) s += `<circle class="dot" cx="${sx(p.x)}" cy="${sy(p.y)}" r="3"><title>${new Date(p.x).toLocaleDateString('fi-FI')}: ${nf(p.y, 1)} ${unit}</title></circle>`;
  return s + '</svg>';
}

function barChart(items, { goal = null } = {}) {
  const W = 340, H = 160, L = 22, R = 6, T = 10, B = 22;
  const max = Math.max(goal || 0, ...items.map((i) => i.value), 1);
  const top = Math.ceil(max);
  const bw = (W - L - R) / items.length;
  const sy = (v) => T + (1 - v / top) * (H - T - B);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  const step = top <= 7 ? 1 : Math.ceil(top / 5);
  for (let v = 0; v <= top; v += step) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${L - 4}" y="${sy(v) + 3}" text-anchor="end">${v}</text>`;
  items.forEach((it, i) => {
    const h = sy(0) - sy(it.value);
    s += `<rect class="bar${it.dim ? ' dim' : ''}" x="${L + i * bw + bw * 0.15}" y="${sy(it.value)}" width="${bw * 0.7}" height="${Math.max(h, 0)}" rx="2"><title>${esc(it.label)}: ${it.value}</title></rect>`;
    if (items.length <= 8 || i % 2 === (items.length - 1) % 2) s += `<text x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>`;
  });
  if (goal) s += `<line class="trendline" x1="${L}" x2="${W - R}" y1="${sy(goal)}" y2="${sy(goal)}"/>`;
  return s + '</svg>';
}

// ---------- Liikekohtainen kehitys ----------
let progressEx = null, progressRange = 0;
$('#p-exercise').addEventListener('change', (e) => { progressEx = e.target.value; renderProgress(); });
document.querySelectorAll('#p-range button').forEach((b) => b.addEventListener('click', () => {
  progressRange = Number(b.dataset.range);
  document.querySelectorAll('#p-range button').forEach((x) => x.classList.toggle('on', x === b));
  renderProgress();
}));

function stat(v, l, s = '', cls = '') {
  return `<div class="stat"><div class="v ${cls}">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}

function renderProgress() {
  const list = A.exerciseList(sets);
  const sel = $('#p-exercise');
  if (!list.length) {
    sel.innerHTML = '';
    $('#progress-body').innerHTML = '<div class="empty">Kirjaa ensin sarjoja, niin kehitys näkyy täällä.</div>';
    return;
  }
  if (!progressEx || !list.includes(progressEx)) progressEx = list[0];
  sel.innerHTML = [...list].sort((a, b) => a.localeCompare(b, 'fi')).map((n) => `<option ${n === progressEx ? 'selected' : ''}>${esc(n)}</option>`).join('');

  const all = A.exerciseSessions(sets, progressEx);
  const bw = A.isBodyweight(all);
  const metric = bw ? 'maxReps' : 'bestE1rm';
  const unit = bw ? 'toistoa' : 'kg';
  const pr = A.personalRecords(all);
  const tr = A.trend(all, today(), 28, metric);
  const slope = A.slopePerWeek(all.slice(-12), metric);
  const since = progressRange ? A.fmtDate(A.addDays(today(), -progressRange)) : '0000';
  const shown = all.filter((s) => s.date >= since);

  let html = '<div class="stats">';
  if (bw) {
    html += stat(pr.maxReps.value, 'Eniten toistoja sarjassa', shortDate(pr.maxReps.date));
    html += stat(nf(all[all.length - 1].totalReps, 0), 'Toistoja viime kerralla', fmtDay(all[all.length - 1].date));
  } else {
    html += stat(kg(Math.round(pr.bestE1rm.value * 10) / 10), 'Paras arvioitu 1RM', shortDate(pr.bestE1rm.date));
    html += stat(kg(pr.maxWeight.value), 'Raskain paino', shortDate(pr.maxWeight.date));
  }
  html += tr
    ? stat(`${tr.pct >= 0 ? '+' : ''}${nf(tr.pct, 1)} %`, 'Muutos 4 vk vs. edelliset 4 vk', `${nf(tr.prev)} → ${nf(tr.recent)} ${unit}`, tr.pct > 0 ? 'up' : tr.pct < 0 ? 'down' : '')
    : stat('–', 'Muutos 4 vk vs. edelliset 4 vk', 'Liian vähän dataa');
  html += slope !== null
    ? stat(`${slope >= 0 ? '+' : ''}${nf(slope, 2)}`, `${unit} / viikko`, 'Trendi, 12 viim. kertaa', slope > 0 ? 'up' : slope < 0 ? 'down' : '')
    : stat('–', `${unit} / viikko`, 'Tarvitaan ≥3 kertaa');
  html += stat(all.length, 'Kertoja yhteensä', `Viimeksi ${fmtDay(all[all.length - 1].date).toLowerCase()}`);
  html += stat(`${nf(pr.maxVolume.value, 0)}`, 'Suurin volyymi (kg)', shortDate(pr.maxVolume.date));
  html += '</div>';

  const pts = shown.map((s) => ({ x: A.parseDate(s.date).getTime(), y: s[metric] }));
  let trendLine = null;
  if (shown.length >= 3) {
    const sl = A.slopePerWeek(shown, metric);
    const n = shown.length, xw = shown.map((s) => (A.parseDate(s.date) - A.parseDate(shown[0].date)) / (7 * 864e5));
    const mx = xw.reduce((a, b) => a + b, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
    if (sl !== null) trendLine = { x0: pts[0].x, y0: my - sl * mx, x1: pts[n - 1].x, y1: my + sl * (xw[n - 1] - mx) };
  }
  html += `<div class="card"><h3>${bw ? 'Maksimitoistot' : 'Arvioitu 1RM'} <span class="small muted">(${unit})</span></h3>${lineChart(pts, { unit, trend: trendLine })}
    ${bw ? '' : '<p class="small muted">e1RM = paino × (1 + toistot/30). Vertailukelpoinen mittari eri toistomäärillä tehdyille sarjoille. Katkoviiva = trendi.</p>'}</div>`;
  html += `<div class="card"><h3>Volyymi per kerta <span class="small muted">(${bw ? 'toistot' : 'kg × toistot'})</span></h3>${lineChart(shown.map((s) => ({ x: A.parseDate(s.date).getTime(), y: bw ? s.totalReps : s.volume })))}</div>`;

  html += `<div class="card"><h3>Viimeisimmät kerrat</h3><table><tr><th>Päivä</th><th>Paras sarja</th><th class="num">Sarjat</th><th class="num">${bw ? 'Toistot' : 'Volyymi'}</th></tr>`;
  for (const s of [...all].reverse().slice(0, 15)) {
    const best = s.sets.reduce((b, x) => (bw ? x.reps > b.reps : A.e1rm(x.weight, x.reps) > A.e1rm(b.weight, b.reps)) ? x : b);
    html += `<tr><td>${shortDate(s.date)}</td><td>${nf(best.weight, 2)} × ${best.reps}</td><td class="num">${s.setCount}</td><td class="num">${nf(bw ? s.totalReps : s.volume, 0)}</td></tr>`;
  }
  html += '</table></div>';
  $('#progress-body').innerHTML = html;
}

// ---------- Aktiivisuus ----------
function renderActivity() {
  if (!sets.length) {
    $('#activity-body').innerHTML = '<div class="empty">Ei vielä treenejä.</div>';
    return;
  }
  const t = today();
  const goal = settings.weeklyGoal;
  const sum = A.activitySummary(sets, t);
  const streak = A.weekStreak(sets, t, goal);
  const wk = A.weeklyCounts(sets, t, 12);
  const thisWeek = wk[wk.length - 1].count;

  let html = '<div class="stats">';
  html += stat(`${thisWeek} / ${goal}`, 'Käynnit tällä viikolla', thisWeek >= goal ? 'Tavoite täynnä ✓' : `${goal - thisWeek} jäljellä`, thisWeek >= goal ? 'up' : '');
  html += stat(streak, 'Viikkoputki', `Viikkoja peräkkäin ≥${goal} käyntiä`);
  html += stat(sum.last30, 'Käynnit 30 pv');
  html += stat(nf(sum.avgPerWeek, 1), 'Käyntiä / viikko', 'Keskiarvo, 12 vk');
  html += stat(sum.daysSince === 0 ? 'Tänään' : `${sum.daysSince} pv`, 'Edellisestä käynnistä', '', sum.daysSince > 4 ? 'down' : '');
  html += stat(sum.totalSessions, 'Käynnit yhteensä');
  html += '</div>';

  html += `<div class="card"><h3>Käynnit viikoittain</h3>${barChart(wk.map((w) => ({ label: shortDate(w.weekStart), value: w.count, dim: w.count < goal })), { goal })}
    <p class="small muted">Katkoviiva = viikkotavoite. Haalea palkki = tavoite jäi vajaaksi.</p>
    <label>Viikkotavoite <select id="goal-sel">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === goal ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>`;

  // Lämpökartta 26 viikkoa
  const dates = new Set(A.trainingDates(sets));
  const start = A.addDays(A.weekStart(t), -7 * 25);
  const ts = todayStr();
  let cells = '';
  for (let i = 0; i < 26 * 7; i++) {
    const d = A.fmtDate(A.addDays(start, i));
    cells += `<div class="${dates.has(d) ? 'on' : ''}${d === ts ? ' today' : ''}${d > ts ? ' future' : ''}" title="${d}"></div>`;
  }
  html += `<div class="card"><h3>Viimeiset 6 kk</h3><div class="heat">${cells}</div><p class="small muted">Rivit ma–su, sarakkeet viikkoja.</p></div>`;

  // Kuukaudet
  const ms = A.monthlyStats(sets, t, 6);
  const MN = ['tammi', 'helmi', 'maalis', 'huhti', 'touko', 'kesä', 'heinä', 'elo', 'syys', 'loka', 'marras', 'joulu'];
  html += `<div class="card"><h3>Kuukausittain</h3><table><tr><th>Kk</th><th class="num">Käynnit</th><th class="num">Sarjat</th><th class="num">Volyymi (kg)</th></tr>`;
  for (const m of [...ms].reverse()) html += `<tr><td>${MN[Number(m.month.slice(5)) - 1]}kuu</td><td class="num">${m.sessions}</td><td class="num">${m.sets}</td><td class="num">${nf(m.volume, 0)}</td></tr>`;
  html += '</table></div>';

  // Treenatuimmat liikkeet 90 pv
  const since = A.fmtDate(A.addDays(t, -89));
  const cnt = new Map();
  for (const s of sets) if (s.date >= since) cnt.set(s.exercise, (cnt.get(s.exercise) || 0) + 1);
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    html += `<div class="card"><h3>Eniten sarjoja (90 pv)</h3><table>`;
    for (const [ex, n] of top) html += `<tr><td data-goto-ex="${esc(ex)}">${esc(ex)}</td><td class="num">${n}</td></tr>`;
    html += '</table></div>';
  }

  $('#activity-body').innerHTML = html;
  $('#goal-sel').addEventListener('change', (e) => { settings.weeklyGoal = Number(e.target.value); saveSettings(); renderActivity(); });
}

// ---------- Historia ----------
let historyLimit = 20;
function renderHistory() {
  const info = $('#backup-info');
  if (!settings.lastExport) info.textContent = sets.length ? '⚠️ Et ole vielä vienyt varmuuskopiota.' : '';
  else {
    const d = Math.round((A.parseDate(todayStr()) - A.parseDate(settings.lastExport)) / 864e5);
    info.textContent = `Viimeisin vienti: ${fmtDay(settings.lastExport).toLowerCase()}${d > 14 ? ' ⚠️ yli 2 vk sitten' : ''}`;
  }
  const days = A.groupByDate(sets);
  if (!days.length) { $('#history-body').innerHTML = '<div class="empty">Ei kirjauksia.</div>'; return; }
  let html = '';
  for (const d of days.slice(0, historyLimit)) {
    html += `<div class="day-head"><h3>${fmtDay(d.date)}</h3><span class="small muted">${d.sets.length} sarjaa</span></div><div class="card">${dayBlocks(d.sets, true)}</div>`;
  }
  if (days.length > historyLimit) html += `<button id="more" style="width:100%">Näytä lisää (${days.length - historyLimit} päivää)</button>`;
  $('#history-body').innerHTML = html;
  $('#more')?.addEventListener('click', () => { historyLimit += 20; renderHistory(); });
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
$('#btn-export-json').addEventListener('click', () =>
  download(`sali-${todayStr()}.json`, JSON.stringify({ app: 'salipaivakirja', version: 1, exported: new Date().toISOString(), sets }, null, 1), 'application/json'));
$('#btn-export-csv').addEventListener('click', () =>
  download(`sali-${todayStr()}.csv`, A.toCSV(sets), 'text/csv'));

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

// Päivitä näkymä, jos sovellus palaa taustalta seuraavana päivänä
let lastDay = todayStr();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && todayStr() !== lastDay) {
    if (fDate.value === lastDay) fDate.value = todayStr();
    lastDay = todayStr();
    render();
  }
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js');
}
