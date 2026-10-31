import { dirFromVector } from '../art/AnimRegistry.js';

// 까망이: 주인이 특정 활동(walk_cat)일 때만 밖에 나와서 졸졸 따라다닌다.
export class Pet {
  constructor(scene, def, owner, scale = 1) {
    this.scene = scene;
    this.id = def.id;
    this.def = def;
    this.owner = owner;
    this.key = def.sprite;
    this.sprite = scene.add.sprite(owner.x, owner.y, this.key, 0).setOrigin(0.5, 0.9).setScale(scale).setVisible(false);
    this.facing = 'down';
    this.trail = [];
    this.paused = false;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get visible() { return this.sprite.visible; }
  get place() { return this.owner.place; }
  get activity() { return this.owner.activity; }
  get moving() { return false; }

  update(dt) {
    const out = this.owner.visible && this.def.outWhen.includes(this.owner.activity);
    if (!out) {
      this.sprite.setVisible(false);
      this.trail = [];
      return;
    }
    if (!this.sprite.visible) {
      this.sprite.setVisible(true);
      this.sprite.setPosition(this.owner.x + 14, this.owner.y);
    }
    // 주인이 지나간 자리를 조금 늦게 따라감
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - this.owner.x, last.y - this.owner.y) > 6) this.trail.push({ x: this.owner.x, y: this.owner.y });
    if (this.trail.length > 60) this.trail.shift();
    let moving = false;
    if (!this.paused && this.trail.length > 5) {
      const p = this.trail[0];
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.min(d, this.owner.speed * 1.05 * dt);
      if (d > 1) {
        this.sprite.setPosition(this.x + (dx / d) * sp, this.y + (dy / d) * sp);
        this.facing = dirFromVector(dx, dy, this.facing);
        moving = true;
      }
      if (d < 3) this.trail.shift();
    }
    this.sprite.anims.play(`${this.key}.${moving ? 'walk' : 'idle'}.${this.facing}`, true);
    this.sprite.setDepth(this.y);
  }

  faceTowards(x, y) {
    this.facing = dirFromVector(x - this.x, y - this.y, this.facing);
  }
}
