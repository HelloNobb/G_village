// localStorage 저장. 저장이 막힌 환경(시크릿 모드 등)에서도 게임은 계속 돈다.

const KEY = 'village-sim:save:v1';
const VERSION = 1;
export const FAMILIARITY_LEVELS = [0, 2, 5, 10]; // 레벨 n에 필요한 누적 포인트

function blank() {
  return {
    version: VERSION,
    player: { name: '', x: null, y: null, facing: 'down' },
    npcs: {},
    flags: {},
    settings: { ambientBubbles: true },
    lastPlayed: null,
  };
}

export class SaveSystem {
  constructor() {
    this.data = blank();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION) this.data = { ...blank(), ...parsed, settings: { ...blank().settings, ...parsed.settings } };
      }
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
  }

  npc(id) {
    if (!this.data.npcs[id]) this.data.npcs[id] = { points: 0, talkDays: [], lastTalk: null, seen: [], recent: [] };
    return this.data.npcs[id];
  }

  familiarity(id) {
    const p = this.npc(id).points;
    let lv = 0;
    FAMILIARITY_LEVELS.forEach((need, i) => { if (p >= need) lv = i; });
    return lv;
  }

  hasMet(id) {
    return !!this.data.flags[`met.${id}`];
  }

  /** 대화 1회 기록. 하루(KST 논리일)에 첫 대화만 친밀도 +1 */
  recordTalk(id, lineId, dateKey, isoNow) {
    const n = this.npc(id);
    if (lineId) {
      if (!n.seen.includes(lineId)) n.seen.push(lineId);
      n.recent = [...n.recent.filter((x) => x !== lineId), lineId].slice(-6);
    }
    let gained = false;
    if (!n.talkDays.includes(dateKey)) {
      n.talkDays = [...n.talkDays, dateKey].slice(-30);
      n.points += 1;
      gained = true;
    }
    n.lastTalk = isoNow;
    this.data.flags[`met.${id}`] = true;
    this.save();
    return gained;
  }

  save() {
    this.data.lastPlayed = new Date().toISOString();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* 무시 */
    }
  }

  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 무시 */
    }
    this.data = blank();
  }
}
