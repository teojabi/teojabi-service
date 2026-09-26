import { Body, Controller, Get, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
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
