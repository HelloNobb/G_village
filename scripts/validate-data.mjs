// 게임 데이터 검증: JSON 문법, 참조(스폿·루트·주민·장소), 시간 형식, 스케줄 빈틈, 대사 id 중복, 금지어.
// 사용: npm run validate   (CI에서 실패하면 배포가 멈춘다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScheduleSystem } from '../src/systems/ScheduleSystem.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = (p) => path.join(root, 'public', 'data', p);
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function load(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    err(`${path.relative(root, p)}: JSON 오류 — ${e.message}`);
    return null;
  }
}

const hm = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  if (!m || +m[2] > 59 || +m[1] > 29) return null;
  return +m[1] * 60 + +m[2];
};

const npcs = load(D('npcs.json'));
const map = load(D('map.json'));
const sched = load(D('schedules.json'));
const places = load(D('places.json'));
const ambient = load(D('ambient.json'));
load(D('daylight.json'));
load(path.join(root, 'public', 'assets', 'manifest.json'));
if (!npcs || !map || !sched || !places || !ambient) finish();

const residents = npcs.residents.map((n) => n.id);
const allChars = [...residents, ...(npcs.pets ?? []).map((p) => p.id)];
const placeIds = Object.keys(places.places);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAYSETS = { all: DAYS, weekday: DAYS.slice(0, 5), weekend: ['sat', 'sun'] };
const BANDS = ['dawn', 'morning', 'lunch', 'afternoon', 'evening', 'night', 'latenight'];
const CONTEXTS = ['talk', 'knock', 'busy'];

// ── map ──
if (map.rows.length !== map.height) err(`map.json: rows ${map.rows.length}줄 ≠ height ${map.height}`);
map.rows.forEach((r, y) => {
  if (r.length !== map.width) err(`map.json: ${y}번째 줄 길이 ${r.length} ≠ width ${map.width}`);
  for (const c of r) if (!map.legend[c]) { err(`map.json: ${y}번째 줄에 legend에 없는 글자 '${c}'`); break; }
});
const walk = (x, y) => map.legend[map.rows[y]?.[x]]?.walkable;
for (const [id, s] of Object.entries(map.spots)) if (!walk(s.x, s.y)) err(`map.json: 스폿 ${id} (${s.x},${s.y})이 막힌 칸`);
for (const [id, r] of Object.entries(map.routes)) r.forEach(([x, y]) => { if (!walk(x, y)) err(`map.json: 루트 ${id} 지점 (${x},${y})이 막힌 칸`); });
for (const n of npcs.residents) if (!map.buildings.find((b) => b.id === n.house)) err(`npcs.json: ${n.id}의 집 ${n.house}이 map.json buildings에 없음`);

// ── schedules ──
const activities = new Set();
for (const id of residents) {
  const s = sched.npcs[id];
  if (!s) { err(`schedules.json: 주민 ${id}의 스케줄 없음`); continue; }
  const all = [s.default, ...(s.entries ?? [])];
  all.forEach((e, i) => {
    const where = `schedules.json ${id}[${i === 0 ? 'default' : i - 1}]`;
    if (!e) return err(`${where}: 비어 있음`);
    activities.add(e.activity);
    const targets = [e.at, e.route, e.follow].filter(Boolean).length;
    if (targets !== 1) err(`${where}: at / route / follow 중 정확히 하나만 있어야 함`);
    for (const a of [e.at].flat().filter(Boolean)) if (!map.spots[a]) err(`${where}: 스폿 '${a}' 없음`);
    if (e.route && !map.routes[e.route]) err(`${where}: 루트 '${e.route}' 없음`);
    if (e.follow && !residents.includes(e.follow)) err(`${where}: follow 대상 '${e.follow}' 없음`);
    if (i === 0) return;
    const f = hm(e.from), t = hm(e.to);
    if (f == null || t == null) err(`${where}: 시각 형식 오류 (${e.from}~${e.to}) — HH:MM, 05:00~29:00`);
    else if (f >= t) err(`${where}: from(${e.from}) ≥ to(${e.to})`);
    else if (f < 300 || t > 1740) warn(`${where}: 게임 하루(05:00~29:00) 밖 시각`);
    const days = [e.days ?? 'all'].flat();
    for (const d of days) if (!DAYS.includes(d) && !DAYSETS[d]) err(`${where}: 알 수 없는 days '${d}'`);
  });
  // 빈틈 검사 (default로 채워지는 구간 경고)
  for (const day of DAYS) {
    const cover = new Uint8Array(1740);
    for (const e of s.entries ?? []) {
      const set = [e.days ?? 'all'].flat().flatMap((d) => DAYSETS[d] ?? [d]);
      if (!set.includes(day)) continue;
      for (let m = hm(e.from); m < hm(e.to); m++) cover[m] = 1;
    }
    let gap = 0;
    for (let m = 300; m < 1740; m++) if (!cover[m]) gap++;
    if (gap > 0) warn(`schedules.json ${id}: ${day}에 스케줄 없는 시간 ${gap}분 (default로 처리됨)`);
  }
}

