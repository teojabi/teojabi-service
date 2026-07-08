
import { Body, Controller, Logger, Post } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

type CreateWebhookTestScheduleBody = {
  subscriptionId: string;
  minutes?: number;
};

@Controller('api/v1/subscriptions-test')
export class SubscriptionsTestController {
  private readonly logger = new Logger(SubscriptionsTestController.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('schedule')
  async createWebhookTestSchedule(@Body() body: CreateWebhookTestScheduleBody) {
    const minutes = body.minutes === undefined ? 5 : Number(body.minutes);
    this.logger.debug(
      `[createWebhookTestSchedule] subscriptionId=${body.subscriptionId ?? 'none'}, minutes=${Number.isFinite(minutes) ? minutes : 'invalid'}`,
    );

    return this.subscriptionsService.createWebhookTestSchedule({
      subscriptionId: body.subscriptionId,
      minutes,
    });
  }
}
