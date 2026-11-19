// 게임 데이터 검사: JSON 문법, 참조(특성·행동·자리·루트·기억), 특성 충돌, 대사 조건, 금지어, 1일 시뮬레이션 점검
// 사용: npm run validate   (CI에서 실패하면 배포가 멈춤)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = (p) => path.join(root, 'public', 'data', p);
const errors = [], warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { err(`${path.relative(root, p)}: JSON 오류 — ${e.message}`); return null; } };

const F = ['map', 'residents', 'needs', 'traits', 'actions', 'memory', 'romance', 'talk', 'news', 'daylight'];
const data = Object.fromEntries(F.map((k) => [k, load(D(`${k}.json`))]));
load(path.join(root, 'public', 'assets', 'manifest.json'));
if (errors.length) finish();
const { map, residents, needs, traits, actions, memory, talk, news } = data;
const NEEDS = Object.keys(needs.needs);
const TR = traits.traits;
const ACT = actions.actions;

// ── map
if (map.rows.length !== map.height) err(`map.json: rows ${map.rows.length}줄 ≠ height ${map.height}`);
map.rows.forEach((r, y) => { if (r.length !== map.width) err(`map.json: ${y}번째 줄 길이 ${r.length}`); for (const c of r) if (!map.legend[c]) { err(`map.json: ${y}번째 줄 '${c}' 가 legend에 없음`); break; } });
const walk = (x, y) => map.legend[map.rows[y]?.[x]]?.walkable;
for (const [id, s] of Object.entries(map.spots)) if (!walk(s.x, s.y)) err(`map.json: 자리 ${id} (${s.x},${s.y})가 막힌 칸`);
for (const [id, r] of Object.entries(map.routes)) r.forEach(([x, y]) => { if (!walk(x, y)) err(`map.json: 루트 ${id} (${x},${y})가 막힌 칸`); });

// ── traits
for (const [id, t] of Object.entries(TR)) {
  for (const c of t.conflicts ?? []) {
    if (!TR[c]) err(`traits.json ${id}: 충돌 대상 '${c}' 없음`);
    else if (!(TR[c].conflicts ?? []).includes(id)) warn(`traits.json: ${id}↔${c} 충돌이 한쪽에만 적혀 있음`);
  }
  for (const [hook, m] of Object.entries(t.mods ?? {})) {
    if (typeof m !== 'object' || (m.mul == null && m.add == null)) err(`traits.json ${id}.${hook}: {mul} 또는 {add} 필요`);
    const [head, a, b] = hook.split('.');
    if (['needDecay', 'needPerceived', 'moodWeight'].includes(head) && !NEEDS.includes(a)) err(`traits.json ${id}: '${hook}' 의 욕구 '${a}' 없음`);
    if (head === 'needGain' && (!NEEDS.includes(a) || !(b?.startsWith('tag:') || ACT[b]))) err(`traits.json ${id}: '${hook}' — needGain.<욕구>.<행동|tag:태그>`);
    if (['actionScore', 'actionDuration', 'interruptAt'].includes(head) && a && !a.startsWith('tag:') && !ACT[a]) err(`traits.json ${id}: '${hook}' 의 행동 '${a}' 없음`);
  }
}

// ── residents
const RID = residents.residents.map((r) => r.id);
for (const r of residents.residents) {
  const w = `residents.json ${r.id}`;
  for (const t of r.traits) if (!TR[t]) err(`${w}: 특성 '${t}' 없음`);
  if (r.traits.length < 1 || r.traits.length > 2) err(`${w}: 특성은 1~2개`);
  for (const a of r.traits) for (const b of TR[a]?.conflicts ?? []) if (r.traits.includes(b)) err(`${w}: '${a}'와 '${b}'는 함께 가질 수 없음`);
  if (!needs.chronotypes[r.chrono]) err(`${w}: 생활리듬 '${r.chrono}' 없음`);
  if (!map.spots[r.desk]) err(`${w}: 책상 '${r.desk}' 없음`);
  if (!map.buildings.find((b) => b.id === r.house && b.kind === 'house')) err(`${w}: 집 '${r.house}' 없음`);
  if (!(r.extro >= 0 && r.extro <= 100)) err(`${w}: extro 는 0~100`);
  for (const [k, v] of Object.entries(r.abilities)) if (!(v >= 1 && v <= 5)) err(`${w}: 능력 ${k} 는 1~5`);
}
for (const x of residents.relations ?? []) for (const id of [x.a, x.b]) if (!RID.includes(id)) err(`residents.json relations: '${id}' 없음`);
for (const c of Object.values(needs.chronotypes)) if (c.curve.length !== 24) err(`needs.json: 생활리듬 curve 는 24개`);

