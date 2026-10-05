import { Controller, Get, Post } from '@nestjs/common';
import { MailService } from './mail.service';
import { buildDigestBody, DigestCondition } from './digest.template';

// 이메일(Cloud Outbound Mailer) 설정 여부를 확인하는 진단용 엔드포인트.
// 값(키)은 노출하지 않고, 설정 여부와 발신 주소(마스킹)만 돌려준다.
// 테스트 발송은 MAIL_TEST_RECIPIENT(또는 기본 보조 주소)로만 보낸다(오남용 방지).
@Controller('api/v1/mail-status')
export class MailStatusController {
  constructor(private readonly mail: MailService) {}

  @Get()
  status() {
    const sender = process.env.NCLOUD_MAIL_SENDER_ADDRESS || '';
    const masked = sender ? sender.replace(/^(.).*(@.*)$/, '$1***$2') : null;
    return { configured: this.mail.isConfigured(), sender: masked };
  }

  @Post('sample-digest')
  async sampleDigest() {
    const to = process.env.MAIL_TEST_RECIPIENT || 'delete9876@naver.com';
    if (!this.mail.isConfigured()) return { sent: false, reason: 'not-configured' };
    const conditions: DigestCondition[] = [
      {
        name: '상업지역 신축 검토',
        summary: '성북구·관악구·금천구 · 200억 이하 · 경매·공매 포함',
        items: [
          { type: 'listing', label: '맞춤', title: '서울특별시 성북구 동소문동5가 84', detail: '36억원 · 대지 · 노후 건물', url: 'https://teojabi.com/#listing=premium%3A2c29192c-f69a-4b50-9ab9-518b02e21e3a' },
          { type: 'auction', label: '경매', title: '서울특별시 관악구 봉천동 66-92', detail: '대지 · 최저 6.4억원 · 매각기일 2026-10-06', url: 'https://teojabi.com/#listing=auction%3AB0002102023013011058011' },
          { type: 'onbid', label: '공매', title: '서울특별시 금천구 독산동 293-4 대지', detail: '최저입찰 176.9억원 · 입찰마감 2026-10-06', url: 'https://teojabi.com/#listing=onbid%3A2026-0400-020363%3A%3A6220456' },
        ],
      },
    ];
    const total = conditions.reduce((sum, c) => sum + c.items.length, 0);
    try {
      const send = await this.mail.send({ to, title: `[터잡이] 조건에 맞는 새 매물 ${total}건`, body: buildDigestBody(conditions, { inquiryEmail: 'teojabi@gmail.com' }) });
      return { sent: true, to, send };
    } catch (e) {
      return { sent: false, reason: String((e as Error)?.message || e).slice(0, 200) };
    }
  }

  @Post('test')
  async test() {
    const to = process.env.MAIL_TEST_RECIPIENT || 'delete9876@naver.com';
    if (!this.mail.isConfigured()) return { sent: false, reason: 'not-configured' };
    try {
      const send = await this.mail.send({
        to,
        title: '[터잡이] 이메일 알림 설정 테스트',
        body: '<div style="font-family:\'Malgun Gothic\',sans-serif"><p>이 메일은 터잡이 알림(Cloud Outbound Mailer) 설정 확인용 테스트입니다.</p><p>정상 수신되면 이메일 알림 발송이 준비된 것입니다.</p></div>',
      });
      let status: any = null;
      try {
        if (send?.requestId) status = await this.mail.requestStatus(send.requestId);
      } catch (e) {
        status = { error: String((e as any)?.response?.data ?? (e as Error)?.message).slice(0, 300) };
      }
      return { sent: true, to, send, status };
    } catch (e) {
      return { sent: false, reason: String((e as Error)?.message || e).slice(0, 200) };
    }
  }
}
