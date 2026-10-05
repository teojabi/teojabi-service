import { Controller, Get } from '@nestjs/common';
import { MailService } from './mail.service';

// 이메일(Cloud Outbound Mailer) 설정 여부를 확인하는 진단용 엔드포인트.
// 값(키)은 노출하지 않고, 설정 여부와 발신 주소(마스킹)만 돌려준다.
@Controller('api/v1/mail-status')
export class MailStatusController {
  constructor(private readonly mail: MailService) {}

  @Get()
  status() {
    const sender = process.env.NCLOUD_MAIL_SENDER_ADDRESS || '';
    const masked = sender ? sender.replace(/^(.).*(@.*)$/, '$1***$2') : null;
    return { configured: this.mail.isConfigured(), sender: masked };
  }
}
