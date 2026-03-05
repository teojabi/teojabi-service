import { ReservationsService } from './reservations.service';
export declare class ReservationsController {
    private readonly reservationsService;
    constructor(reservationsService: ReservationsService);
    createReservation(req: any, body: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        date: Date;
        status: import(".prisma/client").$Enums.ResStatus;
        message: string | null;
        userId: string;
        propertyId: string;
    }>;
    getMyReservations(req: any): Promise<({
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
