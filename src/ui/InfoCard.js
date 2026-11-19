// 주민 정보
// - 맵 위 작은 카드(반투명): PC는 마우스를 올리면, 휴대폰은 누르면. 지금 상태의 핵심만.
// - 전체 정보: 오른쪽 "지금 마을"에서 이름을 누르면 펼쳐짐 (fullHTML)
import { memoryText, subjectName, extroName, needColor } from './describe.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NEED_ORDER = ['hunger', 'energy', 'fun', 'achievement', 'social'];
const ABIL = { work: '업무', stamina: '체력', craft: '손재주', learning: '학습력', charm: '말솜씨' };

function traitChip(sim, id) {
  return `<span class="chip trait" title="${esc(sim.traits.defs[id]?.desc ?? '')}">${esc(sim.traits.label(id))}</span>`;
}

function bars(sim, r) {
  return NEED_ORDER.map((n) => {
    const def = sim.needsCfg.needs[n];
    const v = r.needs[n];
    return `<span>${def.icon} ${def.name}</span><span class="bar"><i style="width:${v}%;background:${needColor(v)}"></i></span><span class="num">${Math.round(v)}</span>`;
  }).join('');
}

/** 맵 위 작은 카드: 이름·기분·지금 하는 일과 이유·부족한 욕구·가장 큰 기분 원인 */
export function miniHTML(sim, r) {
  const ex = sim.explain(r);
  const lvl = sim.moodLevel(r);
  const icons = sim.needsCfg.mood.icons;
  const low = NEED_ORDER.filter((n) => r.needs[n] < 35).map((n) => `${sim.needsCfg.needs[n].icon}${Math.round(r.needs[n])}`).join(' ');
  const top = [...r.moodlets].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const where = r.hidden ? `${sim.areaName(`home:${r.hidden}`)} 안` : ex.where;
  return `<div class="m-top"><span class="dot" style="background:${r.color}"></span><b>${esc(r.name)}</b> <span class="m-lv">Lv.${r.lv}</span><span class="m-mood">${icons[lvl]}</span></div>
    <div class="m-what">${esc(ex.what)} <span class="m-sub">· ${esc(where ?? '')}</span>${ex.date ? ' 💕' : ''}</div>
    ${ex.why ? `<div class="m-sub">${esc(ex.why)}</div>` : ''}
    ${ex.by.length ? `<div class="m-sub">${ex.by.map((t) => esc(sim.traits.label(t))).join(' ')}</div>` : ''}
    ${low ? `<div class="m-low">부족: ${low}</div>` : ''}
    ${top ? `<div class="m-sub ${top.value >= 0 ? 'pos' : 'neg'}">${top.value >= 0 ? '+' : ''}${Math.round(top.value)} ${esc(top.label)}</div>` : ''}`;
}

