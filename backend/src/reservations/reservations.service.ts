import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReservationsService {
    constructor(private readonly prisma: PrismaService) { }

    async create(userId: string, data: any) {
        return this.prisma.reservation.create({
            data: {
                userId,
                propertyId: data.propertyId,
                date: new Date(data.date),
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
