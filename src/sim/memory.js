// 기억 장치
// - 기억 한 건: { k: 종류, s: 대상("person:som" / "activity:work" / "place:cafe"), v: -1~1, i: 강도, t: 시각, o: 함께 있던 사람, x: 문구 변수 }
// - 단기 기억(short) → 강하거나 같은 일이 반복되면 장기 기억(long)으로 합쳐짐
// - 태도 점수 attitude(대상) = Σ v × i × 옅어진 정도 × 특성 가중치  (−100 ~ 100)
import { HOUR, DAY } from './time.js';

export class Memory {
  constructor(data, traits) {
    this.cfg = data;
    this.kinds = data.kinds;
    this.traits = traits;
  }

  empty() {
    return { short: [], long: [] };
  }

  /** 특성에 따른 기억 가중치 */
  weight(r, kind, subject, extra = {}) {
    const hooks = [];
    if (subject.startsWith('person:')) {
      hooks.push('memory.weight.person');
      if (extra.rival) hooks.push('memory.weight.rival');
      if (r.focusPerson && subject === `person:${r.focusPerson}`) hooks.push('memory.weight.focus');
    }
    return this.traits.v(r, hooks, 1);
  }

  halfLife(r, m, long) {
    const base = (long ? this.cfg.halfLifeHours.long : this.cfg.halfLifeHours.short) * HOUR;
    return m.v < 0 ? this.traits.v(r, 'memory.halfLife.negative', base) : base;
  }

  /**
   * 기억 추가
   * @returns {object} 저장된 기억
   */
  add(r, kind, subject, now, { other = null, vars = {}, intensityMul = 1 } = {}) {
    const def = this.kinds[kind];
    if (!def) return null;
    const w = this.weight(r, kind, subject, { rival: def.rival });
    const m = {
      k: kind,
      s: subject,
      v: def.valence,
      i: Math.min(100, Math.round(def.intensity * intensityMul * w)),
      t: now,
      o: other,
      x: vars,
    };
    r.memory.short.unshift(m);
    // 강도가 높으면 바로 장기 기억으로
    if (m.i >= this.cfg.consolidate.intensity) this.toLong(r, [m], now);
    else this.tryConsolidate(r, subject, Math.sign(m.v), now);
    if (r.memory.short.length > this.cfg.limits.short) r.memory.short.length = this.cfg.limits.short;
    return m;
  }

  /** 같은 대상·같은 방향 기억이 windowDays 안에 count 번 이상이면 장기 기억 하나로 합침 */
  tryConsolidate(r, subject, sign, now) {
    const { count, windowDays } = this.cfg.consolidate;
    const recent = r.memory.short.filter((m) => m.s === subject && Math.sign(m.v) === sign && now - m.t < windowDays * DAY && !m.merged);
    if (recent.length >= count) this.toLong(r, recent, now, true);
  }

  toLong(r, mems, now, merged = false) {
    for (const m of mems) m.merged = true;
    const first = mems[0];
    const sign = Math.sign(first.v);
    let entry;
    if (merged) {
      const type = first.s.split(':')[0];
      entry = {
        k: `summary.${type}.${sign < 0 ? 'negative' : 'positive'}`,
        s: first.s,
        v: sign * Math.max(...mems.map((m) => Math.abs(m.v))),
        i: Math.min(100, this.cfg.consolidate.mergedIntensity + (mems.length - this.cfg.consolidate.count) * 5),
        t: now,
        o: first.o,
        x: first.x,
        n: mems.length,
      };
    } else {
      entry = { ...first, long: true };
    }
    entry.long = true;
    // 같은 대상·방향 요약이 있으면 갱신
    const same = r.memory.long.findIndex((m) => m.s === entry.s && m.k === entry.k);
    if (same >= 0) {
      const old = r.memory.long[same];
      entry.i = Math.min(100, Math.max(old.i, entry.i) + 5);
      entry.n = (old.n ?? 1) + (entry.n ?? 1);
      r.memory.long.splice(same, 1);
    }
    r.memory.long.unshift(entry);
    if (r.memory.long.length > this.cfg.limits.long) {
      // 가장 약해진 기억부터 잊음
      r.memory.long.sort((a, b) => this.strength(r, b, now) - this.strength(r, a, now));
      r.memory.long.length = this.cfg.limits.long;
    }
    return entry;
  }

  /** 지금 시점의 남은 세기 (0~1 × 강도) */
  strength(r, m, now) {
    const hl = this.halfLife(r, m, m.long);
    return m.i * Math.pow(0.5, (now - m.t) / hl);
  }

  /** 태도 점수 (−100~100) */
  attitude(r, subject, now) {
    let s = 0;
    for (const m of r.memory.short) if (m.s === subject && !m.merged) s += m.v * this.strength(r, m, now);
    for (const m of r.memory.long) if (m.s === subject) s += m.v * this.strength(r, m, now);
    return Math.max(-100, Math.min(100, s));
  }

  avoids(r, subject, now) {
    return this.attitude(r, subject, now) <= this.cfg.avoidAt;
  }

  /** 행동·장소 점수 배율: 피하면 ×0.3, 그 외 1 + 태도/200 */
  factor(r, subject, now) {
    const a = this.attitude(r, subject, now);
    if (a <= this.cfg.avoidAt) return 0.3;
    return 1 + a / 200;
  }

  /** 너무 옅어진 단기 기억 정리 */
  prune(r, now) {
    r.memory.short = r.memory.short.filter((m) => this.strength(r, m, now) > 2);
    r.memory.long = r.memory.long.filter((m) => this.strength(r, m, now) > 3);
  }

  /** 대상별 태도 목록 (화면용: 좋아하는 것·피하는 것) */
  attitudes(r, now) {
    const subjects = new Set([...r.memory.short.map((m) => m.s), ...r.memory.long.map((m) => m.s)]);
    return [...subjects].map((s) => ({ s, a: this.attitude(r, s, now) })).filter((x) => Math.abs(x.a) >= 5).sort((a, b) => b.a - a.a);
  }
}
