// 마을 저장: 브라우저 localStorage (탭·브라우저를 닫아도 남음) + 파일 내보내기/불러오기
const KEY = 'g-village:save:v2';
const OLD_KEYS = ['village-sim:save:v1'];

export class SaveStore {
  constructor() {
    try { for (const k of OLD_KEYS) localStorage.removeItem(k); } catch { /* 무시 */ }
    // 브라우저가 공간이 부족할 때 이 사이트 데이터를 지우지 않도록 요청 (지원하는 브라우저만)
    try { navigator.storage?.persist?.(); } catch { /* 무시 */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s?.version === 2 ? s : null;
    } catch {
      return null;
    }
  }

  save(state) {
    state.savedAt = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  clear() {
    try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  }

  /** 지금 마을을 JSON 파일로 내려받기 */
  exportFile(state, day) {
    state.savedAt = Date.now();
    const payload = { app: 'g-village', version: 2, exportedAt: new Date().toISOString(), state };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `g-village_Day${day}_${stamp}.json`;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /** 파일에서 마을 읽기 → state (형식이 틀리면 오류) */
  async importFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    const state = data?.app === 'g-village' ? data.state : data;
    if (!state || state.version !== 2 || !state.residents || !state.rel) throw new Error('G village 마을 파일이 아니에요.');
    return state;
  }
}
