// 매일 알림 이메일(다이제스트) 본문 템플릿. 알림 서비스와 진단용 샘플 발송이 함께 쓴다.
const SITE_URL = 'https://teojabi.com/';

export type DigestItem = { kindLabel: string; title: string; detail: string };

const escape = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function buildDigestBody(items: DigestItem[]): string {
  const rows = items
    .map(
      (item) =>
        `<li style="margin:0 0 10px;"><strong>${escape(item.kindLabel)}</strong><br>${escape(item.title)}<br><span style="color:#6b7280;font-size:13px;">${escape(item.detail)}</span></li>`,
    )
    .join('');
  return `
<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;line-height:1.6;">
  <h2 style="margin:0 0 8px;font-size:20px;">[터잡이] 새 매물·경매·공매 알림 ${items.length}건</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#374151;">저장 조건·찜에 <b>새로 올라온</b> 물건이에요. 사실 안내이며, 계약·입찰 전 원문을 확인하세요.</p>
  <ul style="padding-left:18px;margin:0 0 20px;">${rows}</ul>
  <p style="margin:0 0 20px;"><a href="${SITE_URL}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">터잡이에서 확인하기</a></p>
  <p style="margin:0;font-size:12px;color:#6b7280;">권리분석·적정 입찰가는 제공하지 않아요. 알림 수신은 내 보관함 &gt; 알림 설정에서 끌 수 있어요.</p>
</div>`.trim();
}
