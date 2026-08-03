import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CliOptions = {
  subscriptionId: string;
  minutes: number;
};

function readCliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : undefined;
}

function parseCliOptions(): CliOptions {
  const subscriptionId = readCliArg('subscriptionId') || process.env.TEST_SUBSCRIPTION_ID;
  if (!subscriptionId) {
    throw new Error('subscriptionId가 필요합니다. 예: --subscriptionId=... 또는 TEST_SUBSCRIPTION_ID 환경변수');
  }

  const minutesArg = readCliArg('minutes');
  const minutes = minutesArg ? Number(minutesArg) : 5;
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error('minutes는 0보다 큰 숫자여야 합니다. 예: --minutes=5');
  }

  return { subscriptionId, minutes };
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

function generateTestPaymentId() {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseResponsePayload(text: string): Prisma.InputJsonValue {
  if (!text) {
    return { empty: true };
  }

  try {
    return JSON.parse(text) as Prisma.InputJsonValue;
  } catch {
    return { raw: text };
  }
}

async function main() {
  const { subscriptionId, minutes } = parseCliOptions();
  const prisma = new PrismaService();

  try {
    await prisma.$connect();

    const subscription = await prisma.userSubscription.findUnique({
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
      throw new Error(`구독을 찾을 수 없습니다. subscriptionId=${subscriptionId}`);
    }

    const customerName = subscription.user.name?.trim();
    if (!customerName) {
      throw new Error('예약결제 등록을 위해 사용자 이름이 필요합니다.');
    }

    const billingKey = await prisma.billingKey.findFirst({
      where: {
        userId: subscription.userId,
        isActive: true,
      },
      orderBy: {
        issuedAt: 'desc',
      },
    });

    if (!billingKey) {
      throw new Error(`활성 billingKey를 찾을 수 없습니다. userId=${subscription.userId}`);
    }

    const secret = requireEnv('PORTONE_API_SECRET');
    const storeId = requireEnv('PORTONE_STORE_ID');
    const channelKey = requireEnv('PORTONE_CHANNEL_KEY_SUBSCRIPTION');

    const nextBillingAt = new Date(Date.now() + minutes * 60 * 1000);
    const paymentId = generateTestPaymentId();

    const invoice = await prisma.subscriptionInvoice.create({
      data: {
        subscriptionId: subscription.id,
        billingKeyId: billingKey.id,
        portonePaymentId: paymentId,
        amount: subscription.plan.amount,
        currency: subscription.plan.currency,
        status: 'READY',
      },
    });

    const scheduleResponse = await fetch(`https://api.portone.io/payments/${paymentId}/schedule`, {
      method: 'POST',
      headers: {
        Authorization: `PortOne ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        storeId,
        channelKey,
        payment: {
          billingKey: billingKey.billingKey,
          orderName: `${subscription.plan.name} 구독 결제`,
          amount: {
            total: Number(subscription.plan.amount),
          },
          customer: {
            id: billingKey.portoneCustomerId,
            name: {
              full: customerName,
            },
            email: subscription.user.email?.trim() || undefined,
            phoneNumber: subscription.user.phone?.trim() || undefined,
          },
          currency: subscription.plan.currency,
        },
        timeToPay: nextBillingAt.toISOString(),
      }),
    });

    const responseText = await scheduleResponse.text();
    const payload = parseResponsePayload(responseText);

    if (!scheduleResponse.ok) {
      const failReason =
        typeof payload === 'object' && payload !== null
          ? `테스트 예약결제 등록 실패: ${JSON.stringify(payload)}`
          : `테스트 예약결제 등록 실패: ${responseText}`;

      await prisma.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'FAILED',
          failReason,
          rawPayload: payload,
        },
      });

      throw new Error(failReason);
    }

    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        rawPayload: payload,
      },
    });

    console.log('[subscription-test-schedule] 예약 등록 완료');
    console.log(`- subscriptionId: ${subscription.id}`);
    console.log(`- userId: ${subscription.userId}`);
    console.log(`- paymentId: ${paymentId}`);
    console.log(`- timeToPay: ${nextBillingAt.toISOString()}`);
    console.log(`- invoiceId: ${invoice.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[subscription-test-schedule] 실패: ${message}`);
  process.exit(1);
});
