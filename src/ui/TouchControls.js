// 화면 드래그 = 가상 조이스틱, 짧게 탭 = 그 위치로 이동/주민 탭하면 말걸기.

const DRAG_START = 12;
const RADIUS = 46;

export class TouchControls {
  /**
   * @param {Phaser.Scene} scene
   * @param {(worldX:number, worldY:number)=>void} onTap
   */
  constructor(scene, onTap) {
    this.scene = scene;
    this.onTap = onTap;
    this.vec = { x: 0, y: 0 };
    this.active = null;
    this.joy = document.getElementById('joystick');
    this.knob = document.getElementById('joystick-knob');
    const input = scene.input;
    input.addPointer(2);
    input.on('pointerdown', (p) => {
      if (this.active) return;
      this.active = { id: p.id, sx: p.x, sy: p.y, t: performance.now(), drag: false };
    });
    input.on('pointermove', (p) => {
      const a = this.active;
      if (!a || a.id !== p.id || !p.isDown) return;
      const dx = p.x - a.sx, dy = p.y - a.sy;
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
      if (!a.drag && performance.now() - a.t < 350) {
        const wp = scene.cameras.main.getWorldPoint(p.x, p.y);
        this.onTap(wp.x, wp.y);
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
