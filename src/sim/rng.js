// 시드가 있는 난수 (상태를 저장해 두면 불러온 뒤에도 같은 흐름으로 이어짐)
export class Rng {
  constructor(seed = Date.now() >>> 0) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  chance(p) { return this.next() < p; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** 가중치 [{item, w}] */
  weighted(list) {
    const total = list.reduce((s, x) => s + Math.max(0, x.w), 0);
    if (total <= 0) return list[0]?.item;
    let r = this.next() * total;
    for (const x of list) { r -= Math.max(0, x.w); if (r <= 0) return x.item; }
    return list[list.length - 1].item;
  }
}
