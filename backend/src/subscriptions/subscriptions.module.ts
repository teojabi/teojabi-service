import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsTestController } from './subscriptions-test.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  controllers: [SubscriptionsController, SubscriptionsTestController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
