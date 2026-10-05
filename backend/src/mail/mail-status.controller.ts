import { Controller, Get, Post } from '@nestjs/common';
import { MailService } from './mail.service';
import { buildDigestBody } from './digest.template';

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
    const items = [
      { kindLabel: '맞춤 매물', title: '서울 마포구 성산동 123-4', detail: '제2종근린생활시설 · 45억원 · 대지 120㎡ · 제2종일반주거지역' },
      { kindLabel: '경매 D-14', title: '서울 마포구 서교동 5-1', detail: '근린생활시설 · 최저 3억원 · 매각기일 2026-10-19' },
      { kindLabel: '공매 D-7', title: '서울 강서구 화곡동 88-1', detail: '상가용및업무용건물 · 최저입찰 2.1억원 · 입찰마감 2026-10-12' },
    ];
    try {
      const send = await this.mail.send({ to, title: `[터잡이] 새 매물·경매·공매 알림 ${items.length}건`, body: buildDigestBody(items) });
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
