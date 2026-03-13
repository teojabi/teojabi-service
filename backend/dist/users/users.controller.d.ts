import { UsersService } from './users.service';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    getProfile(req: any): Promise<{
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
}
