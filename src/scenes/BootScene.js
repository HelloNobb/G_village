import Phaser from 'phaser';
import { PlaceholderFactory } from '../art/PlaceholderFactory.js';
import { registerCharacterAnims } from '../art/AnimRegistry.js';

// 데이터 JSON + manifest 의 실제 이미지 → 플레이스홀더 생성 → World
const DATA = ['map', 'residents', 'needs', 'traits', 'actions', 'memory', 'romance', 'talk', 'news', 'daylight'];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    for (const k of DATA) this.load.json(k, `data/${k}.json`);
    this.load.json('manifest', 'assets/manifest.json');
  }

  create() {
    const manifest = this.cache.json.get('manifest');
    for (const [key, spec] of Object.entries(manifest)) {
      if (key.startsWith('_')) continue;
      if (spec.type === 'spritesheet') this.load.spritesheet(key, spec.url, { frameWidth: spec.frameWidth, frameHeight: spec.frameHeight });
      else if (spec.type === 'image') this.load.image(key, spec.url);
    }
    this.load.once('complete', () => this.finish());
    this.load.on('loaderror', (file) => console.error('불러오기 실패:', file.src));
    this.load.start();
  }

  finish() {
    const manifest = this.cache.json.get('manifest');
    new PlaceholderFactory(this).ensureAll(manifest, this.cache.json.get('map'));
    if (!this.textures.exists('fx.white')) {
      const t = this.textures.createCanvas('fx.white', 4, 4);
      t.getContext().fillStyle = '#fff';
      t.getContext().fillRect(0, 0, 4, 4);
      t.refresh();
    }
    for (const r of this.cache.json.get('residents').residents) {
      registerCharacterAnims(this, r.sprite, manifest[r.sprite]);
      if (r.pet) registerCharacterAnims(this, r.pet.sprite, manifest[r.pet.sprite]);
    }
    // 접속 안 한 동안 계산은 World 에서 (화면에 "불러오는 중"이 먼저 뜨도록 한 프레임 쉼)
    document.getElementById('loading').textContent = '자리를 비운 사이의 마을을 계산하는 중…';
    setTimeout(() => this.scene.start('World'), 30);
  }
}
