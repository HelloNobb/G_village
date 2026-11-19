import Phaser from 'phaser';
import { Sim } from '../sim/Sim.js';
import { kst, hm } from '../sim/time.js';
import { buildBriefing } from '../sim/briefing.js';
import { DayNight } from '../systems/DayNight.js';
import { WorldMap, DEPTH } from '../map/MapBuilder.js';
import { SpeechBubbles } from '../ui/SpeechBubbles.js';
import { Hud } from '../ui/Hud.js';
import { InfoCard } from '../ui/InfoCard.js';
import { Panels } from '../ui/Panels.js';
import { CameraControls } from '../ui/CameraControls.js';
import { SaveStore } from '../ui/SaveStore.js';
import { DPR, CHAR_SCALE, texResolution } from '../config.js';

const DATA_KEYS = ['map', 'residents', 'needs', 'traits', 'actions', 'memory', 'romance', 'talk', 'news'];
const FONT = "'Gowun Dodum','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  create() {
    const J = (k) => this.cache.json.get(k);
    this.data_ = Object.fromEntries(DATA_KEYS.map((k) => [k, J(k)]));
    this.manifest = J('manifest');
    this.store = new SaveStore();
    this.dayNight = new DayNight(J('daylight'));

    // ── 시뮬레이션 불러오기 + 접속 안 한 동안 계산
    let state = this.store.load();
    let brief = null;
    if (!state) state = Sim.newState(this.data_, Date.now());
    this.sim = new Sim(this.data_, state);
    const away = Date.now() - (state.savedAt ?? Date.now());
    if (away > 60 * 1000 && state.speed > 0) {
      const res = this.sim.catchUp(away);
      brief = { ...res, days: buildBriefing(this.sim, res.events, res.fromDay, res.toDay) };
    }
    this.sim.out = [];

    // ── 맵
    this.world = new WorldMap(this, this.data_.map).build();
    const T = this.world.T;
    this.worldW = this.world.W * T;
    this.worldH = this.world.H * T;

    // ── 주민 그림
    this.views = new Map();
    for (const r of this.sim.list()) this.makeView(r);
    this.pets = this.sim.list().filter((r) => r.pet).map((r) => this.makePet(r));
    this.deskLabels = new Map();
    for (const r of this.sim.list()) {
      const s = this.data_.map.spots[r.desk];
      const label = this.add.text(s.desk.x * T + T / 2, s.desk.y * T - 2, '', {
        fontFamily: FONT, fontSize: '11px', color: '#fff', backgroundColor: 'rgba(45,42,50,0.82)', padding: { x: 4, y: 1 }, resolution: DPR * 3,
      }).setOrigin(0.5, 1).setDepth(s.desk.y * T + T);
      this.deskLabels.set(r.id, label);
    }

    this.buildLighting();
    this.bubbles = new SpeechBubbles(this);
    this.hud = new Hud();
    this.card = new InfoCard(this.sim);
    this.panels = new Panels(this.sim, { onSelect: () => {} });
    this.camCtl = new CameraControls(this, {
      worldW: this.worldW, worldH: this.worldH,
      onHover: (w, l) => this.hover(w, l),
      onTap: (w, l, type) => this.tap(w, l, type),
    });
    this.setupControls();

    this.saveTimer = 0;
    this.skyTimer = 0;
    this.updateSky(true);
    document.getElementById('loading').classList.add('hidden');
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('pagehide', () => this.save());
    if (brief && brief.events.length) this.showBriefing(brief);
    this.save();
  }

  // ───────────────────────────── 주민 그림
  makeView(r) {
    const scale = (1 / texResolution(this.manifest[r.sprite])) * CHAR_SCALE;
    const sprite = this.add.sprite(r.pos.x, r.pos.y, r.sprite, 0).setOrigin(0.5, 0.92).setScale(scale);
    const mood = this.add.text(r.pos.x, r.pos.y, '', { fontSize: '15px', resolution: DPR * 3 }).setOrigin(0.5, 1).setDepth(DEPTH.bubble - 1);
    const heart = this.add.text(r.pos.x, r.pos.y, '💕', { fontSize: '12px', resolution: DPR * 3 }).setOrigin(0.5, 1).setDepth(DEPTH.bubble - 1).setVisible(false);
    const homeDot = this.add.circle(0, 0, 6, Phaser.Display.Color.HexStringToColor(r.color).color).setStrokeStyle(2, 0xffffff).setDepth(DEPTH.bubble - 2).setVisible(false);
    const homeZ = this.add.text(0, 0, 'z', { fontFamily: FONT, fontSize: '11px', color: '#fff', resolution: DPR * 3 }).setOrigin(0.5).setDepth(DEPTH.bubble - 2).setVisible(false);
    const ring = this.add.ellipse(0, 0, 30, 12).setStrokeStyle(2.5, 0xffe28a).setDepth(1.5).setVisible(false);
    const view = { id: r.id, sprite, mood, heart, homeDot, homeZ, ring, x: r.pos.x, y: r.pos.y, top: r.pos.y - 60, visible: true };
    this.views.set(r.id, view);
    return view;
  }

  // 반려동물: 주인이 같이 산책할 때만 밖에 나와 주인이 지나간 자리를 따라감
  makePet(owner) {
    const p = owner.pet;
    const scale = (1 / texResolution(this.manifest[p.sprite])) * CHAR_SCALE;
    const sprite = this.add.sprite(owner.pos.x, owner.pos.y, p.sprite, 0).setOrigin(0.5, 0.9).setScale(scale).setVisible(false);
    return { owner: owner.id, pet: p, sprite, trail: [], facing: 'down', x: owner.pos.x, y: owner.pos.y, top: owner.pos.y, visible: false };
  }

  syncPets(dt) {
    for (const v of this.pets) {
      const o = this.sim.get(v.owner);
      const out = !o.hidden && o.action?.id === 'walk_cat';
      if (!out) { v.sprite.setVisible(false); v.visible = false; v.trail = []; continue; }
      if (!v.visible) { v.sprite.setPosition(o.pos.x + 16, o.pos.y + 2); v.trail = []; }
      v.visible = true;
      v.sprite.setVisible(true);
      const last = v.trail[v.trail.length - 1];
      if (!last || Math.hypot(last.x - o.pos.x, last.y - o.pos.y) > 6) v.trail.push({ x: o.pos.x, y: o.pos.y });
      // 발자취를 짧게(주인 뒤 약 1.5칸) 유지 → 바로 뒤를 따라다님
      while (v.trail.length > 1 && Math.hypot(v.trail[0].x - o.pos.x, v.trail[0].y - o.pos.y) > 48) v.trail.shift();
      if (Math.hypot(o.pos.x - v.sprite.x, o.pos.y - v.sprite.y) > 140) v.sprite.setPosition(v.trail[0].x, v.trail[0].y);
      let moving = false;
      if (v.trail.length > 1) {
        const p = v.trail[0];
        const dx = p.x - v.sprite.x, dy = p.y - v.sprite.y, d = Math.hypot(dx, dy);
        const step = Math.min(d, Math.max(60, d * 3) * dt);
        if (d > 1) {
          v.sprite.setPosition(v.sprite.x + (dx / d) * step, v.sprite.y + (dy / d) * step);
          v.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
          moving = true;
        }
        if (d < 3) v.trail.shift();
      }
      v.sprite.anims.play(`${v.pet.sprite}.${moving ? 'walk' : 'idle'}.${v.facing}`, true);
      v.sprite.setDepth(v.sprite.y);
      v.x = v.sprite.x; v.y = v.sprite.y; v.top = v.sprite.y - v.sprite.displayHeight;
    }
  }

  syncViews() {
    const sim = this.sim;
    const icons = sim.needsCfg.mood.icons;
    for (const r of sim.list()) {
      const v = this.views.get(r.id);
      const s = v.sprite;
      const visible = !r.hidden;
      s.setVisible(visible);
      s.setPosition(r.pos.x, r.pos.y);
      s.setDepth(r.pos.y);
      const moving = r.path.length > 0 && !sim.inTalk(r) && this.sim.state.speed > 0;
      const facing = sim.inTalk(r) || r.action?.phase === 'do' ? (r.facing ?? 'down') : r.facing ?? 'down';
      s.anims.play(`${r.sprite}.${moving ? 'walk' : 'idle'}.${facing}`, true);
      v.x = r.pos.x; v.y = r.pos.y; v.visible = visible;
      v.top = r.pos.y - s.displayHeight * 0.92;
      v.mood.setText(icons[sim.moodLevel(r)]).setPosition(r.pos.x + s.displayWidth * 0.35, v.top + 4).setVisible(visible);
      const k = Math.min(1.8, Math.max(0.8, DPR / this.cameras.main.zoom));
      v.mood.setScale(k);
      v.heart.setVisible(visible && !!r.action?.date).setPosition(r.pos.x - s.displayWidth * 0.35, v.top + 4).setScale(k);
      // 집 안이면 집 위에 색 점 (자는 중이면 z)
      if (r.hidden) {
        const h = this.world.houseById(r.hidden);
        const inside = sim.list().filter((x) => x.hidden === r.hidden);
        const i = inside.indexOf(r);
        const T = this.world.T;
        const cx = (h.x + h.w / 2) * T + (i - (inside.length - 1) / 2) * 16;
        const cy = (h.y + h.h) * T - 8;
        v.homeDot.setPosition(cx, cy).setVisible(true).setAlpha(sim.asleep(r) ? 0.55 : 1);
        v.homeZ.setPosition(cx, cy - 1).setVisible(sim.asleep(r));
        v.x = cx; v.y = cy + 8; v.top = cy - 8;
      } else { v.homeDot.setVisible(false); v.homeZ.setVisible(false); }
      v.ring.setVisible(this.panels.expanded.has(r.id) && visible).setPosition(r.pos.x, r.pos.y - 2);
      const label = this.deskLabels.get(r.id);
      const txt = `${r.name} Lv.${r.lv}`;
      if (label.text !== txt) label.setText(txt);
    }
  }

  // ───────────────────────────── 조명
  buildLighting() {
    const T = this.world.T;
    this.overlay = this.add.image(0, 0, 'fx.white').setOrigin(0).setDisplaySize(this.worldW, this.worldH).setDepth(DEPTH.overlay).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.lights = [];
    const add = (x, y, scale, tint, kind, ref) => {
      const img = this.add.image(x, y, 'fx.light').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light).setScale(scale * 0.5).setTint(tint).setAlpha(0);
      this.lights.push({ img, kind, ref });
    };
    for (const [x, y] of this.data_.map.lamps) {
      const c = this.world.center(x, y);
      this.add.rectangle(c.x, c.y - 4, 4, 26, 0x4a4a58).setOrigin(0.5, 1).setDepth(c.y);
      this.add.circle(c.x, c.y - 30, 5, 0xfff1c4).setDepth(c.y);
      add(c.x, c.y - 26, 1.3, 0xffd89a, 'lamp');
    }
    for (const h of this.world.houses) for (const w of h.windows) add(w.x, w.y + 4, 0.6, 0xffc870, 'window', h.id);
    for (const b of this.world.shops) add((b.x + b.w / 2) * T, (b.y + b.h / 2) * T, 2.2, 0xffd08a, 'facility', b.id);
    const seaTop = this.world.seaRect.y;
    this.stars = [];
    for (let i = 0; i < 45; i++) {
      const st = this.add.image(Math.random() * this.worldW, seaTop + 6 + Math.random() * (this.worldH - seaTop - 12), 'fx.star')
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light).setAlpha(0).setScale(0.3 + Math.random() * 0.4);
      this.stars.push({ img: st, phase: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6 });
    }
  }

  updateSky(force = false) {
    const t = this.sim.clock();
    const sky = this.dayNight.compute(t);
    this.sky = sky;
    this.overlay.setTint(sky.mult);
    this.world.seaRect.setFillStyle(sky.sea);
    const list = this.sim.list();
    for (const L of this.lights) {
      let on = 1;
      if (L.kind === 'window') on = list.some((r) => r.hidden === L.ref && !this.sim.asleep(r)) ? 1 : 0;
      else if (L.kind === 'facility') on = list.some((r) => this.sim.area(r) === L.ref) ? 1 : 0.35;
      L.target = sky.lights * on;
      if (force) L.img.setAlpha(L.target);
    }
  }

  // ───────────────────────────── 고르기 (호버·탭)
  pick(w) {
    if (!w) return null;
    let best = null, bd = 30;
    for (const r of this.sim.list()) {
      const v = this.views.get(r.id);
      const d = r.hidden ? Math.hypot(w.x - v.homeDot.x, w.y - v.homeDot.y) * 2.2 : Math.hypot(w.x - r.pos.x, w.y - (r.pos.y - v.sprite.displayHeight * 0.45));
      if (d < Math.max(bd, v.sprite.displayHeight * 0.5) && d < (best?.d ?? Infinity)) best = { id: r.id, d };
    }
    return best?.id ?? null;
  }

  pickPet(w) {
    if (!w) return null;
    return this.pets.find((v) => v.visible && Math.hypot(w.x - v.x, w.y - (v.y - 10)) < 22) ?? null;
  }

  hover(w, l) {
    const pet = this.pickPet(w);
    if (pet) { this.card.showPet(pet, this.sim.get(pet.owner), { x: l.x, y: l.y }); return; }
    const id = this.pick(w);
    if (id) this.card.show(id, { x: l.x, y: l.y });
    else this.card.hide();
    this.game.canvas.style.cursor = id ? 'pointer' : 'default';
  }

  tap(w, l, type) {
    const pet = this.pickPet(w);
    if (pet) { this.card.showPet(pet, this.sim.get(pet.owner), { x: l.x, y: l.y, pinned: true }); return; }
    const id = this.pick(w);
    if (id) this.card.show(id, { x: l.x, y: l.y, pinned: true });
    else this.card.hide(true);
  }

  select(id) {
    const r = this.sim.get(id);
    const cam = this.cameras.main;
    const p = cam.worldView;
    const frame = document.getElementById('frame').getBoundingClientRect();
    let x = frame.width / 2, y = frame.height / 2;
    if (!r.hidden) {
      x = ((r.pos.x - p.x) / p.width) * frame.width;
      y = ((r.pos.y - p.y) / p.height) * frame.height;
    }
    this.card.hide(true);
    this.card.show(id, { x, y, pinned: true });
  }

  // ───────────────────────────── 상단 버튼
  setupControls() {
    const speedBtns = [...document.querySelectorAll('#speed button')];
    const allowed = speedBtns.map((b) => Number(b.dataset.speed));
    if (!allowed.includes(this.sim.state.speed)) this.sim.state.speed = allowed.reduce((a, b) => (Math.abs(b - this.sim.state.speed) < Math.abs(a - this.sim.state.speed) ? b : a));
    const mark = () => speedBtns.forEach((b) => b.classList.toggle('on', Number(b.dataset.speed) === this.sim.state.speed));
    speedBtns.forEach((b) => b.addEventListener('click', () => { this.sim.state.speed = Number(b.dataset.speed); mark(); this.save(); }));
    mark();
    document.getElementById('btn-export').addEventListener('click', () => this.store.exportFile(this.sim.state, this.sim.day));
    const file = document.getElementById('import-file');
    document.getElementById('btn-import').addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      try {
        const st = await this.store.importFile(f);
        // 파일의 저장 시각을 그대로 둬야 그 뒤로 흐른 시간(최대 3일)을 이어서 계산함
        st.savedAt = st.savedAt ?? Date.now();
        this.skipSave = true;
        localStorage.setItem('g-village:save:v2', JSON.stringify(st));
        location.reload();
      } catch (e) {
        alert(`불러오지 못했어요: ${e.message}`);
      }
    });
    const modal = document.getElementById('reset-modal');
    document.getElementById('btn-reset').addEventListener('click', () => modal.classList.remove('hidden'));
    document.getElementById('reset-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('reset-ok').addEventListener('click', () => {
      const random = document.getElementById('reset-random').checked;
      const st = Sim.newState(this.data_, Date.now(), { randomTraits: random });
      this.store.save(st);
      this.skipSave = true;
      location.reload();
    });
    document.getElementById('brief-close').addEventListener('click', () => document.getElementById('brief-modal').classList.add('hidden'));
  }

  showBriefing(b) {
    const hrs = Math.round(b.span / 3600000);
    document.getElementById('brief-sub').textContent = `${hrs >= 24 ? `${Math.floor(hrs / 24)}일 ${hrs % 24}시간` : `${hrs}시간`} 동안 마을에 이런 일이 있었어요.${b.capped ? ' (최대 3일까지만 계산해요)' : ''}`;
    const T = this.sim.traits;
    document.getElementById('brief-body').innerHTML = b.days.map((d) => `<div class="brief-day"><h3>Day ${d.day}</h3><ul>${d.items.map((i) => `<li>${i.trait ? `<b>[${esc(T.defs[i.trait]?.name)}]</b> ` : ''}${esc(i.text)}</li>`).join('')}</ul></div>`).join('');
    document.getElementById('brief-modal').classList.remove('hidden');
  }

  save() {
    if (this.skipSave) return;
    this.store.save(this.sim.state);
  }

  // ───────────────────────────── 루프
  update(time, delta) {
    const dt = Math.min(0.25, delta / 1000);
    const speed = this.sim.state.speed;
    if (speed > 0) {
      // 빠른 배속에서도 계산이 촘촘하도록 한 프레임을 여러 번으로 쪼개서 진행
      this.sim.advance(dt * speed, speed >= 300 ? 5 : 2);
    } else {
      this.sim.state.savedAt = Date.now();
    }
    // 시뮬레이션이 보낸 이벤트
    const busy = speed >= 300; // 아주 빠를 땐 말풍선을 일부만 (소식에는 전부 남음)
    for (const ev of this.sim.out) {
      const v = this.views.get(ev.who);
      if (busy && ev.kind !== 'news' && Math.random() > 0.15) continue;
      if (ev.kind === 'say' && v) this.bubbles.show(v, ev.text, 3.2, ev.delay ?? 0);
      else if (ev.kind === 'tag' && v) this.bubbles.tag(v, ev.text);
      else if (ev.kind === 'news' && ev.item.text) this.panels.addNews(ev.item);
    }
    this.sim.out.length = 0;

    this.syncViews();
    this.syncPets(dt);
    this.bubbles.update(dt);
    this.skyTimer -= dt;
    if (this.skyTimer <= 0) { this.skyTimer = 1; this.updateSky(); }
    for (const L of this.lights) L.img.alpha += ((L.target ?? 0) - L.img.alpha) * Math.min(1, dt * 2);
    const lt = this.sky?.lights ?? 0;
    for (const s of this.stars) s.img.setAlpha(lt * (0.45 + 0.4 * Math.sin((time / 1000) * s.sp + s.phase)));
    this.hud.update(this.sky);
    this.card.update(dt);
    this.panels.update(dt);

    const t = kst(this.sim.now);
    document.getElementById('day-label').textContent = `Day ${this.sim.day}`;
    document.getElementById('time-label').textContent = `${t.month}/${t.date}(${t.dayKo}) ${hm(this.sim.now)}`;

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 10; this.save(); }
  }
}
