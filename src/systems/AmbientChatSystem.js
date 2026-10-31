import { matchWhen } from './DialogueSystem.js';

// 같은 장소에 있는 주민끼리 짧은 대화. 데이터: public/data/ambient.json

const CHECK_EVERY = 4; // 초
const CHANCE = 0.4;
const NEAR_PX = 4 * 32;
const PASS_PX = 56;
const PERSON_COOLDOWN = 40 * 1000;
const PASS_COOLDOWN = 5 * 60 * 1000;

export class AmbientChatSystem {
  constructor(scene, data, { npcs, bubbles, isEnabled, getCtx }) {
    this.scene = scene;
    this.scripts = data.scripts ?? [];
    this.passing = data.passing ?? [];
    this.npcs = npcs; // Map<id, Npc>
    this.bubbles = bubbles;
    this.isEnabled = isEnabled;
    this.getCtx = getCtx;
    this.timer = 2;
    this.cool = new Map(); // scriptId → 다시 가능한 시각(ms)
    this.personCool = new Map();
    this.passCool = new Map();
    this.running = null;
  }

  inView(npc) {
    const v = this.scene.cameras.main.worldView;
    return npc.visible && v.contains(npc.x, npc.y);
  }

  update(dt) {
    if (this.running) { this.tickRunning(dt); return; }
    if (!this.isEnabled()) return;
    this.checkPassing();
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = CHECK_EVERY;
    if (Math.random() > CHANCE) return;

    const now = Date.now();
    const base = this.getCtx();
    const candidates = [];
    for (const sc of this.scripts) {
      if ((this.cool.get(sc.id) ?? 0) > now) continue;
      const ps = sc.participants.map((id) => this.npcs.get(id));
      if (ps.some((p) => !p || !p.visible || p.paused || p.chatting)) continue;
      if (ps.some((p) => (this.personCool.get(p.id) ?? 0) > now)) continue;
      if (!sc.allowMoving && ps.some((p) => p.moving)) continue;
      const place = ps[0].place;
      if (ps.some((p) => p.place !== place)) continue;
      const near = sc.allowMoving ? NEAR_PX * 1.6 : NEAR_PX;
      if (ps.some((p) => Math.hypot(p.x - ps[0].x, p.y - ps[0].y) > near)) continue;
      if (!ps.some((p) => this.inView(p))) continue;
      const present = [...this.npcs.values()].filter((n) => n.visible && n.place === place).map((n) => n.id);
      const ctx = { ...base, context: 'talk', place, activity: ps[0].activity, present, familiarity: 0, firstMeet: false, moving: ps.some((p) => p.moving) };
      const when = { ...(sc.when ?? {}) };
      delete when.familiarity;
      const n = matchWhen(when, ctx);
      if (n < 0) continue;
      candidates.push({ sc, ps, w: (sc.weight ?? 1) * (1 + n * 0.3) });
    }
    if (!candidates.length) return;
    let r = Math.random() * candidates.reduce((s, c) => s + c.w, 0);
    const pick = candidates.find((c) => (r -= c.w) <= 0) ?? candidates[0];
    this.start(pick.sc, pick.ps);
  }

  start(sc, ps) {
    this.running = { sc, ps, i: -1, t: 0 };
    ps.forEach((p) => { p.chatting = true; });
    this.cool.set(sc.id, Date.now() + (sc.cooldownMin ?? 60) * 60 * 1000);
    this.next();
  }

  next() {
    const r = this.running;
    r.i++;
    const line = r.sc.lines[r.i];
    if (!line) { this.stop(); return; }
    const sp = this.npcs.get(line.s);
    if (!sp || !sp.visible) { this.stop(); return; }
    // 서 있는 사람들은 서로 바라봄
    for (const p of r.ps) {
      if (p === sp || p.moving) continue;
      p.faceTowards(sp.x, sp.y);
    }
    if (!sp.moving) {
      const other = r.ps.find((p) => p !== sp);
      if (other) sp.faceTowards(other.x, other.y);
    }
    const dur = 1.6 + line.t.length * 0.085;
    r.t = dur;
    this.bubbles.show(sp, line.t, dur);
  }

  tickRunning(dt) {
    const r = this.running;
    if (r.ps.some((p) => !p.visible || p.paused)) { this.stop(); return; }
    r.t -= dt;
    if (r.t <= 0) this.next();
  }

  stop() {
    const r = this.running;
    if (!r) return;
    const until = Date.now() + PERSON_COOLDOWN;
    r.ps.forEach((p) => { p.chatting = false; this.personCool.set(p.id, until); });
    this.running = null;
  }

  checkPassing() {
    const now = Date.now();
    for (const ps of this.passing) {
      const key = ps.pair.join('|');
      if ((this.passCool.get(key) ?? 0) > now) continue;
      const [a, b] = ps.pair.map((id) => this.npcs.get(id));
      if (!a || !b || !a.visible || !b.visible || a.chatting || b.chatting || a.paused || b.paused) continue;
      if (!a.moving && !b.moving) continue;
      if (a.goal?.npc === b.id || b.goal?.npc === a.id) continue; // 같이 걷는 중이면 스쳐 지나가는 인사 X
      if (Math.hypot(a.x - b.x, a.y - b.y) > PASS_PX) continue;
      if (!this.inView(a)) continue;
      this.passCool.set(key, now + PASS_COOLDOWN);
      this.start({ id: `pass:${key}`, lines: ps.lines, cooldownMin: 0, allowMoving: true }, [a, b]);
      return;
    }
  }
}
