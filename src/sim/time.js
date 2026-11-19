// 한국 시간(UTC+9, 서머타임 없음) 계산
export const KST = 9 * 3600 * 1000;
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export const TIME_BANDS = [
  { id: 'dawn', from: 5, to: 7, ko: '새벽' },
  { id: 'morning', from: 7, to: 11, ko: '아침' },
  { id: 'lunch', from: 11, to: 14, ko: '점심' },
  { id: 'afternoon', from: 14, to: 18, ko: '오후' },
  { id: 'evening', from: 18, to: 21, ko: '저녁' },
  { id: 'night', from: 21, to: 24, ko: '밤' },
  { id: 'latenight', from: 0, to: 5, ko: '심야' },
];

/** epoch ms → 한국 시각 정보 */
export function kst(ms) {
  const d = new Date(ms + KST);
  const hour = d.getUTCHours(), minute = d.getUTCMinutes();
  const h = hour + minute / 60 + d.getUTCSeconds() / 3600;
  const band = TIME_BANDS.find((b) => h >= b.from && h < b.to) ?? TIME_BANDS[0];
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate(),
    hour, minute, h, clockMin: h * 60,
    day: DAY_KEYS[d.getUTCDay()], dayKo: DAY_KO[d.getUTCDay()],
    timeBand: band.id, timeBandKo: band.ko,
  };
}

/** 그날 한국 자정(epoch ms) */
export function kstMidnight(ms) {
  return Math.floor((ms + KST) / DAY) * DAY - KST;
}

/** Day 번호 (Day 0 = 시작한 날, 자정마다 +1) */
export function dayIndex(ms, day0) {
  return Math.floor((kstMidnight(ms) - day0) / DAY);
}

export function hm(ms) {
  const t = kst(ms);
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/** h 가 [from, to) 안인지 (자정 넘김 지원: [21, 4]) */
export function inHours(h, [from, to]) {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
