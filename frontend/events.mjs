// 회원 행동 로그. 로그인한 회원만 기록한다(비회원·익명은 보내지 않음).
// 이벤트는 메모리에 모아 배치(최대 10건 또는 5초)로 POST /api/v1/events 에 보낸다.
import { apiFetch } from './api-client.mjs';
import { member } from './member.mjs';

const MAX_QUEUE = 40;
const BATCH_SIZE = 20;
let queue = [];
let timer = null;

const ready = () => member.status === 'ready';

async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  if (!ready()) { queue = []; return; } // 로그아웃 등으로 세션이 끊기면 버린다.
  const batch = queue.splice(0, BATCH_SIZE);
  try {
    await apiFetch('/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
    });
  } catch {
    // 기록 실패는 서비스 이용을 막지 않도록 조용히 무시한다.
  }
  if (queue.length && !timer) timer = setTimeout(flush, 3000);
}

// 로그인 회원이 아니면 아무것도 하지 않는다.
export function logEvent(type, payload = {}, entityId = null) {
  if (!type || !ready()) return;
  queue.push({
    type: String(type).slice(0, 40),
    entityId: entityId == null ? null : String(entityId).slice(0, 120),
    payload: payload && typeof payload === 'object' ? payload : {},
    occurredAt: new Date().toISOString(),
  });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= 10) { void flush(); return; }
  if (!timer) timer = setTimeout(flush, 5000);
}

member.addEventListener('change', () => { if (!ready()) queue = []; });
window.addEventListener('pagehide', () => { void flush(); });
