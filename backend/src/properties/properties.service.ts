import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PropertiesService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll() {
        return this.prisma.$queryRaw`
            SELECT id, title, description, address, price, 
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            ORDER BY "createdAt" DESC
            LIMIT 50;
        `;
    }

    async findById(id: string) {
        const rows = await this.prisma.$queryRaw<any[]>`
            SELECT id, title, description, address, price, 
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat
            FROM "Property"
            WHERE id = ${id}
        `;
        return rows.length > 0 ? rows[0] : null;
    }

    async createProperty(data: any) {
        const { title, description, address, price, lat, lng, ownerId } = data;
        const result = await this.prisma.$queryRaw<any[]>`
            INSERT INTO "Property" ("id", "title", "description", "address", "price", "location", "ownerId", "updatedAt")
            VALUES (gen_random_uuid(), ${title}, ${description}, ${address}, ${price}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${ownerId || null}, NOW())
            RETURNING id, title;
        `;
        return result[0];
    }

    async findNearby(lat: number, lng: number, radius: number) {
        // radius in meters
        const degreeRadius = radius / 111320.0;
        return this.prisma.$queryRaw`
            SELECT id, title, description, address, price, 
                   ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat,
                   ST_DistanceSphere(location, ST_MakePoint(${lng}, ${lat})) as distance
            FROM "Property"
            WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), ${degreeRadius})
            ORDER BY distance ASC
            LIMIT 50;
        `;
    }
}
