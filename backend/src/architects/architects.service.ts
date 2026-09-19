import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateArchitectStatusDto, UpsertArchitectDto } from './architects.dto';

type ArchitectRow = {
  id: string;
  userId: string;
  officeName: string;
  representativeName: string;
  bio: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  kakaoUrl: string | null;
  regions: string | null;
  specialties: string | null;
  status: string;
  featured: boolean;
  sortOrder: number;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ArchitectsService implements OnModuleInit {
  private readonly logger = new Logger(ArchitectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseService: SupabaseService,
  ) {}

  // 마이그레이션 파이프라인이 없는 환경에서도 안전하게 동작하도록 표를 보장한다.
  async onModuleInit() {
    try {
      await this.ensureSchema();
    } catch (error) {
      this.logger.error('건축사 표를 확인하지 못했습니다.', error as Error);
    }
  }

  private async ensureSchema() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.architect_profile (
        id text PRIMARY KEY,
        user_id text NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
        office_name text NOT NULL,
        representative_name text NOT NULL,
        bio text,
        logo_url text,
        website_url text,
        phone text,
        email text,
        address text,
        kakao_url text,
        regions text,
        specialties text,
        status text NOT NULL DEFAULT 'PENDING',
        featured boolean NOT NULL DEFAULT false,
        sort_order integer NOT NULL DEFAULT 0,
        approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS architect_profile_status_idx ON public.architect_profile(status, sort_order)',
    );
  }

  private url(value?: string | null) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    if (text.length > 500) return text.slice(0, 500);
    if (/^(https?:)?\/\//i.test(text)) return text.startsWith('http') ? text : `https:${text}`;
    return `https://${text}`;
  }

  private text(value?: string | null, max = 300) {
    const trimmed = String(value ?? '').trim();
    return trimmed ? trimmed.slice(0, max) : null;
  }

  private shape(row: ArchitectRow) {
    return {
      id: row.id,
      officeName: row.officeName,
      representativeName: row.representativeName,
      bio: row.bio ?? '',
      logoUrl: row.logoUrl ?? null,
      websiteUrl: row.websiteUrl ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
      kakaoUrl: row.kakaoUrl ?? null,
      regions: row.regions ?? '',
      specialties: row.specialties ?? '',
      status: row.status,
      featured: row.featured,
      sortOrder: row.sortOrder,
      approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listPublic() {
    const rows = await this.prisma.architectProfile.findMany({
      where: { status: 'APPROVED' },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 30,
    });
    return rows.map((row) => this.shape(row as ArchitectRow));
  }

  async getMine(userId: string) {
    const row = await this.prisma.architectProfile.findUnique({ where: { userId } });
    return row ? this.shape(row as ArchitectRow) : null;
  }

  async upsertMine(userId: string, dto: UpsertArchitectDto) {
    const officeName = this.text(dto.officeName, 120);
    const representativeName = this.text(dto.representativeName, 80);
    if (!officeName || !representativeName) {
      throw new BadRequestException('사무소명과 대표 건축사명을 입력해 주세요.');
    }
    const existing = await this.prisma.architectProfile.findUnique({ where: { userId } });
    // 이미 승인된 프로필은 수정해도 공개를 유지하고, 신규·보류 건은 다시 검토 대기로 둔다.
    const status = existing?.status === 'APPROVED' ? 'APPROVED' : 'PENDING';
    const data = {
      officeName,
      representativeName,
      bio: this.text(dto.bio, 2000),
      logoUrl: this.url(dto.logoUrl),
      websiteUrl: this.url(dto.websiteUrl),
      phone: this.text(dto.phone, 40),
      email: this.text(dto.email, 254),
      address: this.text(dto.address, 300),
      kakaoUrl: this.url(dto.kakaoUrl),
      regions: this.text(dto.regions, 300),
      specialties: this.text(dto.specialties, 300),
      status,
    };
    const row = await this.prisma.architectProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.shape(row as ArchitectRow);
  }

  async uploadLogo(userId: string, file: any) {
    if (!file || !file.buffer) throw new BadRequestException('로고 이미지를 선택해 주세요.');
    const logoUrl = await this.supabaseService.uploadImage(file);
    const existing = await this.prisma.architectProfile.findUnique({ where: { userId } });
    if (existing) {
      await this.prisma.architectProfile.update({ where: { userId }, data: { logoUrl } });
    }
    return { logoUrl };
  }

  async listAll() {
    const rows = await this.prisma.architectProfile.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => this.shape(row as ArchitectRow));
  }

  async setStatus(id: string, dto: UpdateArchitectStatusDto) {
    const existing = await this.prisma.architectProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('건축사 프로필을 찾지 못했습니다.');
    const data: { status?: string; approvedAt?: Date | null; featured?: boolean; sortOrder?: number } = {};
    if (dto.status) {
      data.status = dto.status;
      data.approvedAt = dto.status === 'APPROVED' ? new Date() : null;
    }
    if (typeof dto.featured === 'boolean') data.featured = dto.featured;
    if (typeof dto.sortOrder === 'number') data.sortOrder = dto.sortOrder;
    if (!Object.keys(data).length) throw new BadRequestException('변경할 값이 없습니다.');
    const row = await this.prisma.architectProfile.update({ where: { id }, data });
    return this.shape(row as ArchitectRow);
  }
}
