// 한국어 조사 처리: {name:이} → 핀이 / 데이지가
const PAIRS = { 이: ['이', '가'], 가: ['이', '가'], 은: ['은', '는'], 는: ['은', '는'], 을: ['을', '를'], 를: ['을', '를'], 와: ['과', '와'], 과: ['과', '와'], 아: ['아', '야'], 야: ['아', '야'], 이랑: ['이랑', '랑'], 랑: ['이랑', '랑'], 예요: ['이에요', '예요'], 이에요: ['이에요', '예요'], 라고: ['이라고', '라고'], 이라고: ['이라고', '라고'] };

export function josa(word, j) {
  const w = String(word);
  if (j === '으로' || j === '로') {
    const c = w.charCodeAt(w.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return w + '로';
    const jong = (c - 0xac00) % 28;
    return w + (jong === 0 || jong === 8 ? '로' : '으로');
  }
  const pair = PAIRS[j];
  if (!pair) return w + j;
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return w + pair[1];
  return w + ((c - 0xac00) % 28 ? pair[0] : pair[1]);
}

/** "{a:와} {b:이} 만났어요" 같은 템플릿 채우기 */
export function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)(?::([가-힣]+))?\}/g, (m, k, j) => {
    const v = vars[k];
    if (v == null) return m;
    return j ? josa(v, j) : String(v);
  });
}
