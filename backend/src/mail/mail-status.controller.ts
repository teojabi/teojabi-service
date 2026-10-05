import { Controller, Get, Post } from '@nestjs/common';
import { MailService } from './mail.service';

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

  @Post('test')
  async test() {
    const to = process.env.MAIL_TEST_RECIPIENT || 'delete9876@naver.com';
    if (!this.mail.isConfigured()) return { sent: false, reason: 'not-configured' };
    try {
      await this.mail.send({
        to,
        title: '[터잡이] 이메일 알림 설정 테스트',
        body: '<div style="font-family:\'Malgun Gothic\',sans-serif"><p>이 메일은 터잡이 알림(Cloud Outbound Mailer) 설정 확인용 테스트입니다.</p><p>정상 수신되면 이메일 알림 발송이 준비된 것입니다.</p></div>',
      });
      return { sent: true, to };
    } catch (e) {
      return { sent: false, reason: String((e as Error)?.message || e).slice(0, 200) };
    }
  }
}
