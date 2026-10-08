import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { buildDigestBody, DigestCondition, DigestItem } from '../mail/digest.template';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const clampLead = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 1), 14) : 7;
};

type SavedRow = { kind: string; key: string; payload: any };
type Alert = {
  type: 'auction' | 'onbid' | 'listing' | 'notice';
  key: string;
  origin: 'favorite' | 'condition' | 'notice';
  conditionName: string | null;
  date: string;
  kindLabel: string;
  title: string;
  detail: string;
  meta?: Record<string, unknown>;
};
type InboxRow = {
  key: string;
  kind: string;
  origin: string;
  conditionName: string | null;
  date: string | null;
  title: string | null;
  detail: string | null;
  score: number | null;
  readAt: Date | null;
  emailedAt: Date | null;
};
export type NotificationPreferences = {
  email: boolean;
  webPush: boolean;
  kakao: boolean;
  favorites: boolean;
  conditions: boolean;
  leadDays: number;
};

// 이메일·푸시·카카오는 명시적 수신 동의(옵트인) 전까지 꺼둔다. 알림함(웹)은 동의 없이도 보인다.
const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: true,
  webPush: false,
  kakao: false,
  favorites: true,
  conditions: true,
  leadDays: 7,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private kst(shiftDays = 0) {
    return new Date(Date.now() + KST_OFFSET_MS + shiftDays * DAY_MS);
  }

  private date(shiftDays = 0) {
    return this.kst(shiftDays).toISOString().slice(0, 10);
  }

  // '안 본 매물'·'예외 추천'은 주 2회(월·목 KST)만 보낸다.
  private isDiscoveryDay() {
    const dow = this.kst(0).getUTCDay(); // 0=일 … 6=토
    return dow === 1 || dow === 4;
  }

  private stamp(shiftDays = 0) {
    return this.kst(shiftDays).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  }

  private dateOf(value: unknown) {
    // date/timestamp 컬럼은 Prisma가 JS Date로 돌려준다. String(Date)는 "Wed Oct 02 ..."가 되므로 반드시 먼저 처리한다.
    if (value instanceof Date) {
      const t = value.getTime();
      return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
    }
    const raw = String(value ?? '');
    if (/^\d{8}/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return raw.slice(0, 10);
  }

  private labelFor(date: string) {
    const target = Date.parse(`${date}T00:00:00+09:00`);
    const today = Date.parse(`${this.date()}T00:00:00+09:00`);
    const diff = Math.round((target - today) / DAY_MS);
    if (!Number.isFinite(diff)) return '';
    return diff <= 0 ? '오늘' : `D-${diff}`;
  }

  private money(value: unknown) {
    const n = Number(value);
    return n > 0 ? `${(n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억원` : '가격 미기재';
  }

  // 평당가(가격 ÷ 평수). 1평 = 3.3058㎡.
  private pppText(priceWon: number, areaM2: number) {
    const area = Number(areaM2) || 0;
    if (!(priceWon > 0) || !(area > 0)) return '';
    const perPyeong = (priceWon * 3.3058) / area;
    const text = perPyeong >= 1e8
      ? `${(perPyeong / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`
      : `${Math.round(perPyeong / 1e4).toLocaleString('ko-KR')}만원`;
    return `평당 ${text}`;
  }

  private kindLabelFor(kind: string, date: string | null) {
    if (kind === 'notice') return '공지';
    if (kind === 'listing') return '맞춤 매물';
    const prefix = kind === 'auction' ? '경매' : '공매';
    return date ? `${prefix} ${this.labelFor(date)}` : prefix;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const rows = await this.prisma.$queryRaw<Array<any>>`
      SELECT email, web_push AS "webPush", kakao, favorites, conditions, lead_days AS "leadDays"
      FROM public.notification_preference WHERE user_id=${userId} LIMIT 1`;
    if (!rows.length) return { ...DEFAULT_PREFERENCES };
    const row = rows[0];
    return {
      email: row.email !== false,
      webPush: row.webPush === true,
      kakao: row.kakao === true,
      favorites: row.favorites !== false,
      conditions: row.conditions !== false,
      leadDays: clampLead(row.leadDays),
    };
  }

  async savePreferences(userId: string, input: any): Promise<NotificationPreferences> {
    const current = await this.getPreferences(userId);
    const next: NotificationPreferences = {
      email: typeof input?.email === 'boolean' ? input.email : current.email,
      webPush: typeof input?.webPush === 'boolean' ? input.webPush : current.webPush,
      kakao: typeof input?.kakao === 'boolean' ? input.kakao : current.kakao,
      favorites: typeof input?.favorites === 'boolean' ? input.favorites : current.favorites,
      conditions: typeof input?.conditions === 'boolean' ? input.conditions : current.conditions,
      leadDays: input?.leadDays != null ? clampLead(input.leadDays) : current.leadDays,
    };
    await this.prisma.$executeRaw`
      INSERT INTO public.notification_preference(user_id,email,web_push,kakao,favorites,conditions,lead_days,updated_at)
      VALUES (${userId},${next.email},${next.webPush},${next.kakao},${next.favorites},${next.conditions},${next.leadDays},now())
      ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email,web_push=EXCLUDED.web_push,kakao=EXCLUDED.kakao,
        favorites=EXCLUDED.favorites,conditions=EXCLUDED.conditions,lead_days=EXCLUDED.lead_days,updated_at=now()`;
    return next;
  }

  // 원클릭 수신거부: 이메일에 담긴 서명 토큰으로 로그인 없이 이메일 알림을 끈다.
  private unsubscribeSecret() {
    return process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || 'teojabi-unsubscribe';
  }
  unsubscribeToken(userId: string) {
    return createHmac('sha256', this.unsubscribeSecret()).update(String(userId)).digest('hex').slice(0, 32);
  }
  unsubscribeUrl(userId: string) {
    const base = process.env.PUBLIC_API_BASE || 'https://api.teojabi.com';
    return `${base}/api/v1/notifications/unsubscribe?u=${encodeURIComponent(userId)}&t=${this.unsubscribeToken(userId)}`;
  }
  async unsubscribe(userId: string, token: string) {
    if (!userId || !token || token !== this.unsubscribeToken(userId)) return { ok: false };
    await this.prisma.$executeRaw`
      INSERT INTO public.notification_preference(user_id,email,updated_at) VALUES (${userId},false,now())
      ON CONFLICT (user_id) DO UPDATE SET email=false, updated_at=now()`;
    return { ok: true };
  }

  // --- 알림함(개별 항목) -----------------------------------------------------

  async getInboxForUser(userId: string, leadDays?: number) {
    const preferences = await this.getPreferences(userId);
    const days = clampLead(leadDays ?? preferences.leadDays);
    return this.getInbox(userId, days, { favorites: preferences.favorites, conditions: preferences.conditions });
  }

  async markRead(userId: string) {
    await this.prisma.$executeRaw`
      UPDATE public.notification_item SET read_at=now() WHERE user_id=${userId} AND read_at IS NULL`;
    return { status: 'ok' };
  }

  async deleteItem(userId: string, key: string) {
    await this.prisma.$executeRaw`
      DELETE FROM public.notification_item WHERE user_id=${userId} AND item_key=${key}`;
    return { status: 'ok' };
  }

  // 이메일로 보낸 항목만 '보냄' 표시(앱에서 읽음 처리와 분리). 못 보낸 나머지는 다음에 다시 시도한다.
  private async markEmailed(userId: string, keys: string[]) {
    if (!keys.length) return;
    await this.prisma.$executeRaw`
      UPDATE public.notification_item SET emailed_at=now() WHERE user_id=${userId} AND item_key IN (${Prisma.join(keys)})`;
  }

  // 저장된 최근 알림 항목을 반환한다(목록 + 안 읽은 개수).
  private async listInbox(userId: string) {
    const rows = await this.prisma.$queryRaw<InboxRow[]>`
      SELECT item_key AS "key", kind, origin, condition_name AS "conditionName",
             to_char(event_date,'YYYY-MM-DD') AS "date", title, detail, meta, score, read_at AS "readAt", emailed_at AS "emailedAt"
      FROM public.notification_item
      WHERE user_id=${userId}
      ORDER BY (read_at IS NULL) DESC, score DESC NULLS LAST, event_date ASC NULLS LAST, created_at DESC
      LIMIT 60`;
    const items = rows.map((row) => ({
      type: row.kind as Alert['type'],
      key: row.key,
      origin: row.origin as Alert['origin'],
      conditionName: row.conditionName,
      date: row.date ?? '',
      kindLabel: this.kindLabelFor(row.kind, row.date),
      title: row.title ?? '',
      detail: row.detail ?? '',
      meta: (row as any).meta ?? null,
      score: row.score == null ? null : Number(row.score),
      read: row.readAt != null,
      emailed: row.emailedAt != null,
    }));
    const unreadCount = items.filter((item) => !item.read).length;
    // 조건별 최근 30일 알림 건수. 알림이 많은 조건에 조정 안내를 보여주기 위한 참고값.
    const stats = await this.prisma.$queryRaw<Array<{ name: string | null; count: bigint }>>`
      SELECT condition_name AS name, count(*) AS count
      FROM public.notification_item
      WHERE user_id=${userId} AND origin='condition' AND created_at >= now() - interval '30 days'
      GROUP BY condition_name`;
    const conditionAlertCounts: Record<string, number> = {};
    for (const row of stats) if (row.name) conditionAlertCounts[row.name] = Number(row.count);
    return { status: 'ready', generatedAt: new Date().toISOString(), count: items.length, unreadCount, items, conditionAlertCounts };
  }

  // 새로 생긴 매칭·공지만 알림 항목으로 추가한다. 첫 조회는 기준선(기존 매칭은 읽음 처리)으로 삼아
  // 과거 물건이 한꺼번에 알림으로 쏟아지지 않게 한다.
  private async syncInbox(userId: string, candidates: Alert[]) {
    const existingRows = await this.prisma.$queryRaw<Array<{ item_key: string }>>`
      SELECT item_key FROM public.notification_item WHERE user_id=${userId}`;
    const existing = new Set(existingRows.map((r) => r.item_key));
    const firstRun = existing.size === 0;
    const readAt = firstRun ? new Date() : null;

    for (const candidate of candidates) {
      if (!candidate.key || existing.has(candidate.key)) continue;
      existing.add(candidate.key);
      // 날짜 형식이 어긋나면 ::date 캐스트가 실패해 알림함 전체가 막히므로, 유효한 날짜만 넣고 나머지는 비운다.
      const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.date || '')) ? candidate.date : null;
      try {
        await this.prisma.$executeRaw`
          INSERT INTO public.notification_item
            (user_id,item_key,kind,origin,condition_name,event_date,title,detail,meta,score,read_at,emailed_at)
          VALUES (${userId},${candidate.key},${candidate.type},${candidate.origin},${candidate.conditionName},
                  ${eventDate}::date,${candidate.title},${candidate.detail},
                  ${candidate.meta ? JSON.stringify(candidate.meta) : null}::jsonb,
                  ${candidate.meta?.score ?? null},${readAt},${readAt})
          ON CONFLICT (user_id,item_key) DO NOTHING`;
      } catch (error) {
        // 한 건이 실패해도 나머지 알림은 정상적으로 저장되도록 건별로 흡수한다.
        this.logger.error(`Inbox insert failed for ${candidate.key}`, error as Error);
      }
    }

    const notices = await this.prisma.$queryRaw<Array<{ id: bigint; title: string; body: string | null; date: string }>>`
      SELECT id, title, body, to_char(published_at,'YYYY-MM-DD') AS date
      FROM public.notice WHERE active=true ORDER BY published_at DESC LIMIT 20`;
    for (const notice of notices) {
      const key = `notice:${notice.id}`;
      if (existing.has(key)) continue;
      existing.add(key);
      await this.prisma.$executeRaw`
        INSERT INTO public.notification_item
          (user_id,item_key,kind,origin,condition_name,event_date,title,detail,read_at,emailed_at)
        VALUES (${userId},${key},'notice','notice',NULL,${notice.date}::date,${notice.title},${notice.body ?? ''},${readAt},now())
        ON CONFLICT (user_id,item_key) DO NOTHING`;
    }
  }

  async getInbox(userId: string, leadDays: number, options: { favorites?: boolean; conditions?: boolean } = {}) {
    const zoneMap = await this.zoneLimits();
    const cursor = await this.alertCursor();
    const candidates = await this.collectAlerts(userId, leadDays, options, zoneMap, cursor);
    const profile = await this.userProfile(userId);
    for (const candidate of candidates) {
      const score = this.scoreCandidate(profile, candidate);
      if (score != null) candidate.meta = { ...(candidate.meta || {}), score };
    }
    await this.syncInbox(userId, candidates);
    return this.listInbox(userId);
  }

  private async userProfile(userId: string): Promise<any | null> {
    const rows = await this.prisma.$queryRaw<Array<{ profile: any }>>`
      SELECT profile FROM public.user_preference WHERE user_id=${userId} LIMIT 1`;
    return rows[0]?.profile ?? null;
  }

  // 프로필과 매물 특징을 견줘 0~100 점수를 낸다(목적별 가중). 프로필·특징이 없으면 null.
  private scoreCandidate(profile: any, candidate: Alert): number | null {
    const features = candidate.meta?.features as any;
    if (!profile || !features) return null;
    const norm = (list: any[], key: string) => {
      if (!Array.isArray(list) || !list.length || !key) return 0;
      const max = Math.max(...list.map((x) => Number(x.weight) || 0)) || 1;
      const hit = list.find((x) => key.includes(String(x.key)) || String(x.key).includes(key));
      return hit ? (Number(hit.weight) || 0) / max : 0;
    };
    let score = 0;
    score += 30 * norm(profile.districts, features.district || '');
    score += 15 * norm(profile.zones, features.zone || '');
    score += 15 * norm(profile.usages, features.usage || '');
    const avg = Number(profile.budget?.avg);
    const price = Number(features.price);
    if (avg > 0 && price > 0) score += 15 * Math.max(0, 1 - Math.abs(price - avg) / avg);
    const purpose = profile.purposes?.[0]?.key;
    if (purpose === 'new-build') {
      const remaining = Number(features.remainingFar);
      if (Number.isFinite(remaining)) score += remaining > 0 ? 20 * Math.min(1, remaining / 200) : -10;
      const buildUse = profile.buildUses?.[0]?.key;
      if (buildUse === 'hotel' && /관광|상업/.test(String(features.specialZone) + String(features.zone))) score += 10;
    } else if (purpose === 'renovate') {
      if (features.currentFar != null) score += 8;
    } else if (purpose === 'invest') {
      score += 6;
    } else if (purpose === 'own-use') {
      score += 4 * norm(profile.usages, features.usage || '');
    }
    return Math.round(Math.max(0, Math.min(100, score)));
  }

  // 용도지역별 허용 건폐율·용적률(법정 상한) 조회. 개발여력 계산에 쓴다.
  private async zoneLimits() {
    const rows = await this.prisma.$queryRaw<Array<{ zone_name: string; bcr: any; far: any }>>`
      SELECT zone_name, bcr_limit AS bcr, far_limit AS far FROM public.zoning_regulation`;
    const map: Record<string, { bcr: number; far: number }> = {};
    for (const row of rows) map[row.zone_name] = { bcr: Number(row.bcr), far: Number(row.far) };
    return map;
  }

  // 매물의 개발여력 포맷: 허용/현재/여유 용적률과 여유 연면적(신축 검토용).
  private development(row: any, zoneMap: Record<string, { bcr: number; far: number }>) {
    const zone = String(row?.use_zone || '').trim() || null;
    const reg = zone ? zoneMap[zone] : undefined;
    const land = Number(row?.land_area_m2);
    const building = Number(row?.building_area_m2);
    // 허용 용적률/건폐율: master_land(지구단위계획 반영) 값을 우선하고, 없으면 용도지역 법정 상한.
    const rowFar = Number(row?.far_limit);
    const rowBcr = Number(row?.bcr_limit);
    const allowedFar = row?.far_limit != null && Number.isFinite(rowFar) ? rowFar : (reg ? reg.far : null);
    const allowedBcr = row?.bcr_limit != null && Number.isFinite(rowBcr) ? rowBcr : (reg ? reg.bcr : null);
    const currentFar = Number.isFinite(land) && land > 0 && Number.isFinite(building) && building > 0
      ? Math.round((building / land) * 100)
      : null;
    const remainingFar = allowedFar != null && currentFar != null ? Math.round((allowedFar - currentFar) * 10) / 10 : null;
    const buildableFloorAreaM2 = remainingFar != null && remainingFar > 0 && Number.isFinite(land) && land > 0
      ? Math.round((remainingFar / 100) * land)
      : null;
    const districtPlan = String(row?.district_plan || '').trim() || null;
    if (!zone && currentFar == null && !districtPlan) return null;
    return { zone, allowedFar, allowedBcr, currentFar, remainingFar, buildableFloorAreaM2, districtPlan };
  }

  // 찜·저장 조건에 맞는 현재 물건을 모은다(임박 기간 내).
  private async collectAlerts(
    userId: string,
    leadDays: number,
    options: { favorites?: boolean; conditions?: boolean; skipSpecials?: boolean } = {},
    zoneMap: Record<string, { bcr: number; far: number }> = {},
    cursor: Date = new Date(0),
  ): Promise<Alert[]> {
    const includeFavorites = options.favorites !== false;
    const includeConditions = options.conditions !== false;
    const saved = await this.prisma.$queryRaw<SavedRow[]>`
      SELECT kind, item_key AS key, payload FROM public.discovery_item
      WHERE user_id=${userId} AND kind IN ('favorite','condition')`;
    const start = this.date(0);
    const end = this.date(leadDays);
    const startStamp = this.stamp(0);
    const endStamp = this.stamp(leadDays);
    const items: Alert[] = [];
    // '안 본 매물'·'예외 추천'은 주 2회(월·목 KST)만. 그날만 조회 기록을 모은다.
    const specialDay = includeConditions && !options.skipSpecials && this.isDiscoveryDay();
    const seen = specialDay ? await this.seenListingIds(userId).catch(() => ({ naver: [] as string[], disco: [] as string[] })) : { naver: [] as string[], disco: [] as string[] };

    const favAuction = includeFavorites
      ? saved.filter((r) => r.kind === 'favorite' && r.key.startsWith('auction:')).map((r) => r.key.slice('auction:'.length))
      : [];
    const favOnbid = includeFavorites
      ? saved.filter((r) => r.kind === 'favorite' && r.key.startsWith('onbid:')).map((r) => r.key.slice('onbid:'.length))
      : [];

    if (favAuction.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT docid, full_address, min_price, usage_name, sale_date, sale_hour,
               use_zone, land_area_m2, building_area_m2, far_limit, bcr_limit, district_plan,
               sigu, special_zone, height_district
        FROM public.auction_item
        WHERE docid IN (${Prisma.join(favAuction)})
          AND sale_date >= ${start}::date AND sale_date <= ${end}::date
        ORDER BY sale_date ASC LIMIT 50`);
      for (const r of rows) items.push(this.auctionAlert(r, 'favorite', null, zoneMap));
    }

    if (favOnbid.length) {
      const cltrs = [...new Set(favOnbid.map((k) => k.split('::')[0]))];
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT cltr_mng_no, pbct_cdtn_no, cltr_nm, lowst_bid_prc, usg_mcls_nm, bid_end_dt
        FROM public.onbid_item
        WHERE cltr_mng_no IN (${Prisma.join(cltrs)})
          AND bid_end_dt >= ${startStamp} AND bid_end_dt <= ${endStamp}
        ORDER BY bid_end_dt ASC LIMIT 50`);
      const wanted = new Set(favOnbid);
      for (const r of rows) {
        if (wanted.has(`${r.cltr_mng_no}::${r.pbct_cdtn_no}`)) items.push(this.onbidAlert(r, 'favorite', null));
      }
    }

    for (const savedRow of includeConditions ? saved.filter((r) => r.kind === 'condition') : []) {
      const payload = savedRow.payload || {};
      // 조건별 알림을 끈 경우 그 조건은 매칭하지 않는다.
      if (payload.alerts === false) continue;
      const conditionName = payload.name || '저장 조건';
      const districts = Array.isArray(payload.districts) ? payload.districts.filter((d: any) => typeof d === 'string') : [];
      // 새로 올라온 매물(네이버·디스코) 매칭 — 최대 3건.
      try { items.push(...(await this.listingAlerts(payload, conditionName, cursor))); } catch { /* 매물 매칭 실패는 무시 */ }
      // 주 2회(월·목): 조건에 맞는 '아직 안 보신 매물' + '예외 추천'(각 1건).
      if (specialDay) {
        try { const d = await this.discoveryAlert(payload, conditionName, seen); if (d) items.push(d); } catch { /* 발견 매칭 실패는 무시 */ }
        try { const e = await this.exceptionAlert(payload, conditionName, seen); if (e) items.push(e); } catch { /* 예외 매칭 실패는 무시 */ }
      }

      const auction = payload.auction;
      if (!auction?.enabled) continue;
      const source = auction.source || 'court';
      const wantCourt = source === 'court' || source === 'both';
      const wantOnbid = source === 'onbid' || source === 'both';
      const usages = Array.isArray(auction.usages) ? auction.usages.filter((u: any) => typeof u === 'string') : [];
      const dealType = auction.dealType || '';
      const maxPrice = Number(auction.maxPriceWon) || 0;
      const maxRate = Number(auction.maxBidRate) || 0;
      const failMax = Number(auction.failMax) || 0;
      const sort = payload?.sort;

      // 새로 올라온 경매 물건 — 최대 3건.
      if (wantCourt) {
        const conditions: Prisma.Sql[] = [Prisma.sql`a.first_seen_at > ${cursor}`, Prisma.sql`coalesce(a.sale_kind, 'whole') <> 'share'`, Prisma.sql`a.is_share IS NOT TRUE`, Prisma.sql`coalesce(a.detail_address,'') !~ '[0-9]+[[:space:]]*[층호]'`];
        if (districts.length) conditions.push(Prisma.sql`a.sigu IN (${Prisma.join(districts)})`);
        if (usages.length) conditions.push(Prisma.sql`(${Prisma.join(usages.map((u: string) => Prisma.sql`a.usage_name ILIKE ${'%' + u + '%'}`), ' OR ')})`);
        if (dealType) conditions.push(Prisma.sql`a.deal_type = ${dealType}`);
        if (maxPrice) conditions.push(Prisma.sql`a.min_price <= ${maxPrice}`);
        if (maxRate) conditions.push(Prisma.sql`a.noti_min_rate <= ${maxRate}`);
        if (failMax) conditions.push(Prisma.sql`a.fail_count <= ${failMax}`);
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT a.docid, a.full_address, a.min_price, a.usage_name, a.sale_date, a.sale_hour,
                 a.use_zone, a.land_area_m2, a.building_area_m2, a.area_max, a.obj_area_m2,
                 a.court_name, a.case_no, a.sale_kind,
                 a.far_limit, a.bcr_limit, a.district_plan, a.sigu, a.special_zone, a.height_district
          FROM public.auction_item a WHERE ${Prisma.join(conditions, ' AND ')}
          ORDER BY ${sort === 'ppp' ? Prisma.sql`(a.min_price / NULLIF(coalesce(a.obj_area_m2, a.area_max, a.land_area_m2, a.building_area_m2), 0)) ASC NULLS LAST` : Prisma.sql`a.first_seen_at DESC`} LIMIT 60`);
        // 일괄매각(bundle)은 사건 단위로 묶어 면적을 합산한다(목록의 '일괄 합계'와 동일).
        const groupMap = new Map<string, any[]>();
        for (const r of rows) {
          const key = (r.sale_kind || 'whole') === 'bundle' && r.case_no ? `case:${r.court_name || ''}:${r.case_no}` : `row:${r.docid}`;
          const list = groupMap.get(key);
          if (list) list.push(r);
          else groupMap.set(key, [r]);
        }
        const areaOf = (x: any) => Number(x.obj_area_m2) || Number(x.area_max) || Number(x.land_area_m2) || Number(x.building_area_m2) || 0;
        let shown = 0;
        for (const list of groupMap.values()) {
          if (shown >= 3) break;
          shown += 1;
          const representative = list.slice().sort((a, b) => areaOf(b) - areaOf(a))[0] || list[0];
          const areaM2 = list.reduce((sum, r) => sum + areaOf(r), 0);
          items.push(this.auctionAlert(representative, 'condition', conditionName, zoneMap, { areaM2: areaM2 || null, bundleCount: list.length }));
        }
      }

      // 새로 올라온 공매 물건 — 최대 3건.
      if (wantOnbid) {
        const conditions: Prisma.Sql[] = [Prisma.sql`o.first_seen_at > ${cursor}`];
        if (districts.length) conditions.push(Prisma.sql`o.sigu IN (${Prisma.join(districts)})`);
        if (usages.length) conditions.push(Prisma.sql`(${Prisma.join(usages.map((u: string) => Prisma.sql`(o.usg_mcls_nm ILIKE ${'%' + u + '%'} OR o.usg_scls_nm ILIKE ${'%' + u + '%'})`), ' OR ')})`);
        if (dealType) conditions.push(Prisma.sql`o.deal_type = ${dealType}`);
        if (maxPrice) conditions.push(Prisma.sql`o.lowst_bid_prc <= ${maxPrice}`);
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT o.cltr_mng_no, o.pbct_cdtn_no, o.cltr_nm, o.lowst_bid_prc, o.usg_mcls_nm, o.usg_lcls_nm,
                 o.land_area_m2, o.building_area_m2, o.bundle, o.bid_end_dt
          FROM public.onbid_item o WHERE ${Prisma.join(conditions, ' AND ')}
          ORDER BY ${sort === 'ppp' ? Prisma.sql`(o.lowst_bid_prc / NULLIF(coalesce(o.land_area_m2, o.building_area_m2), 0)) ASC NULLS LAST` : Prisma.sql`o.first_seen_at DESC`} LIMIT 3`);
        for (const r of rows) items.push(this.onbidAlert(r, 'condition', conditionName));
      }
    }

    // 같은 키(경매·공매는 조건·찜 공통)와, 매물은 같은 주소가 여러 조건에 걸려도 하나만 남긴다.
    const dedup = new Map<string, Alert>();
    for (const item of items) {
      if (!item.key) continue;
      const addr = String(item.title || '').replace(/\s+/g, '');
      const dedupKey = item.type === 'listing' && addr ? `addr:${addr}` : item.key;
      if (!dedup.has(dedupKey)) dedup.set(dedupKey, item);
    }
    return [...dedup.values()];
  }

  @Cron('0 0 11 * * *', { timeZone: 'Asia/Seoul' })
  async dispatchDailyEmail() {
    const mailReady = this.mail.isConfigured();
    if (!mailReady) this.logger.warn('Email digest: mail not configured; syncing inboxes only.');
    // 메일 수신 여부와 무관하게 모든 회원의 알림함을 갱신한다(인박스 최신 유지).
    const users = await this.prisma.$queryRaw<Array<{ userId: string; email: string | null }>>`
      SELECT id AS "userId", email FROM public."user"`;
    // 저장 조건(알림 켠 것) 또는 찜이 있는 회원에게 알린다. (찜만 있어도 찜 마감 알림은 받음)
    const activeRows = await this.prisma.$queryRaw<Array<{ userId: string }>>`
      SELECT DISTINCT user_id AS "userId" FROM public.discovery_item
      WHERE (kind='condition' AND COALESCE(payload->>'alerts','true') <> 'false') OR kind='favorite'`;
    const hasAlerts = new Set(activeRows.map((r) => r.userId));
    const today = this.date();
    let sent = 0;
    for (const user of users) {
      if (!hasAlerts.has(user.userId)) continue;
      try {
        const preferences = await this.getPreferences(user.userId);
        const inbox = await this.getInbox(user.userId, preferences.leadDays, {
          favorites: preferences.favorites,
          conditions: preferences.conditions,
        });
        if (!mailReady || !preferences.email || !user.email) continue;
        // 아직 메일로 안 보낸 항목만 담는다(이메일 발송과 앱 읽음은 분리). 한 번에 너무 많지 않게 상한을 둔다.
        const unread = inbox.items.filter((item) => !item.emailed).slice(0, 15);
        if (!unread.length) continue;
        const dedupeKey = `email:${user.userId}:${today}`;
        const inserted = await this.prisma.$executeRaw`
          INSERT INTO public.notification_delivery(user_id,dedupe_key,channel,item_count,status)
          VALUES (${user.userId},${dedupeKey},'email',${unread.length},'SENT')
          ON CONFLICT (dedupe_key) DO NOTHING`;
        if (inserted === 0) continue;
        const summaries = await this.conditionSummaryMap(user.userId);
        const listingCount = unread.filter((item: any) => item.type === 'listing').length;
        const auctionCount = unread.filter((item: any) => item.type === 'auction' || item.type === 'onbid').length;
        const heading = listingCount && auctionCount ? '새로운 매물·경매 임박 알림'
          : auctionCount ? '경매 임박 알림'
          : '새로운 매물 알림';
        await this.mail.send({
          to: user.email,
          title: `[터잡이] ${heading}`,
          body: buildDigestBody(this.toDigestConditions(unread, summaries), { inquiryEmail: 'teojabi@gmail.com', unsubscribeUrl: this.unsubscribeUrl(user.userId), heading }),
        });
        await this.markEmailed(user.userId, unread.map((item: any) => item.key).filter(Boolean));
        sent += 1;
      } catch (error) {
        this.logger.error(`Email digest failed for ${user.userId}`, error as Error);
        await this.prisma
          .$executeRaw`UPDATE public.notification_delivery SET status='FAILED', error=${String((error as Error)?.message ?? error).slice(0, 200)} WHERE dedupe_key=${`email:${user.userId}:${today}`}`
          .catch(() => undefined);
      }
    }
    // 하루치 매칭이 끝나면 커서를 현재로 올린다(다음 날은 이 시각 이후 신규분만 대상).
    await this.advanceCursor().catch((error) => this.logger.error('Cursor advance failed', error as Error));
    this.logger.log(`Daily notification sync: ${sent}/${users.length} emailed`);
  }

  // 오류 정정용 재발송: 조건에 맞는 항목만 추려 지정 회원에게 다시 보낸다('안 본 매물·예외 추천' 제외).
  async resendDigestForUsers(userIds: string[], note: string, dryRun = false) {
    const mailReady = this.mail.isConfigured();
    const results: Array<Record<string, unknown>> = [];
    for (const userId of userIds) {
      try {
        const rows = await this.prisma.$queryRaw<Array<{ email: string | null }>>`
          SELECT email FROM public."user" WHERE id=${userId}`;
        const email = rows[0]?.email?.trim();
        const preferences = await this.getPreferences(userId);
        if (!mailReady || !preferences.email || !email) {
          results.push({ userId, skipped: 'no-email' });
          continue;
        }
        const items = await this.collectAlerts(
          userId,
          preferences.leadDays,
          { favorites: true, conditions: true, skipSpecials: true },
          {},
          new Date(0),
        );
        if (!items.length) {
          results.push({ userId, email, skipped: 'no-items' });
          continue;
        }
        const summaries = await this.conditionSummaryMap(userId);
        const conditions = this.toDigestConditions(items, summaries);
        const total = conditions.reduce((sum, c) => sum + c.items.length, 0);
        if (dryRun) {
          results.push({
            userId,
            email,
            dryRun: true,
            total,
            conditions: conditions.map((c) => ({ name: c.name, items: c.items.map((i) => `${i.label} ${i.title}`) })),
          });
          continue;
        }
        await this.mail.send({
          to: email,
          title: `[터잡이] 조건에 맞는 새 매물 ${total}건 (정정 발송)`,
          body: buildDigestBody(conditions, {
            inquiryEmail: 'teojabi@gmail.com',
            unsubscribeUrl: this.unsubscribeUrl(userId),
            note,
          }),
        });
        results.push({ userId, email, sent: true, total });
      } catch (error) {
        results.push({ userId, error: String((error as Error)?.message ?? error) });
      }
    }
    return { dryRun, count: userIds.length, results };
  }

  private auctionAlert(
    r: any,
    origin: 'favorite' | 'condition',
    conditionName: string | null,
    zoneMap: Record<string, { bcr: number; far: number }> = {},
    opts: { areaM2?: number | null; bundleCount?: number } = {},
  ): Alert {
    const date = this.dateOf(r.sale_date);
    const development = this.development(r, zoneMap);
    const areaM2 = opts.areaM2 != null
      ? opts.areaM2
      : Number(r.obj_area_m2) || Number(r.area_max) || Number(r.land_area_m2) || Number(r.building_area_m2) || null;
    const bundle = (opts.bundleCount || 0) > 1;
    const areaText = areaM2 ? `${bundle ? '일괄 합계 ' : '면적 '}${Math.round(areaM2).toLocaleString('ko-KR')}㎡` : '';
    const detail = [
      String(r.usage_name || '용도 미기재'),
      `최저 ${this.money(r.min_price)}`,
      areaText,
      `${bundle ? `일괄 ${opts.bundleCount}건 · ` : ''}매각기일 ${date}${r.sale_hour ? ` ${r.sale_hour}` : ''}`,
    ].filter(Boolean).join(' · ');
    return {
      type: 'auction',
      key: `auction:${r.docid}`,
      origin,
      conditionName,
      date,
      kindLabel: `경매 ${this.labelFor(date)}`,
      title: String(r.full_address || r.docid || ''),
      detail,
      meta: {
        ...(development ? { development } : {}),
        features: {
          district: String(r.sigu || ''),
          zone: String(r.use_zone || ''),
          usage: String(r.usage_name || ''),
          price: Number(r.min_price) || 0,
          specialZone: String(r.special_zone || ''),
          heightDistrict: String(r.height_district || ''),
          currentFar: development?.currentFar ?? null,
          remainingFar: development?.remainingFar ?? null,
        },
      },
    };
  }

  private onbidAlert(r: any, origin: 'favorite' | 'condition', conditionName: string | null): Alert {
    const date = this.dateOf(r.bid_end_dt);
    const usage = String(r.usg_mcls_nm || r.usg_lcls_nm || '용도 미기재');
    const isLand = /토지|대지|임야|전답|잡종지|과수원|답/.test(usage);
    const landM2 = Number(r.land_area_m2) || null;
    const bldgM2 = Number(r.building_area_m2) || null;
    const areaM2 = isLand ? (landM2 ?? bldgM2) : (bldgM2 ?? landM2);
    const areaText = areaM2 ? `${r.bundle === true ? '일괄 합계 ' : '면적 '}${Math.round(areaM2).toLocaleString('ko-KR')}㎡` : '';
    const detail = [usage, `최저입찰 ${this.money(r.lowst_bid_prc)}`, areaText, `입찰마감 ${date}`].filter(Boolean).join(' · ');
    return {
      type: 'onbid',
      key: `onbid:${r.cltr_mng_no}::${r.pbct_cdtn_no}`,
      origin,
      conditionName,
      date,
      kindLabel: `공매 ${this.labelFor(date)}`,
      title: String(r.cltr_nm || r.cltr_mng_no || ''),
      detail,
    };
  }

  // 신규 매칭 기준 시각(커서). 없으면 최근 24시간을 기준으로 본다.
  private async alertCursor(): Promise<Date> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ last_seen_at: Date }>>`
        SELECT last_seen_at FROM public.notification_source_cursor WHERE source='all' LIMIT 1`;
      return rows[0]?.last_seen_at ?? new Date(Date.now() - DAY_MS);
    } catch {
      return new Date(Date.now() - DAY_MS);
    }
  }

  // 하루치 매칭이 끝난 뒤 커서를 현재로 올린다. 중복은 notification_item이 막는다.
  private async advanceCursor(): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO public.notification_source_cursor(source,last_seen_at,updated_at)
      VALUES ('all', now(), now())
      ON CONFLICT (source) DO UPDATE SET last_seen_at=now(), updated_at=now()`;
  }

  // 사용자의 저장 조건 이름 → 요약 문자열(이메일 상단에 표시).
  private async conditionSummaryMap(userId: string): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<Array<{ payload: any }>>`
      SELECT payload FROM public.discovery_item WHERE user_id=${userId} AND kind='condition'`;
    const map = new Map<string, string>();
    for (const row of rows) {
      const p = row.payload || {};
      map.set(String(p.name || '저장 조건'), this.conditionSummary(p));
    }
    return map;
  }

  private conditionSummary(payload: any): string {
    const parts: string[] = [];
    const districts = Array.isArray(payload?.districts) ? payload.districts.filter(Boolean) : [];
    if (districts.length) parts.push(districts.join('·'));
    if (Number(payload?.budgetWon) > 0) parts.push(`${(Number(payload.budgetWon) / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억 이하`);
    if (Number(payload?.minAreaM2) > 0) parts.push(`대지 ${Math.round(Number(payload.minAreaM2)).toLocaleString('ko-KR')}㎡ 이상`);
    if (Number(payload?.maxAreaM2) > 0) parts.push(`대지 ${Math.round(Number(payload.maxAreaM2)).toLocaleString('ko-KR')}㎡ 이하`);
    if (Array.isArray(payload?.zones) && payload.zones.length) parts.push(payload.zones.join('·'));
    if (payload?.kind === 'land') parts.push('토지');
    else if (payload?.kind === 'building') parts.push('건물');
    if (Number(payload?.minRoadWidthM) > 0) parts.push(`도로 ${payload.minRoadWidthM}m 이상`);
    if (payload?.auction?.enabled) {
      const s = payload.auction.source;
      parts.push(s === 'onbid' ? '공매 포함' : s === 'both' ? '경매·공매 포함' : '경매 포함');
    }
    return parts.join(' · ');
  }

  private static detailUrl(key: string): string | null {
    if (!key || key.startsWith('notice:')) return null;
    return `https://teojabi.com/#listing=${encodeURIComponent(key)}`;
  }

  private digestLabel(item: any): string {
    if (item.type === 'auction') return '경매';
    if (item.type === 'onbid') return '공매';
    if (item.type === 'notice') return '공지';
    const key = String(item.key || '');
    if (key.startsWith('naver:')) return '네이버';
    if (key.startsWith('disco:')) return '디스코';
    return '매물';
  }

  // 알림함 항목을 조건별로 묶어 이메일 모델로 만든다. 특례(안 본 매물·예외 추천)도 그대로 포함한다.
  private toDigestConditions(unread: any[], summaries: Map<string, string>): DigestCondition[] {
    const groups = new Map<string, DigestItem[]>();
    const order: string[] = [];
    for (const item of unread) {
      const name = item.type === 'notice' ? '공지' : item.conditionName || (item.origin === 'favorite' ? '찜한 물건' : '맞춤 매물');
      if (!groups.has(name)) {
        groups.set(name, []);
        order.push(name);
      }
      groups.get(name)!.push({
        type: item.type,
        label: this.digestLabel(item),
        title: item.title || '',
        detail: item.detail || '',
        score: item.score ?? null,
        url: NotificationsService.detailUrl(item.key),
      });
    }
    return order.map((name) => ({
      name,
      summary: summaries.get(name) || (name === '찜한 물건' ? '내가 찜한 물건' : ''),
      items: groups.get(name)!,
    }));
  }

  private area(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString('ko-KR')}㎡` : '면적 미기재';
  }

  // 새로 올라온 매물(네이버·디스코) 중 저장 조건에 맞는 것, 최대 3건.
  private async listingAlerts(payload: any, conditionName: string, cursor: Date): Promise<Alert[]> {
    const districts = Array.isArray(payload?.districts) ? payload.districts.filter((d: any) => typeof d === 'string') : [];
    const zones = Array.isArray(payload?.zones) ? payload.zones.filter((z: any) => typeof z === 'string') : [];
    const budgetWon = Number(payload?.budgetWon) || 0;
    const minArea = Number(payload?.minAreaM2) || 0;
    const maxArea = Number(payload?.maxAreaM2) || 0;
    const minRoad = Number(payload?.minRoadWidthM) || 0;
    const kind = payload?.kind;
    const out: Alert[] = [];
    // 저장 조건의 '역에서 가까운 곳'도 알림에 반영한다. 역 좌표를 조회해 직선거리로 거른다.
    const stationName = String(payload?.stationName || '').trim();
    const maxDistance = Number(payload?.maxDistanceM) || 0;
    let station: { lat: number; lng: number } | null = null;
    if (stationName) {
      try {
        const st = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
          SELECT lat, lng FROM public.seoul_subway_stations
          WHERE replace(station_name,' ','') LIKE ${'%' + stationName.replace(/\s+/g, '') + '%'} AND lat IS NOT NULL
          ORDER BY length(station_name) LIMIT 1`;
        if (st.length) station = { lat: Number(st[0].lat), lng: Number(st[0].lng) };
      } catch { /* 역 조회 실패 시 거리 조건 생략 */ }
    }
    // 같은 주소(필지)가 여러 출처(네이버·디스코·터잡이 추천)에 있으면 하나만 추천한다.
    const keyOf = (r: any) => {
      const pnu = String(r.pnu || '').trim();
      return /^\d{19}$/.test(pnu) ? `pnu:${pnu}` : `addr:${String(r.address || '').replace(/\s+/g, '').slice(0, 40)}`;
    };
    const candidates: Array<{ source: 'naver' | 'disco'; row: any; key: string }> = [];

    // '새 매물'은 매물번호가 아니라 대지위치 기준이다. 재등록(같은 주소) 제외는 아래에서 한 번에 처리한다.
    const naverCond: Prisma.Sql[] = [Prisma.sql`n.first_seen_at > ${cursor}`];
    if (districts.length) naverCond.push(Prisma.sql`n."구" IN (${Prisma.join(districts)})`);
    if (budgetWon) naverCond.push(Prisma.sql`n."거래가격" <= ${budgetWon / 1e8}`);
    if (minArea) naverCond.push(Prisma.sql`n."대지면적" >= ${minArea}`);
    if (maxArea) naverCond.push(Prisma.sql`n."대지면적" <= ${maxArea}`);
    if (minRoad) naverCond.push(Prisma.sql`n."도로폭_m" >= ${minRoad}`);
    if (kind === 'land') naverCond.push(Prisma.sql`n."주용도코드명" = '토지'`);
    else if (kind === 'building') naverCond.push(Prisma.sql`coalesce(n."주용도코드명",'') <> '토지'`);
    if (zones.length) naverCond.push(Prisma.sql`(${Prisma.join(zones.map((z: string) => Prisma.sql`n."용도지역" ILIKE ${'%' + z.replace('지역', '') + '%'}`), ' OR ')})`);
    if (station && maxDistance) naverCond.push(Prisma.sql`ST_Distance(ST_SetSRID(ST_MakePoint(n.lng,n.lat),4326)::geography, ST_SetSRID(ST_MakePoint(${station.lng},${station.lat}),4326)::geography) <= ${maxDistance}`);
    // 저장 조건의 정렬을 알림 추천 순서에도 적용한다(평당가 낮은 순 등).
    const sort = payload?.sort;
    const naverOrder = sort === 'ppp' ? Prisma.sql`(n."거래가격" / NULLIF(n."대지면적", 0)) ASC NULLS LAST`
      : sort === 'area' ? Prisma.sql`n."대지면적" DESC NULLS LAST`
      : sort === 'price-desc' ? Prisma.sql`n."거래가격" DESC NULLS LAST`
      : sort === 'price' ? Prisma.sql`n."거래가격" ASC NULLS LAST`
      : Prisma.sql`n.first_seen_at DESC`;
    const naverRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT n."매물번호" AS id, n."거래가격" AS price, n."대지면적" AS land, n."대지위치" AS address,
             n."구" AS district, n."동" AS dong, n."주용도코드명" AS use, n."용도지역" AS zone, n."도로폭_m" AS road, n.pnu AS pnu
      FROM public.naver n WHERE ${Prisma.join(naverCond, ' AND ')}
      ORDER BY ${naverOrder} LIMIT 30`);
    for (const r of (await this.freshAddressRows(naverRows, 'naver', cursor)).slice(0, 3)) candidates.push({ source: 'naver', row: r, key: keyOf(r) });

    const discoCond: Prisma.Sql[] = [Prisma.sql`d.first_seen_at > ${cursor}`, Prisma.sql`d.active IS TRUE`];
    if (districts.length) discoCond.push(Prisma.sql`d.gu IN (${Prisma.join(districts)})`);
    if (budgetWon) discoCond.push(Prisma.sql`d.price_manwon <= ${budgetWon / 1e4}`);
    if (minArea) discoCond.push(Prisma.sql`d.land_area_m2 >= ${minArea}`);
    if (maxArea) discoCond.push(Prisma.sql`d.land_area_m2 <= ${maxArea}`);
    if (station && maxDistance) discoCond.push(Prisma.sql`ST_Distance(ST_SetSRID(ST_MakePoint(d.lng,d.lat),4326)::geography, ST_SetSRID(ST_MakePoint(${station.lng},${station.lat}),4326)::geography) <= ${maxDistance}`);
    const discoOrder = sort === 'ppp' ? Prisma.sql`(d.price_manwon / NULLIF(d.land_area_m2, 0)) ASC NULLS LAST`
      : sort === 'area' ? Prisma.sql`d.land_area_m2 DESC NULLS LAST`
      : sort === 'price-desc' ? Prisma.sql`d.price_manwon DESC NULLS LAST`
      : sort === 'price' ? Prisma.sql`d.price_manwon ASC NULLS LAST`
      : Prisma.sql`d.first_seen_at DESC`;
    const discoRows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT d.did AS id, d.price_manwon AS price_manwon, d.land_area_m2 AS land, d.address AS address,
             d.gu AS district, d.dong AS dong, d.main_use AS use, d.use_zone AS zone, d.pnu AS pnu
      FROM public.disco_listing d WHERE ${Prisma.join(discoCond, ' AND ')}
      ORDER BY ${discoOrder} LIMIT 30`);
    for (const r of (await this.freshAddressRows(discoRows, 'disco', cursor)).slice(0, 3)) candidates.push({ source: 'disco', row: r, key: keyOf(r) });

    const seen = new Set<string>();
    for (const c of candidates) {
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      out.push(this.listingAlert(c.row, c.source, conditionName));
    }
    return out;
  }

  // 커서 이전에 이미 있던 대지위치는 재등록으로 보고 제외한다. 상관 서브쿼리 대신 후보 주소만 한 번에 조회한다.
  private async freshAddressRows(rows: any[], source: 'naver' | 'disco', cursor: Date): Promise<any[]> {
    const addrs = [...new Set(rows.map((r) => String(r.address || '').trim()).filter(Boolean))];
    if (!addrs.length) return rows;
    try {
      const known = source === 'naver'
        ? await this.prisma.$queryRaw<Array<{ a: string }>>`SELECT DISTINCT "대지위치" AS a FROM public.naver WHERE "대지위치" IN (${Prisma.join(addrs)}) AND first_seen_at <= ${cursor}`
        : await this.prisma.$queryRaw<Array<{ a: string }>>`SELECT DISTINCT address AS a FROM public.disco_listing WHERE address IN (${Prisma.join(addrs)}) AND first_seen_at <= ${cursor}`;
      const knownSet = new Set(known.map((k) => String(k.a || '').trim()));
      return rows.filter((r) => !knownSet.has(String(r.address || '').trim()));
    } catch {
      return rows;
    }
  }

  // 사용자가 이미 본(조회·찜·이전 알림) 매물 키를 출처별로 모은다.
  private async seenListingIds(userId: string): Promise<{ naver: string[]; disco: string[] }> {
    const naver = new Set<string>(), disco = new Set<string>();
    const add = (key: unknown) => {
      const k = String(key || '');
      if (k.startsWith('naver:')) naver.add(k.slice('naver:'.length));
      else if (k.startsWith('disco:')) disco.add(k.slice('disco:'.length));
    };
    try {
      const viewed = await this.prisma.$queryRaw<Array<{ e: string }>>`
        SELECT DISTINCT entity_id AS e FROM public.user_event WHERE user_id=${userId} AND type='view_detail' AND entity_id IS NOT NULL`;
      for (const r of viewed) add(r.e);
      const favs = await this.prisma.$queryRaw<Array<{ k: string }>>`
        SELECT item_key AS k FROM public.discovery_item WHERE user_id=${userId} AND kind='favorite'`;
      for (const r of favs) add(r.k);
      const alerted = await this.prisma.$queryRaw<Array<{ k: string }>>`
        SELECT item_key AS k FROM public.notification_item WHERE user_id=${userId}`;
      for (const r of alerted) add(r.k);
    } catch { /* 조회 실패 시 빈 집합 */ }
    return { naver: [...naver], disco: [...disco] };
  }

  // 조건에 맞는 '아직 안 보신 매물' 1건. 정렬은 평당가 낮은 순 고정.
  private async discoveryAlert(payload: any, conditionName: string, seen: { naver: string[]; disco: string[] }): Promise<Alert | null> {
    const districts = Array.isArray(payload?.districts) ? payload.districts.filter((d: any) => typeof d === 'string') : [];
    const zones = Array.isArray(payload?.zones) ? payload.zones.filter((z: any) => typeof z === 'string') : [];
    const budgetWon = Number(payload?.budgetWon) || 0;
    const minArea = Number(payload?.minAreaM2) || 0;
    const maxArea = Number(payload?.maxAreaM2) || 0;
    const minRoad = Number(payload?.minRoadWidthM) || 0;
    const kind = payload?.kind;

    const naverCond: Prisma.Sql[] = [Prisma.sql`n."상태" IN ('신규','유지')`, Prisma.sql`n."대지면적" > 0`, Prisma.sql`n."거래가격" > 0`];
    if (districts.length) naverCond.push(Prisma.sql`n."구" IN (${Prisma.join(districts)})`);
    if (budgetWon) naverCond.push(Prisma.sql`n."거래가격" <= ${budgetWon / 1e8}`);
    if (minArea) naverCond.push(Prisma.sql`n."대지면적" >= ${minArea}`);
    if (maxArea) naverCond.push(Prisma.sql`n."대지면적" <= ${maxArea}`);
    if (minRoad) naverCond.push(Prisma.sql`n."도로폭_m" >= ${minRoad}`);
    if (kind === 'land') naverCond.push(Prisma.sql`n."주용도코드명" = '토지'`);
    else if (kind === 'building') naverCond.push(Prisma.sql`coalesce(n."주용도코드명",'') <> '토지'`);
    if (zones.length) naverCond.push(Prisma.sql`(${Prisma.join(zones.map((z: string) => Prisma.sql`n."용도지역" ILIKE ${'%' + z.replace('지역', '') + '%'}`), ' OR ')})`);
    if (seen.naver.length) naverCond.push(Prisma.sql`n."매물번호" NOT IN (${Prisma.join(seen.naver)})`);
    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT n."매물번호" AS id, n."거래가격" AS price, n."대지면적" AS land, n."대지위치" AS address,
             n."구" AS district, n."동" AS dong, n."주용도코드명" AS use, n."용도지역" AS zone, n."도로폭_m" AS road, n.pnu AS pnu
      FROM public.naver n WHERE ${Prisma.join(naverCond, ' AND ')}
      ORDER BY (n."거래가격" / NULLIF(n."대지면적", 0)) ASC NULLS LAST LIMIT 1`);
    if (rows.length) return this.listingAlert(rows[0], 'naver', conditionName, '아직 안 보신 매물');

    const discoCond: Prisma.Sql[] = [Prisma.sql`d.active IS TRUE`, Prisma.sql`d.land_area_m2 > 0`, Prisma.sql`d.price_manwon > 0`];
    if (districts.length) discoCond.push(Prisma.sql`d.gu IN (${Prisma.join(districts)})`);
    if (budgetWon) discoCond.push(Prisma.sql`d.price_manwon <= ${budgetWon / 1e4}`);
    if (minArea) discoCond.push(Prisma.sql`d.land_area_m2 >= ${minArea}`);
    if (maxArea) discoCond.push(Prisma.sql`d.land_area_m2 <= ${maxArea}`);
    if (seen.disco.length) discoCond.push(Prisma.sql`d.did NOT IN (${Prisma.join(seen.disco)})`);
    const drows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT d.did AS id, d.price_manwon AS price_manwon, d.land_area_m2 AS land, d.address AS address,
             d.gu AS district, d.dong AS dong, d.main_use AS use, d.use_zone AS zone, d.pnu AS pnu
      FROM public.disco_listing d WHERE ${Prisma.join(discoCond, ' AND ')}
      ORDER BY (d.price_manwon / NULLIF(d.land_area_m2, 0)) ASC NULLS LAST LIMIT 1`);
    if (drows.length) return this.listingAlert(drows[0], 'disco', conditionName, '아직 안 보신 매물');
    return null;
  }

  // '예외 추천': 예산·면적·지역 중 하나만 살짝 벗어나지만 평당가가 가장 낮은 1건(매일 무작위).
  private async exceptionAlert(payload: any, conditionName: string, seen: { naver: string[]; disco: string[] }): Promise<Alert | null> {
    const budgetWon = Number(payload?.budgetWon) || 0;
    const districts = Array.isArray(payload?.districts) ? payload.districts.filter((d: any) => typeof d === 'string') : [];
    const zones = Array.isArray(payload?.zones) ? payload.zones.filter((z: any) => typeof z === 'string') : [];
    const minArea = Number(payload?.minAreaM2) || 0;
    const maxArea = Number(payload?.maxAreaM2) || 0;
    const minRoad = Number(payload?.minRoadWidthM) || 0;
    const kind = payload?.kind;

    const options: Array<'budget' | 'area' | 'region'> = [];
    if (budgetWon) options.push('budget');
    if (minArea || maxArea) options.push('area');
    if (districts.length) options.push('region');
    if (!options.length) return null;
    const type = options[Math.floor(Math.random() * options.length)];

    // 공통 필터: 용도지역·도로폭·용도·이미 본 것 제외.
    const cond: Prisma.Sql[] = [Prisma.sql`n."상태" IN ('신규','유지')`, Prisma.sql`n."대지면적" > 0`];
    if (zones.length) cond.push(Prisma.sql`(${Prisma.join(zones.map((z: string) => Prisma.sql`n."용도지역" ILIKE ${'%' + z.replace('지역', '') + '%'}`), ' OR ')})`);
    if (minRoad) cond.push(Prisma.sql`n."도로폭_m" >= ${minRoad}`);
    if (kind === 'land') cond.push(Prisma.sql`n."주용도코드명" = '토지'`);
    else if (kind === 'building') cond.push(Prisma.sql`coalesce(n."주용도코드명",'') <> '토지'`);
    if (seen.naver.length) cond.push(Prisma.sql`n."매물번호" NOT IN (${Prisma.join(seen.naver)})`);

    let note: string;
    if (type === 'budget') {
      cond.push(Prisma.sql`n."거래가격" > ${budgetWon / 1e8}`, Prisma.sql`n."거래가격" <= ${(budgetWon * 1.15) / 1e8}`);
      if (districts.length) cond.push(Prisma.sql`n."구" IN (${Prisma.join(districts)})`);
      if (minArea) cond.push(Prisma.sql`n."대지면적" >= ${minArea}`);
      if (maxArea) cond.push(Prisma.sql`n."대지면적" <= ${maxArea}`);
      note = `조건 예산 ${(budgetWon / 1e8).toLocaleString('ko-KR')}억보다 조금 높지만 평당가가 낮아요`;
    } else if (type === 'area') {
      if (districts.length) cond.push(Prisma.sql`n."구" IN (${Prisma.join(districts)})`);
      if (budgetWon) cond.push(Prisma.sql`n."거래가격" <= ${budgetWon / 1e8}`);
      if (minArea && maxArea) cond.push(Prisma.sql`((n."대지면적" >= ${minArea * 0.85} AND n."대지면적" < ${minArea}) OR (n."대지면적" > ${maxArea} AND n."대지면적" <= ${maxArea * 1.15}))`);
      else if (minArea) cond.push(Prisma.sql`(n."대지면적" >= ${minArea * 0.85} AND n."대지면적" < ${minArea})`);
      else cond.push(Prisma.sql`(n."대지면적" > ${maxArea} AND n."대지면적" <= ${maxArea * 1.15})`);
      note = '조건 대지면적에서 조금 벗어나지만 평당가가 낮아요';
    } else {
      cond.push(Prisma.sql`n."구" NOT IN (${Prisma.join(districts)})`);
      if (budgetWon) cond.push(Prisma.sql`n."거래가격" <= ${budgetWon / 1e8}`);
      if (minArea) cond.push(Prisma.sql`n."대지면적" >= ${minArea}`);
      if (maxArea) cond.push(Prisma.sql`n."대지면적" <= ${maxArea}`);
      note = '조건 지역은 아니지만 나머지 조건은 맞고 평당가가 낮아요';
    }

    const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT n."매물번호" AS id, n."거래가격" AS price, n."대지면적" AS land, n."대지위치" AS address,
             n."구" AS district, n."동" AS dong, n."주용도코드명" AS use, n."용도지역" AS zone, n."도로폭_m" AS road, n.pnu AS pnu
      FROM public.naver n WHERE ${Prisma.join(cond, ' AND ')}
      ORDER BY (n."거래가격" / NULLIF(n."대지면적", 0)) ASC NULLS LAST LIMIT 1`);
    if (rows.length) return this.listingAlert(rows[0], 'naver', conditionName, '예외 추천', note);
    return null;
  }

  private listingAlert(r: any, source: 'naver' | 'disco', conditionName: string, kindLabel = '맞춤 매물', note = ''): Alert {
    const priceWon = source === 'naver' ? (Number(r.price) || 0) * 1e8 : (Number(r.price_manwon) || 0) * 1e4;
    const detail = [
      String(r.use || '').trim() || '용도 미기재',
      this.money(priceWon),
      this.pppText(priceWon, Number(r.land) || 0),
      r.land ? `대지 ${this.area(r.land)}` : '',
      String(r.zone || '').trim(),
      note,
    ].filter(Boolean).join(' · ');
    return {
      type: 'listing',
      key: `${source}:${r.id}`,
      origin: 'condition',
      conditionName,
      date: this.date(),
      kindLabel,
      title: String(r.address || ''),
      detail,
      meta: {
        features: {
          district: String(r.district || ''),
          zone: String(r.zone || ''),
          usage: String(r.use || ''),
          price: priceWon,
        },
      },
    };
  }
}
