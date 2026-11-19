// 마을 시뮬레이션 본체 (Phaser 없음 — 브라우저·접속 안 한 동안 계산·Node 시뮬레이터가 같은 코드를 씀)
import { Rng } from './rng.js';
import { kst, kstMidnight, dayIndex, inHours, hm, HOUR, MIN, DAY } from './time.js';
import { Grid } from './grid.js';
import { Traits } from './traits.js';
import { Memory } from './memory.js';
import { fill } from './text.js';

const NEEDS = ['hunger', 'energy', 'fun', 'achievement', 'social'];
const WALK_PX = 40; // px / 시뮬레이션 초
const SOCIAL_EVERY = 20; // 초
const NEAR_TALK = 3 * 32;
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class Sim {
  /**
   * @param {object} data { map, residents, needs, traits, actions, memory, romance, talk, news, events }
   * @param {object} state 저장된 상태 (없으면 Sim.newState 로 만든 것)
   */
  constructor(data, state) {
    this.data = data;
    this.state = state;
    this.grid = new Grid(data.map);
    this.traits = new Traits(data.traits);
    this.memory = new Memory(data.memory, this.traits);
    this.actions = data.actions.actions;
    this.needsCfg = data.needs;
    this.rng = new Rng(state.rng);
    this.out = []; // 화면으로 보낼 일회성 이벤트 (말풍선·태그)
    this.capture = null; // 접속 안 한 동안 계산할 때 사건 모으기
    for (const r of this.list()) this.refreshFocus(r);
  }

  // ───────────────────────────── 생성
  static newState(data, now, { randomTraits = false, seed } = {}) {
    const rng = new Rng(seed ?? (now ^ 0x9e3779b9) >>> 0);
    const traits = new Traits(data.traits);
    const grid = new Grid(data.map);
    const t = kst(now);
    const residents = {};
    for (const def of data.residents.residents) {
      const chrono = data.needs.chronotypes[def.chrono];
      const asleep = inHours(t.h, chrono.sleepWindow);
      const home = grid.houses[def.house];
      const c = grid.center(home.front.x, home.front.y);
      residents[def.id] = {
        id: def.id, name: def.name, color: def.color, sprite: def.sprite, house: def.house, desk: def.desk,
        traits: randomTraits ? traits.randomSet(rng) : [...def.traits],
        extro: def.extro, chrono: def.chrono, abilities: { ...def.abilities },
        needs: {
          hunger: rng.range(55, 85), energy: asleep ? rng.range(35, 55) : rng.range(65, 90),
          fun: rng.range(50, 80), achievement: rng.range(45, 75), social: rng.range(45, 75),
        },
        moodlets: [], mood: 30,
        money: def.money, groceries: def.groceries,
        lv: 1, xp: 0, skills: { exercise: 0, reading: 0, game: 0, drawing: 0 },
        memory: { short: [], long: [] },
        pos: c, path: [], hidden: def.house, facing: 'down',
        action: null, lastAction: null, lover: null, focusPerson: null,
        cooldown: {}, flags: {},
      };
    }
    const rel = {};
    for (const a of Object.keys(residents)) {
      rel[a] = {};
      for (const b of Object.keys(residents)) if (a !== b) rel[a][b] = { known: false, affinity: 0, closeness: 0, met: 0, lowSince: null };
    }
    for (const x of data.residents.relations ?? []) {
      for (const [a, b] of [[x.a, x.b], [x.b, x.a]]) Object.assign(rel[a][b], { known: true, affinity: x.affinity, closeness: x.closeness });
      if (x.lover) { residents[x.a].lover = x.b; residents[x.b].lover = x.a; }
    }
    return {
      version: 2, created: now, day0: kstMidnight(now), t: now, speed: 1,
      rng: rng.s, residents, rel, news: [], stats: {}, talkCool: {}, timers: { social: 0, hour: 0, aura: {} },
      lastDay: 0, savedAt: now,
    };
  }

  // ───────────────────────────── 조회
  list() { return Object.values(this.state.residents); }
  get(id) { return this.state.residents[id]; }
  rel(a, b) { return this.state.rel[a]?.[b]; }
  get now() { return this.state.t; }
  get day() { return dayIndex(this.state.t, this.state.day0); }
  clock() { return kst(this.state.t); }

  area(r) {
    if (r.hidden) return `home:${r.hidden}`;
    const t = this.grid.tileOf(r.pos.x, r.pos.y);
    return this.grid.areaAt(t.x, t.y);
  }

  areaName(area) {
    if (area.startsWith('home:')) return this.grid.houses[area.slice(5)]?.label ?? '집';
    return this.data.news.places?.[area] ?? (area === 'street' ? '길' : area);
  }

  dist(a, b) {
    if (a.hidden || b.hidden) return a.hidden && a.hidden === b.hidden ? 0 : Infinity;
    return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
  }

  asleep(r) { return r.action?.id === 'sleep' && r.action.phase === 'do'; }
  inTalk(r) { return r.talkUntil && r.talkUntil > this.now; }
  moodLevel(r) { const m = this.needsCfg.mood; return r.mood >= m.good ? 'good' : r.mood < m.bad ? 'bad' : 'okay'; }

  stage(a, b) {
    const x = this.rel(a, b);
    if (!x || !x.known) return 'unknown';
    if (this.get(a).lover === b) return 'lover';
    if (x.affinity <= -30) return 'awkward';
    if (x.affinity >= 70) return 'close';
    if (x.affinity >= 40) return 'friend';
    return 'acquaintance';
  }

  // ───────────────────────────── 메인 루프
  /** 시뮬레이션 시간 dt 초만큼 진행 (큰 dt 는 쪼갬) */
  advance(dtSec, maxStep = 10) {
    let left = dtSec;
    while (left > 0) {
      const step = Math.min(maxStep, left);
      this.tick(step);
      left -= step;
    }
  }

  tick(dt) {
    const st = this.state;
    st.t += dt * 1000;
    const dtH = dt / 3600;
    const clock = this.clock();
    const day = this.day;
    if (day !== st.lastDay) this.onNewDay(st.lastDay, day);

    for (const r of this.list()) {
      this.decay(r, dtH, clock);
      this.updateMoodlets(r);
      this.move(r, dt);
      this.runAction(r, dt, dtH, clock);
      this.computeMood(r);
      this.recordStats(r, dt, day);
    }

    st.timers.social += dt;
    if (st.timers.social >= SOCIAL_EVERY) {
      st.timers.social = 0;
      this.socialTick(clock);
    }
    st.timers.hour += dt;
    if (st.timers.hour >= 3600) {
      st.timers.hour = 0;
      this.hourly(clock);
    }
    st.rng = this.rng.s;
  }

  // ───────────────────────────── 욕구
  perceived(r, n) {
    return clamp(r.needs[n] + this.traits.v(r, `needPerceived.${n}`, 0));
  }

  urgency(r, n) {
    const v = this.perceived(r, n);
    return Math.pow((100 - v) / 100, 2) * this.needsCfg.needs[n].urgency;
  }

  decay(r, dtH, clock) {
    const sleeping = this.asleep(r);
    for (const n of NEEDS) {
      let rate = this.needsCfg.needs[n].decay;
      rate = this.traits.v(r, `needDecay.${n}`, rate);
      if (n === 'energy') {
        if (sleeping) continue;
        rate *= this.needsCfg.chronotypes[r.chrono].curve[clock.hour] * (1.2 - 0.05 * r.abilities.stamina);
      } else if (sleeping) rate *= n === 'hunger' ? 0.45 : 0.25;
      r.needs[n] = clamp(r.needs[n] - rate * dtH);
    }
    // 위기 기억 (12시간에 한 번)
    if (r.needs.hunger <= 0.5 && this.cool(r, 'starving', 12 * HOUR)) {
      this.memory.add(r, 'starving', `place:${this.area(r)}`, this.now, { vars: { place: this.areaName(this.area(r)) } });
      this.emit('starving', { a: r.name }, { actors: [r.id], importance: 50 });
    }
    if (r.needs.energy <= 0.5 && this.cool(r, 'exhausted', 12 * HOUR)) {
      this.memory.add(r, 'exhausted', `place:${this.area(r)}`, this.now, { vars: { place: this.areaName(this.area(r)) } });
      this.emit('exhausted', { a: r.name }, { actors: [r.id], importance: 40 });
    }
  }

  // ───────────────────────────── 기분
  addMoodlet(r, id, label, value, hours, { by = null, source = null } = {}) {
    let h = hours;
    if (value < 0) h = this.traits.v(r, 'moodlet.duration.negative', h);
    const until = this.now + h * HOUR;
    const ex = r.moodlets.find((m) => m.id === id && m.source === source);
    if (ex) { ex.until = until; ex.value = value; return; }
    r.moodlets.push({ id, label, value, until, by, source });
    if (r.moodlets.length > 12) r.moodlets.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).length = 12;
  }

  updateMoodlets(r) {
    if (r.moodlets.length && r.moodlets.some((m) => m.until <= this.now)) r.moodlets = r.moodlets.filter((m) => m.until > this.now);
  }

  computeMood(r) {
    const cfg = this.needsCfg;
    let m = this.traits.v(r, 'mood.base', cfg.mood.base);
    for (const n of NEEDS) {
      const w = this.traits.v(r, `moodWeight.${n}`, cfg.needs[n].moodWeight);
      m -= Math.max(0, 60 - r.needs[n]) * w;
    }
    for (const x of r.moodlets) m += x.value;
    const before = this.moodLevel(r);
    r.mood = clamp(m, -100, 100);
    const after = this.moodLevel(r);
    if (before !== after) r.moodChangedAt = this.now;
  }

  // ───────────────────────────── 이동
  setPath(r, tile) {
    const p = this.grid.path(r.pos, tile);
    r.path = p ?? [];
    return !!p;
  }

  leaveHouse(r) {
    if (!r.hidden) return;
    const h = this.grid.houses[r.hidden];
    r.hidden = null;
    r.pos = this.grid.center(h.front.x, h.front.y);
  }

  move(r, dt) {
    if (!r.path.length || this.inTalk(r)) return;
    let remain = WALK_PX * (r.boost ?? 1) * dt;
    while (remain > 0 && r.path.length) {
      const p = r.path[0];
      const dx = p.x - r.pos.x, dy = p.y - r.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= remain) { r.pos = { x: p.x, y: p.y }; r.path.shift(); remain -= d; }
      else {
        r.pos = { x: r.pos.x + (dx / d) * remain, y: r.pos.y + (dy / d) * remain };
        r.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        remain = 0;
      }
    }
  }

  // ───────────────────────────── 행동 고르기
  occupied() {
    const s = new Set();
    for (const r of this.list()) if (r.action?.spot && !this.grid.spots[r.action.spot]?.inside) s.add(r.action.spot);
    return s;
  }

  /** 행동의 자리 후보 → 실제 목적지 */
  resolveAt(r, at, occupied) {
    if (at === 'home') return { spot: `home.${r.house}` };
    if (at === 'desk') return { spot: r.desk };
    if (at.startsWith('route:')) {
      const route = at.slice(6);
      const pts = this.grid.routes[route];
      return { route, tile: { x: pts[0][0], y: pts[0][1] } };
    }
    if (at.startsWith('spots:')) {
      const free = this.grid.group(at.slice(6)).filter((k) => !occupied.has(k));
      if (!free.length) return null;
      const here = this.grid.tileOf(r.pos.x, r.pos.y);
      free.sort((a, b) => this.mh(here, this.grid.spots[a]) - this.mh(here, this.grid.spots[b]));
      return { spot: this.rng.chance(0.7) ? free[0] : this.rng.pick(free) };
    }
    return null;
  }

  mh(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  destArea(dest, r) {
    if (dest.spot) {
      const s = this.grid.spots[dest.spot];
      if (s.inside) return `home:${s.house}`;
      return this.grid.areaAt(s.x, s.y);
    }
    if (dest.route) return dest.route.startsWith('beach') ? 'beach' : 'park';
    return this.area(r);
  }

  peopleAt(area, except) {
    return this.list().filter((x) => x !== except && x.action && this.destArea(x.action, x) === area && !this.asleep(x));
  }

  /** 행동 하나의 점수 */
  score(r, id, def, dest, clock, ctx) {
    const by = new Set();
    const T = (hooks, base) => { const res = this.traits.apply(r, hooks, base); res.by.forEach((b) => by.add(b)); return res.value; };
    const tags = def.tags ?? [];
    const durH = ((def.minutes[0] + def.minutes[1]) / 2) / 60;
    const area = this.destArea(dest, r);
    const others = this.peopleAt(area, r);
    let total = 0;
    const parts = [];
    for (const n of NEEDS) {
      let gain = 0;
      const rate = def.rates?.[n] ?? 0;
      if (rate > 0) {
        gain += rate * durH * T([`needGain.${n}.${id}`, ...tags.map((t) => `needGain.${n}.tag:${t}`)], 1);
        if (def.work && n === 'achievement') gain *= 1 + 0.1 * (r.lv - 1);
        if (n === 'fun' && def.homeFunMul && dest.spot?.startsWith('home.')) gain *= def.homeFunMul;
      } else if (rate < 0) gain += rate * durH;
      if (def.once?.[n]) gain += def.once[n];
      if (n === 'social' && def.socialIfOthers && others.length) gain += def.socialIfOthers * durH;
      if (n === 'social' && def.partner && ctx.partner) gain *= this.socialMul(r, ctx.partner.id, by);
      if (id === 'sleep' && n === 'energy') gain = 100 - r.needs.energy;
      if (gain > 0) gain = Math.min(gain, 100 - r.needs[n] + 5);
      const u = this.urgency(r, n);
      if (gain) { total += u * gain; parts.push({ n, u: u * gain }); }
    }
    let s = total / 10;

    // 돈·식료품
    const econ = this.needsCfg.economy;
    const target = T('money.target', econ.foodMoneyTarget);
    const foodUrg = (this.urgency(r, 'hunger') * 60) / 10;
    let note = null;
    if (def.work) {
      const moneyNeed = Math.pow(clamp((target - r.money) / target, 0, 1), 2) * 1.2;
      const pay = (econ.payBase + econ.payPerLevel * (r.lv - 1)) * durH;
      s += (moneyNeed * pay) / 10;
      if (moneyNeed > 0.3) note = 'money';
      if (r.groceries === 0 && r.money < 24) { s += foodUrg * 0.7; note = 'food'; }
      if (this.traits.has(r, 'lazy') && r.money < this.traits.params('lazy').panicMoney && r.groceries === 0) {
        s *= this.traits.params('lazy').panicWorkMul;
        by.add('lazy');
        note = 'panic';
      }
    }
    if (id === 'buy_groceries') {
      s += r.groceries === 0 ? foodUrg * 0.85 : r.groceries === 1 ? foodUrg * 0.3 : 0;
      if (r.groceries <= 1) note = 'groceries';
    }
    if (id === 'sleep') {
      if ((r.cooldown.sleepBlock ?? 0) > this.now && r.needs.energy > 5) return null;
      const win = this.needsCfg.chronotypes[r.chrono].sleepWindow;
      s *= inHours(clock.h, win) ? 1.8 : r.needs.energy < 10 ? 1 : 0.05;
    }
    if (def.hours && !inHours(clock.h, def.hours)) return null;
    if (def.daylight && clock.h >= 7 && clock.h < 19) s *= def.daylight;

    // 특성의 행동 점수 배율
    s = T([`actionScore.${id}`, ...tags.map((t) => `actionScore.tag:${t}`)], s);
    // 장소 선호 (책벌레 → 도서관)
    if (!area.startsWith('home')) s = T(`place.${area}`, s);
    // 기억: 활동·장소에 대한 태도
    s *= this.memory.factor(r, `activity:${id}`, this.now);
    if (!area.startsWith('home')) s *= this.memory.factor(r, `place:${area}`, this.now);
    // 거기 있는 사람: 피하는 사람이 있으면 ↓, 몰두 대상이 있으면 ↑
    for (const o of others) {
      if (this.memory.avoids(r, `person:${o.id}`, this.now)) s *= 0.5;
      if (o.id === r.focusPerson) s = T('place.withFocus', s);
      if (o.id === r.lover) s *= 1.15;
    }
    // 같이 하기: 상대 호감도·연인
    if (def.partner) {
      const aff = this.rel(r.id, ctx.partner.id).affinity;
      s *= 0.6 + aff / 100;
      if (r.lover === ctx.partner.id) s *= this.data.romance.date.scoreMul;
      if (ctx.partner.id === r.focusPerson) s = T('invite.focus', s);
    }
    // 같은 걸 연달아 하면 조금 지루함
    if (r.lastAction === id && id !== 'sleep' && id !== 'work') s *= 0.6;
    // 이동 거리
    const destTile = dest.spot ? this.grid.spots[dest.spot] : dest.tile;
    if (destTile && !r.hidden) s -= this.mh(this.grid.tileOf(r.pos.x, r.pos.y), destTile) * 0.02;
    else if (destTile && r.hidden && !(dest.spot && this.grid.spots[dest.spot].inside && this.grid.spots[dest.spot].house === r.hidden)) s -= 0.15;

    parts.sort((a, b) => b.u - a.u);
    return { s, by: [...by], needs: parts.slice(0, 2).map((p) => p.n), note };
  }

  socialMul(r, otherId, by) {
    if (!this.traits.has(r, 'obsessive') || !r.focusPerson) return 1;
    by?.add('obsessive');
    return otherId === r.focusPerson ? this.traits.v(r, 'social.gain.focus', 1) : this.traits.v(r, 'social.gain.others', 1);
  }

  /** 같이 하기 상대 후보 */
  partnerCandidates(r) {
    return this.list().filter((p) => {
      if (p === r || this.asleep(p) || this.inTalk(p) || p.action?.partnerOf || p.action?.partner) return false;
      if ((r.cooldown[`invite:${p.id}`] ?? 0) > this.now || (r.cooldown.invite ?? 0) > this.now) return false;
      const x = this.rel(r.id, p.id);
      if (!x.known || (x.affinity < 10 && r.lover !== p.id)) return false;
      if (this.memory.avoids(r, `person:${p.id}`, this.now)) return false;
      const d = this.dist(r, p);
      return d <= 8 * 32 || (r.hidden && r.hidden === p.hidden);
    });
  }

  choose(r) {
    const clock = this.clock();
    const occupied = this.occupied();
    const cands = [];
    const partners = this.partnerCandidates(r);
    for (const [id, def] of Object.entries(this.actions)) {
      if (def.auto) continue;
      if (def.require?.money && r.money < def.require.money) continue;
      if (def.require?.groceries && r.groceries < def.require.groceries) continue;
      if (def.needsBehavior && !this.hasBehavior(r, def.needsBehavior)) continue;
      if (id === 'comfort') {
        const target = this.comfortTarget(r);
        if (!target) continue;
        cands.push({ id, dest: { person: target.id }, s: 2.5 * (1 + this.rel(r.id, target.id).affinity / 100), by: ['kind'], needs: [], note: 'comfort', target: target.id });
        continue;
      }
      const partnerList = def.partner ? partners : [null];
      for (const partner of partnerList) {
        if (def.partner && !partner) continue;
        for (const at of def.at) {
          if (at === 'home' && def.partner && (!partner || partner.house !== r.house)) continue;
          const dest = this.resolveAt(r, at, occupied);
          if (!dest) continue;
          const res = this.score(r, id, def, dest, clock, { partner });
          if (!res) continue;
          cands.push({ id, dest, s: res.s, by: res.by, needs: res.needs, note: res.note, partner: partner?.id });
        }
      }
    }
    cands.sort((a, b) => b.s - a.s);
    const top = cands.slice(0, 3).filter((c) => c.s > 0);
    const pick = top.length ? this.rng.weighted(top.map((c) => ({ item: c, w: c.s * c.s }))) : { id: 'rest_home', dest: { spot: `home.${r.house}` }, by: [], needs: [] };
    this.start(r, pick);
  }

  hasBehavior(r, b) {
    return r.traits.some((t) => this.traits.defs[t]?.behavior?.includes(b));
  }

  comfortTarget(r) {
    if (!this.cool(r, 'comfortCheck', 0, true)) return null;
    return this.list().find((p) => p !== r && !this.asleep(p) && !p.hidden && !r.hidden && this.moodLevel(p) === 'bad'
      && this.rel(r.id, p.id).known && this.rel(r.id, p.id).affinity >= 0 && this.dist(r, p) < 12 * 32
      && (r.cooldown[`comfort:${p.id}`] ?? 0) < this.now);
  }

  /** 행동 시작 */
  start(r, c, { asPartnerOf = null } = {}) {
    const def = this.actions[c.id];
    // 같이 하기: 요청 → 수락
    if (def.partner && c.partner && !asPartnerOf) {
      const p = this.get(c.partner);
      if (!this.invite(r, p, c)) {
        const solo = { walk_together: 'walk_solo', cafe_together: 'cafe_rest', hobby_together: 'game' }[c.id];
        return this.start(r, { ...c, id: solo, partner: null, by: c.by, needs: c.needs, note: 'rejected' });
      }
    }
    this.endAction(r, false);
    const [m0, m1] = def.minutes;
    let mins = this.rng.range(m0, m1);
    mins = this.traits.v(r, [`actionDuration.${c.id}`, ...(def.tags ?? []).map((t) => `actionDuration.tag:${t}`)], mins);
    if (c.id === 'work' && this.traits.has(r, 'perfectionist')) mins = Math.max(mins, this.traits.params('perfectionist').minWorkMin);
    const a = {
      id: c.id, phase: 'travel', spot: c.dest?.spot ?? null, route: c.dest?.route ?? null, routeIdx: 0,
      person: c.dest?.person ?? c.target ?? null, partner: c.partner ?? asPartnerOf ?? null, follower: !!asPartnerOf,
      minutes: mins, start: this.now, end: null, why: { needs: c.needs ?? [], by: c.by ?? [], note: c.note ?? null },
      moodAtStart: r.mood, date: !!(c.partner && r.lover === c.partner) || !!(asPartnerOf && r.lover === asPartnerOf),
    };
    r.action = a;
    // 목적지로 출발
    if (a.spot) {
      const s = this.grid.spots[a.spot];
      if (s.inside && r.hidden === s.house) this.beginDo(r);
      else { this.leaveHouse(r); if (!this.setPath(r, s) || !r.path.length) this.arrive(r); }
    } else if (a.route && !a.follower) {
      this.leaveHouse(r);
      const pts = this.grid.routes[a.route];
      this.setPath(r, { x: pts[0][0], y: pts[0][1] });
      if (!r.path.length) this.beginDo(r);
    } else if (a.follower || a.person) {
      this.leaveHouse(r);
      this.chase(r);
    }
  }

  chase(r) {
    const target = this.get(r.action.follower ? r.action.partner : r.action.person);
    if (!target || target.hidden) return;
    const t = this.grid.tileOf(target.pos.x, target.pos.y);
    this.setPath(r, t);
  }

  arrive(r) {
    const a = r.action;
    if (a.spot) {
      const s = this.grid.spots[a.spot];
      if (s.inside) r.hidden = s.house;
      else r.facing = s.facing ?? r.facing;
    }
    this.beginDo(r);
  }

  beginDo(r) {
    const a = r.action;
    const def = this.actions[a.id];
    a.phase = 'do';
    a.end = this.now + a.minutes * MIN;
    for (const [k, v] of Object.entries(def.once ?? {})) {
      if (k === 'money') r.money = Math.max(0, r.money + v);
      else if (k === 'groceries') r.groceries = Math.max(0, r.groceries + (v > 0 ? this.traits.v(r, 'groceries.bought', v) : v));
      else if (NEEDS.includes(k)) r.needs[k] = clamp(r.needs[k] + v);
    }
    if (def.moodlet) this.addMoodlet(r, def.moodlet.id, def.name, def.moodlet.value, def.moodlet.hours);
    if ((a.id === 'eat_home' || a.id === 'snack') && this.hasBehavior(r, 'enjoyFood')) {
      const p = this.traits.params('glutton');
      this.addMoodlet(r, 'food', '맛있게 먹음', p.foodMood, p.foodHours, { by: 'glutton' });
      this.tag(r, '🍩 냠냠', 'glutton');
      if (this.cool(r, 'enjoyFoodNews', 6 * HOUR)) this.emit('enjoy_food', { a: r.name }, { actors: [r.id], trait: 'glutton', importance: 8 });
    }
    if (a.id === 'work' && this.traits.has(r, 'genius') && this.cool(r, 'focusNews', 8 * HOUR)) {
      this.tag(r, '🧠 집중', 'genius');
      this.emit('focus', { a: r.name }, { actors: [r.id], trait: 'genius', importance: 10 });
    }
    if (a.date && !a.follower && this.cool(r, `dateNews`, 2 * HOUR)) {
      const p = this.get(a.partner);
      this.emit('date', { a: r.name, b: p.name, activity: def.name }, { actors: [r.id, p.id], importance: 35 });
    }
  }

  /** 하던 행동 끝내기 */
  endAction(r, natural, reason = null) {
    const a = r.action;
    if (!a) return;
    const def = this.actions[a.id];
    if (a.phase === 'do') {
      // 활동 기억: 하는 동안 기분이 크게 바뀌었으면
      const delta = r.mood - a.moodAtStart;
      if (!['sleep', 'eat_home', 'buy_groceries', 'comfort', 'interrupt'].includes(a.id) && Math.abs(delta) >= 15 && this.cool(r, `actmem:${a.id}`, 6 * HOUR)) {
        this.memory.add(r, delta > 0 ? 'activity_great' : 'activity_bad', `activity:${a.id}`, this.now, { vars: { activity: def.name } });
        this.checkAvoid(r, `activity:${a.id}`, def.name);
      }
      // 완벽주의: 일을 끝까지 마쳤는지
      if (a.id === 'work' && this.traits.has(r, 'perfectionist')) {
        const p = this.traits.params('perfectionist');
        if (natural) {
          r.xp += (a.workedH ?? 0) * (p.finishXpMul - 1);
          r.needs.achievement = clamp(r.needs.achievement + p.finishAchievement);
          this.tag(r, '📐 완벽해', 'perfectionist');
          if (this.rng.chance(0.4)) this.memory.add(r, 'work_done_well', 'activity:work', this.now);
          if (this.cool(r, 'workDoneNews', 10 * HOUR)) this.emit('work_done', { a: r.name }, { actors: [r.id], trait: 'perfectionist', importance: 15 });
          this.levelCheck(r);
        } else if ((a.workedH ?? 0) > 0.2) {
          this.addMoodlet(r, 'unfinished', '일을 마무리 못함', p.unfinishedMood, p.unfinishedHours, { by: 'perfectionist' });
          this.memory.add(r, 'work_unfinished', 'activity:work', this.now);
          this.tag(r, '📐 찜찜', 'perfectionist');
          this.emit('work_unfinished', { a: r.name }, { actors: [r.id], trait: 'perfectionist', importance: 20 });
        }
      }
      // 같이 하기 기억
      if (a.partner && natural && !a.follower) {
        const p = this.get(a.partner);
        for (const [x, y] of [[r, p], [p, r]]) {
          this.memory.add(x, a.date ? 'date' : 'together', `person:${y.id}`, this.now, { other: y.id, vars: { other: y.name, activity: def.name } });
          this.changeAffinity(x, y, a.date ? 4 : 3);
        }
        this.onInteraction(r, p, a.id);
      }
    }
    // 같이 하던 상대도 같이 끝냄
    if (a.partner) {
      const p = this.get(a.partner);
      if (p?.action && p.action.partner === r.id && !p.ending) {
        p.ending = true;
        this.endAction(p, natural);
        p.action = null;
        p.ending = false;
      }
    }
    r.lastAction = a.id;
    r.action = null;
    r.path = [];
    r.boost = 1;
  }

  runAction(r, dt, dtH, clock) {
    if (!r.action) { if (!this.inTalk(r)) this.choose(r); return; }
    const a = r.action;
    const def = this.actions[a.id];
    if (this.inTalk(r)) { if (a.end) a.end += dt * 1000; return; }

    if (a.phase === 'travel') {
      if (a.follower || a.person) {
        const target = this.get(a.follower ? a.partner : a.person);
        if (!target || (target.hidden && target.hidden !== r.hidden) || !target.action) { this.endAction(r, false); return; }
        if (a.follower && target.action?.partner !== r.id) { this.endAction(r, false); return; }
        if (this.dist(r, target) < 40) {
          if (a.person) { this.meetPerson(r, target, a.id); this.endAction(r, true); return; }
          if (a.follower && target.action.phase === 'do') { this.beginDo(r); a.end = target.action.end; }
        } else if (!r.path.length || this.rng.chance(dt / 3)) this.chase(r);
        if (this.now - a.start > 40 * MIN) this.endAction(r, false);
        return;
      }
      if (!r.path.length) { if (a.route) this.beginDo(r); else this.arrive(r); }
      return;
    }

    // ── 하는 중
    if (a.route) this.walkRoute(r);
    if (a.follower) {
      const leader = this.get(a.partner);
      if (!leader?.action || leader.action.partner !== r.id) { this.endAction(r, false); return; }
      if (a.route || leader.action.route) {
        const d = this.dist(r, leader);
        r.boost = d > 60 ? 1.4 : 1;
        if (d > 40 && (!r.path.length || this.rng.chance(dt / 2))) this.chase(r);
        else if (d <= 40) r.path = [];
      }
    }
    const tags = def.tags ?? [];
    for (const [n, rate] of Object.entries(def.rates ?? {})) {
      let v = rate;
      if (rate > 0) v *= this.traits.v(r, [`needGain.${n}.${a.id}`, ...tags.map((t) => `needGain.${n}.tag:${t}`)], 1);
      if (def.work && n === 'achievement') v *= 1 + 0.1 * (r.lv - 1);
      if (n === 'fun' && def.homeFunMul && r.hidden) v *= def.homeFunMul;
      if (n === 'social' && a.partner) v *= this.socialMul(r, a.partner) * (a.date ? this.data.romance.date.gainMul : 1);
      r.needs[n] = clamp(r.needs[n] + v * dtH);
    }
    if (def.socialIfOthers) {
      const others = this.peopleAt(this.area(r), r);
      if (others.length) r.needs.social = clamp(r.needs.social + def.socialIfOthers * dtH * this.socialMul(r, others[0].id));
    }
    // 독립적: 사람이 많은 곳에 오래 있으면 지침
    if (this.hasBehavior(r, 'crowdTired') && !r.hidden) {
      const p = this.traits.params('independent');
      const crowd = this.peopleAt(this.area(r), r).length;
      if (crowd >= p.crowdSize) {
        r.needs.fun = clamp(r.needs.fun + p.crowdFunPerHour * dtH);
        if (this.cool(r, 'crowded', 24 * HOUR)) {
          this.memory.add(r, 'crowded', `place:${this.area(r)}`, this.now, { vars: { place: this.areaName(this.area(r)) } });
          this.tag(r, '🌙 북적여', 'independent');
          this.emit('crowded', { a: r.name, place: this.areaName(this.area(r)) }, { actors: [r.id], trait: 'independent', importance: 15 });
        }
      }
    }
    if (def.work) this.doWork(r, dtH);
    if (a.id === 'study') r.xp += (def.xpPerHour ?? 0) * dtH * this.traits.v(r, 'study.efficiency', 1) * (0.6 + 0.15 * r.abilities.learning);
    if (def.skill) this.gainSkill(r, a.id === 'hobby_together' ? (a.skill ??= this.rng.pick(['game', 'drawing', 'reading'])) : def.skill, dtH);

    // 끝났나?
    if (def.until) {
      const [n, v] = Object.entries(def.until)[0];
      const win = this.needsCfg.chronotypes[r.chrono].sleepWindow;
      if (r.needs[n] >= v || (r.needs[n] >= 85 && !inHours(clock.h, win))) { this.endAction(r, true); return; }
      if (a.id === 'sleep' && r.needs.hunger < 4 && (r.groceries > 0 || r.money >= 8 || r.needs.energy > 40)) {
        r.cooldown.sleepBlock = this.now + 30 * MIN;
        this.endAction(r, false);
        return;
      }
    } else if (this.now >= a.end && !a.follower) { this.endAction(r, true); return; }
    // 급한 욕구가 생기면 중단
    if (a.id !== 'sleep' && !a.follower) {
      const at = this.traits.v(r, [`interruptAt.${a.id}`, ...tags.map((t) => `interruptAt.tag:${t}`)], this.needsCfg.interruptAt);
      for (const n of NEEDS) {
        if ((def.rates?.[n] ?? 0) > 0 || (def.once?.[n] ?? 0) > 0) continue;
        // 먹을 게 없고 돈도 없으면 일이 곧 배고픔의 해결책 → 멈추지 않음
        if (n === 'hunger' && def.work && r.groceries === 0 && r.money < 24 && r.needs.hunger > 0.5) continue;
        if (this.perceived(r, n) < at) { this.endAction(r, false, n); return; }
      }
    }
  }

  walkRoute(r) {
    const a = r.action;
    if (r.path.length) return;
    const pts = this.grid.routes[a.route];
    a.routeIdx = (a.routeIdx + 1) % pts.length;
    const [x, y] = pts[a.routeIdx];
    this.setPath(r, { x, y });
  }

  // ───────────────────────────── 일·성장
  doWork(r, dtH) {
    const econ = this.needsCfg.economy;
    const prog = this.traits.v(r, 'work.progress', 1) * (this.moodLevel(r) === 'bad' ? 0.8 : this.moodLevel(r) === 'good' ? 1.1 : 1);
    const pay = (econ.payBase + econ.payPerLevel * (r.lv - 1)) * this.traits.v(r, 'work.money', 1) * prog;
    r.money += pay * dtH;
    r.xp += dtH * (0.6 + 0.15 * r.abilities.work) * this.traits.v(r, 'work.xp', 1) * prog;
    r.action.workedH = (r.action.workedH ?? 0) + dtH;
    this.levelCheck(r);
  }

  levelCheck(r) {
    const econ = this.needsCfg.economy;
    while (r.lv < econ.maxLevel && r.xp >= econ.levelXp[r.lv]) {
      r.lv++;
      this.addMoodlet(r, 'promotion', `Lv.${r.lv} 달성`, 25, 12);
      this.memory.add(r, 'promotion', 'activity:work', this.now, { vars: { level: r.lv } });
      this.tag(r, `🎉 Lv.${r.lv}`);
      this.emit('promotion', { a: r.name, level: r.lv }, { actors: [r.id], importance: 70, trait: this.traits.has(r, 'genius') ? 'genius' : null });
    }
  }

  gainSkill(r, skill, dtH) {
    const ab = { exercise: 'stamina', reading: 'learning', game: 'learning', drawing: 'craft' }[skill];
    const before = Math.floor(r.skills[skill]);
    const g = this.data.actions.skillPerHour * dtH * this.traits.v(r, ['skillGain', `skillGain.${skill}`], 1) * (0.7 + 0.1 * (r.abilities[ab] ?? 3));
    r.skills[skill] = Math.min(10, r.skills[skill] + g);
    const after = Math.floor(r.skills[skill]);
    if (after > before) {
      const name = this.data.actions.skills[skill];
      this.memory.add(r, 'skill_up', `activity:${skill}`, this.now, { vars: { activity: name } });
      this.addMoodlet(r, 'skill', `${name} 실력 상승`, 10, 4);
      this.emit('skill_up', { a: r.name, skill: name, level: after }, { actors: [r.id], importance: 25 + after * 3 });
    }
  }

  // ───────────────────────────── 관계
  changeAffinity(x, y, delta, { fromTalkPartnerTrait = null } = {}) {
    const rel = this.rel(x.id, y.id);
    let d = delta;
    if (this.traits.has(x, 'obsessive') && x.focusPerson) d *= y.id === x.focusPerson ? this.traits.v(x, 'affinity.gain.focus', 1) : this.traits.v(x, 'affinity.gain.others', 1);
    const before = this.stage(x.id, y.id);
    rel.affinity = clamp(rel.affinity + d, -100, 100);
    rel.closeness = clamp(rel.closeness + this.data.romance.relation.closenessPerInteraction * (delta > 0 ? 1 : 0.5));
    rel.met = this.now;
    const after = this.stage(x.id, y.id);
    if (before !== after && ['friend', 'close', 'awkward'].includes(after) && before !== 'lover') {
      this.emit(`stage_${after}`, { a: x.name, b: y.name }, { actors: [x.id, y.id], importance: after === 'awkward' ? 55 : after === 'close' ? 55 : 45 });
    }
    if (rel.affinity < this.data.romance.breakup.below) rel.lowSince ??= this.now;
    else rel.lowSince = null;
  }

  meet(x, y) {
    for (const [a, b] of [[x, y], [y, x]]) {
      const rel = this.rel(a.id, b.id);
      if (!rel.known) {
        rel.known = true;
        this.memory.add(a, 'first_meet', `person:${b.id}`, this.now, { other: b.id, vars: { other: b.name } });
      }
    }
  }

  refreshFocus(r) {
    if (!this.hasBehavior(r, 'focusPerson')) { r.focusPerson = null; return; }
    if (r.lover) { r.focusPerson = r.lover; return; }
    const min = this.traits.params('obsessive').minAffinity;
    let best = null, ba = min;
    for (const o of this.list()) {
      if (o === r) continue;
      const a = this.rel(r.id, o.id).affinity;
      if (a >= ba) { ba = a; best = o.id; }
    }
    r.focusPerson = best;
  }

  jealousTarget(z) {
    if (z.lover) return z.lover;
    if (z.focusPerson) return z.focusPerson;
    const min = this.traits.params('jealous').minAffinity;
    let best = null, ba = min;
    for (const o of this.list()) if (o !== z && this.rel(z.id, o.id).affinity >= ba) { ba = this.rel(z.id, o.id).affinity; best = o.id; }
    return best;
  }

  /** 두 사람이 어울렸을 때: 질투 확인 */
  onInteraction(x, y, kind) {
    const k = pairKey(x.id, y.id);
    const day = this.day;
    const stats = this.dayStats(day);
    stats.pairs[k] = (stats.pairs[k] ?? 0) + 1;
    for (const z of this.list()) {
      if (z === x || z === y || !this.hasBehavior(z, 'jealousy')) continue;
      const target = this.jealousTarget(z);
      if (target !== x.id && target !== y.id) continue;
      const tgt = this.get(target);
      const other = target === x.id ? y : x;
      const p = this.traits.params('jealous');
      const sees = this.dist(z, tgt) <= p.seeRadius * 32 && !this.asleep(z);
      if (!sees && !this.rng.chance(p.hearChance)) continue;
      if (!this.cool(z, `jealous:${other.id}`, 30 * MIN)) continue;
      this.addMoodlet(z, 'jealous', `질투 (${tgt.name}·${other.name})`, p.jealousMood * (sees ? 1 : 0.6), p.jealousHours, { by: 'jealous', source: other.id });
      this.changeAffinity(z, other, p.rivalAffinity);
      if (z.lover === tgt.id) this.changeAffinity(z, tgt, p.loverAffinity);
      this.memory.add(z, 'jealous', `person:${other.id}`, this.now, { other: other.id, vars: { other: other.name } });
      this.checkAvoid(z, `person:${other.id}`, other.name);
      this.tag(z, '😤 질투', 'jealous');
      this.emit('jealous', { a: z.name, b: tgt.name, c: other.name }, { actors: [z.id, tgt.id, other.id], trait: 'jealous', importance: 45 });
      if (sees && !this.inTalk(z) && z.action?.id !== 'interrupt' && this.rng.chance(p.interruptChance) && !z.action?.partner) {
        this.endAction(z, false);
        this.start(z, { id: 'interrupt', dest: { person: tgt.id }, target: tgt.id, by: ['jealous'], needs: [], note: 'jealous' });
      }
    }
  }

  checkAvoid(r, subject, name) {
    const avoid = this.memory.avoids(r, subject, this.now);
    r.flags.avoid ??= {};
    if (avoid && !r.flags.avoid[subject]) {
      r.flags.avoid[subject] = true;
      const [type] = subject.split(':');
      if (this.cool(r, `avoidNews:${subject}`, 3 * DAY)) this.emit(type === 'person' ? 'avoid_person' : 'avoid_activity', { a: r.name, b: name, activity: name, place: name }, { actors: [r.id], importance: 55 });
    } else if (!avoid && r.flags.avoid[subject] && this.memory.attitude(r, subject, this.now) > -15) delete r.flags.avoid[subject];
  }

  // ───────────────────────────── 대화
  canChat(r) {
    if (this.asleep(r) || this.inTalk(r)) return false;
    if (r.action?.phase === 'travel' && !r.action.route) return false;
    return true;
  }

  focusing(r) {
    return r.action?.phase === 'do' && (this.actions[r.action.id].tags ?? []).includes('focus');
  }

  socialTick(clock) {
    const list = this.list();
    for (const r of list) {
      if (!this.canChat(r) || (r.cooldown.talk ?? 0) > this.now) continue;
      for (const s of list) {
        if (s === r || !this.canChat(s)) continue;
        const sameHouse = r.hidden && r.hidden === s.hidden;
        const near = sameHouse || (!r.hidden && !s.hidden && (this.dist(r, s) <= NEAR_TALK || (this.area(r) === this.area(s) && !['street', 'park', 'beach'].includes(this.area(r)))));
        if (!near) continue;
        if ((this.state.talkCool[pairKey(r.id, s.id)] ?? 0) > this.now) continue;
        const rel = this.rel(r.id, s.id);
        let p = 0.06 * (r.extro / 50) * (0.25 + this.urgency(r, 'social') * 2.2);
        p *= { good: 1.2, okay: 1, bad: 0.6 }[this.moodLevel(r)];
        if (!rel.known) p *= r.extro / 100;
        else p *= 0.6 + Math.max(-0.5, rel.affinity / 100);
        if (this.memory.avoids(r, `person:${s.id}`, this.now)) p = 0;
        const hooks = ['talk.initiate'];
        if (s.id === r.focusPerson) hooks.push('talk.initiate.focus');
        if (this.focusing(r)) hooks.push('talk.initiate.focus');
        p = this.traits.v(r, hooks, p);
        if (this.area(r) === 'library') p *= 0.5;
        if (this.rng.chance(p)) { this.talk(r, s, 'chat'); break; }
      }
    }
    // 유쾌: 주변 기분 올리기
    for (const r of list) {
      if (!this.hasBehavior(r, 'aura') || this.asleep(r)) continue;
      const p = this.traits.params('cheerful');
      const last = this.state.timers.aura[r.id] ?? 0;
      if (this.now - last < p.auraEveryMin * MIN) continue;
      this.state.timers.aura[r.id] = this.now;
      if (!this.rng.chance(p.auraChance)) continue;
      const around = list.filter((o) => o !== r && !this.asleep(o) && this.dist(r, o) <= p.auraRadius * 32);
      if (!around.length) continue;
      for (const o of around) {
        this.addMoodlet(o, 'cheered', `${r.name} 덕분에 웃음`, p.auraMood, p.auraHours, { by: 'cheerful', source: r.id });
        if (this.rel(o.id, r.id).known && this.cool(o, `cheered:${r.id}`, 12 * HOUR)) this.memory.add(o, 'cheered', `person:${r.id}`, this.now, { other: r.id, vars: { other: r.name } });
      }
      this.tag(r, '✨ 하하', 'cheerful');
      if (this.cool(r, 'auraNews', 2 * HOUR)) this.emit('cheer', { a: r.name, place: this.areaName(this.area(r)) }, { actors: [r.id, ...around.map((o) => o.id)], trait: 'cheerful', importance: 15 });
    }
  }

  /** 받아 줄 확률 */
  acceptChance(s, r, base = 0.85) {
    let p = base * { good: 1.1, okay: 1, bad: 0.7 }[this.moodLevel(s)];
    if (this.memory.avoids(s, `person:${r.id}`, this.now)) p *= 0.3;
    const hooks = ['talk.accept'];
    if (this.focusing(s)) hooks.push('talk.accept.focus');
    return clamp(this.traits.v(s, hooks, p), 0, 1);
  }

  /** 대화 한 번 */
  talk(r, s, kind = 'chat') {
    const now = this.now;
    this.state.talkCool[pairKey(r.id, s.id)] = now + 15 * MIN;
    r.cooldown.talk = now + 3 * MIN;
    const firstMeet = !this.rel(r.id, s.id).known;
    if (kind === 'chat' && !this.rng.chance(this.acceptChance(s, r))) {
      this.say(r, this.line(firstMeet ? 'greet' : 'chat', r, s, { outcome: 'neutral' })?.a);
      this.say(s, this.line('brushoff', s, r, {})?.a ?? '…지금은 좀.', 1.6);
      this.memory.add(r, 'rejected', `person:${s.id}`, now, { other: s.id, vars: { other: s.name } });
      this.addMoodlet(r, 'rejected', `${s.name}에게 무시당함`, -5, 2, { source: s.id });
      this.checkAvoid(r, `person:${s.id}`, s.name);
      if (firstMeet) this.meet(r, s);
      this.emit('talk_rejected', { a: r.name, b: s.name }, { actors: [r.id, s.id], importance: 18 });
      return;
    }
    if (firstMeet) this.meet(r, s);

    // 결과 굴림
    const rel = this.rel(s.id, r.id);
    let good = 0.55 + 0.03 * (r.abilities.charm - 3) + rel.affinity / 400;
    let bad = 0.1 - rel.affinity / 500;
    const gr = this.traits.apply(r, ['talk.good', ...(this.traits.has(s, 'bookworm') && this.area(r) === 'library' ? ['talk.good.withBookworm'] : [])], 0);
    const br = this.traits.apply(r, ['talk.bad', ...(this.moodLevel(r) === 'bad' ? ['talk.badWhenMoodBad'] : [])], 0);
    good += gr.value; bad += br.value;
    if (this.moodLevel(r) === 'bad') bad += 0.08;
    if (this.moodLevel(s) === 'bad') bad += 0.05;
    if (this.moodLevel(r) === 'good') good += 0.05;
    if (kind === 'comfort') { good = 0.95; bad = 0; }
    if (kind === 'jealous') bad += 0.15;
    good = clamp(good, 0.05, 0.95); bad = clamp(bad, 0, 0.8);
    const roll = this.rng.next();
    const outcome = roll < bad ? 'bad' : roll < bad + good ? 'good' : 'neutral';
    const by = outcome === 'bad' ? br.by : outcome === 'good' ? gr.by : [];

    // 효과
    const sg = { good: 20, neutral: 12, bad: 6 }[outcome];
    for (const [x, y] of [[r, s], [s, r]]) {
      x.needs.social = clamp(x.needs.social + sg * this.socialMul(x, y.id));
      x.needs.fun = clamp(x.needs.fun + (outcome === 'good' ? 4 : 1));
    }
    // 말 거는 쪽의 재미: 특성(독설가 +5, 유쾌 ×1.5)이 끼어듦
    const baseFun = outcome === 'good' ? 4 : 1;
    r.needs.fun = clamp(r.needs.fun + this.traits.v(r, 'talk.funSelf', baseFun) - baseFun);
    const dGood = 3.5, dBad = -6;
    if (outcome === 'good') {
      this.changeAffinity(s, r, this.traits.v(r, 'talk.partnerAffinityGood', dGood));
      this.changeAffinity(r, s, this.traits.v(s, 'talk.partnerAffinityGood', dGood * 0.8));
      for (const [x, y] of [[r, s], [s, r]]) {
        this.addMoodlet(x, 'talk_good', `${y.name}와 즐거운 대화`, 6, 2, { source: y.id });
        this.memory.add(x, 'talk_good', `person:${y.id}`, this.now, { other: y.id, vars: { other: y.name } });
      }
    } else if (outcome === 'neutral') {
      this.changeAffinity(s, r, 0.8); this.changeAffinity(r, s, 0.8);
    } else {
      this.changeAffinity(s, r, this.traits.v(r, 'talk.partnerAffinityBad', dBad));
      this.changeAffinity(r, s, dBad * 0.4);
      if (this.hasBehavior(r, 'insult')) {
        const p = this.traits.params('toxic');
        const hurt = this.traits.v(s, 'insult.received', 1);
        this.addMoodlet(s, 'insulted', `${r.name}의 독설`, p.insultMood * hurt, p.insultHours, { by: 'toxic', source: r.id });
        this.changeAffinity(s, r, p.insultAffinity * hurt);
        this.memory.add(s, 'insulted', `person:${r.id}`, this.now, { other: r.id, vars: { other: r.name }, intensityMul: hurt });
        this.tag(r, '🗡️ 독설', 'toxic');
      } else {
        this.addMoodlet(s, 'talk_bad', `${r.name}와 언짢은 대화`, -8, 2, { source: r.id });
        this.memory.add(s, 'talk_bad', `person:${r.id}`, this.now, { other: r.id, vars: { other: r.name } });
      }
      this.addMoodlet(r, 'talk_bad', `${s.name}와 언짢은 대화`, -4, 1, { source: s.id });
      this.memory.add(r, 'talk_bad', `person:${s.id}`, this.now, { other: s.id, vars: { other: s.name }, intensityMul: 0.5 });
      this.checkAvoid(s, `person:${r.id}`, r.name);
    }

    // 말풍선
    const L = this.line(firstMeet ? 'greet' : kind === 'chat' ? 'chat' : kind, r, s, { outcome });
    this.say(r, L?.a);
    this.say(s, L?.b, 2.2);
    const secs = this.rng.range(60, 120);
    r.talkUntil = s.talkUntil = this.now + secs * 1000;
    r.path = []; if (!s.action?.route) s.path = [];
    r.facing = s.pos.x < r.pos.x ? 'left' : 'right';
    s.facing = r.pos.x < s.pos.x ? 'left' : 'right';

    // 소식
    const type = firstMeet ? 'first_meet' : outcome === 'bad' && this.hasBehavior(r, 'insult') ? 'insult' : `talk_${outcome}`;
    const imp = { first_meet: 22, insult: 30, talk_bad: 20, talk_good: 8, talk_neutral: 3 }[type];
    this.emit(type, { a: r.name, b: s.name }, { actors: [r.id, s.id], trait: by[0] ?? null, importance: imp, lines: L ? [{ s: r.id, t: L.a }, { s: s.id, t: L.b }] : null });
    this.onInteraction(r, s, 'talk');
  }

  /** 다른 사람에게 다가가서 하는 일 (위로·끼어들기) */
  meetPerson(r, target, id) {
    if (id === 'comfort') {
      const p = this.traits.params('kind');
      r.cooldown[`comfort:${target.id}`] = this.now + 6 * HOUR;
      const neg = target.moodlets.filter((m) => m.value < 0).sort((a, b) => a.value - b.value)[0];
      if (neg) neg.until = Math.min(neg.until, this.now + 20 * MIN);
      this.addMoodlet(target, 'comforted', `${r.name}의 위로`, p.comfortMood, p.comfortHours, { by: 'kind', source: r.id });
      this.meet(r, target);
      this.memory.add(target, 'comforted', `person:${r.id}`, this.now, { other: r.id, vars: { other: r.name } });
      this.changeAffinity(target, r, 8);
      this.changeAffinity(r, target, 3);
      const L = this.line('comfort', r, target, {});
      this.say(r, L?.a); this.say(target, L?.b, 2.2);
      r.talkUntil = target.talkUntil = this.now + 90 * 1000;
      this.tag(r, '🤍 위로', 'kind');
      this.emit('comfort', { a: r.name, b: target.name }, { actors: [r.id, target.id], trait: 'kind', importance: 40 });
    } else if (id === 'interrupt') {
      if (this.canChat(target)) this.talk(r, target, 'jealous');
    }
  }

  /** 같이 하기 요청 */
  invite(r, p, c) {
    const def = this.actions[c.id];
    const rel = this.rel(p.id, r.id);
    let chance = 0.55 * (0.5 + Math.max(0, rel.affinity) / 100);
    chance *= { good: 1.15, okay: 1, bad: 0.7 }[this.moodLevel(p)];
    if (this.urgency(p, 'social') > 0.3) chance *= 1.3;
    if (this.focusing(p)) chance *= 0.4;
    if (p.lover === r.id) chance = Math.max(chance, 0.8);
    if (this.memory.avoids(p, `person:${r.id}`, this.now)) chance *= 0.3;
    chance = this.traits.v(p, 'invite.accept', chance);
    if (p.focusPerson === r.id) chance = this.traits.v(p, 'invite.focus', chance);
    chance = clamp(chance, 0, 0.97);
    const L = this.line(`invite_${c.id}`, r, p, {});
    this.say(r, L?.a);
    r.cooldown.invite = this.now + 20 * MIN;
    if (!this.rng.chance(chance)) {
      r.cooldown[`invite:${p.id}`] = this.now + 3 * HOUR;
      this.say(p, this.line('invite_no', p, r, {})?.a ?? '음… 다음에.', 2);
      this.memory.add(r, 'rejected', `person:${p.id}`, this.now, { other: p.id, vars: { other: p.name } });
      this.addMoodlet(r, 'rejected', `${p.name}가 거절함`, -6, 2, { source: p.id });
      this.checkAvoid(r, `person:${p.id}`, p.name);
      this.emit('invite_no', { a: r.name, b: p.name, activity: def.name }, { actors: [r.id, p.id], importance: 18 });
      return false;
    }
    this.say(p, this.line('invite_yes', p, r, {})?.a ?? '좋아요!', 2);
    r.cooldown[`invite:${p.id}`] = this.now + 90 * MIN;
    this.endAction(p, false);
    // 상대는 따라가거나 옆자리
    if (def.at.some((x) => x.startsWith('route:')) && c.dest.route) {
      this.start(p, { id: c.id, dest: {}, partner: r.id, by: [], needs: ['social'], note: 'invited' }, { asPartnerOf: r.id });
    } else {
      const occupied = this.occupied();
      if (c.dest.spot) occupied.add(c.dest.spot);
      const s = this.grid.spots[c.dest.spot];
      let seat = null;
      if (s?.inside) seat = c.dest.spot;
      else {
        const prefix = c.dest.spot.replace(/\d+[ab]?$/, '');
        const free = this.grid.group(prefix).filter((k) => !occupied.has(k));
        free.sort((a, b) => this.mh(this.grid.spots[a], s) - this.mh(this.grid.spots[b], s));
        seat = free[0];
      }
      if (!seat) return false;
      p.action = null;
      this.start(p, { id: c.id, dest: { spot: seat }, partner: r.id, by: [], needs: ['social'], note: 'invited' }, { asPartnerOf: r.id });
      p.action.follower = false;
      p.action.partnerOf = r.id;
    }
    this.emit(r.lover === p.id ? 'date_start' : 'invite_yes', { a: r.name, b: p.name, activity: def.name }, { actors: [r.id, p.id], importance: r.lover === p.id ? 30 : 22 });
    return true;
  }

  // ───────────────────────────── 매시간: 연애·기억 정리·몰두 대상
  hourly(clock) {
    const list = this.list();
    for (const r of list) { this.refreshFocus(r); this.memory.prune(r, this.now); }
    const R = this.data.romance;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ab = this.rel(a.id, b.id), ba = this.rel(b.id, a.id);
        if (a.lover === b.id) {
          // 이별
          const low = [ab.lowSince, ba.lowSince].filter(Boolean);
          if (low.length && this.now - Math.min(...low) > R.breakup.hours * HOUR && this.rng.chance(R.breakup.chancePerHour)) this.breakup(a, b);
          continue;
        }
        if (a.lover || b.lover) continue;
        if (ab.affinity < R.confess.minAffinity || ba.affinity < R.confess.minAffinity) continue;
        if (ab.closeness < R.confess.minCloseness || ba.closeness < R.confess.minCloseness) continue;
        if (this.dist(a, b) > R.confess.radius * 32 || this.asleep(a) || this.asleep(b)) continue;
        let p = R.confess.chancePerHour;
        if (a.focusPerson === b.id || b.focusPerson === a.id) p *= 2;
        if (!this.rng.chance(p)) continue;
        const [x, y] = (a.focusPerson === b.id || a.extro >= b.extro) ? [a, b] : [b, a];
        const accept = clamp((this.rel(y.id, x.id).affinity - R.confess.acceptFrom) / (100 - R.confess.acceptFrom), 0, 1);
        const L = this.line('confess', x, y, {});
        this.say(x, L?.a);
        if (this.rng.chance(accept)) {
          x.lover = y.id; y.lover = x.id;
          this.say(y, L?.b, 2.4);
          for (const [m, n] of [[x, y], [y, x]]) {
            this.memory.add(m, 'romance_start', `person:${n.id}`, this.now, { other: n.id, vars: { other: n.name } });
            this.addMoodlet(m, 'romance', `${n.name}와 연인이 됨`, 25, 24, { source: n.id });
            this.refreshFocus(m);
          }
          this.emit('romance_start', { a: x.name, b: y.name }, { actors: [x.id, y.id], importance: 100 });
        } else {
          this.say(y, this.line('confess_no', y, x, {})?.a ?? '미안…', 2.4);
          this.memory.add(x, 'confess_rejected', `person:${y.id}`, this.now, { other: y.id, vars: { other: y.name } });
          this.addMoodlet(x, 'confess_no', '고백을 거절당함', -20, 8, { source: y.id });
          this.changeAffinity(x, y, -10);
          this.emit('confess_no', { a: x.name, b: y.name }, { actors: [x.id, y.id], importance: 80 });
        }
      }
    }
    // 하루 동안의 자리 통계 보관 (최근 5일)
    const keep = this.day - 5;
    for (const d of Object.keys(this.state.stats)) if (+d < keep) delete this.state.stats[d];
  }

  breakup(a, b) {
    a.lover = null; b.lover = null;
    for (const [m, n] of [[a, b], [b, a]]) {
      this.memory.add(m, 'breakup', `person:${n.id}`, this.now, { other: n.id, vars: { other: n.name } });
      this.addMoodlet(m, 'breakup', `${n.name}와 헤어짐`, -25, 24, { source: n.id });
      this.refreshFocus(m);
    }
    this.emit('breakup', { a: a.name, b: b.name }, { actors: [a.id, b.id], importance: 100 });
  }

  onNewDay(prev, day) {
    this.state.lastDay = day;
    for (const r of this.list()) for (const o of this.list()) {
      if (r === o) continue;
      const x = this.rel(r.id, o.id);
      x.closeness = clamp(x.closeness - this.data.romance.relation.closenessDecayPerDay);
    }
    this.emit('new_day', { day }, { importance: 0 });
  }

  // ───────────────────────────── 기록
  dayStats(day) {
    return (this.state.stats[day] ??= { place: {}, pairs: {} });
  }

  recordStats(r, dt, day) {
    const st = this.dayStats(day);
    const a = this.asleep(r) ? 'sleep' : this.area(r).startsWith('home') ? 'home' : this.area(r);
    const row = (st.place[r.id] ??= {});
    row[a] = (row[a] ?? 0) + dt / 60;
  }

  cool(r, key, ms, peek = false) {
    const until = r.cooldown[key] ?? 0;
    if (until > this.now) return false;
    if (!peek) r.cooldown[key] = this.now + ms;
    return true;
  }

  /** 소식 기록 */
  emit(type, vars, { actors = [], trait = null, importance = 10, lines = null } = {}) {
    const tpl = this.data.news.events[type];
    const text = tpl ? fill(tpl, vars) : null;
    const item = { t: this.now, day: this.day, type, text, trait, importance, actors, lines };
    if (type !== 'new_day' && text) {
      this.state.news.unshift(item);
      if (this.state.news.length > 250) this.state.news.length = 250;
    }
    this.out.push({ kind: 'news', item });
    if (this.capture) this.capture.push(item);
  }

  say(r, text, delay = 0) {
    if (text) this.out.push({ kind: 'say', who: r.id, text, delay });
  }

  tag(r, text, trait = null) {
    this.out.push({ kind: 'tag', who: r.id, text, trait });
  }

  // ───────────────────────────── 대사 고르기
  register(a, b) {
    const st = this.stage(a.id, b.id);
    return ['friend', 'close', 'lover'].includes(st) ? 'casual' : 'formal';
  }

  line(kind, a, b, { outcome = null } = {}) {
    const lines = this.data.talk.lines.filter((l) => l.kind === kind);
    if (!lines.length) return null;
    const reg = this.register(a, b);
    const ctx = { outcome, register: reg, place: this.area(a), timeBand: this.clock().timeBand, lovers: a.lover === b.id };
    let best = [], bs = -1;
    for (const l of lines) {
      const w = l.when ?? {};
      let s = 0, ok = true;
      for (const [k, v] of Object.entries(w)) {
        const vals = Array.isArray(v) ? v : [v];
        let hit;
        if (k === 'aTrait') hit = vals.some((t) => a.traits.includes(t));
        else if (k === 'bTrait') hit = vals.some((t) => b.traits.includes(t));
        else if (k === 'aAction') hit = vals.includes(a.action?.id ?? a.lastAction);
        else if (k === 'aNeed') hit = vals.some((n) => a.needs[n] < 30);
        else if (k === 'aMood') hit = vals.includes(this.moodLevel(a));
        else hit = vals.includes(ctx[k]);
        if (!hit) { ok = false; break; }
        s += k === 'register' || k === 'outcome' ? 1 : 2;
      }
      if (!ok) continue;
      if (s > bs) { bs = s; best = [l]; } else if (s === bs) best.push(l);
    }
    if (!best.length) return null;
    const l = this.rng.pick(best);
    const v = { a: a.name, b: b.name };
    return { a: fill(l.a, v), b: l.b ? fill(l.b, v) : null };
  }

  // ───────────────────────────── 화면용 요약
  explain(r) {
    const a = r.action;
    if (!a) return { what: '생각 중', why: '' };
    const def = this.actions[a.id];
    const needNames = (a.why.needs ?? []).map((n) => `${this.needsCfg.needs[n].name} ${Math.round(r.needs[n])}`);
    const notes = { money: '돈이 부족해서', food: '먹을 걸 사려고', panic: '돈이 바닥나서 허겁지겁', groceries: '식료품이 떨어져서', rejected: '거절당해서 혼자', invited: '같이 하자고 해서', comfort: '기분이 처진 사람을 보고', jealous: '신경 쓰여서' };
    const why = [a.why.note && notes[a.why.note], needNames.length && `${needNames.join(', ')}`].filter(Boolean).join(' · ');
    const partner = a.partner ? this.get(a.partner)?.name : a.person ? this.get(a.person)?.name : null;
    const where = a.phase === 'travel' ? '가는 중' : this.areaName(this.area(r));
    return { what: `${def.icon} ${def.name}${partner ? ` (${partner})` : ''}`, where, why, by: a.why.by ?? [], date: a.date };
  }

  /** 접속 안 한 동안 계산 (최대 3일) — 그 사이 생긴 사건을 돌려줌 */
  catchUp(ms) {
    const limit = 3 * DAY;
    const span = Math.min(ms, limit);
    this.capture = [];
    const fromDay = this.day;
    this.advance(span / 1000, 15);
    const events = this.capture;
    this.capture = null;
    this.out = [];
    return { events, fromDay, toDay: this.day, span, capped: ms > limit };
  }
}

export { hm };
