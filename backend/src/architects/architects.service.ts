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
  businessNumber: string | null;
  businessStartDate: string | null;
  businessName: string | null;
  businessVerified: boolean;
  businessStatus: string | null;
  businessStatusText: string | null;
  businessCheckedAt: Date | null;
  status: string;
  featured: boolean;
  sortOrder: number;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type BusinessVerification = {
  status: 'verified' | 'inactive' | 'not-found' | 'unavailable' | 'invalid-input' | 'skipped';
  businessStatus?: string | null;
  businessStatusText?: string | null;
  taxType?: string | null;
  endDate?: string | null;
};

const digits = (value?: string | null) => String(value ?? '').replace(/[^0-9]/g, '');

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
        business_number text,
        business_start_date text,
        business_name text,
        business_verified boolean NOT NULL DEFAULT false,
        business_status text,
        business_status_text text,
        business_checked_at timestamptz,
        status text NOT NULL DEFAULT 'PENDING',
        featured boolean NOT NULL DEFAULT false,
        sort_order integer NOT NULL DEFAULT 0,
        approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE public.architect_profile
        ADD COLUMN IF NOT EXISTS business_number text,
        ADD COLUMN IF NOT EXISTS business_start_date text,
        ADD COLUMN IF NOT EXISTS business_name text,
        ADD COLUMN IF NOT EXISTS business_verified boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS business_status text,
        ADD COLUMN IF NOT EXISTS business_status_text text,
        ADD COLUMN IF NOT EXISTS business_checked_at timestamptz
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

  // 국세청 사업자등록정보 진위확인 + 상태조회. NTS_SERVICE_KEY가 없으면 건너뛴다.
  async verifyBusiness(input: {
    businessNumber?: string | null;
    businessStartDate?: string | null;
    representativeName?: string | null;
    businessName?: string | null;
  }): Promise<BusinessVerification> {
    const key = process.env.NTS_SERVICE_KEY || '';
    const bNo = digits(input.businessNumber);
    const startDt = digits(input.businessStartDate);
    const pNm = String(input.representativeName ?? '').trim();
    if (!bNo || !startDt || !pNm) return { status: 'invalid-input', businessStatusText: '사업자등록번호·개업연월일·대표자명을 확인해 주세요.' };
    if (bNo.length !== 10 || startDt.length !== 8) return { status: 'invalid-input', businessStatusText: '사업자등록번호 10자리, 개업연월일 8자리를 확인해 주세요.' };
    if (!key) {
      this.logger.warn('NTS_SERVICE_KEY가 설정되지 않았습니다.');
      return { status: 'unavailable', businessStatusText: '국세청 확인 키(NTS_SERVICE_KEY)가 서버에 설정되지 않았어요.' };
    }
    try {
      const response = await fetch(
        `https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=${encodeURIComponent(key)}&returnType=JSON`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            businesses: [{ b_no: bNo, start_dt: startDt, p_nm: pNm, b_nm: this.text(input.businessName, 120) ?? '' }],
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const raw = await response.text();
      let data: any = null;
      try { data = JSON.parse(raw); } catch { data = null; }
      const item = data?.data?.[0];
      if (!response.ok || data?.status_code !== 'OK' || !item) {
        const detail = data?.status_code ? `응답 ${data.status_code}` : `응답 ${response.status}`;
        this.logger.warn(`사업자 진위확인 비정상 응답(${detail}): ${raw.slice(0, 200)}`);
        return { status: 'unavailable', businessStatusText: `국세청 응답이 올바르지 않아요. (${detail})` };
      }
      if (item.valid !== '01') {
        return { status: 'not-found', businessStatusText: '국세청에 등록되지 않았거나 정보가 일치하지 않아요.' };
      }
      const st = item.status || {};
      return {
        status: st.b_stt_cd === '01' ? 'verified' : 'inactive',
        businessStatus: st.b_stt_cd ?? null,
        businessStatusText: st.b_stt ?? null,
        taxType: st.tax_type ?? null,
        endDate: st.end_dt ?? null,
      };
    } catch (error) {
      this.logger.warn(`사업자 진위확인 호출 실패: ${(error as Error).message}`);
      return { status: 'unavailable', businessStatusText: `국세청 호출에 실패했어요. (${(error as Error).message})` };
    }
  }

  private shape(row: ArchitectRow, { sensitive = false } = {}) {
    const base = {
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
      businessVerified: row.businessVerified,
      status: row.status,
      featured: row.featured,
      sortOrder: row.sortOrder,
      approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (!sensitive) return base;
    return {
      ...base,
      businessNumber: row.businessNumber ?? null,
      businessStartDate: row.businessStartDate ?? null,
      businessName: row.businessName ?? null,
      businessStatus: row.businessStatus ?? null,
      businessStatusText: row.businessStatusText ?? null,
      businessCheckedAt: row.businessCheckedAt ? row.businessCheckedAt.toISOString() : null,
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
    return row ? this.shape(row as ArchitectRow, { sensitive: true }) : null;
  }

  async upsertMine(userId: string, dto: UpsertArchitectDto) {
    const officeName = this.text(dto.officeName, 120);
    const representativeName = this.text(dto.representativeName, 80);
    if (!officeName || !representativeName) {
      throw new BadRequestException('사무소명과 대표 건축사명을 입력해 주세요.');
    }
    const businessNumber = digits(dto.businessNumber).slice(0, 10);
    const businessStartDate = digits(dto.businessStartDate).slice(0, 8);
    const businessName = this.text(dto.businessName, 120);
    if (businessNumber.length !== 10) throw new BadRequestException('사업자등록번호 10자리를 입력해 주세요.');
    if (businessStartDate.length !== 8) throw new BadRequestException('개업연월일을 사업자등록증 기준(YYYYMMDD)으로 입력해 주세요.');
    if (!businessName) throw new BadRequestException('사업자 상호를 입력해 주세요. 국세청에 등록된 상호와 같아야 확인돼요.');

    const verification = await this.verifyBusiness({
      businessNumber,
      businessStartDate,
      representativeName,
      businessName,
    });

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
      businessNumber,
      businessStartDate,
      businessName,
      businessVerified: verification.status === 'verified',
      businessStatus: verification.businessStatus ?? null,
      businessStatusText: verification.businessStatusText ?? null,
      businessCheckedAt: new Date(),
      status,
    };
    const row = await this.prisma.architectProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return { ...this.shape(row as ArchitectRow, { sensitive: true }), verification };
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
    return rows.map((row) => this.shape(row as ArchitectRow, { sensitive: true }));
  }

  // 국세청 연동 상태 점검(관리자용). 키 설정 여부와 실제 호출 결과를 돌려준다.
  async diagnoseBusiness() {
    const key = process.env.NTS_SERVICE_KEY || '';
    const configured = key.length > 0;
    if (!configured) return { keyConfigured: false, reachable: false, message: 'NTS_SERVICE_KEY가 서버에 설정되지 않았어요.' };
    try {
      const response = await fetch(
        `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(key)}&returnType=JSON`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ b_no: ['8461302909'] }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const raw = await response.text();
      const data: any = (() => { try { return JSON.parse(raw); } catch { return null; } })();
      return {
        keyConfigured: true,
        keyLength: key.length,
        reachable: response.ok && data?.status_code === 'OK',
        httpStatus: response.status,
        statusCode: data?.status_code ?? null,
        message: data?.status_code === 'OK' ? '국세청 연결 정상' : `국세청 응답 코드: ${data?.status_code ?? response.status}`,
      };
    } catch (error) {
      return { keyConfigured: true, keyLength: key.length, reachable: false, message: `국세청 호출 실패: ${(error as Error).message}` };
    }
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
    return this.shape(row as ArchitectRow, { sensitive: true });
  }
}
