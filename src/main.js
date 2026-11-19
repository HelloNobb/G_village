import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { DPR } from './config.js';

// 캐시된 옛 코드가 새 데이터와 섞이지 않게: 서버의 최신 빌드 번호와 다르면 한 번 새로고침
async function ensureLatest() {
  try {
    const res = await fetch(`build.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return true; // 개발 모드에는 없음
    const { id } = await res.json();
    if (id !== __BUILD_ID__ && sessionStorage.getItem('g-village:reloaded') !== id) {
      sessionStorage.setItem('g-village:reloaded', id);
      location.reload();
      return false;
    }
  } catch { /* 오프라인 등: 그냥 진행 */ }
  return true;
}

if (await ensureLatest()) start();

function start() {
// 게임 화면은 #game 상자 크기에 맞춰, 기기 픽셀 비율(DPR)로 그린다.
const parent = document.getElementById('game');
const size = () => ({ w: Math.max(200, parent.clientWidth), h: Math.max(200, parent.clientHeight) });
const s0 = size();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#10132a',
  scale: { mode: Phaser.Scale.NONE, width: Math.round(s0.w * DPR), height: Math.round(s0.h * DPR), zoom: 1 / DPR },
  render: { antialias: true, roundPixels: false, mipmapFilter: 'LINEAR_MIPMAP_LINEAR' },
  input: { activePointers: 3 },
  scene: [BootScene, WorldScene],
});

let pending = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const { w, h } = size();
    game.scale.resize(Math.round(w * DPR), Math.round(h * DPR));
  });
}).observe(parent);

// 디버그 모드(?debug=1 등)에서 콘솔로 상태를 볼 수 있게
if (/[?&](debug|t|speed)=/.test(location.search)) window.__village = game;
}
