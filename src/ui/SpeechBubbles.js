import { DEPTH } from '../map/MapBuilder.js';
import { DPR } from '../config.js';

// 주민 머리 위 말풍선 (Phaser Text). 멀리 있으면 "…"로 줄여서 보여준다.
const FONT = "'Gowun Dodum','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

export class SpeechBubbles {
  constructor(scene, getPlayer) {
    this.scene = scene;
    this.getPlayer = getPlayer;
    this.items = [];
  }

  show(target, text, seconds) {
    this.items = this.items.filter((it) => { if (it.target === target) { it.obj.destroy(); return false; } return true; });
    const obj = this.scene.add.text(0, 0, text, {
      fontFamily: FONT,
      fontSize: '13px',
      color: '#2d2a32',
      backgroundColor: 'rgba(255,250,240,0.95)',
      padding: { x: 7, y: 4 },
      wordWrap: { width: 170, useAdvancedWrap: true },
      align: 'center',
      resolution: DPR * 2.5, // 카메라 확대까지 고려해 선명하게
    }).setOrigin(0.5, 1).setDepth(DEPTH.bubble);
    this.items.push({ target, obj, text, life: seconds, total: seconds });
  }

  update(dt) {
    const p = this.getPlayer();
    for (const it of this.items) {
      it.life -= dt;
      const t = it.target;
      it.obj.setPosition(Math.round(t.x), Math.round(t.y - (t.sprite.displayHeight * 0.92) - 4));
      it.obj.setVisible(t.visible);
      const far = p && Math.hypot(p.x - t.x, p.y - t.y) > 260;
      const shown = far ? '…' : it.text;
      if (it.obj.text !== shown) it.obj.setText(shown);
      const fadeIn = Math.min(1, (it.total - it.life) / 0.15);
      const fadeOut = Math.min(1, it.life / 0.3);
      it.obj.setAlpha(Math.max(0, Math.min(fadeIn, fadeOut)) * (far ? 0.7 : 1));
    }
    this.items = this.items.filter((it) => { if (it.life <= 0) { it.obj.destroy(); return false; } return true; });
  }

  clearFor(target) {
    this.items = this.items.filter((it) => { if (it.target === target) { it.obj.destroy(); return false; } return true; });
  }
}
