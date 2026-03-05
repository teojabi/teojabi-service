import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) { }

    async findById(id: string) {
        return this.prisma.user.findUnique({ where: { id } });
    }

    async findByProvider(provider: string, providerId: string) {
        return this.prisma.user.findUnique({
            where: {
                provider_providerId: {
                    provider,
                    providerId,
                },
            },
        });
    }

    async createUser(data: any) {
        return this.prisma.user.create({ data });
    }
}
