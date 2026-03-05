import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PropertiesService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll() {
        return this.prisma.property.findMany({
            take: 50,
            orderBy: { createdAt: 'desc' },
        });
    }

    async findById(id: string) {
        return this.prisma.property.findUnique({ where: { id } });
    }

    // Placeholder for spatial search (PostGIS integration)
    async findNearby(lat: number, lng: number, radius: number) {
        // Requires specialized raw SQL for PostGIS functionality
        return this.prisma.$queryRaw`SELECT 1 as placeholder`;
    }
}
