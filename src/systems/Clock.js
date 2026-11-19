/** "HH:MM" (최대 29:59) → 분 */
export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`잘못된 시각 형식: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