// ── 활동 시간 목표 검사 (경고) ──
// 06:00~21:00: 누군가 한 명은 밖을 걸어 다님(route/follow) / 21:00~24:00: 주민 절반(2명 이상)이 밖에 있음
if (!errors.length) {
  const ss = new ScheduleSystem(sched);
  const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const ranges = (mins) => {
    const out = [];
    for (const m of mins) {
      const last = out[out.length - 1];
      if (last && last[1] === m - 1) last[1] = m; else out.push([m, m]);
    }
    return out.map(([a, b]) => `${fmt(a)}~${fmt(b + 1)}`).join(', ');
  };
  for (const day of DAYS) {
    const t = { day, dayType: DAYSETS.weekend.includes(day) ? 'weekend' : 'weekday' };
    const noWalker = [], fewOutside = [];
    for (let m = 6 * 60; m < 24 * 60; m++) {
      const res = residents.map((id) => ss.resolve(id, { ...t, dayMin: m }));
      const walking = res.filter((r) => r.target.type !== 'spot').length;
      const outside = res.filter((r) => r.target.type !== 'spot' || !map.spots[r.target.spot]?.inside).length;
      if (m < 21 * 60 && walking === 0) noWalker.push(m);
      if (m >= 21 * 60 && outside < 2) fewOutside.push(m);
    }
    if (noWalker.length) warn(`schedules.json ${day}: 밖을 걷는 주민이 없는 시간 ${ranges(noWalker)}`);
    if (fewOutside.length) warn(`schedules.json ${day}: 밤에 밖에 있는 주민이 2명 미만인 시간 ${ranges(fewOutside)}`);
  }
}

// ── news.json ──
const news = load(D('news.json'));
if (news) {
  for (const k of Object.keys(news.activity ?? {})) if (!activities.has(k)) warn(`news.json: activity '${k}'는 스케줄에 없음`);
  for (const a of activities) if (!(a in (news.activity ?? {}))) warn(`news.json: activity '${a}' 문구 없음 (소식이 안 뜸)`);
  for (const k of Object.keys(news.npcActivity ?? {})) {
    const [n, a] = k.split('.');
    if (!residents.includes(n) || !activities.has(a)) err(`news.json npcActivity: '${k}' — 주민id.activity 형식이어야 함`);
  }
  for (const r of Object.keys(news.routes ?? {})) if (!map.routes[r]) warn(`news.json routes: '${r}' 루트 없음`);
}

// ── places ──
for (const a of map.areas) if (!placeIds.includes(a.id)) err(`map.json: 구역 '${a.id}'이 places.json에 없음`);
for (const [id, p] of Object.entries(places.places)) {
  for (const [k, v] of Object.entries(p.hours ?? {})) {
    if (!DAYS.includes(k) && !DAYSETS[k]) err(`places.json ${id}: hours 키 '${k}'`);
    if (v !== null && (!Array.isArray(v) || hm(v[0]) == null || hm(v[1]) == null)) err(`places.json ${id}.${k}: ["HH:MM","HH:MM"] 또는 null`);
  }
}

