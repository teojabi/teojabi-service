import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailStatusController } from './mail-status.controller';

@Module({
  controllers: [MailStatusController],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
