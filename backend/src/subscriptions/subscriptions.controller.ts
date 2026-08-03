import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as PortOne from '@portone/server-sdk';
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
  async handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() res: Response,
  ) {
    const rawPayload = req.rawBody?.toString('utf8') ?? '';

    if (process.env.NODE_ENV !== 'production') {
      this.logger.debug(
        `[PortOne Webhook] signature=${String(headers['x-portone-signature'] ?? 'none')} webhookId=${String(headers['webhook-id'] ?? 'none')} payload=${rawPayload}`,
      );
    }

    try {
      await this.subscriptionsService.handleWebhook(rawPayload, headers);
      return res.status(200).json({ ok: true });
    } catch (error: any) {
      if (
        error instanceof PortOne.Webhook.WebhookVerificationError ||
        error instanceof PortOne.Webhook.InvalidInputError ||
        error instanceof BadRequestException
      ) {
        return res.status(400).json({ ok: false, message: 'invalid webhook signature' });
      }

      this.logger.error(`[PortOne Webhook] processing error: ${error?.message ?? error}`);
      return res.status(500).json({ ok: false });
    }
  }

  @Get('my-paid-summary')
  @UseGuards(JwtAuthGuard)
  async getMyPaidSummary(@Req() req: Request) {
    const user = req.user as { id: string };
    return this.subscriptionsService.getMyPaidSummary(user.id);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  async cancelSubscription(@Req() req: Request) {
    const user = req.user as { id: string };
    this.logger.debug(`[cancel-subscription] userId=${user.id}`);
    return this.subscriptionsService.cancelSubscription(user.id);
  }
}
