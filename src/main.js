import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { WorldScene } from './scenes/WorldScene.js';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#10132a',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  physics: { default: 'arcade', arcade: { debug: false } },
  render: { antialias: true, roundPixels: true },
  input: { activePointers: 3 },
  scene: [BootScene, WorldScene],
});

// 디버그 모드(?debug=1 등)에서 콘솔로 상태를 볼 수 있게
if (/[?&](debug|t|speed)=/.test(location.search)) window.__village = game;
