// 단일 '내 조건' 저장소.
// 목록·경매·AI 채팅이 같은 조건 하나를 편집하고, 같은 탭 세션 동안 유지한다.
const STORE_KEY = 'teojabi.working-condition.v1';
const listeners = new Set();
let current = null;
try {
  const raw = globalThis.sessionStorage?.getItem(STORE_KEY);
  if (raw) current = JSON.parse(raw);
} catch { current = null; }

const persist = () => {
  try {
    if (current) globalThis.sessionStorage?.setItem(STORE_KEY, JSON.stringify(current));
    else globalThis.sessionStorage?.removeItem(STORE_KEY);
  } catch { /* 저장 실패는 무시한다 */ }
};
const emit = () => { for (const fn of [...listeners]) { try { fn(current); } catch { /* 구독자 오류가 전파를 막지 않게 한다 */ } } };

export function getCondition() { return current; }
export function setCondition(next) {
  current = next && typeof next === 'object' ? next : null;
  persist(); emit(); return current;
}
export function patchCondition(patch) {
  if (!patch || typeof patch !== 'object') return current;
  current = { ...(current || {}), ...patch };
  persist(); emit(); return current;
}
export function clearCondition() { current = null; persist(); emit(); }
export function subscribeCondition(fn) { listeners.add(fn); return () => listeners.delete(fn); }
