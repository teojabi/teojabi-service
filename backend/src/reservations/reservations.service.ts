import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, data: any) {
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
      orderBy: { date: 'desc' },
    });
  }

  async updateStatus(id: string, status: any) {
    return this.prisma.reservation.update({
      where: { id },
      data: { status },
    });
  }
}
