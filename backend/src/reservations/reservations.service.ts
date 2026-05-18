import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SUBSCRIPTION_STATUS = {
  ACTIVE: 'ACTIVE',
} as const;

const REPORT_AVAILABLE_PLAN_KEYWORDS = ['LIGHT', 'PRO', 'MASTER'] as const;

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
