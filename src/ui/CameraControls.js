// 카메라: 기본은 맵 전체가 보이게 고정. 휴대폰은 두 손가락으로 확대·이동, PC는 휠 확대 + 드래그 이동.
// 마우스를 주민 위에 올리면 onHover, 누르면(탭) onTap.
import { DPR } from '../config.js';

const MAX_ZOOM = 3.5;

export class CameraControls {
  constructor(scene, { worldW, worldH, onHover, onTap }) {
    this.scene = scene;
    this.cam = scene.cameras.main;
    this.worldW = worldW;
    this.worldH = worldH;
    this.user = 1; // 맵 전체 보기 대비 확대 배율
    this.center = { x: worldW / 2, y: worldH / 2 };
    this.el = document.getElementById('game');
    this.resetBtn = document.getElementById('zoom-reset');
    this.resetBtn.addEventListener('click', () => this.reset());
    this.pointers = new Map();
    this.onHover = onHover;
    this.onTap = onTap;

    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 2) this.startPinch();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.onHover(this.world(e), this.local(e)); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) this.movePinch();
      else if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6 && this.user > 1.01) this.pan(dx, dy);
      if (e.pointerType === 'mouse') this.onHover(this.world(e), this.local(e));
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (p && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 10 && performance.now() - p.t < 500 && !this.wasPinching) this.onTap(this.world(e), this.local(e), e.pointerType);
      if (!this.pointers.size) this.wasPinching = false;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.onHover(null); });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = this.world(e);
      this.setZoom(this.user * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      const after = this.world(e);
      this.center.x += before.x - after.x;
      this.center.y += before.y - after.y;
      this.apply();
    }, { passive: false });
    scene.scale.on('resize', () => this.apply());
    this.apply();
  }

  local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  world(e) {
    const l = this.local(e);
    return this.cam.getWorldPoint(l.x * DPR, l.y * DPR);
  }

  fitZoom() {
    const w = this.scene.scale.width, h = this.scene.scale.height;
    return Math.min(w / this.worldW, h / this.worldH);
  }

  setZoom(z) {
    this.user = Math.max(1, Math.min(MAX_ZOOM, z));
    this.resetBtn.classList.toggle('hidden', this.user <= 1.01);
  }

  reset() {
    this.setZoom(1);
    this.center = { x: this.worldW / 2, y: this.worldH / 2 };
    this.apply();
  }

  pan(dxCss, dyCss) {
    const z = this.cam.zoom / DPR;
    this.center.x -= dxCss / z;
    this.center.y -= dyCss / z;
    this.apply();
  }

  startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.user, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    this.wasPinching = true;
  }

  movePinch() {
    if (!this.pinch) return;
    const [a, b] = [...this.pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    this.setZoom(this.pinch.z * (d / this.pinch.d));
    this.pan(mx - this.pinch.mx, my - this.pinch.my);
    this.pinch.mx = mx; this.pinch.my = my;
  }

  apply() {
    const cam = this.cam;
    cam.setZoom(this.fitZoom() * this.user);
    // 화면에 보이는 범위가 맵 밖으로 너무 나가지 않게
    const vw = this.scene.scale.width / cam.zoom, vh = this.scene.scale.height / cam.zoom;
    const clampAxis = (c, view, total) => (view >= total ? total / 2 : Math.max(view / 2, Math.min(total - view / 2, c)));
    this.center.x = clampAxis(this.center.x, vw, this.worldW);
    this.center.y = clampAxis(this.center.y, vh, this.worldH);
    cam.centerOn(this.center.x, this.center.y);
  }
}
