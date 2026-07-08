import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as PortOne from '@portone/server-sdk';

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

const UNLIMITED_MONTHLY_CREDITS = 2_147_483_647;
const PLAN_TIER_WEIGHT = {
  GENERAL: 1,
  LIGHT: 2,
  PRO: 3,
  MASTER: 4,
} as const;

const PAYMENT_TYPE_SUBSCRIPTION = 'subscription';

type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async prepareBilling(userId: string, planCode: string) {
    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][prepareBilling] started userId=${userId}, planCode=${planCode ?? 'none'}`,
    );

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

    const currentSubscription = await this.validateUpgradeEligibility(userId, plan.code);

    const { storeId, channelKey } = this.getSubscriptionPortOneConfig();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    const customerName = user?.name?.trim();
    if (!customerName) {
      throw new BadRequestException('결제를 위해 프로필 이름을 먼저 등록해주세요.');
    }

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][prepareBilling] ready userId=${userId}, planCode=${plan.code}, amount=${plan.amount}`,
    );

    return {
      storeId,
      channelKey,
      customerId: `user_${userId}`,
      customerName,
      customerEmail: user?.email ?? null,
      customerPhone: user?.phone ?? null,
      plan,
      currentSubscription,
    };
  }

  async confirmBilling(
    userId: string,
    payload: { planCode: string; billingKey: string; customerId: string },
  ) {
    const { planCode, billingKey, customerId } = payload;
    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][confirmBilling] started userId=${userId}, planCode=${planCode ?? 'none'}, customerId=${customerId ?? 'none'}`,
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

    const currentSubscription = await this.validateUpgradeEligibility(userId, plan.code);

    if (currentSubscription.requiresPlanChangeCleanup) {
      await this.cancelSubscription(userId);
    }

    const { channelKey, storeId } = this.getSubscriptionPortOneConfig();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    const customerName = user?.name?.trim();
    if (!customerName) {
      throw new BadRequestException('결제를 위해 프로필 이름을 먼저 등록해주세요.');
    }

    const customerEmail = user?.email?.trim() || undefined;
    const customerPhoneNumber = user?.phone?.trim() || undefined;

    return this.prisma.$transaction(async (tx) => {
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][confirmBilling] deactivate old billing keys userId=${userId}`,
      );
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
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][confirmBilling] billing key stored userId=${userId}, billingKeyId=${savedBillingKey.id}, planCode=${plan.code}`,
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
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][confirmBilling] invoice created subscriptionId=${subscription.id}, invoiceId=${invoice.id}, paymentId=${paymentId}`,
      );

      try {
        this.logger.debug(
          `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][confirmBilling] request PortOne payment paymentId=${paymentId}, amount=${Number(plan.amount)}`,
        );
        const paymentResult = await this.payWithBillingKey({
          paymentId,
          billingKey,
          orderName: `${plan.name} 구독 결제`,
          amount: Number(plan.amount),
          customerId,
          customerName,
          customerEmail,
          customerPhoneNumber,
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

        await this.resetAiCreditWalletForPlan(tx, userId, plan.code, Number(plan.amount));

        await this.syncUserRole(tx, userId, plan.code, SUBSCRIPTION_STATUS.ACTIVE);

        await this.scheduleNextBillingCycle(tx, {
          subscriptionId: subscription.id,
          billingKeyId: savedBillingKey.id,
          billingKey,
          customerId,
          customerName,
          customerEmail,
          customerPhoneNumber,
          planCode: plan.code,
          planName: plan.name,
          amount: Number(plan.amount),
          currency: plan.currency,
          nextBillingAt: currentPeriodEnd,
          reason: 'initial-confirm',
        });

        this.logger.debug(
          `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][confirmBilling] payment success subscriptionId=${subscription.id}, paymentId=${paymentId}, txId=${paymentResult.txId ?? 'none'}`,
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
          `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][confirmBilling] payment failed subscriptionId=${subscription.id}, paymentId=${paymentId}, reason=${error?.message ?? 'unknown'}`,
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

    const credit = await this.getCreditWallet(userId);

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

  async cancelSubscription(userId: string) {
    this.logger.debug(`[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] started userId=${userId}`);

    const subscription = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: {
          in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAST_DUE],
        },
      },
      include: {
        plan: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!subscription) {
      throw new BadRequestException('취소 가능한 활성 구독이 없습니다.');
    }

    const [scheduledInvoices, wallet, activeBillingKeys] = await Promise.all([
      this.prisma.subscriptionInvoice.findMany({
        where: {
          subscriptionId: subscription.id,
          status: INVOICE_STATUS.READY,
        },
        include: {
          billingKey: {
            select: {
              billingKey: true,
            },
          },
        },
        orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.getCreditWallet(userId),
      this.prisma.billingKey.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          billingKey: true,
        },
      }),
    ]);

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] loaded candidates userId=${userId}, subscriptionId=${subscription.id}, scheduledInvoiceCount=${scheduledInvoices.length}, activeBillingKeyCount=${activeBillingKeys.length}`,
    );

    const paidInvoiceWhere: Prisma.SubscriptionInvoiceWhereInput = {
      subscriptionId: subscription.id,
      status: INVOICE_STATUS.PAID,
    };

    if (subscription.currentPeriodStart) {
      paidInvoiceWhere.paidAt = {
        gte: subscription.currentPeriodStart,
      };
    }

    const latestPaidInvoice = await this.prisma.subscriptionInvoice.findFirst({
      where: paidInvoiceWhere,
      orderBy: [{ paidAt: 'desc' }, { requestedAt: 'desc' }],
    });

    const shouldRefundCurrentCycle = Number(wallet?.usedCredits ?? 0) === 0 && !!latestPaidInvoice;

    const scheduleIdsByBillingKey = new Map<string, string[]>();
    const invoiceIdsByBillingKey = new Map<string, string[]>();
    const billingKeysToCancel = new Set(activeBillingKeys.map((item) => item.billingKey));
    for (const invoice of scheduledInvoices) {
      const billingKey = invoice.billingKey?.billingKey;
      if (!billingKey) {
        this.logger.error(
          `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] missing billingKey userId=${userId}, subscriptionId=${subscription.id}, invoiceId=${invoice.id}, paymentId=${invoice.portonePaymentId}`,
        );
        throw new BadRequestException('예약 결제 취소에 필요한 billingKey 정보가 없습니다.');
      }

      if (!scheduleIdsByBillingKey.has(billingKey)) {
        scheduleIdsByBillingKey.set(billingKey, []);
        invoiceIdsByBillingKey.set(billingKey, []);
      }
      billingKeysToCancel.add(billingKey);

      const scheduleId = this.extractScheduleIdFromRawPayload(invoice.rawPayload, invoice.portonePaymentId);
      if (scheduleId) {
        scheduleIdsByBillingKey.get(billingKey)!.push(scheduleId);
      } else {
        this.logger.warn(
          `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] missing scheduleId in rawPayload, fallback to billingKey cancel userId=${userId}, subscriptionId=${subscription.id}, invoiceId=${invoice.id}, paymentId=${invoice.portonePaymentId}`,
        );
      }
      invoiceIdsByBillingKey.get(billingKey)!.push(invoice.id);
    }

    if (billingKeysToCancel.size === 0) {
      this.logger.warn(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] no active billingKey found. schedule cancel skipped userId=${userId}, subscriptionId=${subscription.id}`,
      );
    }

    const scheduledCancelResults = new Map<string, unknown>();
    for (const billingKey of billingKeysToCancel.values()) {
      const scheduleIds = scheduleIdsByBillingKey.get(billingKey) ?? [];
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] cancelling schedules userId=${userId}, subscriptionId=${subscription.id}, billingKey=${billingKey}, scheduleCount=${scheduleIds.length}, scheduleIds=${scheduleIds.join(',') || 'all-by-billing-key'}`,
      );
      const cancelResult = await this.cancelPortOneSchedules({
        billingKey,
        scheduleIds: scheduleIds.length > 0 ? scheduleIds : undefined,
      });

      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] cancelled schedules userId=${userId}, subscriptionId=${subscription.id}, billingKey=${billingKey}, scheduleCount=${scheduleIds.length}`,
      );

      const invoiceIds = invoiceIdsByBillingKey.get(billingKey) ?? [];
      for (const invoiceId of invoiceIds) {
        scheduledCancelResults.set(invoiceId, cancelResult);
      }
    }

    let paidCancelResult: unknown = null;
    if (shouldRefundCurrentCycle && latestPaidInvoice) {
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] refunding paid invoice userId=${userId}, subscriptionId=${subscription.id}, paymentId=${latestPaidInvoice.portonePaymentId}`,
      );
      paidCancelResult = await this.cancelPortOnePayment({
        paymentId: latestPaidInvoice.portonePaymentId,
        reason: '구독 갱신 후 크레딧 미사용으로 결제를 환불합니다.',
      });
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] refunded paid invoice userId=${userId}, subscriptionId=${subscription.id}, paymentId=${latestPaidInvoice.portonePaymentId}`,
      );
    }

    const cancellationTime = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const invoice of scheduledInvoices) {
        await tx.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: {
            status: INVOICE_STATUS.CANCELLED,
            failReason: '구독 취소로 예약 결제가 취소되었습니다.',
            rawPayload: (scheduledCancelResults.get(invoice.id) ?? null) as Prisma.InputJsonValue,
          },
        });
      }

      if (shouldRefundCurrentCycle && latestPaidInvoice) {
        await tx.subscriptionInvoice.update({
          where: { id: latestPaidInvoice.id },
          data: {
            status: INVOICE_STATUS.CANCELLED,
            failReason: '구독 갱신 후 크레딧 미사용으로 환불 처리되었습니다.',
            rawPayload: paidCancelResult as Prisma.InputJsonValue,
          },
        });

        await tx.$executeRaw`
          INSERT INTO user_credit_wallet (user_id, total_credits, used_credits)
          VALUES (${userId}, 0, 0)
          ON CONFLICT (user_id)
          DO UPDATE SET
            total_credits = 0,
            used_credits = 0,
            updated_at = CURRENT_TIMESTAMP
        `;
      }

      await tx.userSubscription.update({
        where: { id: subscription.id },
        data: {
          status: SUBSCRIPTION_STATUS.CANCELLED,
          cancelAtPeriodEnd: false,
          cancelledAt: cancellationTime,
          endedAt: cancellationTime,
        },
      });

      await this.syncUserRole(tx, userId, subscription.plan.code, SUBSCRIPTION_STATUS.CANCELLED);
    });

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelSubscription] done userId=${userId}, subscriptionId=${subscription.id}, scheduledCancelled=${scheduledInvoices.length}, refunded=${shouldRefundCurrentCycle}`,
    );

    return {
      success: true,
      caseType: shouldRefundCurrentCycle ? 'REFUND_WITH_ZERO_CREDIT' : 'CANCEL_ONLY',
      cancelledScheduledPayments: scheduledInvoices.length,
      refundedPaymentId: shouldRefundCurrentCycle ? latestPaidInvoice?.portonePaymentId ?? null : null,
      message: shouldRefundCurrentCycle
        ? '구독이 취소되었고 당월 결제가 환불 처리되었습니다.'
        : '구독이 취소되었습니다. 현재 이용 기간 내 크레딧은 유지됩니다.',
    };
  }

  private extractScheduleIdFromRawPayload(
    rawPayload: Prisma.JsonValue | null | undefined,
    paymentId: string,
  ): string | null {
    const candidate = this.findScheduleIdCandidate(rawPayload, paymentId, 0);
    if (!candidate) {
      return null;
    }

    if (candidate === paymentId) {
      return null;
    }

    return candidate;
  }

  private findScheduleIdCandidate(value: unknown, paymentId: string, depth: number): string | null {
    if (depth > 6 || value === null || value === undefined) {
      return null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = this.findScheduleIdCandidate(item, paymentId, depth + 1);
        if (candidate) {
          return candidate;
        }
      }
      return null;
    }

    if (typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const scheduleIdKeys = ['scheduleId', 'paymentScheduleId'];
    const directScheduleId = scheduleIdKeys.find((key) => typeof record[key] === 'string');
    const referencedPaymentId = this.extractReferencedPaymentId(record);

    if (directScheduleId && referencedPaymentId === paymentId) {
      return record[directScheduleId] as string;
    }

    if (typeof record.id === 'string' && referencedPaymentId === paymentId && record.id !== paymentId) {
      return record.id;
    }

    for (const child of Object.values(record)) {
      const candidate = this.findScheduleIdCandidate(child, paymentId, depth + 1);
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  private extractReferencedPaymentId(record: Record<string, unknown>): string | null {
    if (typeof record.paymentId === 'string') {
      return record.paymentId;
    }

    if (typeof record.portonePaymentId === 'string') {
      return record.portonePaymentId;
    }

    const paymentNode = record.payment;
    if (paymentNode && typeof paymentNode === 'object') {
      const payment = paymentNode as Record<string, unknown>;

      if (typeof payment.id === 'string') {
        return payment.id;
      }

      if (typeof payment.paymentId === 'string') {
        return payment.paymentId;
      }
    }

    return null;
  }

  async handleWebhook(
    rawPayload: string,
    headers: Record<string, string | string[] | undefined>,
  ) {
    if (typeof rawPayload !== 'string' || rawPayload.trim().length === 0) {
      throw new BadRequestException('payload가 비어있습니다.');
    }

    const webhookSecret = process.env.PORTONE_WEBHOOK_SECRET;
    let payload: any;
    if (webhookSecret) {
      payload = await PortOne.Webhook.verify(webhookSecret, rawPayload, headers);
    } else {
      try {
        payload = JSON.parse(rawPayload);
      } catch {
        throw new BadRequestException('유효하지 않은 webhook payload입니다.');
      }
    }

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][handleWebhook] received eventId=${payload?.id ?? payload?.eventId ?? 'none'}, paymentId=${payload?.data?.paymentId ?? payload?.paymentId ?? 'none'}, status=${payload?.data?.status ?? payload?.status ?? 'none'}`,
    );

    const eventId = payload.id ?? payload.eventId ?? null;
    const paymentId = payload.data?.paymentId ?? payload.paymentId ?? null;

    const existingEvent = eventId
      ? await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } })
      : null;
    if (existingEvent) {
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][handleWebhook] duplicated event skipped eventId=${eventId}`,
      );
      return { ok: true, duplicated: true };
    }

    const webhookEvent = await this.prisma.paymentWebhookEvent.create({
      data: {
        eventId,
        paymentId,
        eventType: payload.type ?? null,
        status: payload.data?.status ?? payload.status ?? null,
        payload: payload as Prisma.InputJsonValue,
      },
    });

    if (!paymentId) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processedAt: new Date(),
          processResult: `paymentType=${PAYMENT_TYPE_SUBSCRIPTION};skipped=paymentId_missing`,
        },
      });
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][handleWebhook] paymentId missing, skip state update`,
      );
      return { ok: true, skipped: true };
    }

    const invoice = await this.prisma.subscriptionInvoice.findUnique({
      where: { portonePaymentId: paymentId },
      include: {
        billingKey: true,
        subscription: {
          include: {
            plan: true,
            user: {
              select: {
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processedAt: new Date(),
          processResult: `paymentType=${PAYMENT_TYPE_SUBSCRIPTION};skipped=invoice_not_found`,
        },
      });
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][handleWebhook] invoice not found paymentId=${paymentId}`,
      );
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

      await this.resetAiCreditWalletForPlan(
        this.prisma,
        invoice.subscription.userId,
        invoice.subscription.plan.code,
        Number(invoice.subscription.plan.amount),
      );

      await this.syncUserRole(
        this.prisma,
        invoice.subscription.userId,
        invoice.subscription.plan.code,
        SUBSCRIPTION_STATUS.ACTIVE,
      );

      const customerName = invoice.subscription.user?.name?.trim();
      if (invoice.billingKey?.billingKey && customerName) {
        await this.scheduleNextBillingCycle(this.prisma, {
          subscriptionId: invoice.subscriptionId,
          billingKeyId: invoice.billingKeyId ?? undefined,
          billingKey: invoice.billingKey.billingKey,
          customerId: invoice.billingKey.portoneCustomerId,
          customerName,
          customerEmail: invoice.subscription.user?.email?.trim() || undefined,
          customerPhoneNumber: invoice.subscription.user?.phone?.trim() || undefined,
          planCode: invoice.subscription.plan.code,
          planName: invoice.subscription.plan.name,
          amount: Number(invoice.subscription.plan.amount),
          currency: invoice.subscription.plan.currency,
          nextBillingAt: periodEnd,
          reason: 'webhook-paid',
        });
      } else {
        await this.emitSubscriptionAlert(
          this.prisma,
          invoice.subscription.userId,
          invoice.subscriptionId,
          '다음 회차 자동결제 예약에 필요한 billingKey 또는 주문자명이 누락되어 재예약을 건너뜀',
        );
      }

      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processedAt: now,
          processResult: `paymentType=${PAYMENT_TYPE_SUBSCRIPTION};status=PAID;subscriptionId=${invoice.subscriptionId}`,
        },
      });

      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][handleWebhook] invoice paid processed invoiceId=${invoice.id}, subscriptionId=${invoice.subscriptionId}`,
      );
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      const now = new Date();
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
          cancelAtPeriodEnd: status === 'CANCELLED' ? false : undefined,
          cancelledAt: status === 'CANCELLED' ? now : undefined,
          endedAt: status === 'CANCELLED' ? now : undefined,
        },
      });

      await this.syncUserRole(
        this.prisma,
        invoice.subscription.userId,
        invoice.subscription.plan.code,
        status === 'FAILED' ? SUBSCRIPTION_STATUS.PAST_DUE : SUBSCRIPTION_STATUS.CANCELLED,
      );

      await this.emitSubscriptionAlert(
        this.prisma,
        invoice.subscription.userId,
        invoice.subscriptionId,
        `정기결제 ${status} 처리됨: ${payload.data?.message ?? '사유 없음'}`,
      );

      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processedAt: now,
          processResult: `paymentType=${PAYMENT_TYPE_SUBSCRIPTION};status=${status};subscriptionId=${invoice.subscriptionId}`,
        },
      });

      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][handleWebhook] invoice failure processed invoiceId=${invoice.id}, status=${status}, subscriptionId=${invoice.subscriptionId}`,
      );
    }

    if (status !== 'PAID' && status !== 'FAILED' && status !== 'CANCELLED') {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          processedAt: new Date(),
          processResult: `paymentType=${PAYMENT_TYPE_SUBSCRIPTION};status=${String(status ?? 'unknown')};skipped=unsupported_status`,
        },
      });
    }

    return { ok: true };
  }

  async createWebhookTestSchedule(input: { subscriptionId: string; minutes?: number }) {
    const subscriptionId = input.subscriptionId?.trim();
    if (!subscriptionId) {
      throw new BadRequestException('subscriptionId는 필수입니다.');
    }

    const minutes = input.minutes ?? 5;
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new BadRequestException('minutes는 0보다 큰 숫자여야 합니다.');
    }

    const subscription = await this.prisma.userSubscription.findFirst({
      where: { id: subscriptionId },
      include: {
        plan: {
          select: {
            code: true,
            name: true,
            amount: true,
            currency: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new BadRequestException(`구독을 찾을 수 없습니다. subscriptionId=${subscriptionId}`);
    }

    const customerName = subscription.user?.name?.trim();
    if (!customerName) {
      throw new BadRequestException('예약결제 등록을 위해 사용자 이름이 필요합니다.');
    }

    const billingKey = await this.prisma.billingKey.findFirst({
      where: {
        userId: subscription.userId,
        isActive: true,
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    if (!billingKey) {
      throw new BadRequestException(`활성 billingKey를 찾을 수 없습니다. userId=${subscription.userId}`);
    }

    const { storeId, channelKey } = this.getSubscriptionPortOneConfig();
    const nextBillingAt = new Date(Date.now() + minutes * 60 * 1000);
    const paymentId = this.generatePaymentId();

    const invoice = await this.prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        billingKeyId: billingKey.id,
        portonePaymentId: paymentId,
        amount: subscription.plan.amount,
        currency: subscription.plan.currency,
        status: INVOICE_STATUS.READY,
      },
    });

    try {
      const scheduledResult = await this.scheduleWithBillingKey({
        paymentId,
        billingKey: billingKey.billingKey,
        orderName: `${subscription.plan.name} 구독 결제`,
        amount: Number(subscription.plan.amount),
        customerId: billingKey.portoneCustomerId,
        customerName,
        customerEmail: subscription.user?.email?.trim() || undefined,
        customerPhoneNumber: subscription.user?.phone?.trim() || undefined,
        storeId,
        channelKey,
        timeToPay: nextBillingAt.toISOString(),
      });

      await this.prisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          rawPayload: scheduledResult as Prisma.InputJsonValue,
        },
      });

      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][createWebhookTestSchedule] created subscriptionId=${subscription.id}, paymentId=${paymentId}, timeToPay=${nextBillingAt.toISOString()}`,
      );

      return {
        ok: true,
        subscriptionId: subscription.id,
        userId: subscription.userId,
        paymentId,
        timeToPay: nextBillingAt.toISOString(),
        invoiceId: invoice.id,
      };
    } catch (error: any) {
      const failReason = `테스트 예약결제 등록 실패: ${error?.message ?? '알 수 없는 오류'}`;

      await this.prisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: INVOICE_STATUS.FAILED,
          failReason,
        },
      });

      this.logger.error(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][createWebhookTestSchedule] failed subscriptionId=${subscription.id}, paymentId=${paymentId}, reason=${error?.message ?? error}`,
      );

      throw new BadRequestException(failReason);
    }
  }

  private async payWithBillingKey(input: {
    paymentId: string;
    billingKey: string;
    orderName: string;
    amount: number;
    customerId: string;
    customerName: string;
    customerEmail?: string;
    customerPhoneNumber?: string;
    storeId: string;
    channelKey: string;
  }) {
    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][payWithBillingKey] request start paymentId=${input.paymentId}, customerId=${input.customerId}, amount=${input.amount}`,
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
        customer: {
          id: input.customerId,
          name: { full: input.customerName },
          email: input.customerEmail,
          phoneNumber: input.customerPhoneNumber,
        },
        currency: 'KRW',
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][payWithBillingKey] request failed paymentId=${input.paymentId}, status=${response.status}`,
      );
      throw new BadRequestException(`포트원 결제 실패: ${message}`);
    }

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][payWithBillingKey] request success paymentId=${input.paymentId}`,
    );

    return response.json();
  }

  private getSubscriptionPortOneConfig() {
    const storeId = process.env.PORTONE_STORE_ID;
    const channelKey = process.env.PORTONE_CHANNEL_KEY_SUBSCRIPTION;
    if (!storeId || !channelKey) {
      throw new InternalServerErrorException('정기결제 포트원 설정이 누락되었습니다.');
    }

    return { storeId, channelKey };
  }

  private async scheduleNextBillingCycle(
    client: Prisma.TransactionClient | PrismaService,
    input: {
      subscriptionId: string;
      billingKeyId?: string;
      billingKey: string;
      customerId: string;
      customerName: string;
      customerEmail?: string;
      customerPhoneNumber?: string;
      planCode: string;
      planName: string;
      amount: number;
      currency: string;
      nextBillingAt: Date;
      reason: 'initial-confirm' | 'webhook-paid';
    },
  ) {
    const existingReadyInvoice = await client.subscriptionInvoice.findFirst({
      where: {
        subscriptionId: input.subscriptionId,
        status: INVOICE_STATUS.READY,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existingReadyInvoice) {
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][scheduleNextBillingCycle] skipped duplicated schedule subscriptionId=${input.subscriptionId}, existingPaymentId=${existingReadyInvoice.portonePaymentId}, reason=${input.reason}`,
      );
      return { scheduled: false, skipped: true };
    }

    const nextPaymentId = this.generatePaymentId();
    const nextInvoice = await client.subscriptionInvoice.create({
      data: {
        subscriptionId: input.subscriptionId,
        billingKeyId: input.billingKeyId ?? null,
        portonePaymentId: nextPaymentId,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        status: INVOICE_STATUS.READY,
      },
    });

    try {
      const { storeId, channelKey } = this.getSubscriptionPortOneConfig();
      const scheduledResult = await this.scheduleWithBillingKey({
        paymentId: nextPaymentId,
        billingKey: input.billingKey,
        orderName: `${input.planName} 구독 결제`,
        amount: input.amount,
        customerId: input.customerId,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhoneNumber: input.customerPhoneNumber,
        storeId,
        channelKey,
        timeToPay: input.nextBillingAt.toISOString(),
      });

      await client.subscriptionInvoice.update({
        where: { id: nextInvoice.id },
        data: {
          rawPayload: scheduledResult as Prisma.InputJsonValue,
        },
      });

      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][scheduleNextBillingCycle] scheduled subscriptionId=${input.subscriptionId}, paymentId=${nextPaymentId}, timeToPay=${input.nextBillingAt.toISOString()}, reason=${input.reason}`,
      );

      return { scheduled: true, paymentId: nextPaymentId };
    } catch (error: any) {
      const errorMessage = error?.message ?? '예약결제 등록 실패';

      await client.subscriptionInvoice.update({
        where: { id: nextInvoice.id },
        data: {
          status: INVOICE_STATUS.FAILED,
          failReason: `예약결제 등록 실패: ${errorMessage}`,
        },
      });

      await this.emitSubscriptionAlert(
        client,
        null,
        input.subscriptionId,
        `다음 회차 자동결제 예약 실패: ${errorMessage}`,
      );

      this.logger.error(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][scheduleNextBillingCycle] failed subscriptionId=${input.subscriptionId}, paymentId=${nextPaymentId}, reason=${errorMessage}`,
      );

      return { scheduled: false, paymentId: nextPaymentId };
    }
  }

  private async scheduleWithBillingKey(input: {
    paymentId: string;
    billingKey: string;
    orderName: string;
    amount: number;
    customerId: string;
    customerName: string;
    customerEmail?: string;
    customerPhoneNumber?: string;
    storeId: string;
    channelKey: string;
    timeToPay: string;
  }) {
    const secret = process.env.PORTONE_API_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('PORTONE_API_SECRET이 설정되지 않았습니다.');
    }

    const response = await fetch(`https://api.portone.io/payments/${input.paymentId}/schedule`, {
      method: 'POST',
      headers: {
        Authorization: `PortOne ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storeId: input.storeId,
        channelKey: input.channelKey,
        payment: {
          billingKey: input.billingKey,
          orderName: input.orderName,
          amount: {
            total: input.amount,
          },
          customer: {
            id: input.customerId,
            name: {
              full: input.customerName,
            },
            email: input.customerEmail,
            phoneNumber: input.customerPhoneNumber,
          },
          currency: 'KRW',
        },
        timeToPay: input.timeToPay,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadRequestException(`포트원 예약결제 등록 실패: ${message}`);
    }

    return response.json();
  }

  private async cancelPortOnePayment(input: { paymentId: string; reason: string }) {
    const secret = process.env.PORTONE_API_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('PORTONE_API_SECRET이 설정되지 않았습니다.');
    }

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelPortOnePayment] request paymentId=${input.paymentId}, reason=${input.reason}`,
    );

    const response = await fetch(`https://api.portone.io/payments/${input.paymentId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `PortOne ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: input.reason,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      this.logger.error(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelPortOnePayment] failed paymentId=${input.paymentId}, reason=${message}`,
      );
      throw new BadRequestException(`포트원 결제 취소 실패: ${message}`);
    }

    const result = await response.json();
    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelPortOnePayment] success paymentId=${input.paymentId}`,
    );
    return result;
  }

  private async cancelPortOneSchedules(input: { billingKey?: string; scheduleIds?: string[] }) {
    const secret = process.env.PORTONE_API_SECRET;
    if (!secret) {
      throw new InternalServerErrorException('PORTONE_API_SECRET이 설정되지 않았습니다.');
    }

    const hasBillingKey = typeof input.billingKey === 'string' && input.billingKey.trim().length > 0;
    const normalizedScheduleIds = Array.isArray(input.scheduleIds)
      ? input.scheduleIds.filter((scheduleId) => !!scheduleId)
      : [];

    if (!hasBillingKey && normalizedScheduleIds.length === 0) {
      throw new BadRequestException('예약 결제 취소를 위해 billingKey 또는 scheduleIds가 필요합니다.');
    }

    const requestInput: { billingKey?: string; scheduleIds?: string[] } = {
      billingKey: hasBillingKey ? input.billingKey : undefined,
      scheduleIds: normalizedScheduleIds.length > 0 ? normalizedScheduleIds : undefined,
    };

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelPortOneSchedules] request billingKey=${requestInput.billingKey ?? 'none'}, scheduleCount=${normalizedScheduleIds.length}, scheduleIds=${normalizedScheduleIds.join(',') || 'all-by-billing-key'}`,
    );

    try {
      const paymentScheduleClient = PortOne.PaymentScheduleClient({
        secret,
        storeId: process.env.PORTONE_STORE_ID,
      });

      const result = await paymentScheduleClient.revokePaymentSchedules(requestInput);
      this.logger.debug("=====예약취소요청==========================================================================");
      this.logger.debug(`[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelPortOneSchedules] result=${JSON.stringify(result)}`);
      this.logger.debug(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelPortOneSchedules] success billingKey=${requestInput.billingKey ?? 'none'}, scheduleCount=${normalizedScheduleIds.length}`,
      );
      return result;
    } catch (error: any) {
      const message = error?.data ? JSON.stringify(error.data) : (error?.message ?? '알 수 없는 오류');
      this.logger.error(
        `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][cancelPortOneSchedules] failed billingKey=${requestInput.billingKey ?? 'none'}, scheduleCount=${normalizedScheduleIds.length}, reason=${message}`,
      );
      throw new BadRequestException(`포트원 예약결제 취소 실패: ${message}`);
    }
  }

  private async emitSubscriptionAlert(
    _client: Prisma.TransactionClient | PrismaService,
    userId: string | null,
    subscriptionId: string,
    message: string,
  ) {
    this.logger.warn(
      `[paymentType=${PAYMENT_TYPE_SUBSCRIPTION}][subscription-alert] userId=${userId ?? 'none'}, subscriptionId=${subscriptionId}, message=${message}`,
    );
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

  private async resetAiCreditWalletForPlan(
    client: Prisma.TransactionClient | PrismaService,
    userId: string,
    planCode: string,
    amount: number,
  ) {
    const policy = this.resolveAiCreditPolicy(planCode, amount);
    if (!policy) {
      return;
    }

    await client.$executeRaw`
      INSERT INTO user_credit_wallet (user_id, total_credits, used_credits)
      VALUES (${userId}, ${policy.monthlyCredits}, 0)
      ON CONFLICT (user_id)
      DO UPDATE SET
        total_credits = EXCLUDED.total_credits,
        used_credits = 0,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  private async getCreditWallet(userId: string) {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ total_credits: number; used_credits: number; updated_at: Date | null }>
      >`SELECT total_credits, used_credits, updated_at FROM user_credit_wallet WHERE user_id = ${userId} LIMIT 1`;

      if (rows.length === 0) {
        return null;
      }

      const totalCredits = Number(rows[0].total_credits || 0);
      const usedCredits = Number(rows[0].used_credits || 0);

      return {
        totalCredits,
        usedCredits,
        availableCredits: Math.max(totalCredits - usedCredits, 0),
        updatedAt: rows[0].updated_at,
      };
    } catch (error) {
      this.logger.warn(`[getCreditWallet] user_credit_wallet 조회 실패 userId=${userId}`);
      return null;
    }
  }

  private resolveAiCreditPolicy(
    planCode: string,
    amount: number,
  ): { monthlyCredits: number; dailyLimit: number | null } | null {
    const normalizedPlanCode = (planCode || '').toUpperCase();

    if (
      normalizedPlanCode.includes('MASTER') ||
      normalizedPlanCode.includes('CONNECT') ||
      amount === 180000
    ) {
      return { monthlyCredits: UNLIMITED_MONTHLY_CREDITS, dailyLimit: 50 };
    }

    if (normalizedPlanCode.includes('PRO') || amount === 40000) {
      return { monthlyCredits: 200, dailyLimit: 50 };
    }

    if (normalizedPlanCode.includes('LIGHT') || amount === 10000) {
      return { monthlyCredits: 40, dailyLimit: null };
    }

    return null;
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

  private resolvePlanTier(code?: string | null): keyof typeof PLAN_TIER_WEIGHT {
    const normalizedCode = (code || '').toUpperCase();
    if (normalizedCode.includes('MASTER')) {
      return 'MASTER';
    }

    if (normalizedCode.includes('PRO') || normalizedCode.includes('PLUS')) {
      return 'PRO';
    }

    if (normalizedCode.includes('LIGHT') || normalizedCode.includes('BASIC')) {
      return 'LIGHT';
    }

    return 'GENERAL';
  }

  private async validateUpgradeEligibility(userId: string, targetPlanCode: string) {
    const subscription = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: { in: [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PAST_DUE] },
      },
      include: {
        plan: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const currentTier = this.resolvePlanTier(subscription?.plan?.code);
    const targetTier = this.resolvePlanTier(targetPlanCode);

    const isTargetLightOrPro = targetTier === 'LIGHT' || targetTier === 'PRO';

    if (!isTargetLightOrPro) {
      throw new BadRequestException('Light/Pro 요금제만 신청할 수 있습니다.');
    }

    if (!subscription) {
      return {
        tier: currentTier,
        code: null,
        name: 'General',
        status: null,
        requiresPlanChangeCleanup: false,
      };
    }

    const isCurrentLightOrPro = currentTier === 'LIGHT' || currentTier === 'PRO';
    if (!isCurrentLightOrPro) {
      throw new BadRequestException('현재 구독이 Light 또는 Pro 등급일 때만 플랜 변경이 가능합니다.');
    }

    if (PLAN_TIER_WEIGHT[targetTier] === PLAN_TIER_WEIGHT[currentTier]) {
      throw new BadRequestException('동일한 등급으로는 구독 플랜을 변경할 수 없습니다.');
    }

    return {
      tier: currentTier,
      code: subscription?.plan?.code ?? null,
      name: subscription?.plan?.name ?? 'General',
      status: subscription?.status ?? null,
      requiresPlanChangeCleanup: true,
    };
  }
}
