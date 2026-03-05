import { PropertiesService } from './properties.service';
export declare class PropertiesController {
    private readonly propertiesService;
    constructor(propertiesService: PropertiesService);
    getProperties(): Promise<{
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
    getNearbyProperties(lat: number, lng: number, radius?: number): Promise<unknown>;
    getProperty(id: string): Promise<{
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
}
