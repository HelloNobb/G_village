// 플레이스홀더 텍스처 생성기.
// 규칙: 게임 코드는 텍스처 "키"만 안다. 같은 키로 실제 이미지가 로드돼 있으면 여기서는 아무것도 만들지 않는다.
// → public/assets/manifest.json 에서 type 을 "spritesheet"/"image" 로 바꾸고 url 만 주면 교체 끝.

import { TEX } from '../config.js';

export const DIRS = ['down', 'left', 'right', 'up'];
export const FRAMES_PER_DIR = 3; // 프레임 배치: down 0-2, left 3-5, right 6-8, up 9-11 (0 = 서 있기)

const FONT = "'Gowun Dodum','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hexColor, amt) {
  const n = parseInt(hexColor.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export class PlaceholderFactory {
  constructor(scene) {
    this.scene = scene;
    this.textures = scene.textures;
  }

  has(key) {
    return this.textures.exists(key);
  }

  canvas(key, w, h) {
    const tex = this.textures.createCanvas(key, w, h);
    return { tex, ctx: tex.getContext() };
  }

  /** manifest 전체 처리 */
  ensureAll(manifest, map) {
    for (const [key, spec] of Object.entries(manifest)) {
      if (key.startsWith('_') || this.has(key)) continue;
      if (spec.type === 'placeholder-character') this.character(key, spec);
      else if (spec.type === 'placeholder-house') this.house(key, spec, map.buildings.find((b) => `bld.${b.id}` === key));
      else if (spec.type === 'placeholder-roof') this.roof(key, spec, map.buildings.find((b) => `roof.${b.id}` === key));
    }
    if (!this.has('tiles')) this.tileset(map, manifest.tiles ?? {});
    if (!this.has('fx.light')) this.light();
    if (!this.has('fx.star')) this.star();
  }

  // ── 캐릭터 (4방향 × 3프레임) ─────────────────────────────
  character(key, spec) {
    const fw = spec.frameWidth ?? 32;
    const fh = spec.frameHeight ?? 48;
    const { tex, ctx } = this.canvas(key, fw * 12 * TEX, fh * TEX);
    DIRS.forEach((dir, d) => {
      for (let f = 0; f < FRAMES_PER_DIR; f++) {
        const ox = (d * FRAMES_PER_DIR + f) * fw;
        ctx.save();
        ctx.scale(TEX, TEX);
        ctx.translate(ox, 0);
        if (spec.shape === 'cat') this.drawCat(ctx, fw, fh, spec, dir, f);
        else this.drawPerson(ctx, fw, fh, spec, dir, f);
        ctx.restore();
        tex.add(d * FRAMES_PER_DIR + f, 0, ox * TEX, 0, fw * TEX, fh * TEX);
      }
    });
    tex.refresh();
  }

  drawPerson(ctx, fw, fh, s, dir, f) {
    const w = s.w ?? 20;
    const h = s.h ?? 38;
    const bob = f === 0 ? 0 : -1.5;
    const step = f === 1 ? 2 : f === 2 ? -2 : 0;
    const cx = fw / 2;
    const bottom = fh - 3;
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, bottom, w * 0.55, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 다리
    ctx.fillStyle = shade(s.color, -60);
    const legW = Math.max(3, w * 0.22);
    ctx.fillRect(cx - w * 0.28 - legW / 2 + (dir === 'left' || dir === 'right' ? step : 0), bottom - 7 + (f === 1 ? -1 : 0), legW, 7);
    ctx.fillRect(cx + w * 0.28 - legW / 2 - (dir === 'left' || dir === 'right' ? step : 0), bottom - 7 + (f === 2 ? -1 : 0), legW, 7);
    // 몸
    const top = bottom - h + bob;
    const round = s.shape === 'round';
    ctx.fillStyle = s.color;
    ctx.strokeStyle = 'rgba(40,30,50,0.85)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx - w / 2, top + h * 0.32, w, h * 0.68 - 5, round ? w * 0.45 : 6);
    ctx.fill();
    ctx.stroke();
    // 머리
    const headR = round ? w * 0.48 : w * 0.44;
    const headY = top + headR + 1;
    ctx.fillStyle = s.skin ?? '#f5dcc4';
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // 머리카락
    ctx.fillStyle = s.hair ?? '#333';
    ctx.beginPath();
    if (dir === 'up') ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    else ctx.arc(cx, headY, headR, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    if (s.hairStyle === 'long') {
      const len = h * 0.42;
      if (dir !== 'right') ctx.fillRect(cx - headR - 1, headY - 2, 4, len);
      if (dir !== 'left') ctx.fillRect(cx + headR - 3, headY - 2, 4, len);
      if (dir === 'up') ctx.fillRect(cx - headR, headY, headR * 2, len);
    }
    // 얼굴 방향
    ctx.fillStyle = '#2d2a32';
    if (dir === 'down') {
      ctx.fillRect(cx - 4, headY + 1, 2, 3);
      ctx.fillRect(cx + 2, headY + 1, 2, 3);
    } else if (dir === 'left') ctx.fillRect(cx - headR + 3, headY + 1, 2, 3);
    else if (dir === 'right') ctx.fillRect(cx + headR - 5, headY + 1, 2, 3);
    // 장식 (반짝이는 점)
    if (s.detail === 'sparkle' && dir !== 'up') {
      ctx.fillStyle = '#fff6a8';
      ctx.fillRect(cx + (dir === 'left' ? -headR : headR - 2), headY + 3, 2, 2);
      ctx.fillRect(cx - 2, top + h * 0.45, 3, 3);
    }
    // 이름 글자
    if (s.label && dir !== 'up') {
      ctx.fillStyle = s.labelColor ?? 'rgba(255,255,255,0.95)';
      ctx.font = `bold 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.label, cx, top + h * 0.62);
    }
  }

  drawCat(ctx, fw, fh, s, dir, f) {
    const cx = fw / 2;
    const bottom = fh - 3;
    const bob = f === 0 ? 0 : -1;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, bottom, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.color ?? '#1a1a1a';
    const horiz = dir === 'left' || dir === 'right';
    ctx.beginPath();
    ctx.ellipse(cx, bottom - 5 + bob, horiz ? 9 : 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const hx = dir === 'left' ? cx - 7 : dir === 'right' ? cx + 7 : cx;
    const hy = bottom - 11 + bob + (dir === 'up' ? -1 : 0);
    ctx.beginPath();
    ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy - 2); ctx.lineTo(hx - 3, hy - 8); ctx.lineTo(hx - 1, hy - 3);
    ctx.moveTo(hx + 5, hy - 2); ctx.lineTo(hx + 3, hy - 8); ctx.lineTo(hx + 1, hy - 3);
    ctx.fill();
    // 꼬리
    ctx.strokeStyle = s.color ?? '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const tx = dir === 'left' ? cx + 8 : dir === 'right' ? cx - 8 : cx + 5;
    ctx.moveTo(tx, bottom - 6);
    ctx.quadraticCurveTo(tx + (f === 1 ? 4 : -2), bottom - 16, tx + 2, bottom - 18);
    ctx.stroke();
    if (dir !== 'up') {
      ctx.fillStyle = '#f2d34a';
      if (dir !== 'right') ctx.fillRect(hx - 3, hy - 1, 2, 2);
      if (dir !== 'left') ctx.fillRect(hx + 1, hy - 1, 2, 2);
    }
  }

  // ── 타일셋 ───────────────────────────────────────────────
  // 타일 경계 틈(seam) 방지: 각 타일 둘레를 1px 늘려 그린다 → margin 1, spacing 2
  tileset(map) {
    const T = map.tileSize;
    const P = T * TEX;
    const chars = Object.keys(map.legend);
    const slot = P + 2;
    const { tex, ctx } = this.canvas('tiles', slot * chars.length, slot);
    const tmp = document.createElement('canvas');
    tmp.width = P; tmp.height = P;
    const tctx = tmp.getContext('2d');
    chars.forEach((ch, i) => {
      tctx.clearRect(0, 0, P, P);
      tctx.save();
      tctx.scale(TEX, TEX);
      this.drawTile(tctx, map.legend[ch].name, T, i);
      tctx.restore();
      const x = i * slot + 1, y = 1;
      ctx.drawImage(tmp, x, y);
      // 가장자리 늘리기
      ctx.drawImage(tmp, 0, 0, P, 1, x, y - 1, P, 1);
      ctx.drawImage(tmp, 0, P - 1, P, 1, x, y + P, P, 1);
      ctx.drawImage(tmp, 0, 0, 1, P, x - 1, y, 1, P);
      ctx.drawImage(tmp, P - 1, 0, 1, P, x + P, y, 1, P);
      ctx.drawImage(tmp, 0, 0, 1, 1, x - 1, y - 1, 1, 1);
      ctx.drawImage(tmp, P - 1, 0, 1, 1, x + P, y - 1, 1, 1);
      ctx.drawImage(tmp, 0, P - 1, 1, 1, x - 1, y + P, 1, 1);
      ctx.drawImage(tmp, P - 1, P - 1, 1, 1, x + P, y + P, 1, 1);
    });
    tex.refresh();
    tex.customData = { tileSize: P, margin: 1, spacing: 2 };
  }

  drawTile(ctx, name, T, seed) {
    const r = rand(seed * 977 + 13);
    const dots = (color, n, size = 2) => {
      ctx.fillStyle = color;
      for (let k = 0; k < n; k++) ctx.fillRect(Math.floor(r() * (T - size)), Math.floor(r() * (T - size)), size, size);
    };
    switch (name) {
      case 'grass':
        ctx.fillStyle = '#8fcf7a'; ctx.fillRect(0, 0, T, T);
        dots('#7dbd69', 10); dots('#a6dc90', 5);
        break;
      case 'path':
        ctx.fillStyle = '#e6d3a3'; ctx.fillRect(0, 0, T, T);
        dots('#d6c08b', 8); dots('#efe0b9', 4);
        break;
      case 'plaza':
        ctx.fillStyle = '#ddd5c6'; ctx.fillRect(0, 0, T, T);
        ctx.strokeStyle = '#c7bead'; ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, T / 2, T / 2); ctx.strokeRect(T / 2 + 0.5, T / 2 + 0.5, T / 2 - 1, T / 2 - 1);
        break;
      case 'sand':
        ctx.fillStyle = '#f1dfaa'; ctx.fillRect(0, 0, T, T);
        dots('#e2cc8e', 9, 1); dots('#fff1c8', 5, 1);
        break;
      case 'sea':
        // 바다 색은 DayNight가 아래 사각형으로 칠한다. 타일은 물결만.
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(4, 10); ctx.quadraticCurveTo(9, 6, 14, 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(18, 24); ctx.quadraticCurveTo(23, 20, 28, 24); ctx.stroke();
        break;
      case 'floor':
        ctx.fillStyle = '#ead9bd'; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = '#dbc7a6'; ctx.fillRect(0, T / 2 - 1, T, 1); ctx.fillRect(0, T - 1, T, 1);
        ctx.fillRect(T / 3, 0, 1, T / 2); ctx.fillRect((T * 2) / 3, T / 2, 1, T / 2);
        break;
      case 'wall':
        ctx.fillStyle = '#8a6f5a'; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = '#7a604c'; ctx.fillRect(0, T - 5, T, 5);
        break;
      case 'door':
        ctx.fillStyle = '#ead9bd'; ctx.fillRect(0, 0, T, T);
        ctx.fillStyle = '#b98a5a'; ctx.fillRect(3, 3, T - 6, T - 6);
        break;
      // ── 장식 레이어(배경 투명) ──
      case 'tree':
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(T / 2, T - 4, 11, 4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#7a5236'; ctx.fillRect(T / 2 - 3, T - 12, 6, 9);
        ctx.fillStyle = '#3f8f4f'; ctx.beginPath(); ctx.arc(T / 2, T / 2 - 3, 12, 0, 7); ctx.fill();
        ctx.fillStyle = '#56a862'; ctx.beginPath(); ctx.arc(T / 2 - 4, T / 2 - 7, 6, 0, 7); ctx.fill();
        break;
      case 'flowers': {
        ctx.fillStyle = '#86c873'; ctx.fillRect(0, 0, T, T);
        const cols = ['#ff8fb1', '#ffd86b', '#ffffff', '#c59bff', '#ff9a6a'];
        for (let k = 0; k < 9; k++) {
          ctx.fillStyle = cols[Math.floor(r() * cols.length)];
          const x = 3 + r() * (T - 6), y = 3 + r() * (T - 6);
          ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill();
        }
        break;
      }
      case 'bench':
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(2, T - 8, T - 4, 5);
        ctx.fillStyle = '#9b6b43'; ctx.fillRect(1, 10, T - 2, 5); ctx.fillRect(1, 17, T - 2, 5);
        ctx.fillStyle = '#6e4a2e'; ctx.fillRect(3, 22, 3, 6); ctx.fillRect(T - 6, 22, 3, 6);
        break;
      case 'furniture':
        ctx.fillStyle = '#a0764f'; ctx.fillRect(1, 3, T - 2, T - 6);
        ctx.fillStyle = '#b98c62'; ctx.fillRect(1, 3, T - 2, 6);
        break;
      case 'fountain':
        // 분수 모양은 MapBuilder 가 영역 전체에 하나로 그린다. 타일은 바닥만.
        ctx.fillStyle = '#ddd5c6'; ctx.fillRect(0, 0, T, T);
        break;
      case 'house':
      default:
        break;
    }
  }

  // ── 건물 ─────────────────────────────────────────────────
  house(key, s, b) {
    if (!b) return;
    const T = 32;
    const W = b.w * T, H = b.h * T + 12;
    const { tex, ctx } = this.canvas(key, W * TEX, H * TEX);
    ctx.scale(TEX, TEX);
    const wallTop = H * 0.48;
    // 벽
    ctx.fillStyle = s.wall ?? '#f3e3c8';
    ctx.fillRect(4, wallTop, W - 8, H - wallTop - 2);
    ctx.strokeStyle = 'rgba(40,30,50,0.7)'; ctx.lineWidth = 2;
    ctx.strokeRect(4, wallTop, W - 8, H - wallTop - 2);
    // 지붕
    ctx.fillStyle = s.roof ?? '#c96b4a';
    ctx.beginPath();
    ctx.moveTo(0, wallTop + 6); ctx.lineTo(W * 0.18, 4); ctx.lineTo(W * 0.82, 4); ctx.lineTo(W, wallTop + 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let y = 14; y < wallTop; y += 10) ctx.fillRect(W * 0.12, y, W * 0.76, 2);
    // 문
    const dx = (b.door.x - b.x) * T + T / 2;
    ctx.fillStyle = s.door ?? '#8a5a3a';
    roundRect(ctx, dx - 9, H - 30, 18, 28, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2d34a'; ctx.fillRect(dx + 4, H - 17, 3, 3);
    // 창문 (어두운 유리, 불빛은 라이트 스프라이트로)
    ctx.fillStyle = '#5b6f86';
    const wy = wallTop + 12;
    const win = [dx - 9 - 30, dx + 9 + 12].filter((x) => x > 8 && x + 18 < W - 8);
    for (const x of win) { ctx.fillRect(x, wy, 18, 14); ctx.strokeRect(x, wy, 18, 14); }
    // 이름표
    ctx.font = `bold 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(b.label, W / 2, wallTop * 0.55);
    tex.refresh();
    tex.customData = { windows: win.map((x) => ({ x: (x + 9) * TEX, y: (wy + 7) * TEX })) };
  }

  roof(key, s, b) {
    if (!b) return;
    const T = 32;
    const W = b.w * T, H = b.h * T;
    const { tex, ctx } = this.canvas(key, W * TEX, H * TEX);
    ctx.scale(TEX, TEX);
    ctx.fillStyle = s.roof ?? '#6a7fb0';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let y = 8; y < H; y += 12) ctx.fillRect(0, y, W, 3);
    ctx.strokeStyle = 'rgba(40,30,50,0.75)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    // 문 표시
    const dx = (b.door.x - b.x) * T, dy = (b.door.y - b.y) * T;
    ctx.fillStyle = s.door ?? '#b98a5a';
    ctx.fillRect(dx + 4, dy + 4, T - 8, T - 8);
    // 간판
    ctx.font = `bold 18px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(b.label).width + 24;
    ctx.fillStyle = s.sign ?? '#fff7e6';
    roundRect(ctx, W / 2 - tw / 2, H / 2 - 16, tw, 32, 8); ctx.fill();
    ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#2d2a32';
    ctx.fillText(b.label, W / 2, H / 2 + 1);
    tex.refresh();
  }

  light() {
    const S = 256;
    const { tex, ctx } = this.canvas('fx.light', S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    tex.refresh();
  }

  star() {
    const { tex, ctx } = this.canvas('fx.star', 8, 8);
    ctx.fillStyle = '#fff'; ctx.fillRect(3, 0, 2, 8); ctx.fillRect(0, 3, 8, 2);
    tex.refresh();
  }
}
