import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import * as PortOne from '@portone/server-sdk';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      subscriptionInvoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userSubscription: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      billingKey: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        update: jest.fn(),
      },
      paymentWebhookEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.PORTONE_STORE_ID;
    delete process.env.PORTONE_CHANNEL_KEY_SUBSCRIPTION;
    delete process.env.PORTONE_CHANNEL_KEY_ONETIME;
    delete process.env.PORTONE_WEBHOOK_SECRET;
  });

  it('웹훅 payload 문자열이 비어있으면 예외를 던진다', async () => {
    await expect(service.handleWebhook('', {})).rejects.toThrow('payload가 비어있습니다.');
  });

  it('웹훅 검증 시 raw payload 문자열을 PortOne verify에 전달한다', async () => {
    process.env.PORTONE_WEBHOOK_SECRET = 'webhook-secret';
    const rawPayload = '{"id":"evt_1","data":{"paymentId":"pay_1","status":"PAID"}}';
    const headers = {
      'webhook-id': 'evt_1',
      'webhook-signature': 'signature',
      'webhook-timestamp': '1720000000',
    };

    const verifySpy = jest.spyOn(PortOne.Webhook, 'verify').mockResolvedValue({
      id: 'evt_1',
      data: { paymentId: 'pay_1', status: 'PAID' },
    } as any);
    prismaMock.paymentWebhookEvent.findUnique.mockResolvedValue({ id: 'event-1' });

    const result = await service.handleWebhook(rawPayload, headers);

    expect(verifySpy).toHaveBeenCalledWith('webhook-secret', rawPayload, headers);
    expect(result).toEqual({ ok: true, duplicated: true });
  });

  it('웹훅 secret 미설정 시 payload JSON 파싱 실패면 예외를 던진다', async () => {
    await expect(service.handleWebhook('not-json', {})).rejects.toThrow(
      '유효하지 않은 webhook payload입니다.',
    );
  });

  it('Store ID는 공통 설정을 사용하고 채널은 정기 전용 설정을 사용한다', () => {
    process.env.PORTONE_STORE_ID = 'common-store';
    process.env.PORTONE_CHANNEL_KEY_SUBSCRIPTION = 'subscription-channel';

    const config = (service as any).getSubscriptionPortOneConfig();

    expect(config).toEqual({
      storeId: 'common-store',
      channelKey: 'subscription-channel',
    });
  });

  it('정기 채널 키가 없으면 예외를 던진다', () => {
    process.env.PORTONE_STORE_ID = 'common-store';

    expect(() => (service as any).getSubscriptionPortOneConfig()).toThrow(
      '정기결제 포트원 설정이 누락되었습니다.',
    );
  });

  it('다음 회차 예약결제는 READY 송장이 이미 있으면 중복 생성하지 않는다', async () => {
    process.env.PORTONE_STORE_ID = 'common-store';
    process.env.PORTONE_CHANNEL_KEY_SUBSCRIPTION = 'subscription-channel';

    prismaMock.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'invoice-ready',
      portonePaymentId: 'sub_existing',
    });

    const scheduleSpy = jest.spyOn(service as any, 'scheduleWithBillingKey');

    const result = await (service as any).scheduleNextBillingCycle(prismaMock, {
      subscriptionId: 'sub-1',
      billingKeyId: 'bk-1',
      billingKey: 'billing-key',
      customerId: 'user_1',
      customerName: '홍길동',
      planCode: 'LIGHT_MONTHLY',
      planName: 'Light',
      amount: 10000,
      currency: 'KRW',
      nextBillingAt: new Date('2026-07-01T00:00:00.000Z'),
      reason: 'webhook-paid',
    });

    expect(result).toEqual({ scheduled: false, skipped: true });
    expect(prismaMock.subscriptionInvoice.create).not.toHaveBeenCalled();
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  it('다음 회차 예약 등록 실패 시 송장을 FAILED로 전환한다', async () => {
    process.env.PORTONE_STORE_ID = 'common-store';
    process.env.PORTONE_CHANNEL_KEY_SUBSCRIPTION = 'subscription-channel';

    prismaMock.subscriptionInvoice.findFirst.mockResolvedValue(null);
    prismaMock.subscriptionInvoice.create.mockResolvedValue({
      id: 'invoice-next',
      portonePaymentId: 'sub_next',
    });
    prismaMock.subscriptionInvoice.update.mockResolvedValue({ id: 'invoice-next' });

    jest.spyOn(service as any, 'scheduleWithBillingKey').mockRejectedValue(new Error('schedule failed'));
    const alertSpy = jest.spyOn(service as any, 'emitSubscriptionAlert').mockResolvedValue(undefined);

    const result = await (service as any).scheduleNextBillingCycle(prismaMock, {
      subscriptionId: 'sub-1',
      billingKeyId: 'bk-1',
      billingKey: 'billing-key',
      customerId: 'user_1',
      customerName: '홍길동',
      planCode: 'LIGHT_MONTHLY',
      planName: 'Light',
      amount: 10000,
      currency: 'KRW',
      nextBillingAt: new Date('2026-07-01T00:00:00.000Z'),
      reason: 'initial-confirm',
    });

    expect(result.scheduled).toBe(false);
    expect(prismaMock.subscriptionInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-next' },
        data: expect.objectContaining({
          status: 'FAILED',
        }),
      }),
    );
    expect(alertSpy).toHaveBeenCalled();
  });

  it('구독 취소 case1: 크레딧 사용 이력이 있으면 예약결제만 취소하고 환불하지 않는다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      plan: { code: 'LIGHT_MONTHLY', name: 'Light' },
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    });
    prismaMock.subscriptionInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-ready-1',
        portonePaymentId: 'sub_ready_1',
        rawPayload: {
          schedule: {
            id: 'sched_ready_1',
            paymentId: 'sub_ready_1',
          },
        },
        billingKey: {
          billingKey: 'billing_key_1',
        },
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([
      {
        total_credits: 40,
        used_credits: 5,
        updated_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'invoice-paid-1',
      portonePaymentId: 'sub_paid_1',
    });

    const cancelScheduleSpy = jest
      .spyOn(service as any, 'cancelPortOneSchedules')
      .mockResolvedValue({ revokedScheduleIds: ['sched_ready_1'] });
    const cancelPaidSpy = jest.spyOn(service as any, 'cancelPortOnePayment').mockResolvedValue({ ok: true });

    const result = await service.cancelSubscription('user-1');

    expect(result.caseType).toBe('CANCEL_ONLY');
    expect(cancelScheduleSpy).toHaveBeenCalledTimes(1);
    expect(cancelScheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        billingKey: 'billing_key_1',
        scheduleIds: ['sched_ready_1'],
      }),
    );
    expect(cancelPaidSpy).not.toHaveBeenCalled();
    expect(prismaMock.subscriptionInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-ready-1' },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      }),
    );
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: 'USER' },
      }),
    );
  });

  it('구독 취소 case2: 당월 크레딧 미사용이면 예약결제 취소 + 당월 결제 환불 + 크레딧 0 처리한다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue({
      id: 'sub-2',
      plan: { code: 'PRO_MONTHLY', name: 'Pro' },
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    });
    prismaMock.subscriptionInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-ready-2',
        portonePaymentId: 'sub_ready_2',
        rawPayload: {
          id: 'sched_ready_2',
          paymentId: 'sub_ready_2',
        },
        billingKey: {
          billingKey: 'billing_key_2',
        },
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([
      {
        total_credits: 200,
        used_credits: 0,
        updated_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.subscriptionInvoice.findFirst.mockResolvedValue({
      id: 'invoice-paid-2',
      portonePaymentId: 'sub_paid_2',
    });

    const cancelScheduleSpy = jest
      .spyOn(service as any, 'cancelPortOneSchedules')
      .mockResolvedValue({ revokedScheduleIds: ['sched_ready_2'] });
    const cancelPaidSpy = jest.spyOn(service as any, 'cancelPortOnePayment').mockResolvedValue({ ok: true });

    const result = await service.cancelSubscription('user-2');

    expect(result.caseType).toBe('REFUND_WITH_ZERO_CREDIT');
    expect(result.refundedPaymentId).toBe('sub_paid_2');
    expect(cancelScheduleSpy).toHaveBeenCalledTimes(1);
    expect(cancelScheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        billingKey: 'billing_key_2',
        scheduleIds: ['sched_ready_2'],
      }),
    );
    expect(cancelPaidSpy).toHaveBeenCalledTimes(1);
    expect(cancelPaidSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        paymentId: 'sub_paid_2',
      }),
    );
    expect(prismaMock.subscriptionInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invoice-paid-2' },
        data: expect.objectContaining({
          status: 'CANCELLED',
        }),
      }),
    );
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: 'USER' },
      }),
    );
  });

  it('구독 취소 시 READY 송장에 billingKey가 없으면 예외를 던진다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue({
      id: 'sub-3',
      plan: { code: 'LIGHT_MONTHLY', name: 'Light' },
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    });
    prismaMock.subscriptionInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-ready-3',
        portonePaymentId: 'sub_ready_3',
        billingKey: null,
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([
      {
        total_credits: 40,
        used_credits: 10,
        updated_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.subscriptionInvoice.findFirst.mockResolvedValue(null);

    await expect(service.cancelSubscription('user-3')).rejects.toThrow(
      '예약 결제 취소에 필요한 billingKey 정보가 없습니다.',
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('구독 취소 시 READY 송장의 scheduleId를 찾지 못하면 billingKey 기준으로 예약 취소를 시도한다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue({
      id: 'sub-5',
      plan: { code: 'LIGHT_MONTHLY', name: 'Light' },
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    });
    prismaMock.subscriptionInvoice.findMany.mockResolvedValue([
      {
        id: 'invoice-ready-5',
        portonePaymentId: 'sub_ready_5',
        rawPayload: {
          paymentId: 'sub_ready_5',
        },
        billingKey: {
          billingKey: 'billing_key_5',
        },
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([
      {
        total_credits: 40,
        used_credits: 10,
        updated_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.subscriptionInvoice.findFirst.mockResolvedValue(null);

    const cancelScheduleSpy = jest
      .spyOn(service as any, 'cancelPortOneSchedules')
      .mockResolvedValue({ revokedScheduleIds: [] });
    const cancelPaidSpy = jest.spyOn(service as any, 'cancelPortOnePayment').mockResolvedValue({ ok: true });

    const result = await service.cancelSubscription('user-5');

    expect(result.caseType).toBe('CANCEL_ONLY');
    expect(cancelScheduleSpy).toHaveBeenCalledTimes(1);
    expect(cancelScheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        billingKey: 'billing_key_5',
      }),
    );
    expect((cancelScheduleSpy.mock.calls[0][0] as any).scheduleIds).toBeUndefined();
    expect(cancelPaidSpy).not.toHaveBeenCalled();
  });

  it('구독 취소 시 READY 송장이 없어도 활성 billingKey가 있으면 billingKey 기준으로 예약 취소를 시도한다', async () => {
    prismaMock.userSubscription.findFirst.mockResolvedValue({
      id: 'sub-4',
      plan: { code: 'LIGHT_MONTHLY', name: 'Light' },
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
    });
    prismaMock.subscriptionInvoice.findMany.mockResolvedValue([]);
    prismaMock.billingKey.findMany.mockResolvedValue([
      {
        billingKey: 'billing_key_4',
      },
    ]);
    prismaMock.$queryRaw.mockResolvedValue([
      {
        total_credits: 40,
        used_credits: 10,
        updated_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.subscriptionInvoice.findFirst.mockResolvedValue(null);

    const cancelScheduleSpy = jest
      .spyOn(service as any, 'cancelPortOneSchedules')
      .mockResolvedValue({ revokedScheduleIds: [] });
    const cancelPaidSpy = jest.spyOn(service as any, 'cancelPortOnePayment').mockResolvedValue({ ok: true });

    const result = await service.cancelSubscription('user-4');

    expect(result.caseType).toBe('CANCEL_ONLY');
    expect(cancelScheduleSpy).toHaveBeenCalledTimes(1);
    expect(cancelScheduleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        billingKey: 'billing_key_4',
      }),
    );
    expect((cancelScheduleSpy.mock.calls[0][0] as any).scheduleIds).toBeUndefined();
    expect(cancelPaidSpy).not.toHaveBeenCalled();
  });
});