// ── when 검사 공통 ──
const WHEN_KEYS = ['context', 'place', 'activity', 'timeBand', 'dayType', 'days', 'months', 'familiarity', 'with', 'without', 'firstMeet', 'moving'];
function checkWhen(w, where) {
  if (!w) return;
  for (const k of Object.keys(w)) if (!WHEN_KEYS.includes(k) && !k.startsWith('_')) err(`${where}: when.${k} 는 지원하지 않는 조건`);
  const arr = (v) => [v].flat();
  if (w.context && !CONTEXTS.includes(w.context)) err(`${where}: context '${w.context}'`);
  for (const p of arr(w.place ?? [])) if (!placeIds.includes(p)) err(`${where}: place '${p}' 없음`);
  for (const a of arr(w.activity ?? [])) if (!activities.has(a)) err(`${where}: activity '${a}'는 스케줄에 없음`);
  for (const b of arr(w.timeBand ?? [])) if (!BANDS.includes(b)) err(`${where}: timeBand '${b}'`);
  if (w.dayType && !['weekday', 'weekend'].includes(w.dayType)) err(`${where}: dayType '${w.dayType}'`);
  for (const d of arr(w.days ?? [])) if (!DAYS.includes(d)) err(`${where}: days '${d}'`);
  for (const m of arr(w.months ?? [])) if (!(m >= 1 && m <= 12)) err(`${where}: months '${m}'`);
  for (const n of [...arr(w.with ?? []), ...arr(w.without ?? [])]) if (!residents.includes(n)) err(`${where}: 주민 '${n}' 없음`);
}

// ── dialogue ──
const ids = new Set();
for (const id of allChars) {
  const f = D(`dialogue/${id}.json`);
  if (!fs.existsSync(f)) { err(`dialogue/${id}.json 없음`); continue; }
  const d = load(f);
  if (!d) continue;
  for (const [group, list] of [['lines', d.lines ?? []], ['fallback', d.fallback ?? []]]) {
    list.forEach((l, i) => {
      const where = `dialogue/${id}.json ${group}[${i}] (${l.id ?? '?'})`;
      if (!l.id) err(`${where}: id 없음`);
      else if (ids.has(l.id)) err(`${where}: id 중복`);
      else ids.add(l.id);
      if (!Array.isArray(l.pages) || !l.pages.length || l.pages.some((p) => typeof p !== 'string' || !p.trim())) err(`${where}: pages는 비어 있지 않은 문자열 배열`);
      checkWhen(l.when, where);
    });
  }
  if (!(d.fallback ?? []).length) warn(`dialogue/${id}.json: fallback 없음`);
}

// ── ambient ──
(ambient.scripts ?? []).forEach((s, i) => {
  const where = `ambient.json scripts[${i}] (${s.id})`;
  if (!s.id || ids.has(s.id)) err(`${where}: id 없음/중복`);
  ids.add(s.id);
  for (const p of s.participants ?? []) if (!residents.includes(p)) err(`${where}: 참여자 '${p}' 없음`);
  for (const l of s.lines ?? []) if (!(s.participants ?? []).includes(l.s)) err(`${where}: 말하는 사람 '${l.s}'가 participants에 없음`);
  checkWhen(s.when, where);
});
(ambient.passing ?? []).forEach((p, i) => {
  for (const id of p.pair ?? []) if (!residents.includes(id)) err(`ambient.json passing[${i}]: '${id}' 없음`);
  for (const l of p.lines ?? []) if (!(p.pair ?? []).includes(l.s)) err(`ambient.json passing[${i}]: '${l.s}'가 pair에 없음`);
});

// ── 금지어 ──
const banned = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'banned-words.json'), 'utf8'));
const rules = [
  ...banned.errors.map((r) => ({ ...r, rx: new RegExp(r.re), level: 'error' })),
  ...banned.warnings.map((r) => ({ ...r, rx: new RegExp(r.re), level: 'warn' })),
];
function* strings(v, p) {
  if (typeof v === 'string') yield [p, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${p}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) yield* strings(x, `${p}.${k}`);
}
function walkDir(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walkDir(full);
    else if (f.name.endsWith('.json')) {
      const data = load(full);
      if (!data) continue;
      for (const [p, s] of strings(data, '')) {
        for (const r of rules) {
          if (r.rx.test(s)) (r.level === 'error' ? err : warn)(`금지어 ${path.relative(root, full)}${p}: "${s}" — ${r.why}`);
        }
      }
    }
  }
}
walkDir(path.join(root, 'public', 'data'));

finish();

function finish() {
  for (const w of warnings) console.warn(`⚠️  ${w}`);
  for (const e of errors) console.error(`❌ ${e}`);
  console.log(`\n검사 완료: 오류 ${errors.length}개, 경고 ${warnings.length}개`);
  process.exit(errors.length ? 1 : 0);
}
