// 화면 없이 마을을 며칠 돌려서 수치(밸런스)를 확인하는 도구
//   npm run sim            → 7일
//   npm run sim -- 14 42   → 14일, 시드 42
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim } from '../src/sim/Sim.js';
import { kst, DAY } from '../src/sim/time.js';
import { buildBriefing } from '../src/sim/briefing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
export function loadData() {
  return {
    map: J('map.json'), residents: J('residents.json'), needs: J('needs.json'), traits: J('traits.json'), actions: J('actions.json'),
    memory: J('memory.json'), romance: J('romance.json'), talk: J('talk.json'), news: J('news.json'),
  };
}

if (process.argv[1] && process.argv[1].endsWith('simulate.mjs')) {
  const days = Number(process.argv[2] ?? 7);
  const seed = Number(process.argv[3] ?? 7);
  const data = loadData();
  const start = Date.UTC(2026, 10, 23, 8 - 9, 0); // 11/23 08:00 KST
  const sim = new Sim(data, Sim.newState(data, start, { seed }));
  const ids = sim.list().map((r) => r.id);
  const m = Object.fromEntries(ids.map((id) => [id, { act: {}, sleepStarts: [], zeroHunger: 0, zeroEnergy: 0, mood: { good: 0, okay: 0, bad: 0 }, lastAct: null }]));
  const all = [];
  sim.capture = all;
  const STEP = 15;
  for (let s = 0; s < (days * DAY) / 1000; s += STEP) {
    sim.tick(STEP);
    sim.out.length = 0;
    for (const r of sim.list()) {
      const x = m[r.id];
      const a = r.action?.phase === 'do' ? r.action.id : r.action ? 'travel' : 'none';
      x.act[a] = (x.act[a] ?? 0) + STEP / 3600;
      if (a === 'sleep' && x.lastAct !== 'sleep') x.sleepStarts.push(kst(sim.now).hour);
      x.lastAct = a;
      if (r.needs.hunger < 1) x.zeroHunger += STEP / 3600;
      if (r.needs.energy < 1) x.zeroEnergy += STEP / 3600;
      x.mood[sim.moodLevel(r)] += STEP;
    }
  }
  console.log(`=== ${days}일 시뮬레이션 (seed ${seed}) ===`);
  for (const r of sim.list()) {
    const x = m[r.id];
    const tot = Object.values(x.mood).reduce((a, b) => a + b, 0);
    const top = Object.entries(x.act).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => `${k} ${(v / days).toFixed(1)}h`).join(' · ');
    const hist = {}; x.sleepStarts.forEach((h) => (hist[h] = (hist[h] ?? 0) + 1));
    console.log(`\n[${r.name}] ${r.traits.join('+')} / ${r.chrono} | Lv.${r.lv} xp ${r.xp.toFixed(1)} | 돈 ${Math.round(r.money)} 식료품 ${r.groceries} | 연인 ${r.lover ?? '-'}`);
    console.log(`  하루 평균: ${top}`);
    console.log(`  잠든 시각: ${Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h}시×${n}`).join(' ')}`);
    console.log(`  기분: 좋음 ${((x.mood.good / tot) * 100).toFixed(0)}% 양호 ${((x.mood.okay / tot) * 100).toFixed(0)}% 나쁨 ${((x.mood.bad / tot) * 100).toFixed(0)}% | 허기0 ${x.zeroHunger.toFixed(1)}h 수면0 ${x.zeroEnergy.toFixed(1)}h`);
    console.log(`  욕구 지금: ${Object.entries(r.needs).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' ')}`);
    console.log(`  기억: 단기 ${r.memory.short.length} 장기 ${r.memory.long.length} | 피함: ${Object.keys(r.flags.avoid ?? {}).join(', ') || '-'}`);
  }
  console.log('\n관계 (호감도 →):');
  for (const a of ids) console.log(`  ${a.padEnd(6)} ` + ids.map((b) => (a === b ? '   -  ' : `${sim.rel(a, b).known ? '' : '?'}${Math.round(sim.rel(a, b).affinity)}`.padStart(6))).join(''));
  const counts = {};
  all.forEach((e) => (counts[e.type] = (counts[e.type] ?? 0) + 1));
  console.log('\n사건 수:', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('\n브리핑 (마지막 3일):');
  for (const d of buildBriefing(sim, all, Math.max(0, sim.day - 2), sim.day)) {
    console.log(`  Day ${d.day}`);
    d.items.forEach((i) => console.log(`   · ${i.trait ? `[${sim.traits.defs[i.trait].name}] ` : ''}${i.text}`));
  }
}
