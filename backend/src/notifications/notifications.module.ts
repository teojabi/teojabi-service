import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController, NotificationsUnsubscribeController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [NotificationsController, NotificationsUnsubscribeController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