/** 사이드바에 펼쳐지는 전체 정보 */
export function fullHTML(sim, r) {
  const ex = sim.explain(r);
  const lvl = sim.moodLevel(r);
  const moodCfg = sim.needsCfg.mood;
  const econ = sim.needsCfg.economy;
  const now = sim.now;
  const T = sim.traits;
  const lover = r.lover ? ` · 💕 ${esc(sim.get(r.lover).name)}` : '';
  const focus = r.focusPerson && r.focusPerson !== r.lover ? ` · 💘 ${esc(sim.get(r.focusPerson).name)}` : '';
  const pet = r.pet ? ` · 🐈‍⬛ ${esc(r.pet.name)}` : '';
  const nextXp = econ.levelXp[r.lv] ?? null;
  const moodlets = [...r.moodlets].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 5)
    .map((m) => `<li class="${m.value >= 0 ? 'pos' : 'neg'}">${m.value >= 0 ? '+' : ''}${Math.round(m.value)} ${esc(m.label)}${m.by ? ` ${esc(T.label(m.by))}` : ''}</li>`).join('');
  const lowNeeds = NEED_ORDER.filter((n) => r.needs[n] < 40).map((n) => `<li class="neg">${esc(sim.needsCfg.needs[n].name)} 부족</li>`).join('');
  const mems = [...r.memory.short.filter((m) => !m.merged), ...r.memory.long].sort((a, b) => b.t - a.t).slice(0, 3)
    .map((m) => `<li class="${m.v >= 0 ? 'pos' : 'neg'}">${esc(memoryText(sim, m))}</li>`).join('');
  const atts = sim.memory.attitudes(r, now);
  const likes = atts.filter((a) => a.a >= 15).slice(0, 3).map((a) => esc(subjectName(sim, a.s))).join(', ') || '—';
  const avoids = atts.filter((a) => a.a <= -15).reverse().slice(0, 3).map((a) => `${esc(subjectName(sim, a.s))}${a.a <= sim.data.memory.avoidAt ? '(피함)' : ''}`).join(', ') || '—';
  const skills = Object.entries(r.skills).map(([k, v]) => `${sim.data.actions.skills[k]} ${v.toFixed(1)}`).join(' · ');
  const abil = Object.entries(r.abilities).map(([k, v]) => `${ABIL[k]} ${'★'.repeat(v)}${'☆'.repeat(5 - v)}`).join(' · ');
  return `<div class="full">
    <div class="sub">${esc(sim.needsCfg.chronotypes[r.chrono].name)} · ${extroName(r.extro)}(${r.extro})${lover}${focus}${pet} · 기분 ${moodCfg.names[lvl]} ${Math.round(r.mood)}</div>
    <div class="chips">${r.traits.map((t) => traitChip(sim, t)).join('')}</div>
    <div class="doing">${esc(ex.what)} <span class="why">· ${esc(r.hidden ? '집 안' : ex.where ?? '')}</span>
      ${ex.why ? `<div class="why">이유: ${esc(ex.why)}</div>` : ''}
      ${ex.by.length ? `<div class="chips">${ex.by.map((t) => traitChip(sim, t)).join('')}</div>` : ''}</div>
    <div class="bars">${bars(sim, r)}</div>
    <h4>기분이 이런 이유</h4><ul>${moodlets}${lowNeeds}${moodlets || lowNeeds ? '' : '<li>특별한 일 없음</li>'}</ul>
    <h4>생활</h4>
    <div>💰 ${Math.floor(r.money)} · 🧺 식료품 ${r.groceries} · 💼 Lv.${r.lv}${nextXp ? ` (${r.xp.toFixed(1)}/${nextXp})` : ' (최고)'}</div>
    <div class="why">${skills}</div>
    <h4>최근 기억</h4><ul>${mems || '<li>아직 없음</li>'}</ul>
    <div><span class="pos">좋아함</span> ${likes} · <span class="neg">꺼림</span> ${avoids}</div>
    <h4>타고난 능력</h4><div class="why">${abil}</div>
  </div>`;
}

export class InfoCard {
  constructor(sim) {
    this.sim = sim;
    this.el = document.getElementById('card');
    this.id = null;
    this.pet = null;
    this.pinned = false;
    this.timer = 0;
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target.closest('.close')) this.hide(true);
    });
  }

  show(id, { x, y, pinned = false } = {}) {
    if (this.pinned && !pinned && this.id !== id) return;
    this.id = id;
    this.pet = null;
    this.pinned = pinned || (this.pinned && this.id === id);
    this.el.classList.toggle('pinned', this.pinned);
    this.el.classList.remove('hidden');
    this.render();
    if (x != null) this.place(x, y);
  }

  showPet(view, owner, { x, y, pinned = false } = {}) {
    if (this.pinned && !pinned) return;
    this.id = null;
    this.pet = owner.id;
    this.pinned = pinned;
    this.el.classList.toggle('pinned', pinned);
    this.el.classList.remove('hidden');
    const p = owner.pet;
    this.el.innerHTML = `<button class="close" aria-label="닫기">✕</button>
      <div class="m-top">🐈‍⬛ <b>${esc(p.name)}</b></div><div class="m-sub">${esc(p.desc ?? `${owner.name}의 반려동물`)}</div>
      <div class="m-what">${esc(owner.name)}와 산책 중</div>`;
    this.place(x, y);
  }

  place(x, y) {
    const frame = this.el.parentElement.getBoundingClientRect();
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let left = x + 16, top = y - h - 10;
    if (left + w > frame.width - 6) left = x - w - 16;
    if (top < 6) top = y + 16;
    this.el.style.left = `${Math.max(6, Math.min(frame.width - w - 6, left))}px`;
    this.el.style.top = `${Math.max(6, Math.min(frame.height - h - 6, top))}px`;
  }

  hide(force = false) {
    if (this.pinned && !force) return;
    this.pinned = false;
    this.id = null;
    this.pet = null;
    this.el.classList.add('hidden');
  }

  update(dt) {
    if (!this.id) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    this.render();
  }

  render() {
    const r = this.sim.get(this.id);
    if (!r) return;
    this.el.innerHTML = `<button class="close" aria-label="닫기">✕</button>${miniHTML(this.sim, r)}`;
  }
}
