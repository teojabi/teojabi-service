import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type MembershipRow = {
  userId: string;
  email: string | null;
  name: string | null;
  accessLevel: 'MASTER' | 'ADMIN';
  active: boolean;
  createdAt: Date;
};

@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}

  private async masterMembership(userId: string, db: any = this.prisma) {
    const rows = await db.$queryRaw<Array<{ accessLevel: string }>>`
      SELECT access_level AS "accessLevel"
      FROM public.teojabi_admin_member
      WHERE user_id = ${userId} AND active = true
      LIMIT 1
    `;
    return rows[0]?.accessLevel === 'MASTER';
  }

  async getMyAccess(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ accessLevel: string; active: boolean }>>`
      SELECT access_level AS "accessLevel", active
      FROM public.teojabi_admin_member
      WHERE user_id = ${userId}
      LIMIT 1
    `;
    return { accessLevel: rows[0]?.active ? rows[0].accessLevel : null, canManageAdmins: rows[0]?.active && rows[0].accessLevel === 'MASTER' };
  }

  async listMembers(requesterId: string): Promise<MembershipRow[]> {
    if (!(await this.masterMembership(requesterId))) throw new ForbiddenException('마스터 관리자만 관리자 계정을 관리할 수 있습니다.');
    return this.prisma.$queryRaw<MembershipRow[]>`
      SELECT m.user_id AS "userId", u.email, u.name,
             m.access_level AS "accessLevel", m.active,
             m.created_at AS "createdAt"
      FROM public.teojabi_admin_member m
      JOIN public."user" u ON u.id = m.user_id
      WHERE m.active = true
      ORDER BY CASE WHEN m.access_level = 'MASTER' THEN 0 ELSE 1 END, m.created_at
    `;
  }

  async addAdmin(requesterId: string, rawEmail: string) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email || email.length > 254) throw new BadRequestException('회원 이메일을 확인해 주세요.');
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.masterMembership(requesterId, tx))) throw new ForbiddenException('마스터 관리자만 관리자를 추가할 수 있습니다.');
      const user = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
      if (!user) throw new NotFoundException('해당 이메일로 가입한 회원이 없습니다. 먼저 회원가입이 필요합니다.');
      const existing = await tx.$queryRaw<Array<{ previousRole: Role; accessLevel: string }>>`
        SELECT previous_role AS "previousRole", access_level AS "accessLevel"
        FROM public.teojabi_admin_member WHERE user_id = ${user.id} LIMIT 1
      `;
      if (existing[0]?.accessLevel === 'MASTER') throw new BadRequestException('마스터 계정은 변경할 수 없습니다.');
      const previousRole = existing[0]?.previousRole || user.role;
      await tx.user.update({ where: { id: user.id }, data: { role: Role.ADMIN } });
      await tx.$executeRaw`
        INSERT INTO public.teojabi_admin_member(user_id, access_level, previous_role, granted_by, active)
        VALUES (${user.id}, 'ADMIN', CAST(${previousRole} AS public."Role"), ${requesterId}, true)
        ON CONFLICT (user_id) DO UPDATE SET
          access_level = 'ADMIN', granted_by = EXCLUDED.granted_by,
          active = true, updated_at = now()
      `;
      return { userId: user.id, email: user.email, name: user.name, accessLevel: 'ADMIN', active: true };
    });
  }

  async removeAdmin(requesterId: string, userId: string) {
    if (requesterId === userId) throw new BadRequestException('마스터 본인의 권한은 해제할 수 없습니다.');
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.masterMembership(requesterId, tx))) throw new ForbiddenException('마스터 관리자만 관리자를 해제할 수 있습니다.');
      const rows = await tx.$queryRaw<Array<{ accessLevel: string; previousRole: Role }>>`
        SELECT access_level AS "accessLevel", previous_role AS "previousRole"
        FROM public.teojabi_admin_member
        WHERE user_id = ${userId} AND active = true
        FOR UPDATE
      `;
      const membership = rows[0];
      if (!membership) throw new NotFoundException('활성 관리자 계정을 찾지 못했습니다.');
      if (membership.accessLevel === 'MASTER') throw new BadRequestException('마스터 계정은 해제할 수 없습니다.');
      await tx.user.update({ where: { id: userId }, data: { role: membership.previousRole } });
      await tx.$executeRaw`
        UPDATE public.teojabi_admin_member
        SET active = false, updated_at = now()
        WHERE user_id = ${userId}
      `;
      return { status: 'removed', userId };
    });
  }
}
