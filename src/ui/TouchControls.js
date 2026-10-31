import { DPR } from '../config.js';

// 화면 드래그 = 가상 조이스틱 / 짧게 탭 = 그 위치로 이동(주민을 탭하면 말걸기) / 두 번 탭 = 상호작용
// 포인터 좌표는 게임 픽셀(= CSS px × DPR) 이라서 화면 표시용은 DPR로 나눈다.

const DRAG_START = 16; // CSS px
const RADIUS = 46;
const TAP_MS = 450;
const DOUBLE_MS = 350;
const DOUBLE_DIST = 44;

export class TouchControls {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ onTap:(wx:number, wy:number)=>void, onDoubleTap:()=>void }} handlers
   */
  constructor(scene, { onTap, onDoubleTap }) {
    this.scene = scene;
    this.vec = { x: 0, y: 0 };
    this.active = null;
    this.lastTap = null;
    this.joy = document.getElementById('joystick');
    this.knob = document.getElementById('joystick-knob');
    const input = scene.input;
    input.addPointer(2);

    input.on('pointerdown', (p) => {
      if (this.active) return;
      this.active = { id: p.id, sx: p.x / DPR, sy: p.y / DPR, t: performance.now(), drag: false };
    });
    input.on('pointermove', (p) => {
      const a = this.active;
      if (!a || a.id !== p.id || !p.isDown) return;
      const dx = p.x / DPR - a.sx, dy = p.y / DPR - a.sy;
      if (!a.drag && Math.hypot(dx, dy) > DRAG_START) {
        a.drag = true;
        this.joy.style.left = `${a.sx}px`;
        this.joy.style.top = `${a.sy}px`;
        this.joy.classList.remove('hidden');
      }
      if (a.drag) {
        const d = Math.hypot(dx, dy);
        const k = d > RADIUS ? RADIUS / d : 1;
        this.vec = { x: (dx * k) / RADIUS, y: (dy * k) / RADIUS };
        this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      }
    });
    const end = (p) => {
      const a = this.active;
      if (!a || a.id !== p.id) return;
      const now = performance.now();
      if (!a.drag && now - a.t < TAP_MS) {
        const last = this.lastTap;
        if (last && now - last.t < DOUBLE_MS && Math.hypot(a.sx - last.x, a.sy - last.y) < DOUBLE_DIST) {
          // 두 번 탭: 첫 탭의 이동은 취소하고 상호작용
          clearTimeout(last.timer);
          this.lastTap = null;
          onDoubleTap();
        } else {
          // 한 번 탭: 두 번째 탭이 올 수 있으니 잠깐 기다렸다가 이동
          const wp = scene.cameras.main.getWorldPoint(p.x, p.y);
          const tap = { t: now, x: a.sx, y: a.sy };
          tap.timer = setTimeout(() => {
            if (this.lastTap === tap) this.lastTap = null;
            onTap(wp.x, wp.y);
          }, DOUBLE_MS);
          this.lastTap = tap;
        }
      }
      this.active = null;
      this.vec = { x: 0, y: 0 };
      this.joy.classList.add('hidden');
      this.knob.style.transform = '';
    };
    input.on('pointerup', end);
    input.on('pointerupoutside', end);
  }
}
