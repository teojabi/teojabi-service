import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findById(id: string): Promise<{
        id: string;
        email: string | null;
        name: string | null;
        image: string | null;
        role: import(".prisma/client").$Enums.Role;
        provider: string | null;
        providerId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    findByProvider(provider: string, providerId: string): Promise<{
        id: string;
        email: string | null;
        name: string | null;
        image: string | null;
        role: import(".prisma/client").$Enums.Role;
        provider: string | null;
        providerId: string | null;
        createdAt: Date;
        updatedAt: Date;
    } | null>;
    createUser(data: any): Promise<{
        id: string;
        email: string | null;
        name: string | null;
        image: string | null;
        role: import(".prisma/client").$Enums.Role;
        provider: string | null;
        providerId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    createSocialUser(provider: string, providerId: string, email: string, name: string): Promise<{
        id: string;
        email: string | null;
        name: string | null;
        image: string | null;
        role: import(".prisma/client").$Enums.Role;
        provider: string | null;
        providerId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
