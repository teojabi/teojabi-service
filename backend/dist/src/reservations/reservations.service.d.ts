import { PrismaService } from '../prisma/prisma.service';
export declare class ReservationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(userId: string, data: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        date: Date;
        status: import(".prisma/client").$Enums.ResStatus;
        message: string | null;
        userId: string;
        propertyId: string;
    }>;
    findAllForUser(userId: string): Promise<({
        property: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            title: string;
            description: string;
            address: string;
            images: string[];
            price: import("@prisma/client-runtime-utils").Decimal | null;
            ownerId: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        date: Date;
        status: import(".prisma/client").$Enums.ResStatus;
        message: string | null;
        userId: string;
        propertyId: string;
    })[]>;
    updateStatus(id: string, status: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        date: Date;
        status: import(".prisma/client").$Enums.ResStatus;
        message: string | null;
        userId: string;
        propertyId: string;
    }>;
}
