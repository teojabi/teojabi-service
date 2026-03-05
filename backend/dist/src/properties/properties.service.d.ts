import { PrismaService } from '../prisma/prisma.service';
export declare class PropertiesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string;
        address: string;
        images: string[];
        price: import("@prisma/client-runtime-utils").Decimal | null;
        ownerId: string | null;
    }[]>;
    findById(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        title: string;
        description: string;
        address: string;
        images: string[];
        price: import("@prisma/client-runtime-utils").Decimal | null;
        ownerId: string | null;
    } | null>;
    findNearby(lat: number, lng: number, radius: number): Promise<unknown>;
}
