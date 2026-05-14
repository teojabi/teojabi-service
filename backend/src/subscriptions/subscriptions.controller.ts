import { Body, Controller, Get, Headers, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

@Controller('api/v1/subscriptions')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('prepare-billing')
  @UseGuards(JwtAuthGuard)
  async prepareBilling(@Req() req: Request, @Body() body: { planCode: string }) {
    const user = req.user as { id: string };
    this.logger.debug(`[prepare-billing] userId=${user.id}, planCode=${body.planCode ?? 'none'}`);
    return this.subscriptionsService.prepareBilling(user.id, body.planCode);
  }

  @Post('confirm-billing')
  @UseGuards(JwtAuthGuard)
  async confirmBilling(
    @Req() req: Request,
    @Body() body: { planCode: string; billingKey: string; customerId: string },
  ) {
    const user = req.user as { id: string };
    this.logger.debug(
      `[confirm-billing] userId=${user.id}, planCode=${body.planCode ?? 'none'}, customerId=${body.customerId ?? 'none'}`,
    );
    return this.subscriptionsService.confirmBilling(user.id, body);
  }

  @Post('webhook')
  async handleWebhook(@Headers('x-portone-signature') signature: string | undefined, @Body() payload: any) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `[PortOne Webhook] signature=${signature ?? 'none'} payload=${JSON.stringify(payload)}`,
      );
    }

    return this.subscriptionsService.handleWebhook(payload, signature);
  }

  @Get('my-paid-summary')
  @UseGuards(JwtAuthGuard)
  async getMyPaidSummary(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.subscriptionsService.getMyPaidSummary(user.id);
  }
}
