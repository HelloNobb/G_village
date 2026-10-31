import { dirFromVector } from '../art/AnimRegistry.js';

const BASE_SPEED = 96; // px/s (= 3타일/초)

export class Npc {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} def npcs.json 항목
   * @param {import('../map/MapBuilder.js').WorldMap} world
   * @param {import('../systems/Pathfinder.js').Pathfinder} pf
   */
  constructor(scene, def, world, pf, speedFactor = 1, scale = 1) {
    this.scene = scene;
    this.id = def.id;
    this.def = def;
    this.world = world;
    this.pf = pf;
    this.speed = BASE_SPEED * speedFactor;
    this.key = def.sprite;
    this.sprite = scene.add.sprite(0, 0, this.key, 0).setOrigin(0.5, 0.92).setScale(scale);
    this.facing = 'down';
    this.hiddenIn = null; // 들어가 있는 집 id
    this.path = [];
    this.goal = null; // { kind, ... }
    this.schedKey = null;
    this.activity = 'home';
    this.label = '';
    this.routeIdx = 0;
    this.paused = false; // 플레이어와 대화 중
    this.chatting = false; // 주민끼리 대화 중
    this.boost = 1; // 따라가는 주민이 뒤처지면 잠깐 빨라짐
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get visible() { return !this.hiddenIn; }
  get moving() { return this.path.length > 0; }
  get tile() { return this.world.tileOf(this.sprite.x, this.sprite.y - 4); }

  /** 현재 장소 id (대사 조건용) */
  get place() {
    if (this.hiddenIn) return 'home';
    const t = this.tile;
    return this.world.areaAt(t.x, t.y);
  }

  setHidden(houseId) {
    this.hiddenIn = houseId;
    this.sprite.setVisible(!houseId);
    if (houseId) this.path = [];
  }

  teleport(tx, ty) {
    const c = this.world.center(tx, ty);
    this.sprite.setPosition(c.x, c.y);
    this.path = [];
  }

  /** 새로고침/첫 로드: 지금 있어야 할 곳에 바로 놓는다 */
  placeNow(res, getNpc) {
    this.applySchedule(res);
    const g = this.goal;
    if (g.kind === 'spot') {
      const s = this.world.spots[g.spot];
      this.teleport(s.x, s.y);
      this.facing = s.facing ?? 'down';
      this.setHidden(s.inside ? s.house : null);
    } else if (g.kind === 'route') {
      const pts = this.world.routes[g.route];
      const [x, y] = pts[this.routeIdx % pts.length];
      this.teleport(x, y);
      this.setHidden(null);
    } else if (g.kind === 'follow') {
      const leader = getNpc(g.npc);
      if (leader && leader.visible) {
        const t = leader.tile;
        const n = this.pf.nearestWalkable(t.x + 1, t.y) ?? t;
        this.teleport(n.x, n.y);
        this.setHidden(null);
      } else {
        this.setHidden(this.def.house);
        const h = this.world.houseById(this.def.house);
        this.teleport(h.front.x, h.front.y);
      }
    }
  }

  applySchedule(res) {
    this.schedKey = res.key;
    this.activity = res.activity;
    this.label = res.label;
    const t = res.target;
    if (t.type === 'spot') this.goal = { kind: 'spot', spot: t.spot };
    else if (t.type === 'route') {
      this.goal = { kind: 'route', route: t.route };
      // 현재 위치에서 가장 가까운 지점부터 시작
      const pts = this.world.routes[t.route];
      const cur = this.tile;
      let best = 0, bd = Infinity;
      pts.forEach(([x, y], i) => { const d = Math.abs(x - cur.x) + Math.abs(y - cur.y); if (d < bd) { bd = d; best = i; } });
      this.routeIdx = best;
    } else this.goal = { kind: 'follow', npc: t.npc };
    this.path = [];
    this.arrived = false;
  }

  /** 스케줄에 따라 매 프레임 */
  update(dt, res, getNpc) {
    if (res.key !== this.schedKey) this.applySchedule(res);
    if (this.paused) { this.playAnim(false); return; }

    if (this.goal?.kind === 'follow') {
      this.repathT = (this.repathT ?? 0) - dt;
      if (!this.path.length || this.repathT <= 0) { this.repathT = 0.5; this.think(getNpc, dt); }
    } else if (!this.path.length) this.think(getNpc, dt);
    this.step(dt);
  }

  think(getNpc, dt) {
    const g = this.goal;
    if (!g) return;
    if (g.kind === 'spot') {
      const s = this.world.spots[g.spot];
      if (!s) return;
      if (s.inside) {
        if (this.hiddenIn === s.house) return;
        if (this.hiddenIn) this.exitHouse();
        const t = this.tile;
        if (t.x === s.x && t.y === s.y) { this.setHidden(s.house); return; }
        this.walkTo(s.x, s.y);
      } else {
        if (this.hiddenIn) this.exitHouse();
        const t = this.tile;
        if (t.x === s.x && t.y === s.y) {
          if (!this.arrived) { this.arrived = true; this.facing = s.facing ?? this.facing; }
          return;
        }
        this.walkTo(s.x, s.y);
      }
    } else if (g.kind === 'route') {
      if (this.hiddenIn) this.exitHouse();
      const pts = this.world.routes[g.route];
      const [x, y] = pts[this.routeIdx % pts.length];
      const t = this.tile;
      if (t.x === x && t.y === y) this.routeIdx = (this.routeIdx + 1) % pts.length;
      const [nx, ny] = pts[this.routeIdx % pts.length];
      this.walkTo(nx, ny);
    } else if (g.kind === 'follow') {
      const leader = getNpc(g.npc);
      const home = this.world.houseById(this.def.house);
      if (!leader || !leader.visible) {
        if (this.hiddenIn) return;
        const t = this.tile;
        if (t.x === home.front.x && t.y === home.front.y) { this.setHidden(home.id); return; }
        this.walkTo(home.front.x, home.front.y);
        return;
      }
      if (this.hiddenIn) this.exitHouse();
      const d = Math.hypot(leader.x - this.x, leader.y - this.y);
      this.boost = d > 120 ? 1.6 : d > 60 ? 1.3 : 1;
      this.leaderRef = leader;
      if (d > 40) {
        const lt = leader.tile;
        this.walkTo(lt.x, lt.y);
      } else {
        this.path = [];
        this.facing = leader.facing;
      }
    }
  }

  exitHouse() {
    const h = this.world.houseById(this.hiddenIn);
    this.setHidden(null);
    if (h) this.teleport(h.front.x, h.front.y);
  }

  walkTo(tx, ty) {
    const t = this.tile;
    const p = this.pf.find(t.x, t.y, tx, ty);
    if (!p) return;
    const pts = p.map((q) => this.world.center(q.x, q.y));
    this.path = pts;
  }

  step(dt) {
    if (!this.path.length || this.hiddenIn) { this.playAnim(false); this.sprite.setDepth(this.y); return; }
    if (this.goal?.kind !== 'follow') this.boost = 1;
    else if (this.leaderRef && Math.hypot(this.leaderRef.x - this.x, this.leaderRef.y - this.y) < 34) {
      // 따라가는 중: 충분히 가까우면 멈춤 (다음 think 에서 다시 따라감)
      this.path = [];
      this.playAnim(false);
      this.sprite.setDepth(this.y);
      return;
    }
    let remain = this.speed * this.boost * dt;
    while (remain > 0 && this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x, dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= remain) {
        this.sprite.setPosition(p.x, p.y);
        this.path.shift();
        remain -= d;
      } else {
        this.sprite.setPosition(this.x + (dx / d) * remain, this.y + (dy / d) * remain);
        this.facing = dirFromVector(dx, dy, this.facing);
        remain = 0;
      }
    }
    this.playAnim(this.path.length > 0);
    this.sprite.setDepth(this.y);
  }

  playAnim(moving) {
    this.sprite.anims.play(`${this.key}.${moving ? 'walk' : 'idle'}.${this.facing}`, true);
  }

  faceTowards(x, y) {
    this.facing = dirFromVector(x - this.x, y - this.y, this.facing);
    this.playAnim(false);
  }
}
