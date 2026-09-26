import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

type WeightMap = Record<string, number>;
const inc = (map: WeightMap, key: unknown, weight = 1) => {
  const k = String(key ?? '').trim();
  if (k) map[k] = (map[k] || 0) + weight;
};
const top = (map: WeightMap, limit = 8) =>
  Object.entries(map)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, weight]) => ({ key, weight }));

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 최근 행동 이벤트(180일)와 저장 조건에서 관심 프로필을 다시 계산해 저장한다.
   * 찜(favorite)은 강한 선호, 조회(view_detail)는 약한 선호, 해제(unfavorite)는 약한 감점.
   */
  async rebuild(userId: string) {
    const events = await this.prisma.$queryRaw<Array<{ type: string; payload: any }>>`
      SELECT type, payload FROM public.user_event
      WHERE user_id=${userId} AND occurred_at > now() - interval '180 days'
      ORDER BY occurred_at DESC LIMIT 2000`;
    const conditions = await this.prisma.$queryRaw<Array<{ payload: any }>>`
      SELECT payload FROM public.discovery_item WHERE user_id=${userId} AND kind='condition'`;

    const districts: WeightMap = {};
    const zones: WeightMap = {};
    const usages: WeightMap = {};
    const stations: WeightMap = {};
    const commercialTypes: WeightMap = {};
    const commercialNames: WeightMap = {};
    const buildUses: WeightMap = {};
    let bMin: number | null = null;
    let bMax: number | null = null;
    let bSum = 0;
    let bN = 0;
    let preferTourism = 0;
    let excludeEducation = 0;
    let excludeHeritage = 0;
    const addBudget = (value: unknown) => {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) {
        bMin = bMin == null ? n : Math.min(bMin, n);
        bMax = bMax == null ? n : Math.max(bMax, n);
        bSum += n;
        bN += 1;
      }
    };

    for (const event of events) {
      const p = event.payload || {};
      if (event.type === 'condition_applied') {
        (p.districts || []).forEach((d: unknown) => inc(districts, d));
        (p.zones || []).forEach((z: unknown) => inc(zones, z));
        addBudget(p.budgetWon);
        inc(buildUses, p.buildUse);
        if (p.preferTourism) preferTourism += 1;
        if (p.excludeEducation) excludeEducation += 1;
        if (p.excludeHeritage) excludeHeritage += 1;
      } else if (event.type === 'view_detail') {
        inc(districts, p.district);
        inc(usages, p.usage);
        addBudget(p.priceWon);
      } else if (event.type === 'favorite') {
        inc(districts, p.district, 3);
        inc(usages, p.usage, 3);
        addBudget(p.priceWon);
      } else if (event.type === 'unfavorite') {
        if (p.district && districts[p.district]) districts[p.district] = Math.max(0, districts[p.district] - 1);
      } else if (event.type === 'station_filter') {
        inc(stations, p.station, 2);
      } else if (event.type === 'commercial_select') {
        (p.types || []).forEach((t: unknown) => inc(commercialTypes, t, 2));
        inc(commercialNames, p.name, 2);
      }
    }
    for (const row of conditions) {
      const p = row.payload || {};
      (p.districts || []).forEach((d: unknown) => inc(districts, d, 2));
      (p.zones || []).forEach((z: unknown) => inc(zones, z, 2));
      addBudget(p.budgetWon);
      inc(buildUses, p.buildUse, 2);
      if (p.preferTourism) preferTourism += 1;
      if (p.excludeEducation) excludeEducation += 1;
      if (p.excludeHeritage) excludeHeritage += 1;
    }

    const profile = {
      districts: top(districts),
      zones: top(zones),
      usages: top(usages),
      stations: top(stations),
      commercialTypes: top(commercialTypes),
      commercialNames: top(commercialNames),
      buildUses: top(buildUses),
      budget: bN ? { min: bMin, max: bMax, avg: Math.round(bSum / bN) } : null,
      flags: { preferTourism: preferTourism > 0, excludeEducation: excludeEducation > 0, excludeHeritage: excludeHeritage > 0 },
      eventCount: events.length,
      conditionCount: conditions.length,
    };
    await this.prisma.$executeRaw`
      INSERT INTO public.user_preference(user_id,profile,updated_at)
      VALUES (${userId},${JSON.stringify(profile)}::jsonb, now())
      ON CONFLICT (user_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=now()`;
    return { ...profile, updatedAt: new Date().toISOString() };
  }

  async get(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ profile: any; updatedAt: Date }>>`
      SELECT profile, updated_at AS "updatedAt" FROM public.user_preference WHERE user_id=${userId} LIMIT 1`;
    if (!rows.length) return null;
    return { ...rows[0].profile, updatedAt: rows[0].updatedAt };
  }

  // 최근 7일간 활동한 회원의 프로필을 매일 갱신한다.
  @Cron('0 15 4 * * *', { timeZone: 'Asia/Seoul' })
  async rebuildActive() {
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT DISTINCT user_id FROM public.user_event WHERE occurred_at > now() - interval '7 days'`;
    let done = 0;
    for (const row of rows) {
      try { await this.rebuild(row.user_id); done += 1; } catch (error) {
        this.logger.error(`Profile rebuild failed for ${row.user_id}`, error as Error);
      }
    }
    this.logger.log(`Profiles rebuilt: ${done}/${rows.length}`);
  }
}
