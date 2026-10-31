// 화면 해상도 설정
// DPR: 캔버스를 기기 픽셀 비율로 그린다(레티나·휴대폰에서 선명하게). 성능 때문에 최대 2.
// TEX: 플레이스홀더 그림을 몇 배 해상도로 만들지. 카메라 확대(1~2.25배)까지 고려해 2~3배.
export const DPR = Math.min(2, window.devicePixelRatio || 1);
export const TEX = Math.min(3, Math.max(2, Math.ceil(DPR * 1.5)));
export const TILE = 32; // 월드 좌표 기준 타일 크기

/** manifest 항목의 그림이 월드 크기보다 몇 배 큰지 (placeholder = TEX, 실제 그림 = resolution 또는 1) */
export function texResolution(spec) {
  if (!spec) return 1;
  if (String(spec.type).startsWith('placeholder')) return TEX;
  return spec.resolution ?? 1;
}

export const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
