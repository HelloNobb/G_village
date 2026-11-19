// 주민 정보 카드 — PC: 마우스를 올리면 / 휴대폰: 누르면(고정, ✕로 닫기)
import { memoryText, subjectName, extroName, needColor } from './describe.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NEED_ORDER = ['hunger', 'energy', 'fun', 'achievement', 'social'];
const ABIL = { work: '업무', stamina: '체력', craft: '손재주', learning: '학습력', charm: '말솜씨' };

export class InfoCard {
  constructor(sim) {
    this.sim = sim;
    this.el = document.getElementById('card');
    this.id = null;
    this.pinned = false;
    this.timer = 0;
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target.closest('.close')) this.hide(true);
    });
  }

  show(id, { x, y, pinned = false } = {}) {
    if (this.pinned && !pinned && this.id !== id) return; // 고정된 카드가 우선
    this.id = id;
    this.pinned = pinned || (this.pinned && this.id === id);
    this.el.classList.toggle('pinned', this.pinned);
    this.el.classList.remove('hidden');
    this.render();
    if (x != null) this.place(x, y);
  }

  place(x, y) {
    const frame = this.el.parentElement.getBoundingClientRect();
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let left = x + 18, top = y - h / 2;
    if (left + w > frame.width - 8) left = x - w - 18;
    left = Math.max(8, Math.min(frame.width - w - 8, left));
    top = Math.max(8, Math.min(frame.height - h - 8, top));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide(force = false) {
    if (this.pinned && !force) return;
    this.pinned = false;
    this.id = null;
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
    const sim = this.sim;
    const r = sim.get(this.id);
    if (!r) return;
    const T = sim.traits;
    const ex = sim.explain(r);
    const lvl = sim.moodLevel(r);
    const moodCfg = sim.needsCfg.mood;
    const econ = sim.needsCfg.economy;
    const now = sim.now;
    const traitChip = (id) => `<span class="chip trait" title="${esc(T.defs[id]?.desc ?? '')}">${esc(T.label(id))}</span>`;
    const lover = r.lover ? ` · 💕 ${esc(sim.get(r.lover).name)}` : '';
    const focus = r.focusPerson && r.focusPerson !== r.lover ? ` · 💘 몰두: ${esc(sim.get(r.focusPerson).name)}` : '';
    const nextXp = econ.levelXp[r.lv] ?? null;

    const bars = NEED_ORDER.map((n) => {
      const def = sim.needsCfg.needs[n];
      const v = r.needs[n];
      return `<span>${def.icon} ${def.name}</span><span class="bar"><i style="width:${v}%;background:${needColor(v)}"></i></span><span class="num">${Math.round(v)}</span>`;
    }).join('');

    const moodlets = [...r.moodlets].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 5)
      .map((m) => `<li class="${m.value >= 0 ? 'pos' : 'neg'}">${m.value >= 0 ? '+' : ''}${Math.round(m.value)} ${esc(m.label)}${m.by ? ` <span class="chip trait">${esc(T.label(m.by))}</span>` : ''}</li>`).join('');
    const lowNeeds = NEED_ORDER.filter((n) => r.needs[n] < 40).map((n) => `<li class="neg">${esc(sim.needsCfg.needs[n].name)}이(가) 부족함</li>`).join('');

    const mems = [...r.memory.short.filter((m) => !m.merged), ...r.memory.long].sort((a, b) => b.t - a.t).slice(0, 3)
      .map((m) => `<li class="${m.v >= 0 ? 'pos' : 'neg'}">${esc(memoryText(sim, m))}</li>`).join('');
    const atts = sim.memory.attitudes(r, now);
    const likes = atts.filter((a) => a.a >= 15).slice(0, 3).map((a) => esc(subjectName(sim, a.s))).join(', ') || '—';
    const avoids = atts.filter((a) => a.a <= -15).reverse().slice(0, 3).map((a) => `${esc(subjectName(sim, a.s))}${a.a <= sim.data.memory.avoidAt ? '(피함)' : ''}`).join(', ') || '—';

    const skills = Object.entries(r.skills).map(([k, v]) => `${sim.data.actions.skills[k]} ${v.toFixed(1)}`).join(' · ');
    const abil = Object.entries(r.abilities).map(([k, v]) => `${ABIL[k]} ${'★'.repeat(v)}${'☆'.repeat(5 - v)}`).join('<br>');

    this.el.innerHTML = `
      <button class="close" aria-label="닫기">✕</button>
      <h3><span class="dot" style="background:${r.color}"></span>${esc(r.name)} <span style="font-size:12px;color:#6f6878">Lv.${r.lv}</span>
        <span class="mood ${lvl}">${moodCfg.icons[lvl]} ${moodCfg.names[lvl]} ${Math.round(r.mood)}</span></h3>
      <div class="sub">${esc(sim.needsCfg.chronotypes[r.chrono].name)} · ${extroName(r.extro)}(${r.extro})${lover}${focus}</div>
      <div class="chips">${r.traits.map(traitChip).join('')}</div>
      <div class="doing"><div>${esc(ex.what)} <span style="color:#6f6878">· ${esc(ex.where ?? '')}</span>${ex.date ? ' 💕' : ''}</div>
        ${ex.why ? `<div class="why">이유: ${esc(ex.why)}</div>` : ''}
        ${ex.by.length ? `<div class="chips">${ex.by.map(traitChip).join('')}</div>` : ''}</div>
      <div class="bars">${bars}</div>
      <h4>기분이 이런 이유</h4><ul>${moodlets}${lowNeeds}${moodlets || lowNeeds ? '' : '<li>특별한 일 없음</li>'}</ul>
      <h4>생활</h4>
      <div>💰 ${Math.floor(r.money)} · 🧺 식료품 ${r.groceries} · 💼 Lv.${r.lv}${nextXp ? ` (${r.xp.toFixed(1)}/${nextXp})` : ' (최고)'}</div>
      <div style="color:#6f6878">${skills}</div>
      <h4>최근 기억</h4><ul>${mems || '<li>아직 없음</li>'}</ul>
      <div><span class="pos">좋아함</span> ${likes}</div>
      <div><span class="neg">꺼림</span> ${avoids}</div>
      <h4>타고난 능력</h4><div style="font-size:12px">${abil}</div>`;
  }
}
