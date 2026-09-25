import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { EmailVerificationService } from './email-verification.service';
import { EmailVerificationController } from './email-verification.controller';

@Module({
  imports: [MailModule],
  providers: [EmailVerificationService],
  controllers: [EmailVerificationController],
})
export class EmailVerificationModule {}
