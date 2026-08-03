import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const REPORT_PAYMENT_AMOUNT = 400000;

const SUBSCRIPTION_STATUS = {
  ACTIVE: 'ACTIVE',
} as const;

const REPORT_AVAILABLE_PLAN_KEYWORDS = ['LIGHT', 'BASIC', 'PRO', 'PLUS', 'MASTER'] as const;
const PAYMENT_TYPE_ONETIME = 'onetime';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async prepareReportPayment(
    userId: string,
    data: { pnu?: string | null; address?: string | null },
  ) {
    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_ONETIME}][prepareReportPayment] started userId=${userId}, pnu=${data?.pnu ?? 'none'}`,
    );

    const { storeId, channelKey } = this.getOnetimePortOneConfig();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    const customerName = user?.name?.trim();
    if (!customerName) {
      throw new Error('결제를 위해 프로필 이름을 먼저 등록해주세요.');
    }

    const paymentId = this.generateReportPaymentId();
    const address = (data?.address || '').trim();
    const orderName = `${customerName}님의 ${address || '선택 부지'}의 전문가리포트`;

    const customerEmail = user?.email?.trim();
    const customerPhoneNumber = user?.phone?.trim();

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_ONETIME}][prepareReportPayment] ready userId=${userId}, paymentId=${paymentId}, amount=${REPORT_PAYMENT_AMOUNT}`,
    );

    return {
      storeId,
      channelKey,
      paymentId,
      amount: REPORT_PAYMENT_AMOUNT,
      orderName,
      customer: {
        id: `user_${userId}`,
        customerId: `user_${userId}`,
        name: {
          full: customerName,
        },
        fullName: customerName,
        email: customerEmail || undefined,
        phoneNumber: customerPhoneNumber || undefined,
      },
    };
  }

  async confirmReportPayment(
    userId: string,
    payload: {
      paymentId: string;
      propertyId?: string | null;
      pnu?: string | null;
      address?: string | null;
      message: string;
    },
  ) {
    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_ONETIME}][confirmReportPayment] started userId=${userId}, paymentId=${payload?.paymentId ?? 'none'}`,
    );

    if (!payload?.paymentId) {
      throw new Error('paymentId는 필수입니다.');
    }

    const payment = await this.getPortOnePayment(payload.paymentId);
    const paymentAmount = Number(payment?.amount?.total ?? payment?.amount ?? 0);
    const paymentStatus = payment?.status;
    const paymentCustomerId = payment?.customer?.id ?? payment?.customerId;

    if (paymentStatus !== 'PAID') {
      throw new ForbiddenException('결제가 완료되지 않았습니다.');
    }

    if (paymentAmount !== REPORT_PAYMENT_AMOUNT) {
      throw new ForbiddenException('결제 금액이 일치하지 않습니다.');
    }

    if (paymentCustomerId && paymentCustomerId !== `user_${userId}`) {
      throw new ForbiddenException('결제 사용자 정보가 일치하지 않습니다.');
    }

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_ONETIME}][confirmReportPayment] verified userId=${userId}, paymentId=${payload.paymentId}`,
    );

    return this.prisma.reservation.create({
      data: {
        userId,
        type: 'REPORT',
        propertyId: payload.propertyId || null,
        pnu: payload.pnu || null,
        address: payload.address || null,
        date: new Date(),
        message: payload.message,
      },
    });
  }

  async create(userId: string, data: any) {
    if (data.type === 'REPORT') {
      await this.ensureReportPermission(userId);
    }

    if (!data.propertyId && !data.pnu) {
      throw new Error('Property ID or PNU is required');
    }
    if (!data.date) {
      throw new Error('Date is required');
    }

    const reservationDate = new Date(data.date);
    if (isNaN(reservationDate.getTime())) {
      throw new Error('Invalid date');
    }

    // If propertyId is provided, check if property exists
    if (data.propertyId) {
      const property = await this.prisma.property.findUnique({
        where: { id: data.propertyId },
      });

      if (!property) {
        throw new Error('Property not found');
      }
    }

    console.log(`[ReservationsService] Creating reservation for user: ${userId}`, data);
    return this.prisma.reservation.create({
      data: {
        userId,
        type: data.type || 'GENERAL',
        propertyId: data.propertyId || null,
        pnu: data.pnu || null,
        address: data.address || null,
        date: reservationDate,
        message: data.message,
      },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.reservation.findMany({
      where: { userId },
      include: {
        property: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(query?: any) {
    const page = parseInt(query?.page || '1');
    const limit = parseInt(query?.limit || '10');
    const skip = (page - 1) * limit;
    const type = query?.type;
    const status = query?.status;

    const where: any = {};
    if (type && type !== 'ALL') {
      where.type = type;
    }
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        include: {
          property: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              phoneVerified: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    console.log(`[ReservationsService] Found ${items.length}/${total} reservations (page: ${page}, type: ${type})`);
    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(id: string, status: any) {
    return this.prisma.reservation.update({
      where: { id },
      data: { status },
    });
  }

  async updateAdminFeedback(id: string, adminFeedback: string | null) {
    return this.prisma.reservation.update({
      where: { id },
      data: {
        adminFeedback,
      },
    });
  }

  private async ensureReportPermission(userId: string) {
    const activeSubscription = await this.prisma.userSubscription.findFirst({
      where: {
        userId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        plan: {
          active: true,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        plan: {
          select: {
            code: true,
          },
        },
      },
    });

    const planCode = activeSubscription?.plan?.code?.toUpperCase() ?? '';
    const hasPermission = REPORT_AVAILABLE_PLAN_KEYWORDS.some((keyword) => planCode.includes(keyword));

    if (!hasPermission) {
      throw new ForbiddenException('전문가 리포트 신청은 유료 구독(Light/Pro/Master) 회원만 가능합니다.');
    }
  }

  private generateReportPaymentId() {
    // PortOne paymentId는 영문/숫자만 허용되므로 구분자(_, -) 없이 생성
    // 예: reportmb9x3n2hk4j8pz
    return `report${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  private async getPortOnePayment(paymentId: string) {
    const secret = process.env.PORTONE_API_SECRET;
    if (!secret) {
      throw new Error('PORTONE_API_SECRET이 설정되지 않았습니다.');
    }

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_ONETIME}][getPortOnePayment] request start paymentId=${paymentId}`,
    );

    const response = await fetch(`https://api.portone.io/payments/${paymentId}`, {
      headers: {
        Authorization: `PortOne ${secret}`,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`포트원 결제 조회 실패: ${message}`);
    }

    this.logger.debug(
      `[paymentType=${PAYMENT_TYPE_ONETIME}][getPortOnePayment] request success paymentId=${paymentId}`,
    );

    return response.json();
  }

  private getOnetimePortOneConfig() {
    const storeId = process.env.PORTONE_STORE_ID;
    const channelKey = process.env.PORTONE_CHANNEL_KEY_ONETIME;
    if (!storeId || !channelKey) {
      throw new Error('단건 결제 포트원 설정이 누락되었습니다.');
    }

    return { storeId, channelKey };
  }
}
