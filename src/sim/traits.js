// 특성 통로: 모든 수치 계산은 apply(주민, hook 목록, 기본값)을 거친다.
// traits.json 의 mods 에 적힌 hook 이 하나라도 맞으면 그 특성이 계산에 끼어들고, 어떤 특성이 끼어들었는지도 돌려준다(화면에 이유로 표시).

export class Traits {
  constructor(data) {
    this.defs = data.traits;
  }

  has(r, id) {
    return r.traits.includes(id);
  }

  params(id) {
    return this.defs[id]?.params ?? {};
  }

  /**
   * @param {object} r 주민
   * @param {string|string[]} hooks 확인할 hook 이름들 (예: ['needGain.fun.read', 'needGain.fun.tag:solo'])
   * @param {number} base 기본값
   * @returns {{ value:number, by:string[] }}
   */
  apply(r, hooks, base) {
    const list = Array.isArray(hooks) ? hooks : [hooks];
    let v = base;
    const by = [];
    for (const id of r.traits) {
      const mods = this.defs[id]?.mods;
      if (!mods) continue;
      let hit = false;
      for (const h of list) {
        const m = mods[h];
        if (!m) continue;
        if (m.mul != null) v *= m.mul;
        if (m.add != null) v += m.add;
        hit = true;
      }
      if (hit) by.push(id);
    }
    return { value: v, by };
  }

  /** 값만 필요할 때 */
  v(r, hooks, base) {
    return this.apply(r, hooks, base).value;
  }

  /** 서로 충돌하는 특성 쌍 찾기 (검사·무작위 배정용) */
  conflicts(list) {
    const out = [];
    for (const a of list) for (const b of this.defs[a]?.conflicts ?? []) if (list.includes(b) && a < b) out.push([a, b]);
    return out;
  }

  /** 충돌 없이 1~2개 무작위 */
  randomSet(rng) {
    const ids = Object.keys(this.defs);
    const n = rng.chance(0.75) ? 2 : 1;
    for (let tries = 0; tries < 50; tries++) {
      const pick = [];
      while (pick.length < n) {
        const t = rng.pick(ids);
        if (!pick.includes(t)) pick.push(t);
      }
      if (!this.conflicts(pick).length) return pick;
    }
    return [rng.pick(ids)];
  }

  label(id) {
    const d = this.defs[id];
    return d ? `${d.icon}${d.name}` : id;
  }
}
