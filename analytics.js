// Puhtaat analytiikkafunktiot. Ei DOM-riippuvuuksia -> testattavissa Nodella.

/** 'YYYY-MM-DD' -> paikallinen Date (ei aikavyöhykeongelmia). */
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date -> 'YYYY-MM-DD' paikallisessa ajassa. */
export function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d, n) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}

/** Viikon maanantai. */
export function weekStart(d) {
  const day = (d.getDay() + 6) % 7; // ma=0
  return addDays(d, -day);
}

/** Arvioitu 1RM (Epley). Luotettavin 1–10 toistolla. */
export function e1rm(weight, reps) {
  if (!weight || !reps) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function normalizeName(s) {
  return s.trim().replace(/\s+/g, ' ');
}

/** Liikkeet viimeisimmän käytön mukaan järjestettynä. */
export function exerciseList(sets) {
  const last = new Map();
  for (const s of sets) {
    const k = s.exercise;
    const t = s.date + String(s.ts ?? 0).padStart(15, '0');
    if (!last.has(k) || last.get(k) < t) last.set(k, t);
  }
  return [...last.entries()].sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([k]) => k);
}

/** Ryhmittely päivittäin: [{date, sets:[...]}] uusin ensin. */
export function groupByDate(sets) {
  const m = new Map();
  for (const s of sets) {
    if (!m.has(s.date)) m.set(s.date, []);
    m.get(s.date).push(s);
  }
  return [...m.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, ss]) => ({ date, sets: ss.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)) }));
}

/**
 * Liikekohtainen sessiohistoria (vanhin ensin).
 * Jokaiselle päivälle: paras e1RM, raskain paino, volyymi (kg×toistot), toistot yht., sarjat.
 */
export function exerciseSessions(sets, exercise) {
  const own = sets.filter((s) => s.exercise === exercise);
  return groupByDate(own)
    .reverse()
    .map(({ date, sets: ss }) => {
      let bestE1rm = 0, maxWeight = 0, volume = 0, totalReps = 0, maxReps = 0;
      for (const s of ss) {
        bestE1rm = Math.max(bestE1rm, e1rm(s.weight, s.reps));
        maxWeight = Math.max(maxWeight, s.weight);
        volume += s.weight * s.reps;
        totalReps += s.reps;
        maxReps = Math.max(maxReps, s.reps);
      }
      return { date, bestE1rm, maxWeight, volume, totalReps, maxReps, setCount: ss.length, sets: ss };
    });
}

/** Onko liike kehonpainoliike (kaikki painot 0)? Silloin mitataan toistoja. */
export function isBodyweight(sessions) {
  return sessions.length > 0 && sessions.every((s) => s.maxWeight === 0);
}

/** Ennätykset. */
export function personalRecords(sessions) {
  const pr = { bestE1rm: null, maxWeight: null, maxVolume: null, maxReps: null };
  for (const s of sessions) {
    if (!pr.bestE1rm || s.bestE1rm > pr.bestE1rm.value) pr.bestE1rm = { value: s.bestE1rm, date: s.date };
    if (!pr.maxWeight || s.maxWeight > pr.maxWeight.value) pr.maxWeight = { value: s.maxWeight, date: s.date };
    if (!pr.maxVolume || s.volume > pr.maxVolume.value) pr.maxVolume = { value: s.volume, date: s.date };
    if (!pr.maxReps || s.maxReps > pr.maxReps.value) pr.maxReps = { value: s.maxReps, date: s.date };
  }
  return pr;
}

/**
 * Trendi: pääsuureen paras arvo viimeisen `days` päivän aikana vs. sitä edeltävä yhtä pitkä jakso.
 * Palauttaa null jos kummaltakaan jaksolta ei ole dataa.
 */
export function trend(sessions, today, days = 28, metric = 'bestE1rm') {
  const end = fmtDate(today);
  const mid = fmtDate(addDays(today, -days));
  const start = fmtDate(addDays(today, -2 * days));
  let recent = 0, prev = 0, hasR = false, hasP = false;
  for (const s of sessions) {
    if (s.date > mid && s.date <= end) { recent = Math.max(recent, s[metric]); hasR = true; }
    else if (s.date > start && s.date <= mid) { prev = Math.max(prev, s[metric]); hasP = true; }
  }
  if (!hasR || !hasP || prev === 0) return null;
  return { recent, prev, pct: ((recent - prev) / prev) * 100 };
}

/**
 * Lineaarinen regressio pääsuureelle (yksikköä / viikko). Tarvitsee ≥3 sessiota.
 */
