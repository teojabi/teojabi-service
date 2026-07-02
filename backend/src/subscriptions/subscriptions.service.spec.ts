import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      subscriptionInvoice: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $executeRaw: jest.fn(),
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
    delete process.env.PORTONE_STORE_ID;
    delete process.env.PORTONE_CHANNEL_KEY_SUBSCRIPTION;
    delete process.env.PORTONE_CHANNEL_KEY_ONETIME;
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
});
