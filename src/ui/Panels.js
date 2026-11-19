// 오른쪽 패널: 지금 마을 / 관계도 / 소식
import { kst } from '../sim/time.js';
import { thought, STAGE_NAMES, needColor } from './describe.js';
import { fullHTML } from './InfoCard.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const NEED_ORDER = ['hunger', 'energy', 'fun', 'achievement', 'social'];
const SVGNS = 'http://www.w3.org/2000/svg';

export class Panels {
  constructor(sim, { onSelect }) {
    this.sim = sim;
    this.onSelect = onSelect;
    this.tab = 'now';
    this.nowEl = document.getElementById('now-list');
    this.newsEl = document.getElementById('news-list');
    this.svg = document.getElementById('rel-graph');
    this.detail = document.getElementById('rel-detail');
    this.timer = 0;
    this.relTimer = 0;
    this.selPair = null;
    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => this.setTab(b.dataset.tab)));
    this.rows = new Map();
    this.expanded = new Set(); // 전체 정보를 펼친 주민
    for (const r of sim.list()) {
      const li = document.createElement('li');
      li.addEventListener('click', (e) => {
        if (e.target.closest('.full')) return; // 펼친 내용 안을 누를 땐 접지 않음
        if (this.expanded.has(r.id)) this.expanded.delete(r.id); else this.expanded.add(r.id);
        this.renderNow();
        onSelect(r.id, this.expanded.has(r.id));
      });
      this.nowEl.append(li);
      this.rows.set(r.id, li);
    }
    // 저장된 소식으로 채우기 (오래된 것부터 넣어서 최신이 위로)
    this.newsEl.innerHTML = '';
    [...sim.state.news].slice(0, 80).reverse().forEach((n) => this.addNews(n));
  }

  setTab(t) {
    this.tab = t;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    for (const id of ['now', 'rel', 'news']) document.getElementById(`tab-${id}`).classList.toggle('hidden', id !== t);
    if (t === 'rel') this.drawGraph();
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0.6; if (this.tab === 'now') this.renderNow(); }
    this.relTimer -= dt;
    if (this.tab === 'rel' && this.relTimer <= 0) { this.relTimer = 2; this.drawGraph(); }
  }

  renderNow() {
    const sim = this.sim;
    const icons = sim.needsCfg.mood.icons;
    for (const r of sim.list()) {
      const ex = sim.explain(r);
      const bars = NEED_ORDER.map((n) => `<span title="${sim.needsCfg.needs[n].name} ${Math.round(r.needs[n])}"><i style="width:${r.needs[n]}%;background:${needColor(r.needs[n])}"></i></span>`).join('');
      const traits = ex.by.map((t) => sim.traits.defs[t]?.icon ?? '').join('');
      const html = `<div class="top"><span class="caret">${this.expanded.has(r.id) ? '▾' : '▸'}</span><span class="dot" style="background:${r.color}"></span><span class="name">${esc(r.name)}</span><span class="lv">Lv.${r.lv}${r.lover ? ` · 💕${esc(sim.get(r.lover).name)}` : ''}</span><span class="moodi">${icons[sim.moodLevel(r)]}</span></div>
        <div class="what">${esc(ex.what)} <span class="why">· ${esc(ex.where ?? '')}</span></div>
        ${ex.why || traits ? `<div class="why">${esc(ex.why)} ${traits}</div>` : ''}
        <div class="minibars">${bars}</div>
        ${this.expanded.has(r.id) ? fullHTML(sim, r) : ''}`;
      const li = this.rows.get(r.id);
      li.classList.toggle('open', this.expanded.has(r.id));
      if (li.innerHTML !== html) li.innerHTML = html;
    }
  }

  addNews(n) {
    if (!n.text) return;
    const sim = this.sim;
    const t = kst(n.t);
    const li = document.createElement('li');
    if (n.importance >= 60) li.className = 'big';
    const tr = n.trait ? `<span class="tr">${esc(sim.traits.label(n.trait))}</span>` : '';
    const lines = n.lines ? n.lines.map((l) => `<span class="line">${esc(sim.get(l.s)?.name)}: “${esc(l.t)}”</span>`).join('') : '';
    li.innerHTML = `<span class="t">D${n.day} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}</span><span class="msg">${tr}${esc(n.text)}${lines}</span>`;
    this.newsEl.prepend(li);
    while (this.newsEl.children.length > 120) this.newsEl.lastElementChild.remove();
  }

  // ── 관계도 ──
  drawGraph() {
    const sim = this.sim;
    const list = sim.list();
    const W = 320, H = 300, cx = W / 2, cy = H / 2 + 6, R = 112;
    const pos = {};
    list.forEach((r, i) => {
      const a = -Math.PI / 2 + (i / list.length) * Math.PI * 2;
      pos[r.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    const svg = this.svg;
    svg.innerHTML = `<defs>${['g', 'n', 'b'].map((k) => `<marker id="ar-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${{ g: '#3f9b5a', n: '#9a93a3', b: '#c2453d' }[k]}"/></marker>`).join('')}</defs>`;
    for (const a of list) {
      for (const b of list) {
        if (a === b) continue;
        const rel = sim.rel(a.id, b.id);
        if (!rel.known) continue;
        const p = pos[a.id], q = pos[b.id];
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
        const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        const off = 6; // 방향별로 옆으로 비켜 그림
        const sx = p.x + ux * 24 + nx * off, sy = p.y + uy * 24 + ny * off;
        const ex = q.x - ux * 26 + nx * off, ey = q.y - uy * 26 + ny * off;
        const af = rel.affinity;
        const k = af >= 15 ? 'g' : af <= -15 ? 'b' : 'n';
        const color = { g: '#3f9b5a', n: '#9a93a3', b: '#c2453d' }[k];
        const width = 1.2 + (Math.abs(af) / 100) * 3.2;
        const line = document.createElementNS(SVGNS, 'line');
        Object.entries({ x1: sx, y1: sy, x2: ex, y2: ey, stroke: color, 'stroke-width': width, 'marker-end': `url(#ar-${k})`, class: 'edge', opacity: this.selPair && !this.selPair.includes(a.id) ? 0.25 : 0.9 }).forEach(([kk, v]) => line.setAttribute(kk, v));
        line.addEventListener('click', () => this.showPair(a.id, b.id));
        svg.append(line);
        if (a.lover === b.id && a.id < b.id) {
          const heart = document.createElementNS(SVGNS, 'text');
          heart.setAttribute('x', (p.x + q.x) / 2); heart.setAttribute('y', (p.y + q.y) / 2 + 5);
          heart.setAttribute('text-anchor', 'middle'); heart.textContent = '💕';
          svg.append(heart);
        }
      }
    }
    for (const r of list) {
      const g = document.createElementNS(SVGNS, 'g');
      g.setAttribute('class', 'node');
      g.innerHTML = `<circle cx="${pos[r.id].x}" cy="${pos[r.id].y}" r="21" fill="${r.color}"/><text x="${pos[r.id].x}" y="${pos[r.id].y + 5}" fill="#fff">${esc(r.name)}</text>`;
      g.addEventListener('click', () => this.showPerson(r.id));
      svg.append(g);
    }
    if (this.selPair?.length === 2) this.renderPair(...this.selPair);
  }

  showPerson(id) {
    this.selPair = [id];
    const sim = this.sim;
    const a = sim.get(id);
    const rows = sim.list().filter((b) => b !== a).map((b) => {
      const st = STAGE_NAMES[sim.stage(a.id, b.id)];
      const af = Math.round(sim.rel(a.id, b.id).affinity);
      return `<div class="pair"><b>${esc(a.name)} → ${esc(b.name)}</b> ${sim.rel(a.id, b.id).known ? `${af > 0 ? '+' : ''}${af}` : ''} · ${st}<br>“${esc(thought(sim, a, b))}”</div>`;
    }).join('');
    this.detail.innerHTML = rows;
    this.drawGraph();
  }

  showPair(a, b) {
    this.selPair = [a, b];
    this.renderPair(a, b);
    this.drawGraph();
  }

  renderPair(aId, bId) {
    const sim = this.sim;
    const a = sim.get(aId), b = sim.get(bId);
    const one = (x, y) => {
      const rel = sim.rel(x.id, y.id);
      const af = Math.round(rel.affinity);
      return `<div class="pair"><b>${esc(x.name)} → ${esc(y.name)}</b> 호감도 ${af > 0 ? '+' : ''}${af} · 친밀도 ${Math.round(rel.closeness)} · ${STAGE_NAMES[sim.stage(x.id, y.id)]}<br>“${esc(thought(sim, x, y))}”</div>`;
    };
    this.detail.innerHTML = one(a, b) + one(b, a);
  }
}
