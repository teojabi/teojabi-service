import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { createHash, createHmac, randomBytes } from 'crypto';

const TOKEN_TTL_MINUTES = 30;
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async sendVerificationLink(
    userId: string,
    meta: { requestIp?: string; userAgent?: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        lastVerificationSentAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }
    if (!user.email) {
      throw new BadRequestException('사용자 이메일이 등록되어 있지 않습니다.');
    }
    const userEmail = user.email;
    if (user.emailVerified) {
      return { success: true, message: '이미 인증된 이메일입니다.' };
    }

    if (user.lastVerificationSentAt) {
      const elapsedSeconds = Math.floor(
        (Date.now() - user.lastVerificationSentAt.getTime()) / 1000,
      );
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        throw new HttpException(
          `인증 메일은 ${RESEND_COOLDOWN_SECONDS}초에 1번만 요청할 수 있습니다.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: {
          userId,
          purpose: 'REPORT_DELIVERY_VERIFICATION',
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId,
          email: userEmail,
          tokenHash,
          purpose: 'REPORT_DELIVERY_VERIFICATION',
          expiresAt,
          requestIp: meta.requestIp,
          userAgent: meta.userAgent,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          lastVerificationSentAt: new Date(),
        },
      });
    });

    await this.sendMail(userEmail, this.buildVerificationUrl(rawToken));

    return {
      success: true,
      message: '인증 메일을 발송했습니다.',
      expiresAt,
    };
  }

  async confirmVerificationToken(token: string) {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const verificationToken = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verificationToken || !verificationToken.userId) {
      throw new BadRequestException('유효하지 않은 인증 토큰입니다.');
    }
    if (verificationToken.usedAt) {
      throw new BadRequestException('이미 사용된 인증 토큰입니다.');
    }
    if (verificationToken.expiresAt.getTime() < now.getTime()) {
      throw new BadRequestException('만료된 인증 토큰입니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: verificationToken.id },
        data: { usedAt: now },
      });

      await tx.user.update({
        where: { id: verificationToken.userId as string },
        data: {
          emailVerified: true,
          emailVerifiedAt: now,
        },
      });
    });

    return { success: true, message: '이메일 인증이 완료되었습니다.' };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildVerificationUrl(rawToken: string) {
    const backendUrl =
      this.configService.get<string>('BACKEND_PUBLIC_URL') ||
      this.configService.get<string>('BACKEND_URL') ||
      'http://localhost:3000';

    return `${backendUrl}/api/v1/email-verification/confirm?token=${encodeURIComponent(rawToken)}`;
  }

  private async sendMail(to: string, verificationUrl: string) {
    const baseUrl =
      this.configService.get<string>('NCLOUD_MAIL_BASE_URL') ||
      'https://mail.apigw.ntruss.com';
    const accessKey = this.configService.get<string>('NCLOUD_ACCESS_KEY');
    const secretKey = this.configService.get<string>('NCLOUD_SECRET_KEY');
    const senderAddress = this.configService.get<string>('NCLOUD_MAIL_SENDER_ADDRESS');
    const senderName = this.configService.get<string>('NCLOUD_MAIL_SENDER_NAME');
    const apiPath = '/api/v1/mails';

    const missingKeys: string[] = [];
    if (!accessKey) missingKeys.push('NCLOUD_ACCESS_KEY');
    if (!secretKey) missingKeys.push('NCLOUD_SECRET_KEY');
    if (!senderAddress) missingKeys.push('NCLOUD_MAIL_SENDER_ADDRESS');

    if (missingKeys.length > 0) {
      throw new InternalServerErrorException(
        `이메일 전송 설정(Cloud Outbound Mailer)이 누락되었습니다. 누락 항목: ${missingKeys.join(', ')}`,
      );
    }

    try {
      const timestamp = Date.now().toString();
      const signature = createHmac('sha256', secretKey as string)
        .update(`POST ${apiPath}\n${timestamp}\n${accessKey}`)
        .digest('base64');

      const payload = {
        senderAddress,
        senderName,
        title: '[터잡이] 이메일 인증을 완료해 주세요',
        body: `<p>아래 버튼을 눌러 이메일 인증을 완료해 주세요.</p><p><a href="${verificationUrl}">이메일 인증하기</a></p><p>링크는 ${TOKEN_TTL_MINUTES}분 동안 유효합니다.</p>`,
        recipients: [
          {
            address: to,
            type: 'R',
          },
        ],
        individual: true,
        advertising: false,
      };

      const response = await fetch(`${baseUrl.replace(/\/$/, '')}${apiPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'x-ncp-apigw-timestamp': timestamp,
          'x-ncp-iam-access-key': accessKey as string,
          'x-ncp-apigw-signature-v2': signature,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[EmailVerificationService] Cloud Outbound Mailer response error', {
          status: response.status,
          body: errorBody,
        });
        throw new Error('Cloud Outbound Mailer API 호출 실패');
      }
    } catch (error) {
      console.error('[EmailVerificationService] Failed to send email', error);
      throw new InternalServerErrorException(
        '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }
  }
}
