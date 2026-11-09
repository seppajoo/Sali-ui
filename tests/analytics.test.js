import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../analytics.js';

const S = (date, exercise, weight, reps, ts = 0) => ({ date, exercise, weight, reps, ts });
const today = A.parseDate('2026-11-09'); // maanantai

test('e1rm', () => {
  assert.equal(A.e1rm(100, 1), 100);
  assert.equal(A.e1rm(100, 0), 0);
  assert.ok(Math.abs(A.e1rm(100, 5) - 116.667) < 0.01);
});

test('weekStart = maanantai', () => {
  assert.equal(A.fmtDate(A.weekStart(A.parseDate('2026-11-15'))), '2026-11-09'); // su
  assert.equal(A.fmtDate(A.weekStart(A.parseDate('2026-11-09'))), '2026-11-09'); // ma
});

test('exerciseSessions laskee päiväkohtaiset arvot', () => {
  const sets = [S('2026-11-01', 'Penkki', 80, 5), S('2026-11-01', 'Penkki', 85, 3), S('2026-11-03', 'Penkki', 90, 1), S('2026-11-03', 'Kyykky', 100, 5)];
  const ss = A.exerciseSessions(sets, 'Penkki');
  assert.equal(ss.length, 2);
  assert.equal(ss[0].date, '2026-11-01');
  assert.equal(ss[0].maxWeight, 85);
  assert.equal(ss[0].volume, 80 * 5 + 85 * 3);
  assert.equal(ss[0].setCount, 2);
  assert.equal(ss[1].bestE1rm, 90);
  const pr = A.personalRecords(ss);
  assert.equal(pr.maxWeight.value, 90);
  assert.equal(pr.maxVolume.date, '2026-11-01');
});

test('trend vertaa jaksoja', () => {
  const sets = [S('2026-09-20', 'P', 100, 1), S('2026-10-25', 'P', 110, 1)];
  const t = A.trend(A.exerciseSessions(sets, 'P'), today, 28);
  assert.equal(t.prev, 100);
  assert.equal(t.recent, 110);
  assert.ok(Math.abs(t.pct - 10) < 1e-9);
  assert.equal(A.trend(A.exerciseSessions([sets[1]], 'P'), today), null);
});

test('slopePerWeek', () => {
  const sets = [S('2026-10-01', 'P', 100, 1), S('2026-10-08', 'P', 102, 1), S('2026-10-15', 'P', 104, 1)];
  assert.ok(Math.abs(A.slopePerWeek(A.exerciseSessions(sets, 'P')) - 2) < 1e-9);
  assert.equal(A.slopePerWeek(A.exerciseSessions(sets.slice(0, 2), 'P')), null);
});

test('bodyweight-tunnistus', () => {
  assert.ok(A.isBodyweight(A.exerciseSessions([S('2026-11-01', 'Leuat', 0, 8)], 'Leuat')));
  assert.ok(!A.isBodyweight(A.exerciseSessions([S('2026-11-01', 'Leuat', 10, 5)], 'Leuat')));
});

test('weeklyCounts ja weekStreak', () => {
  const sets = [
    S('2026-11-09', 'P', 1, 1), // tämä viikko
    S('2026-11-03', 'P', 1, 1), S('2026-11-05', 'P', 1, 1), // ed. viikko 2 krt
    S('2026-10-28', 'P', 1, 1), S('2026-10-28', 'K', 1, 1), // 1 päivä (2 liikettä)
    // 2026-10-19 viikko tyhjä
    S('2026-10-14', 'P', 1, 1),
  ];
  const wk = A.weeklyCounts(sets, today, 4);
  assert.deepEqual(wk.map((w) => w.count), [0, 1, 2, 1]);
  assert.equal(A.weekStreak(sets, today, 1), 3);
  // tavoite 2: kuluva viikko vajaa ei katkaise, ed. viikko 2 -> 1, sitä ed. 1 -> katkeaa
  assert.equal(A.weekStreak(sets, today, 2), 1);
});

test('activitySummary', () => {
  const sets = [S('2026-11-07', 'P', 1, 1), S('2026-10-01', 'P', 1, 1)];
  const s = A.activitySummary(sets, today);
  assert.equal(s.totalSessions, 2);
  assert.equal(s.last30, 1);
  assert.equal(s.daysSince, 2);
});

test('CSV edestakaisin', () => {
  const sets = [S('2026-11-01', 'Pystypunnerrus, käsipainot', 22.5, 8, 1), S('2026-11-01', 'Kyykky "low bar"', 100, 5, 2)];
  const back = A.parseCSV(A.toCSV(sets));
  assert.equal(back.length, 2);
  assert.equal(back[0].exercise, 'Pystypunnerrus, käsipainot');
  assert.equal(back[1].exercise, 'Kyykky "low bar"');
  assert.equal(back[0].weight, 22.5);
});

test('exerciseList järjestää viimeisimmän mukaan', () => {
  const sets = [S('2026-11-01', 'A', 1, 1), S('2026-11-05', 'B', 1, 1), S('2026-11-03', 'C', 1, 1)];
  assert.deepEqual(A.exerciseList(sets), ['B', 'C', 'A']);
});

test('isoWeek', () => {
  assert.equal(A.isoWeek(A.parseDate('2026-11-09')), 46);
  assert.equal(A.isoWeek(A.parseDate('2026-01-01')), 1);
  assert.equal(A.isoWeek(A.parseDate('2027-01-03')), 53);
});
