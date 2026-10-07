// 매일 알림 이메일(다이제스트) 본문 템플릿.
// 조건별로 "저장 조건 → 매칭 건수(맞춤/경매/공매) → 매물 링크"를 보여준다.
const SITE_URL = 'https://teojabi.com/';

export type DigestItem = {
  type: 'listing' | 'auction' | 'onbid' | 'notice';
  label: string; // 맞춤 | 경매 | 공매 | 공지
  title: string;
  detail: string;
  url: string | null; // 매물 상세페이지 링크
};
export type DigestCondition = {
  name: string;
  summary: string;
  items: DigestItem[];
};

const escape = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const countByType = (items: DigestItem[]) => ({
  listing: items.filter((i) => i.type === 'listing').length,
  auction: items.filter((i) => i.type === 'auction').length,
  onbid: items.filter((i) => i.type === 'onbid').length,
});

function itemRow(item: DigestItem): string {
  const chip = `<span style="display:inline-block;font-size:11px;font-weight:700;color:#2563eb;border:1px solid #bfdbfe;background:#eff6ff;border-radius:999px;padding:1px 9px;">${escape(item.label)}</span>`;
  const inner = `${chip}<span style="display:block;font-weight:700;color:#111827;margin:7px 0 3px;">${escape(item.title)}</span><span style="display:block;font-size:13px;color:#6b7280;">${escape(item.detail)}</span>`;
  const style = 'display:block;text-decoration:none;color:inherit;padding:13px 0;border-top:1px solid #f3f4f6;';
  return item.url
    ? `<a href="${escape(item.url)}" style="${style}">${inner}</a>`
    : `<div style="${style}">${inner}</div>`;
}

function conditionSection(condition: DigestCondition): string {
  const counts = countByType(condition.items);
  const total = condition.items.length;
  const breakdown = [
    counts.listing ? `맞춤 ${counts.listing}건` : '',
    counts.auction ? `경매 ${counts.auction}건` : '',
    counts.onbid ? `공매 ${counts.onbid}건` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const head = condition.name
    ? `<h3 style="margin:0 0 6px;font-size:16px;color:#111827;">${escape(condition.name)}</h3>`
    : '';
  const summary = condition.summary
    ? `<p style="margin:0 0 10px;font-size:13px;color:#6b7280;">${escape(condition.summary)}</p>`
    : '';
  const countLine = `<p style="margin:0 0 8px;font-size:15px;color:#111827;">조건에 맞는 매물을 <b>${total}건</b> 찾았어요.${breakdown ? ` <span style="color:#6b7280;font-size:13px;">${escape(breakdown)}</span>` : ''}</p>`;
  return `<section style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 16px;">${head}${summary}${countLine}${condition.items.map(itemRow).join('')}</section>`;
}

export function buildDigestBody(conditions: DigestCondition[], opts: { inquiryEmail?: string; unsubscribeUrl?: string } = {}): string {
  const inquiry = opts.inquiryEmail || 'teojabi@gmail.com';
  const total = conditions.reduce((sum, c) => sum + c.items.length, 0);
  return `
<div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;line-height:1.6;">
  <h2 style="margin:0 0 6px;font-size:20px;">[터잡이] 조건에 맞는 새 매물 ${total}건</h2>
  <p style="margin:0 0 18px;font-size:13px;color:#6b7280;">저장하신 조건에 <b>새로 올라온</b> 매물이에요. 항목을 누르면 상세페이지로 이동해요.</p>
  ${conditions.map(conditionSection).join('')}
  <p style="margin:18px 0 6px;font-size:13px;">문의: <a href="mailto:${escape(inquiry)}" style="color:#2563eb;">${escape(inquiry)}</a></p>
  <p style="margin:0 0 18px;"><a href="${SITE_URL}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">터잡이에서 확인하기</a></p>
  <p style="margin:0;font-size:12px;color:#6b7280;">권리분석·적정 입찰가는 제공하지 않아요. 사실 안내이니 계약·입찰 전 원문을 확인하세요. 알림 수신은 내 보관함 &gt; 알림 설정에서 끌 수 있어요.</p>
  ${opts.unsubscribeUrl ? `<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">더 이상 이 메일을 받지 않으려면 <a href="${escape(opts.unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline;">수신거부</a>를 눌러주세요.</p>` : ''}
</div>`.trim();
}
