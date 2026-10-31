import { DIRS, FRAMES_PER_DIR } from './PlaceholderFactory.js';

// 애니메이션 키 규칙: `<텍스처키>.walk.<방향>`, `<텍스처키>.idle.<방향>`
// 실제 스프라이트시트도 같은 프레임 배치(down 0-2, left 3-5, right 6-8, up 9-11)를 쓰면 코드 수정 없이 교체됨.
// 다른 배치의 시트라면 manifest 에 "frames": { "down": [0,1,2], ... } 로 덮어쓸 수 있다.

export function registerCharacterAnims(scene, key, spec = {}) {
  DIRS.forEach((dir, d) => {
    const frames = spec.frames?.[dir] ?? [0, 1, 2].map((f) => d * FRAMES_PER_DIR + f);
    const walkKey = `${key}.walk.${dir}`;
    const idleKey = `${key}.idle.${dir}`;
    if (!scene.anims.exists(walkKey)) {
      scene.anims.create({
        key: walkKey,
        frames: [frames[1], frames[0], frames[2], frames[0]].map((frame) => ({ key, frame })),
        frameRate: spec.walkFps ?? 8,
        repeat: -1,
      });
    }
    if (!scene.anims.exists(idleKey)) {
      scene.anims.create({ key: idleKey, frames: [{ key, frame: frames[0] }], frameRate: 1 });
    }
  });
}

export function dirFromVector(dx, dy, fallback = 'down') {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
