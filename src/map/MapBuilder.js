// public/data/map.json → 타일맵(바닥/장식), 충돌, 건물, 구역 조회

const DECOR = new Set(['tree', 'flowers', 'bench', 'furniture', 'fountain', 'house']);
const BASE_OF = { furniture: 'floor', fountain: 'plaza', tree: 'grass', flowers: 'grass', house: 'grass' };

export const DEPTH = {
  sea: -10,
  ground: 0,
  decor: 1,
  // 엔티티: y 좌표(px)
  overlay: 100000,
  light: 100001,
  bubble: 100002,
};

export class WorldMap {
  constructor(scene, data) {
    this.scene = scene;
    this.data = data;
    this.T = data.tileSize;
    this.W = data.width;
    this.H = data.height;
    this.chars = Object.keys(data.legend);
    this.indexOf = Object.fromEntries(this.chars.map((c, i) => [c, i]));
    this.nameOf = Object.fromEntries(this.chars.map((c) => [c, data.legend[c].name]));
    this.rows = data.rows.map((r) => r.padEnd(this.W, ',').slice(0, this.W));
    this.walkable = this.rows.map((row) => [...row].map((c) => !!data.legend[c]?.walkable));
    this.buildings = data.buildings.map((b) => ({ ...b }));
    this.shops = this.buildings.filter((b) => b.kind === 'shop');
    this.houses = this.buildings.filter((b) => b.kind === 'house');
    this.areas = data.areas;
    this.spots = data.spots;
    this.routes = data.routes;
  }

  charAt(x, y) {
    return this.rows[y]?.[x] ?? 'T';
  }

  build() {
    const s = this.scene;
    const { T, W, H } = this;
    // 바다 바탕 (색은 시간에 따라 바뀜)
    const seaTop = this.rows.findIndex((r) => r.includes('~'));
    this.seaRect = s.add.rectangle(0, seaTop * T, W * T, (H - seaTop) * T, 0x3aa0c8).setOrigin(0).setDepth(DEPTH.sea);

    const map = s.make.tilemap({ tileWidth: T, tileHeight: T, width: W, height: H });
    const ts = map.addTilesetImage('tiles', 'tiles', T, T, 0, 0);
    const ground = map.createBlankLayer('ground', ts).setDepth(DEPTH.ground);
    const decor = map.createBlankLayer('decor', ts).setDepth(DEPTH.decor);
    const collide = map.createBlankLayer('collide', ts).setVisible(false);

    const gData = [], dData = [], cData = [];
    for (let y = 0; y < H; y++) {
      const gr = [], dr = [], cr = [];
      for (let x = 0; x < W; x++) {
        const c = this.charAt(x, y);
        const name = this.nameOf[c] ?? 'grass';
        if (DECOR.has(name)) {
          dr.push(name === 'house' ? -1 : this.indexOf[c]);
          gr.push(this.indexOf[this.baseChar(x, y, name)] ?? 0);
        } else {
          dr.push(-1);
          gr.push(this.indexOf[c] ?? 0);
        }
        cr.push(this.walkable[y][x] ? -1 : 0);
      }
      gData.push(gr); dData.push(dr); cData.push(cr);
    }
    ground.putTilesAt(gData, 0, 0);
    decor.putTilesAt(dData, 0, 0);
    collide.putTilesAt(cData, 0, 0);
    collide.setCollisionByExclusion([-1]);
    this.tilemap = map;
    this.collideLayer = collide;

    // 집 (스프라이트, y정렬)
    for (const b of this.houses) {
      const key = `bld.${b.id}`;
      const img = s.add.image(b.x * T, (b.y + b.h) * T, key).setOrigin(0, 1);
      img.setDisplaySize(b.w * T, img.height * ((b.w * T) / img.width));
      img.setDepth((b.y + b.h) * T - 1);
      b.sprite = img;
      const spec = s.cache.json.get('manifest')[key] ?? {};
      const wins = spec.windows ?? s.textures.get(key).customData?.windows ?? [];
      const sx = (b.w * T) / img.width;
      b.windows = wins.map((w) => ({ x: b.x * T + w.x * sx, y: (b.y + b.h) * T - img.displayHeight + w.y * sx }));
    }
    // 상가 지붕 (안에 들어가면 투명해짐) + 문 앞 충돌(영업 외 시간)
    for (const b of this.shops) {
      b.roof = s.add.image(b.x * T, b.y * T, `roof.${b.id}`).setOrigin(0).setDisplaySize(b.w * T, b.h * T);
      b.roof.setDepth((b.y + b.h) * T + 2);
      b.interior = { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 };
      const door = s.add.zone(b.door.x * T + T / 2, b.door.y * T + T / 2, T, T);
      s.physics.add.existing(door, true);
      b.doorBody = door;
      b.closedSign = s.add.text(b.front.x * T + T / 2, b.front.y * T + 4, 'CLOSED', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#fff', backgroundColor: '#8a3b3b', padding: { x: 4, y: 1 },
      }).setOrigin(0.5, 0).setDepth((b.y + b.h) * T + 3).setVisible(false);
    }
    return this;
  }

  baseChar(x, y, name) {
    if (BASE_OF[name]) return this.chars.find((c) => this.nameOf[c] === BASE_OF[name]);
    const counts = {};
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0]]) {
      const c = this.charAt(x + dx, y + dy);
      const n = this.nameOf[c];
      if (!n || DECOR.has(n) || n === 'wall' || n === 'sea') continue;
      counts[c] = (counts[c] ?? 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : this.chars.find((c) => this.nameOf[c] === 'grass');
  }

  tileOf(px, py) {
    return { x: Math.floor(px / this.T), y: Math.floor(py / this.T) };
  }

  center(tx, ty) {
    return { x: tx * this.T + this.T / 2, y: ty * this.T + this.T / 2 + 6 };
  }

  /** 타일 좌표 → 구역 id */
  areaAt(tx, ty) {
    for (const a of this.areas) {
      if (tx >= a.x && tx < a.x + a.w && ty >= a.y && ty < a.y + a.h) return a.id;
    }
    return 'street';
  }

  shopAt(tx, ty) {
    return this.shops.find((b) => tx >= b.interior.x && tx < b.interior.x + b.interior.w && ty >= b.interior.y && ty < b.interior.y + b.interior.h) ?? null;
  }

  houseById(id) {
    return this.houses.find((h) => h.id === id);
  }
}
