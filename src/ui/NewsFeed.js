// 오른쪽 패널: "지금 마을에서"(주민 현재 위치) + "마을 소식"(시간순 소식 피드)
// 문구는 public/data/news.json 에서 고칠 수 있다. {name:이} 처럼 쓰면 받침에 맞춰 이/가 를 붙인다.

const PAIRS = { 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'], 와: ['과', '와'], 과: ['과', '와'], 으로: ['으로', '로'], 로: ['으로', '로'] };

export function josa(word, j) {
  const pair = PAIRS[j];
  if (!pair) return word + j;
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return word + pair[1];
  const jong = (ch - 0xac00) % 28;
  if (j === '으로' || j === '로') return word + (jong === 0 || jong === 8 ? '로' : '으로'); // 받침 없음/ㄹ → 로
  return word + (jong ? pair[0] : pair[1]);
}

export function fillNews(tpl, vars) {
  return tpl.replace(/\{(\w+)(?::([가-힣]+))?\}/g, (m, k, j) => {
    const v = vars[k];
    if (v == null) return m;
    return j ? josa(String(v), j) : String(v);
  });
}

const MAX = 80;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class NewsFeed {
  constructor(scene, data) {
    this.scene = scene;
    this.data = data;
    this.list = document.getElementById('news-list');
    this.nowList = document.getElementById('now-list');
    this.count = 0;
    this.nowTimer = 0;
    this.nowRows = new Map();
    for (const def of scene.npcData.residents) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:${def.color}"></span><span class="who">${esc(def.name)}</span><span class="where"></span>`;
      this.nowList.append(li);
      this.nowRows.set(def.id, li);
    }
  }

  /** 템플릿 찾기: "<npc>.<activity>" > "<activity>" */
  activityText(npcId, activity, vars) {
    const a = this.data.activity ?? {};
    const own = this.data.npcActivity ?? {};
    const key = `${npcId}.${activity}`;
    const tpl = key in own ? own[key] : a[activity]; // null = 이 주민은 소식 안 띄움
    if (!tpl) return null;
    return fillNews(tpl, vars);
  }

  event(key, vars) {
    const tpl = this.data.events?.[key];
    return tpl ? fillNews(tpl, vars) : null;
  }

  /** @param {{time:string, text:string, kind?:string}} item */
  push(item, { prepend = true } = {}) {
    if (!item.text) return;
    const li = document.createElement('li');
    if (item.kind) li.className = item.kind;
    li.innerHTML = `<span class="t">${esc(item.time)}</span><span class="msg">${item.html ?? esc(item.text)}</span>`;
    if (prepend) this.list.prepend(li);
    else this.list.append(li);
    this.count++;
    while (this.list.children.length > MAX) this.list.lastElementChild.remove();
  }

  pushChat(time, placeName, lines, nameOf) {
    const body = lines.map((l) => `<span class="line"><b>${esc(nameOf(l.s))}</b> ${esc(l.t)}</span>`).join('');
    this.push({ time, kind: 'chat', text: 'chat', html: `${placeName ? `<span class="place">${esc(placeName)}</span>` : ''}${body}` });
  }

  /** "지금 마을에서" 목록 갱신 */
  updateNow(dt, describe) {
    this.nowTimer -= dt;
    if (this.nowTimer > 0) return;
    this.nowTimer = 0.7;
    for (const n of this.scene.npcs.values()) {
      const li = this.nowRows.get(n.id);
      const { where, what, inside } = describe(n);
      const html = `<b>${esc(where)}</b>${what ? ` · ${esc(what)}` : ''}`;
      const el = li.querySelector('.where');
      if (el.innerHTML !== html) el.innerHTML = html;
      li.classList.toggle('inside', inside);
    }
  }
}
