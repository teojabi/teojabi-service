import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

export interface UpdateUserDto {
  name?: string;
  email?: string;
  phone?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultCreditWallet(userId: string) {
    await this.prisma.$executeRaw`
      INSERT INTO user_credit_wallet (user_id, total_credits, used_credits)
      VALUES (${userId}, 2, 0)
      ON CONFLICT (user_id) DO NOTHING
    `;
  }

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

  async updateRole(id: string, role: Role) {
    return this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  async createSocialUser(
    provider: string,
    providerId: string,
    email: string,
    name: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          provider,
          providerId,
          email,
          name,
        },
      });

      // 기본 권한(로그인 사용자) 분석 요청 크레딧 2회 지급
      await tx.$executeRaw`
          INSERT INTO user_credit_wallet (user_id, total_credits, used_credits)
          VALUES (${user.id}, 2, 0)
          ON CONFLICT (user_id) DO NOTHING
        `;

      return user;
    });
  }
}
