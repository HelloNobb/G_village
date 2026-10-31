// 상단 하늘 띠 + 날짜/시간 + 현재 장소
import { DPR } from '../config.js';

export class Hud {
  constructor() {
    this.canvas = document.getElementById('sky');
    this.ctx = this.canvas.getContext('2d');
    this.dateEl = document.getElementById('clock-date');
    this.timeEl = document.getElementById('clock-time');
    this.placeEl = document.getElementById('place-label');
    this.lastDraw = 0;
  }

  update(clockLabel, sky, placeName, starSeed = 7) {
    if (this.dateEl.textContent !== clockLabel.date) this.dateEl.textContent = clockLabel.date;
    if (this.timeEl.textContent !== clockLabel.time) this.timeEl.textContent = clockLabel.time;
    if (this.placeEl.textContent !== placeName) this.placeEl.textContent = placeName;
    const now = performance.now();
    if (now - this.lastDraw < 500) return;
    this.lastDraw = now;
    const c = this.canvas, ctx = this.ctx;
    const r = c.getBoundingClientRect();
    if (r.width && c.width !== Math.round(r.width * DPR)) {
      c.width = Math.round(r.width * DPR);
      c.height = Math.round(r.height * DPR);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const W = c.width / DPR, H = c.height / DPR;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.skyTop);
    g.addColorStop(1, sky.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (sky.lights > 0.3) {
      let s = starSeed;
      ctx.fillStyle = `rgba(255,255,255,${0.7 * sky.lights})`;
      for (let i = 0; i < 18; i++) {
        s = (s * 9301 + 49297) % 233280;
        const x = (s / 233280) * W;
        s = (s * 9301 + 49297) % 233280;
        const y = (s / 233280) * H * 0.8;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
    const { kind, pos } = sky.celestial;
    const x = 18 + pos * (W - 36);
    const y = H * 0.75 - Math.sin(pos * Math.PI) * H * 0.5;
    ctx.beginPath();
    if (kind === 'sun') {
      ctx.fillStyle = '#ffe28a';
      ctx.shadowColor = '#ffcf5a';
      ctx.shadowBlur = 12;
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#f4f1d0';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 8;
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = sky.skyTop;
      ctx.beginPath();
      ctx.arc(x + 3, y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}
