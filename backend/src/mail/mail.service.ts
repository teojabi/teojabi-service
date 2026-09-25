import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

export type MailInput = {
  to: string;
  title: string;
  body: string;
  advertising?: boolean;
};

// 네이버클라우드 Cloud Outbound Mailer 공용 발송기. 이메일 인증·알림에서 함께 쓴다.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  private config() {
    return {
      baseUrl: this.configService.get<string>('NCLOUD_MAIL_BASE_URL') || 'https://mail.apigw.ntruss.com',
      accessKey: this.configService.get<string>('NCLOUD_ACCESS_KEY'),
      secretKey: this.configService.get<string>('NCLOUD_SECRET_KEY'),
      senderAddress: this.configService.get<string>('NCLOUD_MAIL_SENDER_ADDRESS'),
      senderName: this.configService.get<string>('NCLOUD_MAIL_SENDER_NAME'),
    };
  }

  isConfigured() {
    const { accessKey, secretKey, senderAddress } = this.config();
    return Boolean(accessKey && secretKey && senderAddress);
  }

  async send(input: MailInput): Promise<void> {
    const { baseUrl, accessKey, secretKey, senderAddress, senderName } = this.config();
    const apiPath = '/api/v1/mails';

    const missing: string[] = [];
    if (!accessKey) missing.push('NCLOUD_ACCESS_KEY');
    if (!secretKey) missing.push('NCLOUD_SECRET_KEY');
    if (!senderAddress) missing.push('NCLOUD_MAIL_SENDER_ADDRESS');
    if (missing.length) {
      throw new InternalServerErrorException(
        `이메일 전송 설정(Cloud Outbound Mailer)이 누락되었습니다. 누락 항목: ${missing.join(', ')}`,
      );
    }

    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', secretKey as string)
      .update(`POST ${apiPath}\n${timestamp}\n${accessKey}`)
      .digest('base64');

    const payload = {
      senderAddress,
      senderName,
      title: input.title,
      body: input.body,
      recipients: [{ address: input.to, type: 'R' }],
      individual: true,
      confirmAndSend: false,
      advertising: input.advertising === true,
    };

    try {
      await axios.post(`${baseUrl.replace(/\/$/, '')}${apiPath}`, payload, {
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'x-ncp-apigw-timestamp': timestamp,
          'x-ncp-iam-access-key': accessKey as string,
          'x-ncp-apigw-signature-v2': signature,
        },
      });
    } catch (error) {
      this.logger.error('Failed to send email', error as Error);
      throw new InternalServerErrorException('이메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }
}
