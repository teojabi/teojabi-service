import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { createHash, randomBytes } from 'crypto';

const TOKEN_TTL_MINUTES = 30;
const RESEND_COOLDOWN_SECONDS = 60;

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly mail: MailService,
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

    const verificationUrl = this.buildVerificationUrl(rawToken);
    await this.mail.send({
      to: userEmail,
      title: '[터잡이] 이메일 인증을 완료해 주세요',
      body: `
<div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #111827; line-height: 1.6;">
  <h2 style="margin: 0 0 12px; font-size: 20px; color: #111827;">[터잡이] 이메일 인증 안내</h2>
  <p style="margin: 0 0 12px;">안녕하세요.</p>
  <p style="margin: 0 0 20px;">아래 버튼을 눌러 이메일 인증을 완료해 주세요.</p>
  <p style="margin: 0 0 20px;">
    <a href="${verificationUrl}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700;">
      이메일 인증하기
    </a>
  </p>
  <p style="margin: 0 0 8px; font-size: 14px; color: #374151;">인증 링크 유효시간: <strong>${TOKEN_TTL_MINUTES}분</strong></p>
  <p style="margin: 0; font-size: 13px; color: #6b7280; word-break: break-all;">
    버튼이 동작하지 않으면 아래 링크를 브라우저에 복사해 접속해 주세요.<br />
    <a href="${verificationUrl}" style="color: #2563eb; text-decoration: underline;">${verificationUrl}</a>
  </p>
</div>`.trim(),
    });

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
    const backendPublicUrl = this.configService.get<string>('BACKEND_PUBLIC_URL');
    const backendUrl = this.configService.get<string>('BACKEND_URL');
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const port = this.configService.get<string>('PORT') || '3001';
    const isLocalLikeEnv = ['local', 'development', 'test'].includes(
      (nodeEnv || '').toLowerCase(),
    );
    const fallbackBackendUrl = isLocalLikeEnv
      ? `http://localhost:${port}`
      : 'https://api.teojabi.com';
    const baseUrl = backendPublicUrl || backendUrl || fallbackBackendUrl;

    return `${baseUrl}/api/v1/email-verification/confirm?token=${encodeURIComponent(rawToken)}`;
  }

}
