import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('api/v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  inbox(@Request() req: any, @Query('leadDays') leadDays?: string) {
    const parsed = parseInt(leadDays ?? '7', 10);
    const days = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 7, 1), 14);
    return this.notifications.getInbox(req.user.id, days);
  }
}
