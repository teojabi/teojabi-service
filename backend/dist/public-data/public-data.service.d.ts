import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
export declare class PublicDataService {
    private readonly httpService;
    private readonly prisma;
    private readonly logger;
    constructor(httpService: HttpService, prisma: PrismaService);
    handleCron(): Promise<void>;
    syncAddress(address: string): Promise<{
        id: string;
        address: string;
        officialPrice: import("@prisma/client/runtime/library").Decimal | null;
        actualPrice: import("@prisma/client/runtime/library").Decimal | null;
        landUsePlan: string | null;
        syncedAt: Date;
    }>;
    getPublicData(address: string): Promise<{
        id: string;
        address: string;
        officialPrice: import("@prisma/client/runtime/library").Decimal | null;
        actualPrice: import("@prisma/client/runtime/library").Decimal | null;
        landUsePlan: string | null;
        syncedAt: Date;
    }>;
}
