// 그리드 A* (8방향, 벽 모서리 끼어 지나가기 금지) + 경로 캐시

const SQRT2 = Math.SQRT2;

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, f) {
    const a = this.a;
    a.push([f, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
}

export class Pathfinder {
  /** @param {boolean[][]} walkable [y][x] */
  constructor(walkable) {
    this.h = walkable.length;
    this.w = walkable[0].length;
    this.grid = walkable;
    this.cache = new Map();
  }

  isWalkable(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.grid[y][x];
  }

  /** 막힌 칸이면 가장 가까운 걸을 수 있는 칸 */
  nearestWalkable(x, y) {
    if (this.isWalkable(x, y)) return { x, y };
    for (let r = 1; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.isWalkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  /** @returns {{x:number,y:number}[] | null} 시작 칸 제외, 도착 칸 포함 */
  find(sx, sy, tx, ty) {
    const start = this.nearestWalkable(sx, sy);
    const goal = this.nearestWalkable(tx, ty);
    if (!start || !goal) return null;
    if (start.x === goal.x && start.y === goal.y) return [];
    const key = `${start.x},${start.y}>${goal.x},${goal.y}`;
    const hit = this.cache.get(key);
    if (hit) return hit.slice();

    const W = this.w;
    const idx = (x, y) => y * W + x;
    const g = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    const heur = (x, y) => {
      const dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    const open = new MinHeap();
    const s = idx(start.x, start.y);
    g[s] = 0;
    open.push(s, heur(start.x, start.y));
    const gi = idx(goal.x, goal.y);

    while (open.size) {
      const cur = open.pop();
      if (cur === gi) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.isWalkable(nx, ny)) continue;
          if (dx && dy && (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy))) continue;
          const ni = idx(nx, ny);
          if (closed[ni]) continue;
          const ng = g[cur] + (dx && dy ? SQRT2 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = cur;
            open.push(ni, ng + heur(nx, ny));
          }
        }
      }
    }
    if (came[gi] === -1) return null;
    const path = [];
    for (let c = gi; c !== s; c = came[c]) path.push({ x: c % W, y: (c / W) | 0 });
    path.reverse();
    const simplified = simplify(path);
    if (this.cache.size > 400) this.cache.clear();
    this.cache.set(key, simplified);
    return simplified.slice();
  }
}

/** 같은 방향으로 이어지는 중간 점 제거 */
function simplify(path) {
  if (path.length < 3) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1], b = path[i], c = path[i + 1];
    const d1x = b.x - a.x, d1y = b.y - a.y, d2x = c.x - b.x, d2y = c.y - b.y;
    if (Math.sign(d1x) === Math.sign(d2x) && Math.sign(d1y) === Math.sign(d2y) && d1x * d2y === d1y * d2x) continue;
    out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}
