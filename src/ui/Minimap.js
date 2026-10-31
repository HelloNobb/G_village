import { DPR } from '../config.js';

// 우측 상단 실시간 미니맵. 지형은 한 번만 그려 두고, 주민·플레이어 점과 화면 범위만 매번 다시 그린다.
// 누르면 그 위치로 길찾기 이동. 집 안에 있는 주민은 집 위치에 흐린 점으로 표시.

const COLORS = {
  grass: '#8fcf7a', path: '#e6d3a3', plaza: '#d9d2c5', flowers: '#e7a0c4', sand: '#f1dfaa', sea: '#3aa0c8',
  tree: '#3f8f4f', wall: '#8a6f5a', floor: '#ead9bd', door: '#ead9bd', furniture: '#c4a27e', fountain: '#7cc4e8',
  house: '#8fcf7a', bench: '#b08a62',
};
const PX = 4; // 바탕 그림: 타일당 4px

export class Minimap {
  constructor(scene) {
    this.scene = scene;
    this.root = document.getElementById('minimap');
    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.timer = 0;
    const world = scene.world;
    this.world = world;
    this.base = this.drawBase();

    const collapsed = !!scene.save.data.settings.minimapCollapsed;
    this.root.classList.toggle('collapsed', collapsed);
    document.getElementById('minimap-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      const c = !this.root.classList.contains('collapsed');
      this.root.classList.toggle('collapsed', c);
      document.getElementById('minimap-toggle').textContent = c ? '🗺' : '−';
      scene.save.data.settings.minimapCollapsed = c;
      scene.save.save();
      this.resize();
    });
    document.getElementById('minimap-toggle').textContent = collapsed ? '🗺' : '−';
    this.canvas.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const tx = Math.floor(((e.clientX - r.left) / r.width) * world.W);
      const ty = Math.floor(((e.clientY - r.top) / r.height) * world.H);
      scene.onMinimapTap(tx, ty);
    });
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.canvas);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.canvas.width = Math.round(r.width * DPR);
    this.canvas.height = Math.round(r.height * DPR);
  }

  drawBase() {
    const w = this.world;
    const c = document.createElement('canvas');
    c.width = w.W * PX;
    c.height = w.H * PX;
    const g = c.getContext('2d');
    for (let y = 0; y < w.H; y++) {
      for (let x = 0; x < w.W; x++) {
        g.fillStyle = COLORS[w.nameOf[w.charAt(x, y)]] ?? '#8fcf7a';
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    const manifest = this.scene.cache.json.get('manifest');
    for (const b of w.buildings) {
      const spec = manifest[b.kind === 'house' ? `bld.${b.id}` : `roof.${b.id}`] ?? {};
      g.fillStyle = spec.roof ?? '#c96b4a';
      g.fillRect(b.x * PX, b.y * PX, b.w * PX, b.h * PX);
      g.strokeStyle = 'rgba(30,20,40,0.6)';
      g.lineWidth = 1.5;
      g.strokeRect(b.x * PX + 0.75, b.y * PX + 0.75, b.w * PX - 1.5, b.h * PX - 1.5);
    }
    return c;
  }

  update(dt, sky) {
    this.timer -= dt;
    if (this.timer > 0 || this.root.classList.contains('collapsed')) return;
    this.timer = 0.12;
    const { ctx, canvas, world: w, scene } = this;
    const CW = canvas.width, CH = canvas.height;
    if (!CW) return;
    const sx = CW / (w.W * w.T), sy = CH / (w.H * w.T);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.base, 0, 0, CW, CH);
    // 밤에는 어둡게
    if (sky && sky.strength > 0.02) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `#${sky.mult.toString(16).padStart(6, '0')}`;
      ctx.fillRect(0, 0, CW, CH);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 화면 범위
    const v = scene.cameras.main.worldView;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = DPR;
    ctx.strokeRect(v.x * sx, v.y * sy, v.width * sx, v.height * sy);

    const r = 3.2 * DPR;
    const dot = (x, y, color, alpha = 1, rad = r) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x * sx, y * sy, rad, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = DPR;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    // 집 안 주민 (흐리게, 겹치지 않게 조금씩 비켜서)
    const homeCount = {};
    for (const n of scene.npcs.values()) {
      if (!n.hiddenIn) continue;
      const h = w.houseById(n.hiddenIn);
      const k = (homeCount[h.id] = (homeCount[h.id] ?? 0) + 1) - 1;
      const c = w.center(h.x + h.w / 2, h.y + h.h / 2);
      dot(c.x - 16 + k * 22, c.y - 16, n.def.color, 0.45, r * 0.85);
    }
    for (const pet of scene.pets) if (pet.visible) dot(pet.x, pet.y, '#222', 1, r * 0.6);
    for (const n of scene.npcs.values()) if (!n.hiddenIn) dot(n.x, n.y, n.def.color);
    // 플레이어
    const p = scene.player;
    ctx.beginPath();
    ctx.arc(p.x * sx, p.y * sy, r * 1.25, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2 * DPR;
    ctx.strokeStyle = '#2d2a32';
    ctx.stroke();
  }
}
