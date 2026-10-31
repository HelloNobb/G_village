import Phaser from 'phaser';
import { PlaceholderFactory } from '../art/PlaceholderFactory.js';
import { registerCharacterAnims } from '../art/AnimRegistry.js';

// 1단계: 데이터 JSON / 2단계: 대사 + manifest 의 실제 이미지 / 3단계: 플레이스홀더 생성 → World

const DATA = ['npcs', 'schedules', 'map', 'places', 'daylight', 'ambient', 'news'];

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    for (const k of DATA) this.load.json(k, `data/${k}.json`);
    this.load.json('manifest', 'assets/manifest.json');
  }

  create() {
    const npcs = this.cache.json.get('npcs');
    const manifest = this.cache.json.get('manifest');
    for (const n of [...npcs.residents, ...(npcs.pets ?? [])]) this.load.json(`dialogue.${n.id}`, `data/dialogue/${n.id}.json`);
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
    const map = this.cache.json.get('map');
    new PlaceholderFactory(this).ensureAll(manifest, map);
    if (!this.textures.exists('fx.white')) {
      const t = this.textures.createCanvas('fx.white', 4, 4);
      t.getContext().fillStyle = '#fff';
      t.getContext().fillRect(0, 0, 4, 4);
      t.refresh();
    }
    const npcs = this.cache.json.get('npcs');
    const charKeys = ['player', ...npcs.residents.map((n) => n.sprite), ...(npcs.pets ?? []).map((p) => p.sprite)];
    for (const k of charKeys) registerCharacterAnims(this, k, manifest[k]);
    this.scene.start('World');
  }
}
