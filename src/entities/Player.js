import { dirFromVector } from '../art/AnimRegistry.js';

const SPEED = 300; // px/s (예전 150의 2배)

export class Player {
  /** @param {number} scale 그림 해상도 보정 (고해상도 텍스처 → 월드 크기) */
  constructor(scene, x, y, scale = 1) {
    this.scene = scene;
    this.key = 'player';
    this.sprite = scene.physics.add.sprite(x, y, 'player', 0).setOrigin(0.5, 0.92).setScale(scale);
    // 몸통 충돌 상자(발밑 16×10 월드px). 크기는 텍스처 px 단위로 지정
    const bw = 16 / scale, bh = 10 / scale;
    this.sprite.body.setSize(bw, bh).setOffset((this.sprite.width - bw) / 2, this.sprite.height * 0.92 - bh);
    this.sprite.setCollideWorldBounds(true);
    this.facing = 'down';
    this.path = null; // 탭 이동 경로 (픽셀 좌표 배열)
    this.onArrive = null;
    this.frozen = false;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setPath(points, onArrive) {
    this.path = points && points.length ? points : null;
    this.onArrive = onArrive ?? null;
    if (!this.path && onArrive) onArrive();
  }

  /** @param {{x:number,y:number}} input -1..1 */
  update(input) {
    const body = this.sprite.body;
    let vx = 0, vy = 0;
    if (this.frozen) {
      body.setVelocity(0, 0);
    } else if (input.x || input.y) {
      this.path = null;
      this.onArrive = null;
      const len = Math.hypot(input.x, input.y);
      const mag = Math.min(1, len);
      vx = (input.x / len) * SPEED * mag;
      vy = (input.y / len) * SPEED * mag;
    } else if (this.path) {
      const p = this.path[0];
      const dx = p.x - this.sprite.x, dy = p.y - this.sprite.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        vx = (dx / d) * SPEED;
        vy = (dy / d) * SPEED;
      }
    }
    body.setVelocity(vx, vy);
    const moving = Math.hypot(vx, vy) > 5;
    if (moving) this.facing = dirFromVector(vx, vy, this.facing);
    this.sprite.anims.play(`${this.key}.${moving ? 'walk' : 'idle'}.${this.facing}`, true);
    this.sprite.setDepth(this.sprite.y);
    // 탭 이동 중 벽에 막혀 멈추면 포기
    if (this.path && body.blocked && (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down)) {
      this._stuck = (this._stuck ?? 0) + 1;
      if (this._stuck > 30) { this.path = null; this._stuck = 0; }
    } else this._stuck = 0;
  }

  face(dir) {
    this.facing = dir;
  }
}
