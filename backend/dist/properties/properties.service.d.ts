import { PrismaService } from '../prisma/prisma.service';
export declare class PropertiesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<unknown>;
    findById(id: string): Promise<any>;
    createProperty(data: any): Promise<any>;
    findNearby(lat: number, lng: number, radius: number): Promise<unknown>;
}
