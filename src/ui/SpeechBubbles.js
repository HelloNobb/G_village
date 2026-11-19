// 주민 머리 위 말풍선·특성 태그 (Phaser Text). 화면을 축소해도 읽을 수 있게 확대율의 반대로 크기를 맞춤.
import { DEPTH } from '../map/MapBuilder.js';
import { DPR } from '../config.js';

const FONT = "'Gowun Dodum','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

export class SpeechBubbles {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.queue = [];
  }

  /** @param {{x:number,y:number,top:number,visible:boolean}} target */
  show(target, text, seconds = 3.2, delay = 0) {
    if (delay > 0) { this.queue.push({ target, text, seconds, at: performance.now() + delay * 1000 }); return; }
    this.items = this.items.filter((it) => { if (it.target === target && !it.tag) { it.obj.destroy(); return false; } return true; });
    const obj = this.scene.add.text(0, 0, text, {
      fontFamily: FONT, fontSize: '14px', color: '#2d2a32', backgroundColor: 'rgba(255,250,240,0.96)',
      padding: { x: 7, y: 4 }, wordWrap: { width: 190, useAdvancedWrap: true }, align: 'center', resolution: DPR * 3,
    }).setOrigin(0.5, 1).setDepth(DEPTH.bubble);
    this.items.push({ target, obj, life: seconds, total: seconds });
  }

  tag(target, text, color = '#b0407e') {
    const obj = this.scene.add.text(0, 0, text, {
      fontFamily: FONT, fontSize: '12px', color: '#fff', backgroundColor: color, padding: { x: 5, y: 2 }, resolution: DPR * 3,
    }).setOrigin(0.5, 1).setDepth(DEPTH.bubble + 1);
    this.items.push({ target, obj, life: 1.8, total: 1.8, tag: true });
  }

  update(dt) {
    const now = performance.now();
    if (this.queue.length) {
      const due = this.queue.filter((q) => q.at <= now);
      this.queue = this.queue.filter((q) => q.at > now);
      for (const q of due) this.show(q.target, q.text, q.seconds);
    }
    const cam = this.scene.cameras.main;
    const k = Math.min(2.2, Math.max(0.8, (DPR * 1.0) / cam.zoom)); // 화면에서 비슷한 크기로
    for (const it of this.items) {
      it.life -= dt;
      const t = it.target;
      const rise = it.tag ? (1 - it.life / it.total) * 18 : 0;
      it.obj.setScale(k);
      it.obj.setPosition(Math.round(t.x), Math.round(t.top - 6 * k - rise - (it.tag ? 18 * k : 0)));
      it.obj.setVisible(t.visible);
      const fadeIn = Math.min(1, (it.total - it.life) / 0.15);
      const fadeOut = Math.min(1, it.life / 0.35);
      it.obj.setAlpha(Math.max(0, Math.min(fadeIn, fadeOut)));
    }
    this.items = this.items.filter((it) => { if (it.life <= 0) { it.obj.destroy(); return false; } return true; });
    // 겹치는 말풍선은 위로 쌓기
    const shown = this.items.filter((it) => it.obj.visible).sort((a, b) => b.obj.y - a.obj.y);
    for (let i = 0; i < shown.length; i++) {
      const a = shown[i].obj;
      for (let j = 0; j < i; j++) {
        const b = shown[j].obj;
        const overlapX = Math.abs(a.x - b.x) < (a.displayWidth + b.displayWidth) / 2;
        const overlapY = a.y > b.y - b.displayHeight - 2 && a.y - a.displayHeight < b.y;
        if (overlapX && overlapY) a.y = b.y - b.displayHeight - 3;
      }
    }
  }
}