export function slopePerWeek(sessions, metric = 'bestE1rm') {
  if (sessions.length < 3) return null;
  const t0 = parseDate(sessions[0].date).getTime();
  const xs = sessions.map((s) => (parseDate(s.date).getTime() - t0) / (7 * 864e5));
  const ys = sessions.map((s) => s[metric]);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return num / den;
}

/** Edellinen sessio annetulle liikkeelle ennen päivää `beforeDate` (tai viimeisin). */
export function lastSession(sets, exercise, beforeDate) {
  const ss = exerciseSessions(sets, exercise).filter((s) => !beforeDate || s.date < beforeDate);
  return ss.length ? ss[ss.length - 1] : null;
}

// ---------- Aktiivisuus ----------

export function trainingDates(sets) {
  return [...new Set(sets.map((s) => s.date))].sort();
}

/** Käyntimäärät viikoittain viimeiset `weeks` viikkoa (vanhin ensin). */
export function weeklyCounts(sets, today, weeks = 12) {
  const dates = new Set(trainingDates(sets));
  const thisWeek = weekStart(today);
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(thisWeek, -7 * w);
    let c = 0;
    for (let i = 0; i < 7; i++) if (dates.has(fmtDate(addDays(ws, i)))) c++;
    out.push({ weekStart: fmtDate(ws), count: c });
  }
  return out;
}

/**
 * Viikkoputki: peräkkäiset viikot, joilla ≥ `target` käyntiä.
 * Kuluva viikko lasketaan mukaan jos tavoite jo täynnä; muuten se ei katkaise putkea.
 */
export function weekStreak(sets, today, target = 1) {
  const dates = new Set(trainingDates(sets));
  const countWeek = (ws) => {
    let c = 0;
    for (let i = 0; i < 7; i++) if (dates.has(fmtDate(addDays(ws, i)))) c++;
    return c;
  };
  let ws = weekStart(today);
  let streak = 0;
  if (countWeek(ws) >= target) streak++;
  ws = addDays(ws, -7);
  while (countWeek(ws) >= target) { streak++; ws = addDays(ws, -7); }
  return streak;
}

/** Yhteenveto aktiivisuudesta. */
export function activitySummary(sets, today) {
  const dates = trainingDates(sets);
  const t = fmtDate(today);
  const d30 = fmtDate(addDays(today, -29));
  const last30 = dates.filter((d) => d >= d30 && d <= t).length;
  const wk = weeklyCounts(sets, today, 12);
  // Keskiarvo vain niiltä viikoilta, joilla käyttäjä on jo kirjannut (ei rangaista alkua edeltävistä viikoista)
  const firstWeek = dates.length ? fmtDate(weekStart(parseDate(dates[0]))) : null;
  const relevant = firstWeek ? wk.filter((w) => w.weekStart >= firstWeek) : [];
  const avgPerWeek = relevant.length ? relevant.reduce((a, w) => a + w.count, 0) / relevant.length : 0;
  const lastDate = dates.length ? dates[dates.length - 1] : null;
  const daysSince = lastDate ? Math.round((parseDate(t) - parseDate(lastDate)) / 864e5) : null;
  return { totalSessions: dates.length, last30, avgPerWeek, lastDate, daysSince };
}

/** Kuukausittaiset käynnit ja volyymi viimeiset `months` kk (vanhin ensin). */
export function monthlyStats(sets, today, months = 6) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = fmtDate(d).slice(0, 7);
    const own = sets.filter((s) => s.date.startsWith(key));
    out.push({
      month: key,
      sessions: new Set(own.map((s) => s.date)).size,
      volume: own.reduce((a, s) => a + s.weight * s.reps, 0),
      sets: own.length,
    });
  }
  return out;
}

// ---------- CSV ----------

export function toCSV(sets) {
  const esc = (v) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['date', 'exercise', 'weight', 'reps']];
  for (const s of [...sets].sort((a, b) => (a.date === b.date ? (a.ts ?? 0) - (b.ts ?? 0) : a.date < b.date ? -1 : 1)))
    rows.push([s.date, s.exercise, s.weight, s.reps]);
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!header) return [];
  const idx = (n) => header.map((h) => h.trim().toLowerCase()).indexOf(n);
  const [di, ei, wi, ri] = ['date', 'exercise', 'weight', 'reps'].map(idx);
  if ([di, ei, wi, ri].some((x) => x < 0)) throw new Error('CSV:stä puuttuu sarake (date, exercise, weight, reps)');
  return body.map((r, i) => ({
    date: r[di].trim(),
    exercise: normalizeName(r[ei]),
    weight: Number(String(r[wi]).replace(',', '.')),
    reps: Number(r[ri]),
    ts: i,
  })).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.exercise && isFinite(s.weight) && s.reps > 0);
}
