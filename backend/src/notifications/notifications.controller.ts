import { Body, Controller, Get, Header, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('api/v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  inbox(@Request() req: any, @Query('leadDays') leadDays?: string) {
    const parsed = parseInt(leadDays ?? '', 10);
    return this.notifications.getInboxForUser(req.user.id, Number.isFinite(parsed) ? parsed : undefined);
  }

  @Post('read')
  markRead(@Request() req: any) {
    return this.notifications.markRead(req.user.id);
  }

  @Get('preferences')
  preferences(@Request() req: any) {
    return this.notifications.getPreferences(req.user.id);
  }

  @Put('preferences')
  savePreferences(@Request() req: any, @Body() body: any) {
    return this.notifications.savePreferences(req.user.id, body);
  }
}

// 로그인 없이 이메일 수신거부(메일에 담긴 서명 토큰 검증).
@Controller('api/v1/notifications')
export class NotificationsUnsubscribeController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribe(@Query('u') u: string, @Query('t') t: string) {
    const result = await this.notifications.unsubscribe(u, t);
    const title = result.ok ? '이메일 알림을 껐어요' : '링크가 올바르지 않아요';
    const body = result.ok
      ? '더 이상 조건·찜 알림 메일을 보내지 않아요. 언제든 <b>내 보관함 &gt; 알림 설정</b>에서 다시 켤 수 있어요.'
      : '수신거부 링크가 만료되었거나 올바르지 않아요. 내 보관함 &gt; 알림 설정에서 직접 끌 수 있어요.';
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 터잡이</title></head><body style="font-family:'Malgun Gothic',sans-serif;background:#f7f8fa;color:#111827;margin:0;padding:48px 20px;"><div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px;"><h1 style="font-size:20px;margin:0 0 12px;">${title}</h1><p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">${body}</p><a href="https://teojabi.com/" style="display:inline-block;padding:11px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:9px;font-weight:700;font-size:14px;">터잡이로 돌아가기</a></div></body></html>`;
  }
}
