
import { Body, Controller, Logger, NotFoundException, Post } from '@nestjs/common';
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
    if (process.env.NODE_ENV !== 'test' || process.env.ENABLE_SUBSCRIPTION_TEST_API !== 'true') {
      throw new NotFoundException();
    }

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
