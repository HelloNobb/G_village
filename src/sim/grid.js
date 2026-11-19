import { Pathfinder } from '../systems/Pathfinder.js';

// map.json 을 시뮬레이션에서 쓰기 위한 도우미 (Phaser 없이 Node 에서도 동작)
export class Grid {
  constructor(map) {
    this.map = map;
    this.T = map.tileSize;
    this.W = map.width;
    this.H = map.height;
    this.rows = map.rows;
    this.walkable = map.rows.map((row) => [...row].map((c) => !!map.legend[c]?.walkable));
    this.pf = new Pathfinder(this.walkable);
    this.spots = map.spots;
    this.routes = map.routes;
    this.buildings = map.buildings;
    this.houses = Object.fromEntries(map.buildings.filter((b) => b.kind === 'house').map((b) => [b.id, b]));
    this.facilities = Object.fromEntries(map.buildings.filter((b) => b.kind === 'facility').map((b) => [b.id, b]));
    this.spotGroups = {};
  }

  /** 'cafe.s' 같은 접두어로 자리 목록 */
  group(prefix) {
    if (!this.spotGroups[prefix]) this.spotGroups[prefix] = Object.keys(this.spots).filter((k) => k.startsWith(prefix) && !this.spots[k].inside);
    return this.spotGroups[prefix];
  }

  center(tx, ty) {
    return { x: tx * this.T + this.T / 2, y: ty * this.T + this.T / 2 + 6 };
  }

  tileOf(x, y) {
    return { x: Math.floor(x / this.T), y: Math.floor((y - 4) / this.T) };
  }

  areaAt(tx, ty) {
    for (const a of this.map.areas) if (tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h) return a.id;
    return 'street';
  }

  /** 픽셀 좌표 경로 (시작 칸 제외) */
  path(fromPx, toTile) {
    const f = this.tileOf(fromPx.x, fromPx.y);
    const p = this.pf.find(f.x, f.y, toTile.x, toTile.y);
    if (!p) return null;
    return p.map((q) => this.center(q.x, q.y));
  }

  pathLength(fromPx, toTile) {
    const pts = this.path(fromPx, toTile);
    if (!pts) return Infinity;
    let len = 0, prev = fromPx;
    for (const p of pts) { len += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
    return len;
  }
}
