import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const SUBSCRIPTION_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
} as const;

const INVOICE_STATUS = {
  READY: 'READY',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async prepareBilling(userId: string, planCode: string) {
    this.logger.debug(`[prepareBilling] started userId=${userId}, planCode=${planCode ?? 'none'}`);

    if (!planCode) {
      throw new BadRequestException('planCode는 필수입니다.');
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { code: planCode, active: true },
      select: { id: true, code: true, amount: true, currency: true, name: true },
    });

    if (!plan) {
      throw new BadRequestException('유효하지 않은 구독 플랜입니다.');
    }

    const storeId = process.env.PORTONE_STORE_ID;
    const channelKey = process.env.PORTONE_CHANNEL_KEY;

    if (!storeId || !channelKey) {
      throw new InternalServerErrorException('포트원 설정이 누락되었습니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    const customerName = user?.name?.trim();
    if (!customerName) {
      throw new BadRequestException('결제를 위해 프로필 이름을 먼저 등록해주세요.');
    }

    this.logger.debug(`[prepareBilling] ready userId=${userId}, planCode=${plan.code}, amount=${plan.amount}`);

    return {
      storeId,
      channelKey,
      customerId: `user_${userId}`,
      customerName,
      customerEmail: user?.email ?? null,
      customerPhone: user?.phone ?? null,
      plan,
    };
  }

  async confirmBilling(
    userId: string,
    payload: { planCode: string; billingKey: string; customerId: string },
  ) {
    const { planCode, billingKey, customerId } = payload;
    this.logger.debug(
      `[confirmBilling] started userId=${userId}, planCode=${planCode ?? 'none'}, customerId=${customerId ?? 'none'}`,
    );

    if (!planCode || !billingKey || !customerId) {
      throw new BadRequestException('planCode, billingKey, customerId는 필수입니다.');
    }

    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { code: planCode, active: true },
    });
    if (!plan) {
      throw new BadRequestException('유효하지 않은 구독 플랜입니다.');
    }

    const channelKey = process.env.PORTONE_CHANNEL_KEY;
    const storeId = process.env.PORTONE_STORE_ID;
    if (!channelKey || !storeId) {
      throw new InternalServerErrorException('포트원 설정이 누락되었습니다.');
    }

    return this.prisma.$transaction(async (tx) => {
      this.logger.debug(`[confirmBilling] deactivate old billing keys userId=${userId}`);
      await tx.billingKey.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false, deletedAt: new Date() },
      });

      const savedBillingKey = await tx.billingKey.create({
        data: {
          userId,
          portoneCustomerId: customerId,
          billingKey,
          channelKey,
          isActive: true,
        },
      });

      this.logger.debug(
        `[confirmBilling] billing key stored userId=${userId}, billingKeyId=${savedBillingKey.id}, planCode=${plan.code}`,
      );

      const now = new Date();
      const currentPeriodEnd = this.calculatePeriodEnd(now, plan.intervalUnit, plan.intervalCount);

      const subscription = await tx.userSubscription.create({
        data: {
          userId,
          planId: plan.id,
          status: SUBSCRIPTION_STATUS.PENDING,
        },
      });

      const paymentId = this.generatePaymentId();

      const invoice = await tx.subscriptionInvoice.create({
        data: {
          subscriptionId: subscription.id,
          billingKeyId: savedBillingKey.id,
          portonePaymentId: paymentId,
          amount: plan.amount,
          currency: plan.currency,
          status: INVOICE_STATUS.READY,
        },
      });

      this.logger.debug(
        `[confirmBilling] invoice created subscriptionId=${subscription.id}, invoiceId=${invoice.id}, paymentId=${paymentId}`,
      );

      try {
        this.logger.debug(`[confirmBilling] request PortOne payment paymentId=${paymentId}, amount=${Number(plan.amount)}`);
        const paymentResult = await this.payWithBillingKey({
          paymentId,
          billingKey,
          orderName: `${plan.name} 구독 결제`,
          amount: Number(plan.amount),
          customerId,
          storeId,
          channelKey,
        });

        await tx.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: {
            status: INVOICE_STATUS.PAID,
            portoneTxId: paymentResult.txId ?? null,
            paidAt: new Date(),
            rawPayload: paymentResult as Prisma.InputJsonValue,
          },
        });

        await tx.userSubscription.update({
          where: { id: subscription.id },
          data: {
            status: SUBSCRIPTION_STATUS.ACTIVE,
            startAt: now,
            currentPeriodStart: now,
            currentPeriodEnd,
          },
        });

        await this.syncUserRole(tx, userId, plan.code, SUBSCRIPTION_STATUS.ACTIVE);

        this.logger.debug(
          `[confirmBilling] payment success subscriptionId=${subscription.id}, paymentId=${paymentId}, txId=${paymentResult.txId ?? 'none'}`,
        );

        return {
          success: true,
          subscriptionId: subscription.id,
          paymentId,
        };
      } catch (error: any) {
        await tx.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: {
            status: INVOICE_STATUS.FAILED,
            failReason: error?.message ?? '결제 실패',
          },
        });

        await tx.userSubscription.update({
          where: { id: subscription.id },
          data: {
            status: SUBSCRIPTION_STATUS.PAST_DUE,
          },
        });

        this.logger.debug(
          `[confirmBilling] payment failed subscriptionId=${subscription.id}, paymentId=${paymentId}, reason=${error?.message ?? 'unknown'}`,
        );

        return {
          success: false,
          subscriptionId: subscription.id,
          message: error?.message ?? '구독 결제에 실패했습니다.',
        };
      }
    });
  }

  async getMyPaidSummary(userId: string) {
    const subscription = await this.prisma.userSubscription.findFirst({
      where: { userId },
      include: {
        plan: {
          select: {
            code: true,
            name: true,
            amount: true,
            currency: true,
            intervalUnit: true,
            intervalCount: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const invoices = await this.prisma.subscriptionInvoice.findMany({
      where: {
        subscription: {
          userId,
        },
      },
      orderBy: [{ paidAt: 'desc' }, { requestedAt: 'desc' }],
      take: 20,
      include: {
        subscription: {
          include: {
            plan: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    let credit: { totalCredits: number; usedCredits: number; availableCredits: number; updatedAt: Date | null } | null = null;

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ total_credits: number; used_credits: number; updated_at: Date | null }>
      >`SELECT total_credits, used_credits, updated_at FROM user_credit_wallet WHERE user_id = ${userId} LIMIT 1`;

      if (rows.length > 0) {
        const totalCredits = Number(rows[0].total_credits || 0);
        const usedCredits = Number(rows[0].used_credits || 0);
        credit = {
          totalCredits,
          usedCredits,
          availableCredits: Math.max(totalCredits - usedCredits, 0),
          updatedAt: rows[0].updated_at,
        };
      }
    } catch (error) {
      this.logger.warn(`[getMyPaidSummary] user_credit_wallet 조회 실패 userId=${userId}`);
    }

    return {
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startAt: subscription.startAt,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            plan: subscription.plan,
          }
        : null,
      credit,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        paymentId: invoice.portonePaymentId,
        txId: invoice.portoneTxId,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        failReason: invoice.failReason,
        paidAt: invoice.paidAt,
        requestedAt: invoice.requestedAt,
        planName: invoice.subscription.plan.name,
        planCode: invoice.subscription.plan.code,
      })),
    };
  }

  async handleWebhook(payload: any, signature?: string) {
    this.logger.debug(
      `[handleWebhook] received eventId=${payload?.id ?? payload?.eventId ?? 'none'}, paymentId=${payload?.data?.paymentId ?? payload?.paymentId ?? 'none'}, status=${payload?.data?.status ?? payload?.status ?? 'none'}`,
    );

    if (!payload) {
      throw new BadRequestException('payload가 비어있습니다.');
    }

    const webhookSecret = process.env.PORTONE_WEBHOOK_SECRET;
    if (webhookSecret && signature !== webhookSecret) {
      throw new UnauthorizedException('유효하지 않은 웹훅 서명입니다.');
    }

    const eventId = payload.id ?? payload.eventId ?? null;
    const paymentId = payload.data?.paymentId ?? payload.paymentId ?? null;

    const existingEvent = eventId
      ? await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } })
      : null;
    if (existingEvent) {
      this.logger.debug(`[handleWebhook] duplicated event skipped eventId=${eventId}`);
      return { ok: true, duplicated: true };
    }

    await this.prisma.paymentWebhookEvent.create({
      data: {
        eventId,
        paymentId,
        eventType: payload.type ?? null,
        status: payload.data?.status ?? payload.status ?? null,
        payload: payload as Prisma.InputJsonValue,
      },
    });

    if (!paymentId) {
      this.logger.debug('[handleWebhook] paymentId missing, skip state update');
      return { ok: true, skipped: true };
    }

    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { portonePaymentId: paymentId },
      include: {
        subscription: { include: { plan: true } },
      },
    });

    if (!invoice) {
      this.logger.debug(`[handleWebhook] invoice not found paymentId=${paymentId}`);
      return { ok: true, skipped: true };
    }

    const status = payload.data?.status ?? payload.status;
    if (status === 'PAID') {
      const now = new Date();
      const periodEnd = this.calculatePeriodEnd(
        now,
        invoice.subscription.plan.intervalUnit,
        invoice.subscription.plan.intervalCount,
      );

      await this.prisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: INVOICE_STATUS.PAID,
          paidAt: now,
          rawPayload: payload as Prisma.InputJsonValue,
        },
      });

      await this.prisma.userSubscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: SUBSCRIPTION_STATUS.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      await this.syncUserRole(
        this.prisma,
        invoice.subscription.userId,
        invoice.subscription.plan.code,
        SUBSCRIPTION_STATUS.ACTIVE,
      );

      this.logger.debug(
        `[handleWebhook] invoice paid processed invoiceId=${invoice.id}, subscriptionId=${invoice.subscriptionId}`,
      );
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      await this.prisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: status === 'FAILED' ? INVOICE_STATUS.FAILED : INVOICE_STATUS.CANCELLED,
          failReason: payload.data?.message ?? null,
          rawPayload: payload as Prisma.InputJsonValue,
        },
      });

      await this.prisma.userSubscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: status === 'FAILED' ? SUBSCRIPTION_STATUS.PAST_DUE : SUBSCRIPTION_STATUS.CANCELLED,
        },
      });

      await this.syncUserRole(
        this.prisma,
        invoice.subscription.userId,
        invoice.subscription.plan.code,
        status === 'FAILED' ? SUBSCRIPTION_STATUS.PAST_DUE : SUBSCRIPTION_STATUS.CANCELLED,
      );

      this.logger.debug(
        `[handleWebhook] invoice failure processed invoiceId=${invoice.id}, status=${status}, subscriptionId=${invoice.subscriptionId}`,
      );
    }

    return { ok: true };
  }

  private async payWithBillingKey(input: {
    paymentId: string;
    billingKey: string;
    orderName: string;
    amount: number;
    customerId: string;
    storeId: string;
    channelKey: string;
  }) {
    this.logger.debug(
      `[payWithBillingKey] request start paymentId=${input.paymentId}, customerId=${input.customerId}, amount=${input.amount}`,
    );

    const secret = process.env.PORTONE_API_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('PORTONE_API_SECRET이 설정되지 않았습니다.');
    }

    const response = await fetch(`https://api.portone.io/payments/${input.paymentId}/billing-key`, {
      method: 'POST',
      headers: {
        Authorization: `PortOne ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storeId: input.storeId,
        channelKey: input.channelKey,
        billingKey: input.billingKey,
        orderName: input.orderName,
        amount: { total: input.amount },
        customer: { id: input.customerId },
        currency: 'KRW',
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      this.logger.debug(`[payWithBillingKey] request failed paymentId=${input.paymentId}, status=${response.status}`);
      throw new BadRequestException(`포트원 결제 실패: ${message}`);
    }

    this.logger.debug(`[payWithBillingKey] request success paymentId=${input.paymentId}`);

    return response.json();
  }

  private calculatePeriodEnd(startAt: Date, intervalUnit: string, intervalCount: number) {
    const end = new Date(startAt);
    const count = intervalCount || 1;

    if (intervalUnit === 'DAY') {
      end.setDate(end.getDate() + count);
      return end;
    }
    if (intervalUnit === 'WEEK') {
      end.setDate(end.getDate() + count * 7);
      return end;
    }
    if (intervalUnit === 'YEAR') {
      end.setFullYear(end.getFullYear() + count);
      return end;
    }

    end.setMonth(end.getMonth() + count);
    return end;
  }

  private generatePaymentId() {
    // PortOne 결제 paymentId 최대 길이(32) 제약을 만족하도록 짧은 형식 사용
    // 예: sub_mb9x3n2h_k4j8pz (최대 32자 이내)
    return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async syncUserRole(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    planCode: string,
    status: SubscriptionStatusValue,
  ) {
    let role: Role = Role.USER;
    if (status === SUBSCRIPTION_STATUS.ACTIVE) {
      role = planCode.includes('PLUS') || planCode.includes('PRO') ? Role.PREMIUM_PLUS : Role.PREMIUM_BASIC;
    }

    await client.user.update({
      where: { id: userId },
      data: { role },
    });
  }
}
