// 조건(when)에 맞는 대사 고르기. 데이터: public/data/dialogue/<npc>.json

const asArr = (v) => (v == null ? null : Array.isArray(v) ? v : [v]);

export const WHEN_KEYS = ['context', 'place', 'activity', 'timeBand', 'dayType', 'days', 'months', 'familiarity', 'with', 'without', 'firstMeet', 'moving'];

/** @returns {number} 맞으면 조건 개수, 안 맞으면 -1 */
export function matchWhen(when = {}, ctx) {
  let n = 0;
  const context = when.context ?? 'talk';
  if (context !== ctx.context) return -1;
  if (when.context) n++;
  for (const k of ['place', 'activity', 'timeBand']) {
    const v = asArr(when[k]);
    if (!v) continue;
    if (!v.includes(ctx[k])) return -1;
    n++;
  }
  if (when.dayType) { if (when.dayType !== ctx.dayType) return -1; n++; }
  if (when.days) { if (!asArr(when.days).includes(ctx.day)) return -1; n += 2; }
  if (when.months) { if (!asArr(when.months).includes(ctx.month)) return -1; n++; }
  if (when.familiarity) {
    const { min = 0, max = 99 } = when.familiarity;
    if (ctx.familiarity < min || ctx.familiarity > max) return -1;
    n++;
  }
  if (when.with) { if (!asArr(when.with).every((id) => ctx.present.includes(id))) return -1; n += 2; }
  if (when.without) { if (asArr(when.without).some((id) => ctx.present.includes(id))) return -1; n++; }
  if (when.firstMeet != null) {
    if (when.firstMeet !== ctx.firstMeet) return -1;
    if (when.firstMeet) n += 100; // 첫 만남 대사는 무조건 우선
  }
  if (when.moving != null) { if (when.moving !== ctx.moving) return -1; n++; }
  return n;
}

export class DialogueSystem {
  /** @param {Record<string, {lines:any[], fallback:any[]}>} data */
  constructor(data) {
    this.data = data;
  }

  /**
   * @param {string} npcId
   * @param {object} ctx
   * @param {{seen:string[], recent:string[]}} mem
   */
  pick(npcId, ctx, mem) {
    const d = this.data[npcId];
    if (!d) return null;
    const scored = [];
    for (const line of d.lines) {
      if (line.once && mem.seen.includes(line.id)) continue;
      const n = matchWhen(line.when, ctx);
      if (n < 0) continue;
      scored.push({ line, score: n * 10 + (line.priority ?? 0) });
    }
    let pool = [];
    if (scored.length) {
      const max = Math.max(...scored.map((s) => s.score));
      pool = scored.filter((s) => s.score >= max - 5).map((s) => s.line);
      // 점수 차이 안에서 후보가 하나뿐이면 조금 더 넓혀서 반복을 줄임
      if (pool.length < 2 && !ctx.firstMeet) pool = scored.filter((s) => s.score >= max - 15).map((s) => s.line);
    } else {
      pool = (d.fallback ?? []).filter((l) => matchWhen(l.when, ctx) >= 0);
      if (!pool.length) return null;
    }
    const fresh = pool.filter((l) => !mem.recent.includes(l.id));
    if (fresh.length) pool = fresh;
    else pool = [...pool].sort((a, b) => mem.recent.indexOf(a.id) - mem.recent.indexOf(b.id)).slice(0, 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

/** {player} {time} {weekday} 치환 */
export function fillText(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
}
