// 실제 시계(한국 시간, UTC+9 / 서머타임 없음) 기반 게임 시계.
// 디버그: ?t=2026-11-01T21:30 (KST 고정 시작 시각), ?speed=60 (배속)

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

/** 게임 하루는 05:00에 시작한다. 00:00~04:59는 전날의 24:00~28:59로 본다. */
export const DAY_START_MIN = 5 * 60;

export const TIME_BANDS = [
  { id: 'dawn', from: 5 * 60, to: 7 * 60, ko: '새벽' },
  { id: 'morning', from: 7 * 60, to: 11 * 60, ko: '아침' },
  { id: 'lunch', from: 11 * 60, to: 14 * 60, ko: '점심' },
  { id: 'afternoon', from: 14 * 60, to: 18 * 60, ko: '오후' },
  { id: 'evening', from: 18 * 60, to: 21 * 60, ko: '저녁' },
  { id: 'night', from: 21 * 60, to: 24 * 60, ko: '밤' },
  { id: 'latenight', from: 0, to: 5 * 60, ko: '심야' },
];

/** "HH:MM" (최대 29:59) → 분 */
export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`잘못된 시각 형식: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseKSTString(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) - KST_OFFSET;
}

export class Clock {
  constructor() {
    const q = new URLSearchParams(location.search);
    this.speed = Math.max(0.1, Number(q.get('speed')) || 1);
    const fixed = q.get('t') ? parseKSTString(q.get('t')) : null;
    this.realStart = Date.now();
    this.virtualStart = fixed ?? this.realStart;
    this.isOverridden = fixed != null || this.speed !== 1;
    this.update();
  }

  /** 가상 epoch(ms) */
  nowMs() {
    return this.virtualStart + (Date.now() - this.realStart) * this.speed;
  }

  update() {
    const ms = this.nowMs();
    const k = new Date(ms + KST_OFFSET); // UTC getter = KST 값
    const hour = k.getUTCHours();
    const minute = k.getUTCMinutes();
    const second = k.getUTCSeconds();
    const clockMin = hour * 60 + minute + second / 60; // 0~1440 (실제 시계 기준)

    // 논리적 하루(05:00 시작)
    const logical = new Date(ms + KST_OFFSET - DAY_START_MIN * 60 * 1000);
    const dow = logical.getUTCDay();
    const dayMin = clockMin < DAY_START_MIN ? clockMin + 1440 : clockMin; // 300~1739

    const band = TIME_BANDS.find((b) => clockMin >= b.from && clockMin < b.to) ?? TIME_BANDS[0];

    this.state = {
      ms,
      year: k.getUTCFullYear(),
      month: k.getUTCMonth() + 1,
      date: k.getUTCDate(),
      hour,
      minute,
      second,
      clockMin,
      dayMin,
      day: DAY_KEYS[dow],
      dayKo: DAY_KO[dow],
      dayType: dow === 0 || dow === 6 ? 'weekend' : 'weekday',
      dateKey: `${logical.getUTCFullYear()}-${String(logical.getUTCMonth() + 1).padStart(2, '0')}-${String(logical.getUTCDate()).padStart(2, '0')}`,
      timeBand: band.id,
      timeBandKo: band.ko,
      realDow: DAY_KO[k.getUTCDay()],
    };
    return this.state;
  }

  /** "오후 3시" 같은 표현 */
  spokenTime() {
    const { hour, minute } = this.state;
    const ampm = hour < 12 ? '오전' : '오후';
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${ampm} ${h12}시${minute >= 30 ? ' 반' : ''}`;
  }

  label() {
    const s = this.state;
    return {
      date: `${s.month}월 ${s.date}일 (${s.realDow})`,
      time: `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`,
    };
  }
}
