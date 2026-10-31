import { parseHM } from './Clock.js';

const DAY_SETS = {
  all: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  weekday: ['mon', 'tue', 'wed', 'thu', 'fri'],
  weekend: ['sat', 'sun'],
};

function daysOf(days) {
  if (!days) return { set: DAY_SETS.all, spec: 0 };
  if (Array.isArray(days)) return { set: days, spec: 2 };
  if (DAY_SETS[days]) return { set: DAY_SETS[days], spec: days === 'all' ? 0 : 1 };
  return { set: [days], spec: 2 };
}

/**
 * schedules.json 해석기.
 * 같은 시각에 여러 항목이 맞으면: 요일 지정이 구체적인 쪽 > 나중에 적힌 쪽.
 */
export class ScheduleSystem {
  constructor(data) {
    this.npcs = {};
    for (const [id, def] of Object.entries(data.npcs)) {
      this.npcs[id] = {
        default: def.default,
        entries: (def.entries ?? []).map((e, i) => {
          const d = daysOf(e.days);
          return { ...e, i, daySet: d.set, spec: d.spec, fromMin: parseHM(e.from), toMin: parseHM(e.to) };
        }),
      };
    }
  }

  /** @returns {{ key:string, entry:object|null, activity:string, label:string, target:object }} */
  resolve(npcId, t) {
    const def = this.npcs[npcId];
    let best = null;
    for (const e of def.entries) {
      if (!e.daySet.includes(t.day)) continue;
      if (t.dayMin < e.fromMin || t.dayMin >= e.toMin) continue;
      if (!best || e.spec > best.spec || (e.spec === best.spec && e.i > best.i)) best = e;
    }
    const e = best ?? { ...def.default, i: -1 };
    let target;
    let altIdx = 0;
    if (e.follow) target = { type: 'follow', npc: e.follow };
    else if (e.route) target = { type: 'route', route: e.route };
    else {
      let at = e.at;
      if (Array.isArray(at)) {
        const every = e.every ?? 60;
        altIdx = Math.floor((t.dayMin - (e.fromMin ?? 0)) / every) % at.length;
        at = at[altIdx];
      }
      target = { type: 'spot', spot: at };
    }
    return {
      key: `${e.i}:${altIdx}`,
      entry: best,
      activity: e.activity ?? 'home',
      label: e.label ?? '',
      target,
    };
  }
}
