// 게임 화면 왼쪽 위 하늘 띠 (해/달 위치, 하늘색)
import { DPR } from '../config.js';

export class Hud {
  constructor() {
    this.canvas = document.getElementById('sky');
    this.ctx = this.canvas.getContext('2d');
    this.last = 0;
  }

  update(sky) {
    const now = performance.now();
    if (now - this.last < 500 || !sky) return;
    this.last = now;
    const c = this.canvas, ctx = this.ctx;
    const r = c.getBoundingClientRect();
    if (r.width && c.width !== Math.round(r.width * DPR)) { c.width = Math.round(r.width * DPR); c.height = Math.round(r.height * DPR); }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const W = c.width / DPR, H = c.height / DPR;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.skyTop); g.addColorStop(1, sky.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (sky.lights > 0.3) {
      let s = 7;
      ctx.fillStyle = `rgba(255,255,255,${0.7 * sky.lights})`;
      for (let i = 0; i < 14; i++) { s = (s * 9301 + 49297) % 233280; const x = (s / 233280) * W; s = (s * 9301 + 49297) % 233280; ctx.fillRect(x, (s / 233280) * H * 0.8, 1.4, 1.4); }
    }
    const { kind, pos } = sky.celestial;
    const x = 12 + pos * (W - 24), y = H * 0.78 - Math.sin(pos * Math.PI) * H * 0.5;
    ctx.beginPath();
    ctx.fillStyle = kind === 'sun' ? '#ffe28a' : '#f4f1d0';
    ctx.shadowColor = kind === 'sun' ? '#ffcf5a' : '#fff';
    ctx.shadowBlur = 10;
    ctx.arc(x, y, kind === 'sun' ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (kind === 'moon') { ctx.fillStyle = sky.skyTop; ctx.beginPath(); ctx.arc(x + 2.5, y - 2, 4.2, 0, Math.PI * 2); ctx.fill(); }
  }
}