// ── actions
for (const [id, a] of Object.entries(ACT)) {
  const w = `actions.json ${id}`;
  for (const at of a.at) {
    if (['home', 'desk', 'person'].includes(at)) continue;
    if (at.startsWith('route:')) { if (!map.routes[at.slice(6)]) err(`${w}: 루트 '${at}' 없음`); continue; }
    if (at.startsWith('spots:')) { if (!Object.keys(map.spots).some((k) => k.startsWith(at.slice(6)))) err(`${w}: '${at}' 에 맞는 자리 없음`); continue; }
    err(`${w}: 알 수 없는 자리 '${at}'`);
  }
  for (const k of Object.keys(a.rates ?? {})) if (!NEEDS.includes(k)) err(`${w}: rates '${k}' 는 욕구가 아님`);
  if (a.skill && !actions.skills[a.skill]) err(`${w}: 숙련 '${a.skill}' 없음`);
  if (!Array.isArray(a.minutes) || a.minutes[0] > a.minutes[1]) err(`${w}: minutes 는 [최소, 최대]`);
}

// ── memory / talk / news
for (const [k, m] of Object.entries(memory.kinds)) {
  if (!['person', 'activity', 'place'].includes(m.subject)) err(`memory.json ${k}: subject 는 person/activity/place`);
  if (!(m.valence >= -1 && m.valence <= 1)) err(`memory.json ${k}: valence 는 -1~1`);
}
const KINDS = new Set(['greet', 'chat', 'brushoff', 'comfort', 'jealous', 'invite_yes', 'invite_no', 'confess', 'confess_no', ...Object.keys(ACT).filter((k) => ACT[k].partner).map((k) => `invite_${k}`)]);
const WHEN = ['outcome', 'register', 'aTrait', 'bTrait', 'aAction', 'aNeed', 'aMood', 'place', 'timeBand', 'lovers'];
const ids = new Set();
talk.lines.forEach((l, i) => {
  const w = `talk.json lines[${i}]`;
  if (!KINDS.has(l.kind)) err(`${w}: kind '${l.kind}' 는 쓰이지 않음`);
  if (!l.a) err(`${w}: a(대사) 없음`);
  for (const [k, v] of Object.entries(l.when ?? {})) {
    if (!WHEN.includes(k)) err(`${w}: when.${k} 는 지원하지 않는 조건`);
    for (const x of [v].flat()) {
      if ((k === 'aTrait' || k === 'bTrait') && !TR[x]) err(`${w}: 특성 '${x}' 없음`);
      if (k === 'aAction' && !ACT[x]) err(`${w}: 행동 '${x}' 없음`);
      if (k === 'aNeed' && !NEEDS.includes(x)) err(`${w}: 욕구 '${x}' 없음`);
    }
  }
});
for (const k of KINDS) if (!talk.lines.some((l) => l.kind === k)) warn(`talk.json: '${k}' 대사가 없음 (기본 문구로 대체)`);

// ── 금지어
const banned = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'banned-words.json'), 'utf8'));
const rules = [...banned.errors.map((r) => ({ ...r, rx: new RegExp(r.re), lv: 'e' })), ...banned.warnings.map((r) => ({ ...r, rx: new RegExp(r.re), lv: 'w' }))];
function* strings(v, p) {
  if (typeof v === 'string') yield [p, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${p}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) yield* strings(x, `${p}.${k}`);
}
for (const f of fs.readdirSync(D('.'))) {
  if (!f.endsWith('.json')) continue;
  const d = load(D(f));
  for (const [p, s] of strings(d, '')) for (const r of rules) if (r.rx.test(s)) (r.lv === 'e' ? err : warn)(`금지어 ${f}${p}: "${s}" — ${r.why}`);
}

// ── 1일 시뮬레이션 점검 (코드·데이터가 함께 돌아가는지)
if (!errors.length) {
  const { Sim } = await import('../src/sim/Sim.js');
  try {
    const sim = new Sim(data, Sim.newState(data, Date.UTC(2026, 10, 23, 0), { seed: 1 }));
    let starving = 0;
    for (let s = 0; s < 24 * 3600; s += 15) {
      sim.tick(15); sim.out.length = 0;
      for (const r of sim.list()) if (r.needs.hunger < 1) starving += 15;
    }
    if (starving > 3 * 3600) warn(`시뮬레이션: 하루 동안 굶주린 시간 합계 ${(starving / 3600).toFixed(1)}시간`);
  } catch (e) {
    err(`시뮬레이션 실행 오류: ${e.stack}`);
  }
}

finish();
function finish() {
  for (const w of warnings) console.warn(`⚠️  ${w}`);
  for (const e of errors) console.error(`❌ ${e}`);
  console.log(`\n검사 완료: 오류 ${errors.length}개, 경고 ${warnings.length}개`);
  process.exit(errors.length ? 1 : 0);
}
