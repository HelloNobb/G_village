// 화면에 보여줄 문장 만들기: 기억, 태도 대상, 관계 생각
import { fill } from '../sim/text.js';

export function subjectName(sim, subject) {
  const [type, id] = subject.split(':');
  if (type === 'person') return sim.get(id)?.name ?? id;
  if (type === 'activity') return sim.actions[id]?.name ?? sim.data.actions.skills[id] ?? id;
  if (type === 'place') return sim.areaName(id);
  return id;
}

export function memoryText(sim, m) {
  const kinds = sim.data.memory.kinds;
  let tpl;
  if (m.k.startsWith('summary.')) tpl = sim.data.memory.summaries[m.k.slice(8)];
  else tpl = kinds[m.k]?.text;
  if (!tpl) return m.k;
  const vars = { ...(m.x ?? {}) };
  const [type] = m.s.split(':');
  const name = subjectName(sim, m.s);
  if (type === 'person') vars.other = vars.other ?? name;
  if (type === 'activity') vars.activity = vars.activity ?? name;
  if (type === 'place') vars.place = vars.place ?? name;
  return fill(tpl, vars) + (m.n > 1 ? ` (${m.n}번)` : '');
}

/** A가 B를 어떻게 생각하는지 한 줄 */
export function thought(sim, a, b) {
  const rel = sim.rel(a.id, b.id);
  if (!rel.known) return '아직 모르는 사이';
  if (a.lover === b.id) {
    if (rel.affinity < 40) return '요즘 마음이 멀어진 것 같다';
    return '사랑한다';
  }
  const att = sim.memory.attitude(a, `person:${b.id}`, sim.now);
  if (att <= sim.data.memory.avoidAt) return '되도록 피하고 싶다';
  const af = rel.affinity;
  let base = af >= 70 ? '같이 있으면 정말 좋다' : af >= 40 ? '편한 친구다' : af >= 15 ? '괜찮은 사람 같다' : af > -10 ? '아직 잘 모르겠다' : af > -30 ? '조금 불편하다' : '껄끄럽다';
  if (a.focusPerson === b.id && a.lover !== b.id) base = '자꾸 생각난다';
  // 그 사람에 대한 가장 강한 기억
  const mem = [...a.memory.long, ...a.memory.short].filter((m) => m.s === `person:${b.id}`)
    .sort((x, y) => sim.memory.strength(a, y, sim.now) - sim.memory.strength(a, x, sim.now))[0];
  return mem ? `${base} — ${memoryText(sim, mem)}` : base;
}

export const STAGE_NAMES = { unknown: '모르는 사이', acquaintance: '아는 사이', friend: '친구', close: '친한 친구', awkward: '껄끄러운 사이', lover: '연인' };

export function extroName(x) {
  return x < 35 ? '소심' : x > 65 ? '외향' : '보통';
}

export function needColor(v) {
  return v < 25 ? '#c2453d' : v < 50 ? '#d39a2c' : '#4aa063';
}
