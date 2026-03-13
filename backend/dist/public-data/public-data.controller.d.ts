import { PublicDataService } from './public-data.service';
export declare class PublicDataController {
    private readonly publicDataService;
    constructor(publicDataService: PublicDataService);
    getPublicData(address: string): Promise<{
        success: boolean;
        message: string;
        data?: undefined;
    } | {
        success: boolean;
        data: {
            id: string;
            address: string;
            officialPrice: import("@prisma/client/runtime/library").Decimal | null;
            actualPrice: import("@prisma/client/runtime/library").Decimal | null;
            landUsePlan: string | null;
            syncedAt: Date;
        };
        message?: undefined;
    }>;
}
