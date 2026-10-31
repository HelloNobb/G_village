import Phaser from 'phaser';
import { Clock, parseHM } from '../systems/Clock.js';
import { DayNight } from '../systems/DayNight.js';
import { Pathfinder } from '../systems/Pathfinder.js';
import { ScheduleSystem } from '../systems/ScheduleSystem.js';
import { DialogueSystem, fillText } from '../systems/DialogueSystem.js';
import { AmbientChatSystem } from '../systems/AmbientChatSystem.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { WorldMap, DEPTH } from '../map/MapBuilder.js';
import { Player } from '../entities/Player.js';
import { Npc } from '../entities/Npc.js';
import { Pet } from '../entities/Pet.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { Hud } from '../ui/Hud.js';
import { TouchControls } from '../ui/TouchControls.js';
import { SpeechBubbles } from '../ui/SpeechBubbles.js';
import { Menu } from '../ui/Menu.js';
import { Minimap } from '../ui/Minimap.js';
import { NewsFeed } from '../ui/NewsFeed.js';
import { DPR, IS_TOUCH, texResolution } from '../config.js';

const TALK_RANGE = 70;
const KNOCK_RANGE = 40;
const LEVEL_KO = ['처음 만남', '아는 사이', '친한 이웃', '단골 이웃'];
const stripTag = (s) => (s ?? '').replace(/\s*\[[^\]]*\]/g, '');
const DAY_KO = { mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일', sat: '토요일', sun: '일요일' };

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    const J = (k) => this.cache.json.get(k);
    this.npcData = J('npcs');
    this.places = J('places');
    this.save = new SaveSystem();
    this.clock = new Clock();
    this.dayNight = new DayNight(J('daylight'));
    this.schedule = new ScheduleSystem(J('schedules'));
    const dialogues = {};
    for (const n of [...this.npcData.residents, ...(this.npcData.pets ?? [])]) dialogues[n.id] = J(`dialogue.${n.id}`);
    this.dialogue = new DialogueSystem(dialogues);
    this.newsData = J('news');
    const manifest = J('manifest');
    this.texScale = (key) => 1 / texResolution(manifest[key]);

    // ── 맵 ──
    this.world = new WorldMap(this, J('map')).build();
    const T = this.world.T;
    this.physics.world.setBounds(0, 0, this.world.W * T, this.world.H * T);
    this.pf = new Pathfinder(this.world.walkable);

    // ── 플레이어 ──
    const sp = this.save.data.player;
    const spawn = sp.x != null ? { x: sp.x, y: sp.y } : this.world.center(this.world.data.playerSpawn.x, this.world.data.playerSpawn.y);
    this.player = new Player(this, spawn.x, spawn.y, this.texScale('player'));
    this.player.facing = sp.facing ?? 'down';
    this.physics.add.collider(this.player.sprite, this.world.collideLayer);
    for (const b of this.world.shops) {
      this.physics.add.collider(this.player.sprite, b.doorBody, null, () => !this.isOpen(b.id) && !this.playerInside(b));
    }

    // ── 주민 ──
    const speedFactor = Math.min(this.clock.speed, 12);
    this.npcs = new Map();
    for (const def of this.npcData.residents) this.npcs.set(def.id, new Npc(this, def, this.world, this.pf, speedFactor, this.texScale(def.sprite)));
    this.pets = (this.npcData.pets ?? []).map((def) => new Pet(this, def, this.npcs.get(def.owner), this.texScale(def.sprite)));
    const getNpc = (id) => this.npcs.get(id);
    this.getNpc = getNpc;
    const t0 = this.clock.update();
    const ordered = [...this.npcs.values()].sort((a, b) => (this.schedule.resolve(a.id, t0).target.type === 'follow') - (this.schedule.resolve(b.id, t0).target.type === 'follow'));
    for (const n of ordered) n.placeNow(this.schedule.resolve(n.id, t0), getNpc);

    // ── 카메라 ──
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.W * T, this.world.H * T);
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.setRoundPixels(false);
    this.applyZoom();
    this.scale.on('resize', () => this.applyZoom());

    // ── 조명 / 색조 ──
    this.buildLighting();

    // ── 말풍선 / 주민끼리 대화 ──
    this.bubbles = new SpeechBubbles(this, () => this.player);
    this.ambient = new AmbientChatSystem(this, J('ambient'), {
      npcs: this.npcs,
      bubbles: this.bubbles,
      isEnabled: () => this.save.data.settings.ambientBubbles,
      isPaused: () => this.dialog.open,
      getCtx: () => this.baseCtx(),
      onChat: (lines, place) => this.news.pushChat(this.clock.label().time, this.placeName(place), lines, (id) => this.npcs.get(id)?.def.name ?? id),
    });

    // ── UI ──
    this.dialog = new DialogueBox();
    this.hud = new Hud();
    this.talkBtn = document.getElementById('talk-btn');
    this.talkLabel = this.talkBtn.querySelector('.label');
    this.talkIcon = this.talkBtn.querySelector('.icon');
    this.talkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.interact(); });
    this.touch = new TouchControls(this, { onTap: (x, y) => this.onTap(x, y), onDoubleTap: () => this.interact() });
    this.menu = new Menu(this);
    this.minimap = new Minimap(this);
    this.news = new NewsFeed(this, this.newsData);
    this.indicator = this.add.text(0, 0, '💬', { fontSize: '16px', resolution: DPR * 2.5 }).setOrigin(0.5, 1).setDepth(DEPTH.bubble).setVisible(false);

    // ── 키보드 ──
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT,
      w: K.W, a: K.A, s: K.S, d: K.D,
    });
    this.input.keyboard.on('keydown-SPACE', () => this.interact());
    this.input.keyboard.on('keydown-E', () => this.interact());
    this.input.keyboard.on('keydown-ENTER', () => { if (this.dialog.open) this.dialog.advance(); });
    this.input.keyboard.on('keydown-ESC', () => this.menu.toggle());
    this.debugOn = /[?&](debug|t|speed)=/.test(location.search);
    this.debugEl = document.getElementById('debug');
    this.input.keyboard.on('keydown-BACKTICK', () => { if (this.debugOn) this.debugEl.classList.toggle('hidden'); });
    if (this.debugOn) this.debugEl.classList.remove('hidden');

    this.saveTimer = 0;
    this.skyTimer = 0;
    this.updateSky(true);
    this.backfillNews();
    document.getElementById('loading').classList.add('hidden');
    window.addEventListener('pagehide', () => this.savePosition());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.savePosition(); });

    if (!this.save.data.player.name) this.menu.askName();
  }

  // ───────────────────────────────── 조명
  buildLighting() {
    const s = this;
    const T = this.world.T;
    const WW = this.world.W * T, WH = this.world.H * T;
    this.overlay = s.add.image(0, 0, 'fx.white').setOrigin(0).setDisplaySize(WW, WH).setDepth(DEPTH.overlay).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.lights = [];
    const addLight = (x, y, scale, tint, kind, ref) => {
      const img = s.add.image(x, y, 'fx.light').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light).setScale(scale * 0.5).setTint(tint).setAlpha(0);
      this.lights.push({ img, kind, ref });
    };
    for (const [x, y] of this.world.data.lamps) {
      const c = this.world.center(x, y);
      const post = s.add.rectangle(c.x, c.y - 4, 4, 26, 0x4a4a58).setOrigin(0.5, 1).setDepth(c.y);
      s.add.circle(c.x, c.y - 30, 5, 0xfff1c4).setDepth(c.y);
      post.setData('lamp', true);
      addLight(c.x, c.y - 26, 1.3, 0xffd89a, 'lamp');
    }
    for (const h of this.world.houses) for (const w of h.windows) addLight(w.x, w.y + 4, 0.6, 0xffc870, 'window', h.id);
    for (const b of this.world.shops) {
      addLight((b.x + b.w / 2) * T, (b.y + b.h / 2) * T, 2.4, 0xffd08a, 'shop', b.id);
      addLight(b.front.x * T + T / 2, b.front.y * T, 0.8, 0xffd08a, 'shop', b.id);
    }
    // 바다 위 별
    const seaTop = this.world.seaRect.y;
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      const st = s.add.image(Math.random() * WW, seaTop + 8 + Math.random() * (WH - seaTop - 16), 'fx.star')
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light).setAlpha(0).setScale(0.3 + Math.random() * 0.4);
      this.stars.push({ img: st, phase: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 1.6 });
    }
  }

  updateSky(force = false) {
    const t = this.clock.state;
    const sky = this.dayNight.compute(t);
    this.sky = sky;
    this.overlay.setTint(sky.mult);
    this.world.seaRect.setFillStyle(sky.sea);
    for (const L of this.lights) {
      let on = 1;
      if (L.kind === 'window') {
        if (L.ref === 'player') on = 0.8;
        else {
          const inside = [...this.npcs.values()].filter((n) => n.hiddenIn === L.ref);
          on = inside.some((n) => n.activity !== 'sleep') ? 1 : 0;
        }
      } else if (L.kind === 'shop') {
        on = this.isOpen(L.ref) ? 1 : 0;
      }
      L.target = sky.lights * on;
      if (force) L.img.setAlpha(L.target);
    }
  }

  // ───────────────────────────────── 영업시간
  hoursFor(placeId, t = this.clock.state) {
    const p = this.places.places[placeId];
    if (!p?.hours) return null;
    const h = p.hours;
    return h[t.day] !== undefined ? h[t.day] : h[t.dayType] !== undefined ? h[t.dayType] : h.all ?? null;
  }

  isOpen(placeId, t = this.clock.state) {
    const hrs = this.hoursFor(placeId, t);
    if (!hrs) return false;
    return t.dayMin >= parseHM(hrs[0]) && t.dayMin < parseHM(hrs[1]);
  }

  playerInside(b) {
    const pt = this.world.tileOf(this.player.x, this.player.y - 4);
    return this.world.shopAt(pt.x, pt.y) === b;
  }

  // ───────────────────────────────── 대화
  baseCtx() {
    const t = this.clock.state;
    return { timeBand: t.timeBand, dayType: t.dayType, day: t.day, month: t.month };
  }

  textVars() {
    const t = this.clock.state;
    return { player: this.save.data.player.name || '이웃', time: this.clock.spokenTime(), weekday: DAY_KO[t.day] };
  }

  findTarget() {
    if (this.dialog.open) return null;
    const p = this.player;
    let best = null, bd = TALK_RANGE;
    for (const n of [...this.npcs.values(), ...this.pets]) {
      if (!n.visible) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < bd) { bd = d; best = { type: 'npc', npc: n }; }
    }
    if (best) return best;
    for (const h of this.world.houses) {
      const c = this.world.center(h.front.x, h.front.y);
      if (Math.hypot(c.x - p.x, c.y - p.y) < KNOCK_RANGE) return { type: 'door', house: h };
    }
    return null;
  }

  interact() {
    if (this.menu.isOpen()) return;
    if (this.dialog.open) { this.dialog.advance(); return; }
    const tg = this.findTarget();
    if (!tg) return;
    if (tg.type === 'npc') this.talkTo(tg.npc);
    else this.knock(tg.house);
  }

  talkTo(npc, context = 'talk') {
    const isPet = this.pets.includes(npc);
    const id = npc.id;
    if (npc.chatting && context === 'talk') {
      this.ambient.stop();
      this.bubbles.clearFor(npc);
      context = 'busy';
    }
    const present = [...this.npcs.values()].filter((n) => n !== npc && n.visible && n.place === npc.place).map((n) => n.id);
    const ctx = {
      ...this.baseCtx(),
      context,
      place: npc.place,
      activity: npc.activity,
      familiarity: this.save.familiarity(id),
      present,
      firstMeet: !this.save.hasMet(id),
      moving: npc.moving,
    };
    let line = this.dialogue.pick(id, ctx, this.save.npc(id));
    if (!line && context === 'busy') line = this.dialogue.pick(id, { ...ctx, context: 'talk' }, this.save.npc(id));
    if (!line) return;
    npc.paused = true;
    npc.faceTowards(this.player.x, this.player.y);
    this.player.face(dirTo(this.player, npc));
    this.player.frozen = true;
    const def = npc.def;
    const vars = this.textVars();
    this.dialog.show({ name: def.name, color: def.color, pages: line.pages.map((p) => fillText(p, vars)), narration: line.narration }, () => {
      npc.paused = false;
      this.player.frozen = false;
      const before = this.save.familiarity(id);
      this.save.recordTalk(id, line.id, this.clock.state.dateKey, new Date(this.clock.state.ms).toISOString());
      if (isPet) return;
      const after = this.save.familiarity(id);
      const vars = { name: def.name, level: LEVEL_KO[after], player: this.textVars().player };
      if (ctx.firstMeet) this.news.push({ time: this.clock.label().time, kind: 'me', text: this.news.event('firstMeet', vars) });
      else if (after > before) this.news.push({ time: this.clock.label().time, kind: 'me', text: this.news.event('levelUp', vars) });
      if (after > before) this.bubbles.show(npc, '♥', 1.6);
    });
  }

  knock(house) {
    const inside = [...this.npcs.values()].filter((n) => n.hiddenIn === house.id);
    const vars = this.textVars();
    if (house.id === 'player') {
      this.dialog.show({ narration: true, pages: ['(내 집이다. 아직 이삿짐 상자가 몇 개 남아 있다.)'] });
      return;
    }
    if (!inside.length) {
      this.dialog.show({ narration: true, pages: ['(똑똑… 대답이 없다. 지금은 집에 없는 것 같다.)'] });
      return;
    }
    const owners = inside.filter((n) => n.def.house === house.id);
    const pool = (owners.length ? owners : inside);
    const awake = pool.filter((n) => n.activity !== 'sleep');
    const who = (awake.length ? awake : pool)[Math.floor(Math.random() * (awake.length ? awake.length : pool.length))];
    const ctx = {
      ...this.baseCtx(),
      context: 'knock',
      place: 'home',
      activity: who.activity,
      familiarity: this.save.familiarity(who.id),
      present: inside.filter((n) => n !== who).map((n) => n.id),
      firstMeet: !this.save.hasMet(who.id),
      moving: false,
    };
    const line = this.dialogue.pick(who.id, ctx, this.save.npc(who.id));
    if (!line) {
      this.dialog.show({ narration: true, pages: ['(안에서 인기척은 나지만 대답은 없다.)'] });
      return;
    }
    this.player.frozen = true;
    this.dialog.show({
      name: line.narration ? '' : `${who.def.name} (문 너머)`,
      color: who.def.color,
      narration: line.narration,
      pages: line.pages.map((p) => fillText(p, vars)),
    }, () => {
      this.player.frozen = false;
      if (!line.narration) this.save.recordTalk(who.id, line.id, this.clock.state.dateKey, new Date(this.clock.state.ms).toISOString());
      else this.save.npc(who.id).recent = [...this.save.npc(who.id).recent, line.id].slice(-6);
    });
  }

  onTap(wx, wy) {
    if (this.menu.isOpen()) return;
    if (this.dialog.open) { this.dialog.advance(); return; }
    const p = this.player;
    // 주민/고양이 탭
    let hit = null, hd = 34;
    for (const n of [...this.npcs.values(), ...this.pets]) {
      if (!n.visible) continue;
      const d = Math.hypot(wx - n.x, wy - (n.y - n.sprite.displayHeight * 0.45));
      if (d < hd) { hd = d; hit = n; }
    }
    if (hit) {
      const n = hit;
      if (Math.hypot(n.x - p.x, n.y - p.y) < TALK_RANGE) { this.talkTo(n); return; }
      this.walkPlayerTo(this.world.tileOf(n.x, n.y - 4), () => {
        if (n.visible && Math.hypot(n.x - p.x, n.y - p.y) < TALK_RANGE + 20) this.talkTo(n);
      });
      return;
    }
    const tt = this.world.tileOf(wx, wy);
    // 집 탭 → 문 앞으로 가서 노크
    const house = this.world.houses.find((h) => tt.x >= h.x && tt.x < h.x + h.w && tt.y >= h.y - 1 && tt.y < h.y + h.h);
    if (house) {
      this.walkPlayerTo(house.front, () => { p.face('up'); this.knock(house); });
      return;
    }
    this.walkPlayerTo(tt);
  }

  onMinimapTap(tx, ty) {
    if (this.dialog.open || this.menu.isOpen()) return;
    const t = this.pf.nearestWalkable(tx, ty);
    if (t) this.walkPlayerTo(t);
  }

  walkPlayerTo(tile, onArrive) {
    const from = this.world.tileOf(this.player.x, this.player.y - 4);
    const path = this.pf.find(from.x, from.y, tile.x, tile.y);
    if (!path) return;
    this.player.setPath(path.map((q) => this.world.center(q.x, q.y)), onArrive);
  }

  // ───────────────────────────────── 루프
  update(time, delta) {
    const dt = Math.min(0.1, delta / 1000);
    const t = this.clock.update();

    // 주민
    for (const n of this.npcs.values()) n.update(dt, this.schedule.resolve(n.id, t), this.getNpc);
    for (const pet of this.pets) pet.update(dt);

    // 플레이어
    const k = this.keys;
    const ix = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const iy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const input = ix || iy ? { x: ix, y: iy } : this.touch.vec;
    const blocked = this.dialog.open || this.menu.isOpen();
    this.player.frozen = blocked;
    this.player.update(blocked ? { x: 0, y: 0 } : input);

    // 지붕: 플레이어가 들어간 가게만 투명
    for (const b of this.world.shops) {
      const inside = this.playerInside(b);
      const target = inside ? 0.12 : 1;
      b.roof.alpha += (target - b.roof.alpha) * Math.min(1, dt * 8);
      b.closedSign.setVisible(!this.isOpen(b.id));
    }

    // 조명·하늘 (1초마다 목표값, 매 프레임 부드럽게)
    this.skyTimer -= dt;
    if (this.skyTimer <= 0) { this.skyTimer = 1; this.updateSky(); }
    for (const L of this.lights) L.img.alpha += ((L.target ?? 0) - L.img.alpha) * Math.min(1, dt * 2);
    const lt = this.sky?.lights ?? 0;
    for (const s of this.stars) s.img.setAlpha(lt * (0.45 + 0.4 * Math.sin(time / 1000 * s.sp + s.phase)));

    this.ambient.update(dt);
    this.bubbles.update(dt);

    // 말걸기 표시
    const tg = blocked ? null : this.findTarget();
    if (tg) {
      const ax = tg.type === 'npc' ? tg.npc.x : this.world.center(tg.house.front.x, tg.house.front.y).x;
      const ay = tg.type === 'npc' ? tg.npc.y - tg.npc.sprite.displayHeight - 2 : (tg.house.y + tg.house.h) * this.world.T - 30;
      this.indicator.setPosition(ax, ay - (Math.sin(time / 200) + 1) * 2).setVisible(true).setText(tg.type === 'door' ? '🚪' : '💬');
    } else this.indicator.setVisible(false);
    this.updateTalkButton(tg, blocked);
    this.minimap.update(dt, this.sky);
    this.detectNews();
    this.news.updateNow(dt, (n) => this.describe(n));

    // HUD
    const ptile = this.world.tileOf(this.player.x, this.player.y - 4);
    const area = this.world.areaAt(ptile.x, ptile.y);
    const placeDef = this.places.places[area];
    let placeName = placeDef?.name ?? '';
    if (placeDef?.hours && !this.isOpen(area)) placeName += ' · 영업 전/후';
    this.hud.update(this.clock.label(), this.sky, placeName);

    // 저장
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 5; this.savePosition(); }

    if (this.debugOn && !this.debugEl.classList.contains('hidden')) this.renderDebug(t);
  }

  updateTalkButton(tg, blocked) {
    const dialogOpen = this.dialog.open;
    const show = IS_TOUCH ? !this.menu.isOpen() : (!!tg && !blocked) || dialogOpen;
    this.talkBtn.classList.toggle('hidden', !show);
    const state = dialogOpen ? 'next' : tg ? tg.type : 'none';
    if (this._talkState === state) return;
    this._talkState = state;
    const L = { next: ['▶', '다음'], npc: ['💬', '말걸기'], door: ['🚪', '노크'], none: ['💬', '말걸기'] }[state];
    this.talkIcon.textContent = L[0];
    this.talkLabel.textContent = L[1];
    this.talkBtn.classList.toggle('idle', state === 'none');
    this.talkBtn.classList.toggle('ready', state === 'npc' || state === 'door');
  }

  // ───────────────────────────────── 마을 소식
  placeName(area) {
    if (area === 'street') return '길';
    return this.places.places[area]?.name ?? '';
  }

  /** 스케줄 목표의 장소 이름 */
  targetName(target, npcId) {
    if (target.type === 'route') return this.newsData.routes?.[target.route] ?? '동네';
    if (target.type === 'follow') return `${this.npcs.get(target.npc)?.def.name ?? ''} 곁`;
    const [prefix, rest] = target.spot.split('.');
    if (prefix === 'home') {
      const own = this.npcs.get(npcId)?.def.house === rest;
      return own ? '집' : this.world.houseById(rest)?.label ?? '집';
    }
    return this.placeName(prefix);
  }

  newsTextFor(npcId, res) {
    const def = this.npcs.get(npcId).def;
    return this.news.activityText(npcId, res.activity, { name: def.name, place: this.targetName(res.target, npcId), player: this.textVars().player });
  }

  backfillNews() {
    const t = this.clock.state;
    const items = [];
    const prevAct = {}, prevShop = {};
    for (let m = 300; m <= Math.floor(t.dayMin); m++) {
      const tt = { ...t, dayMin: m };
      for (const n of this.npcs.values()) {
        const r = this.schedule.resolve(n.id, tt);
        if (prevAct[n.id] !== undefined && prevAct[n.id] !== r.activity) items.push({ m, text: this.newsTextFor(n.id, r) });
        prevAct[n.id] = r.activity;
      }
      for (const b of this.world.shops) {
        const o = this.isOpen(b.id, tt);
        if (prevShop[b.id] !== undefined && o !== prevShop[b.id]) items.push({ m, text: this.news.event(o ? 'shopOpen' : 'shopClose', { place: this.placeName(b.id) }) });
        prevShop[b.id] = o;
      }
    }
    const sr = Math.round(this.sky.sunrise), ss = Math.round(this.sky.sunset);
    if (t.dayMin >= sr) items.push({ m: sr, text: this.news.event('sunrise', {}) });
    if (t.dayMin >= ss) items.push({ m: ss, text: this.news.event('sunset', {}) });
    items.filter((i) => i.text).sort((a, b) => a.m - b.m).slice(-14)
      .forEach((i) => this.news.push({ time: fmt(i.m % 1440), text: i.text }));
    this.news.push({ time: this.clock.label().time, kind: 'me', text: this.news.event('welcome', { player: this.textVars().player }) });
    this.lastAct = Object.fromEntries([...this.npcs.values()].map((n) => [n.id, n.activity]));
    this.lastShop = Object.fromEntries(this.world.shops.map((b) => [b.id, this.isOpen(b.id)]));
    this.lastDay = t.clockMin >= this.sky.sunrise && t.clockMin < this.sky.sunset;
  }

  detectNews() {
    if (!this.lastAct) return;
    const t = this.clock.state;
    const time = this.clock.label().time;
    for (const n of this.npcs.values()) {
      if (this.lastAct[n.id] === n.activity) continue;
      this.lastAct[n.id] = n.activity;
      const text = this.newsTextFor(n.id, this.schedule.resolve(n.id, t));
      if (text) this.news.push({ time, text });
    }
    for (const b of this.world.shops) {
      const o = this.isOpen(b.id);
      if (o === this.lastShop[b.id]) continue;
      this.lastShop[b.id] = o;
      this.news.push({ time, text: this.news.event(o ? 'shopOpen' : 'shopClose', { place: this.placeName(b.id) }) });
    }
    const isDay = t.clockMin >= this.sky.sunrise && t.clockMin < this.sky.sunset;
    if (isDay !== this.lastDay) {
      this.lastDay = isDay;
      this.news.push({ time, text: this.news.event(isDay ? 'sunrise' : 'sunset', {}) });
    }
  }

  /** "지금 마을에서" 한 줄 */
  describe(n) {
    const label = stripTag(n.label);
    if (n.hiddenIn) {
      const own = n.hiddenIn === n.def.house;
      return { where: own ? '집 안' : this.world.houseById(n.hiddenIn)?.label ?? '집 안', what: label, inside: true };
    }
    const where = this.placeName(n.place) || '길';
    if (n.moving && n.goal?.kind === 'spot') {
      const dest = this.targetName({ type: 'spot', spot: n.goal.spot }, n.id);
      if (dest !== where) return { where, what: `${dest}(으)로 가는 중`.replace(/\(으\)로/, josaRo(dest)), inside: false };
    }
    return { where, what: label, inside: false };
  }

  savePosition() {
    const d = this.save.data.player;
    d.x = Math.round(this.player.x);
    d.y = Math.round(this.player.y);
    d.facing = this.player.facing;
    this.save.save();
  }

  applyZoom() {
    // 화면(CSS px) 크기 기준 확대율 × DPR (캔버스가 DPR 배 크기로 그려지므로)
    const w = this.scale.width / DPR, h = this.scale.height / DPR;
    const z = Math.max(1, Math.min(2.25, Math.min(w / 600, h / 430)));
    this.cameras.main.setZoom(z * DPR);
  }

  renderDebug(t) {
    if ((this._dbgT = (this._dbgT ?? 0) + 1) % 10) return;
    const lines = [
      `KST ${t.year}-${t.month}-${t.date} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')} | 논리일 ${t.dateKey} (${t.day}, ${t.dayType}) | ${t.timeBand} | x${this.clock.speed}`,
      `일출 ${fmt(this.sky.sunrise)} 일몰 ${fmt(this.sky.sunset)} | 어둠 ${this.sky.strength.toFixed(2)}`,
      '',
    ];
    for (const n of this.npcs.values()) {
      lines.push(`${n.def.name.padEnd(4)} ${n.hiddenIn ? `[집:${n.hiddenIn}]` : n.place.padEnd(10)} ${n.activity.padEnd(12)} ${n.label} ${n.moving ? '(이동중)' : ''}${n.chatting ? ' (대화중)' : ''} 친밀도 ${this.save.familiarity(n.id)}`);
    }
    lines.push('', '` 키로 숨기기 / ?t=2026-11-01T21:30&speed=60');
    this.debugEl.textContent = lines.join('\n');
  }
}

function josaRo(word) {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return '로';
  const jong = (ch - 0xac00) % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}

function fmt(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
}

function dirTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}
