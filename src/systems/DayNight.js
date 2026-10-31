import { parseHM } from './Clock.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
export const toInt = (c) => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
export const toCss = (c) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

const WHITE = [255, 255, 255];
const SEA_BASE = hex('#3aa0c8');

/**
 * 일출·일몰 기준 키프레임을 분 단위로 보간해서 색조·하늘·조명 값을 낸다.
 * daylight.json: 월별(그 달 15일 기준) 서울 일출/일몰 근사값.
 */
export class DayNight {
  constructor(daylight) {
    this.months = daylight.months.map((m) => ({ sr: parseHM(m.sunrise), ss: parseHM(m.sunset) }));
  }

  sunTimes(month, date) {
    // 15일 기준 월별 값 사이를 날짜로 선형 보간
    const i = month - 1;
    const cur = this.months[i];
    const nextI = date >= 15 ? (i + 1) % 12 : (i + 11) % 12;
    const other = this.months[nextI];
    const t = Math.abs(date - 15) / 30;
    return { sr: lerp(cur.sr, other.sr, t), ss: lerp(cur.ss, other.ss, t) };
  }

  compute(t) {
    const { sr, ss } = this.sunTimes(t.month, t.date);
    const K = [
      [0, '#0e1238', 0.62, '#0b1030', '#1c2550'],
      [sr - 90, '#0e1238', 0.62, '#0b1030', '#1c2550'],
      [sr - 30, '#4a5a8a', 0.4, '#36457a', '#c98a8a'],
      [sr, '#ffcf9e', 0.12, '#6fa8dc', '#ffd6a0'],
      [sr + 90, '#ffffff', 0, '#5aaee8', '#bfe6ff'],
      [ss - 90, '#ffffff', 0, '#5aaee8', '#bfe6ff'],
      [ss - 30, '#ff9a6a', 0.18, '#5a78c0', '#ffa070'],
      [ss + 30, '#3a3f7a', 0.38, '#262c66', '#7a5a90'],
      [ss + 120, '#1a2050', 0.52, '#0b1030', '#1c2550'],
      [1440, '#0e1238', 0.62, '#0b1030', '#1c2550'],
    ];
    const m = t.clockMin;
    let a = K[0], b = K[K.length - 1];
    for (let i = 0; i < K.length - 1; i++) {
      if (m >= K[i][0] && m <= K[i + 1][0]) { a = K[i]; b = K[i + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = Math.min(1, Math.max(0, (m - a[0]) / span));
    const tint = mix(hex(a[1]), hex(b[1]), f);
    const strength = lerp(a[2], b[2], f);
    const skyTop = mix(hex(a[3]), hex(b[3]), f);
    const skyBottom = mix(hex(a[4]), hex(b[4]), f);
    const mult = mix(WHITE, tint, strength);
    const lights = Math.min(1, Math.max(0, (strength - 0.15) / 0.3));

    // 해/달 위치 (0~1)
    const isDay = m >= sr && m < ss;
    const celestial = isDay
      ? { kind: 'sun', pos: (m - sr) / (ss - sr) }
      : { kind: 'moon', pos: (((m - ss) + 1440) % 1440) / (1440 - (ss - sr)) };

    return {
      mult: toInt(mult),
      strength,
      lights,
      sea: toInt(mix(SEA_BASE, skyBottom, 0.35)),
      skyTop: toCss(skyTop),
      skyBottom: toCss(skyBottom),
      celestial,
      sunrise: sr,
      sunset: ss,
    };
  }
}
