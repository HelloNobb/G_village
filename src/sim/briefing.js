// 일별 사건 브리핑: 그날 생긴 사건 중 드물고 강한 것 + 행동이 모여서 생긴 패턴
import { fill } from './text.js';

export function buildBriefing(sim, events, fromDay, toDay, perDay = 5) {
  const out = [];
  const P = sim.data.news.patterns;
  for (let d = fromDay; d <= toDay; d++) {
    const items = [];
    const seen = new Set();
    const perType = {};
    const evs = events.filter((e) => e.day === d && e.importance >= 15 && e.text).sort((a, b) => b.importance - a.importance);
    for (const e of evs) {
      const key = `${e.type}:${[...e.actors].sort().join(',')}`;
      if (seen.has(key) || (perType[e.type] ?? 0) >= 2) continue;
      seen.add(key);
      perType[e.type] = (perType[e.type] ?? 0) + 1;
      items.push({ text: e.text, trait: e.trait, importance: e.importance });
      if (items.length >= perDay - 1) break;
    }
    // 패턴
    const st = sim.state.stats[d];
    if (st) {
      for (const r of sim.list()) {
        const row = st.place[r.id] ?? {};
        const awake = Object.entries(row).filter(([k]) => k !== 'sleep');
        const total = awake.reduce((s, [, v]) => s + v, 0);
        const top = awake.filter(([k]) => !['home', 'street'].includes(k)).sort((a, b) => b[1] - a[1])[0];
        if (top && total > 240 && top[1] / total >= 0.45) items.push({ text: fill(P.place, { a: r.name, place: sim.areaName(top[0]) }), importance: 20 });
        const covered = Object.values(row).reduce((x, y) => x + y, 0);
        if (d < toDay && covered > 20 * 60 && (row.sleep ?? 0) < 180) items.push({ text: fill(P.sleepless, { a: r.name }), importance: 30 });
      }
      for (const [k, n] of Object.entries(st.pairs)) {
        const [ia, ib] = k.split('|');
        if (n < 5 || sim.get(ia).lover === ib) continue;
        const [a, b] = [ia, ib].map((id) => sim.get(id).name);
        items.push({ text: fill(P.pairTalks, { a, b, n }), importance: 18 + n });
      }
    }
    items.sort((a, b) => b.importance - a.importance);
    out.push({ day: d, items: items.length ? items.slice(0, perDay) : [{ text: P.quiet, importance: 0 }] });
  }
  return out;
}
