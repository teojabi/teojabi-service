import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
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
  async confirmVerification(@Query('token') token?: string) {
    if (!token) {
      throw new BadRequestException('인증 토큰이 필요합니다.');
    }

    return this.emailVerificationService.confirmVerificationToken(token);
  }
}
