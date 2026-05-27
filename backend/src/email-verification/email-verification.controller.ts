import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailVerificationService } from './email-verification.service';

@Controller('api/v1/email-verification')
export class EmailVerificationController {
  constructor(
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('send')
  async sendVerification(@Request() req: any) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const requestIp =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0]?.trim() || req.ip
        : req.ip;

    return this.emailVerificationService.sendVerificationLink(req.user.id, {
      requestIp,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('confirm')
  async confirmVerification(
    @Query('token') token?: string,
    @Res() res?: Response,
  ) {
    if (!token) {
      throw new BadRequestException('인증 토큰이 필요합니다.');
    }

    await this.emailVerificationService.confirmVerificationToken(token);

    const html = `
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>이메일 인증 완료</title>
  </head>
  <body style="margin:0; padding:0; background:#f3f4f6; font-family:'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif; color:#111827;">
    <div style="max-width:560px; margin:40px auto; background:#ffffff; border-radius:14px; box-shadow:0 10px 30px rgba(17,24,39,0.08); overflow:hidden;">
      <div style="padding:28px 24px 10px; text-align:center;">
        <div style="font-size:34px; line-height:1;">✅</div>
        <h1 style="margin:14px 0 8px; font-size:24px;">이메일 인증이 완료되었습니다</h1>
        <p style="margin:0; font-size:15px; color:#374151; line-height:1.65;">
          이제 이전에 진행하던 화면으로 돌아가<br />
          전문가 리포트 요청을 계속 진행해 주세요.
        </p>
      </div>
      <div style="padding:20px 24px 28px; text-align:center;">
        <button type="button" onclick="window.close()" style="display:inline-block; border:none; border-radius:10px; background:#2563eb; color:#ffffff; font-size:15px; font-weight:700; padding:12px 22px; cursor:pointer;">
          창 닫기
        </button>
        <p style="margin:12px 0 0; font-size:12px; color:#6b7280;">버튼이 동작하지 않으면 이 창을 직접 닫아 주세요.</p>
      </div>
    </div>
  </body>
</html>`.trim();

    return res?.status(200).contentType('text/html; charset=utf-8').send(html);
  }
}
