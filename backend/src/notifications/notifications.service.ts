import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SITE_URL = 'https://teojabi.com/';
const clampLead = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 1), 14) : 7;
};

type SavedRow = { kind: string; key: string; payload: any };
type Alert = {
  type: 'auction' | 'onbid' | 'notice';
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
  readAt: Date | null;
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
  email: false,
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

  private stamp(shiftDays = 0) {
    return this.kst(shiftDays).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  }

  private dateOf(value: unknown) {
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

  private kindLabelFor(kind: string, date: string | null) {
    if (kind === 'notice') return '공지';
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

  // 저장된 최근 알림 항목을 반환한다(목록 + 안 읽은 개수).
  private async listInbox(userId: string) {
    const rows = await this.prisma.$queryRaw<InboxRow[]>`
      SELECT item_key AS "key", kind, origin, condition_name AS "conditionName",
             to_char(event_date,'YYYY-MM-DD') AS "date", title, detail, meta, read_at AS "readAt"
      FROM public.notification_item
      WHERE user_id=${userId}
      ORDER BY (read_at IS NULL) DESC, event_date ASC NULLS LAST, created_at DESC
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
      read: row.readAt != null,
    }));
    const unreadCount = items.filter((item) => !item.read).length;
    return { status: 'ready', generatedAt: new Date().toISOString(), count: items.length, unreadCount, items };
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
      await this.prisma.$executeRaw`
        INSERT INTO public.notification_item
          (user_id,item_key,kind,origin,condition_name,event_date,title,detail,meta,read_at)
        VALUES (${userId},${candidate.key},${candidate.type},${candidate.origin},${candidate.conditionName},
                ${candidate.date || null}::date,${candidate.title},${candidate.detail},
                ${candidate.meta ? JSON.stringify(candidate.meta) : null}::jsonb,${readAt})
        ON CONFLICT (user_id,item_key) DO NOTHING`;
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
          (user_id,item_key,kind,origin,condition_name,event_date,title,detail,read_at)
        VALUES (${userId},${key},'notice','notice',NULL,${notice.date}::date,${notice.title},${notice.body ?? ''},${readAt})
        ON CONFLICT (user_id,item_key) DO NOTHING`;
    }
  }

  async getInbox(userId: string, leadDays: number, options: { favorites?: boolean; conditions?: boolean } = {}) {
    const zoneMap = await this.zoneLimits();
    const candidates = await this.collectAlerts(userId, leadDays, options, zoneMap);
    await this.syncInbox(userId, candidates);
    return this.listInbox(userId);
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
    const allowedFar = reg ? reg.far : null;
    const allowedBcr = reg ? reg.bcr : null;
    const currentFar = Number.isFinite(land) && land > 0 && Number.isFinite(building) && building > 0
      ? Math.round((building / land) * 100)
      : null;
    const remainingFar = allowedFar != null && currentFar != null ? Math.round((allowedFar - currentFar) * 10) / 10 : null;
    const buildableFloorAreaM2 = remainingFar != null && remainingFar > 0 && Number.isFinite(land) && land > 0
      ? Math.round((remainingFar / 100) * land)
      : null;
    if (!zone && currentFar == null) return null;
    return { zone, allowedFar, allowedBcr, currentFar, remainingFar, buildableFloorAreaM2 };
  }

  // 찜·저장 조건에 맞는 현재 물건을 모은다(임박 기간 내).
  private async collectAlerts(
    userId: string,
    leadDays: number,
    options: { favorites?: boolean; conditions?: boolean } = {},
    zoneMap: Record<string, { bcr: number; far: number }> = {},
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

    const favAuction = includeFavorites
      ? saved.filter((r) => r.kind === 'favorite' && r.key.startsWith('auction:')).map((r) => r.key.slice('auction:'.length))
      : [];
    const favOnbid = includeFavorites
      ? saved.filter((r) => r.kind === 'favorite' && r.key.startsWith('onbid:')).map((r) => r.key.slice('onbid:'.length))
      : [];

    if (favAuction.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT docid, full_address, min_price, usage_name, sale_date, sale_hour,
               use_zone, land_area_m2, building_area_m2
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
      const auction = savedRow.payload?.auction;
      if (!auction?.enabled) continue;
      const conditionName = savedRow.payload?.name || '저장 조건';
      const source = auction.source || 'court';
      const wantCourt = source === 'court' || source === 'both';
      const wantOnbid = source === 'onbid' || source === 'both';
      const districts = Array.isArray(savedRow.payload?.districts) ? savedRow.payload.districts.filter((d: any) => typeof d === 'string') : [];
      const usages = Array.isArray(auction.usages) ? auction.usages.filter((u: any) => typeof u === 'string') : [];
      const dealType = auction.dealType || '';
      const maxPrice = Number(auction.maxPriceWon) || 0;
      const maxRate = Number(auction.maxBidRate) || 0;
      const failMax = Number(auction.failMax) || 0;

      if (wantCourt) {
        const conditions: Prisma.Sql[] = [Prisma.sql`a.sale_date >= ${start}::date AND a.sale_date <= ${end}::date`];
        if (districts.length) conditions.push(Prisma.sql`a.sigu IN (${Prisma.join(districts)})`);
        if (usages.length) conditions.push(Prisma.sql`(${Prisma.join(usages.map((u: string) => Prisma.sql`a.usage_name ILIKE ${'%' + u + '%'}`), ' OR ')})`);
        if (dealType) conditions.push(Prisma.sql`a.deal_type = ${dealType}`);
        if (maxPrice) conditions.push(Prisma.sql`a.min_price <= ${maxPrice}`);
        if (maxRate) conditions.push(Prisma.sql`a.noti_min_rate <= ${maxRate}`);
        if (failMax) conditions.push(Prisma.sql`a.fail_count <= ${failMax}`);
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT a.docid, a.full_address, a.min_price, a.usage_name, a.sale_date, a.sale_hour,
                 a.use_zone, a.land_area_m2, a.building_area_m2
          FROM public.auction_item a WHERE ${Prisma.join(conditions, ' AND ')}
          ORDER BY a.sale_date ASC LIMIT 20`);
        for (const r of rows) items.push(this.auctionAlert(r, 'condition', conditionName, zoneMap));
      }

      if (wantOnbid) {
        const conditions: Prisma.Sql[] = [Prisma.sql`o.bid_end_dt >= ${startStamp} AND o.bid_end_dt <= ${endStamp}`];
        if (districts.length) conditions.push(Prisma.sql`o.sigu IN (${Prisma.join(districts)})`);
        if (usages.length) conditions.push(Prisma.sql`(${Prisma.join(usages.map((u: string) => Prisma.sql`(o.usg_mcls_nm ILIKE ${'%' + u + '%'} OR o.usg_scls_nm ILIKE ${'%' + u + '%'})`), ' OR ')})`);
        if (dealType) conditions.push(Prisma.sql`o.deal_type = ${dealType}`);
        if (maxPrice) conditions.push(Prisma.sql`o.lowst_bid_prc <= ${maxPrice}`);
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT o.cltr_mng_no, o.pbct_cdtn_no, o.cltr_nm, o.lowst_bid_prc, o.usg_mcls_nm, o.bid_end_dt
          FROM public.onbid_item o WHERE ${Prisma.join(conditions, ' AND ')}
          ORDER BY o.bid_end_dt ASC LIMIT 20`);
        for (const r of rows) items.push(this.onbidAlert(r, 'condition', conditionName));
      }
    }

    const dedup = new Map<string, Alert>();
    for (const item of items) if (item.key && !dedup.has(item.key)) dedup.set(item.key, item);
    return [...dedup.values()];
  }

  @Cron('0 30 8 * * *', { timeZone: 'Asia/Seoul' })
  async dispatchDailyEmail() {
    if (!this.mail.isConfigured()) {
      this.logger.warn('Email digest skipped: Cloud Outbound Mailer is not configured.');
      return;
    }
    const recipients = await this.prisma.$queryRaw<Array<{ userId: string; email: string }>>`
      SELECT p.user_id AS "userId", u.email AS email
      FROM public.notification_preference p
      JOIN public."user" u ON u.id = p.user_id
      WHERE p.email = true AND u.email IS NOT NULL AND u.email <> ''`;
    const today = this.date();
    let sent = 0;
    for (const recipient of recipients) {
      try {
        const preferences = await this.getPreferences(recipient.userId);
        if (!preferences.email) continue;
        const inbox = await this.getInbox(recipient.userId, preferences.leadDays, {
          favorites: preferences.favorites,
          conditions: preferences.conditions,
        });
        // 읽지 않은 새 알림만 메일로 보낸다(이미 본 항목 반복 발송 방지).
        const unread = inbox.items.filter((item) => !item.read);
        if (!unread.length) continue;
        const dedupeKey = `email:${recipient.userId}:${today}`;
        const inserted = await this.prisma.$executeRaw`
          INSERT INTO public.notification_delivery(user_id,dedupe_key,channel,item_count,status)
          VALUES (${recipient.userId},${dedupeKey},'email',${unread.length},'SENT')
          ON CONFLICT (dedupe_key) DO NOTHING`;
        if (inserted === 0) continue;
        await this.mail.send({
          to: recipient.email,
          title: `[터잡이] 새 경매·공매 알림 ${unread.length}건`,
          body: this.buildDigestBody(unread as Alert[]),
        });
        await this.markRead(recipient.userId);
        sent += 1;
      } catch (error) {
        this.logger.error(`Email digest failed for ${recipient.userId}`, error as Error);
        await this.prisma
          .$executeRaw`UPDATE public.notification_delivery SET status='FAILED', error=${String((error as Error)?.message ?? error).slice(0, 200)} WHERE dedupe_key=${`email:${recipient.userId}:${today}`}`
          .catch(() => undefined);
      }
    }
    this.logger.log(`Email digest dispatched: ${sent}/${recipients.length}`);
  }

  private buildDigestBody(items: Alert[]) {
    const rows = items
      .map(
        (item) =>
          `<li style="margin:0 0 10px;"><strong>${this.escape(item.kindLabel)}</strong><br>${this.escape(item.title)}<br><span style="color:#6b7280;font-size:13px;">${this.escape(item.detail)}</span></li>`,
      )
      .join('');
    return `
<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;max-width:600px;margin:0 auto;color:#111827;line-height:1.6;">
  <h2 style="margin:0 0 8px;font-size:20px;">[터잡이] 새 경매·공매 알림 ${items.length}건</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#374151;">찜·저장 조건에 <b>새로 올라온</b> 물건이에요. 사실 안내이며, 입찰 전 원문을 확인하세요.</p>
  <ul style="padding-left:18px;margin:0 0 20px;">${rows}</ul>
  <p style="margin:0 0 20px;"><a href="${SITE_URL}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;">터잡이에서 확인하기</a></p>
  <p style="margin:0;font-size:12px;color:#6b7280;">권리분석·적정 입찰가는 제공하지 않아요. 알림 수신은 내 보관함 &gt; 알림 설정에서 끌 수 있어요.</p>
</div>`.trim();
  }

  private escape(value: unknown) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  }

  private auctionAlert(
    r: any,
    origin: 'favorite' | 'condition',
    conditionName: string | null,
    zoneMap: Record<string, { bcr: number; far: number }> = {},
  ): Alert {
    const date = this.dateOf(r.sale_date);
    const development = this.development(r, zoneMap);
    return {
      type: 'auction',
      key: `auction:${r.docid}`,
      origin,
      conditionName,
      date,
      kindLabel: `경매 ${this.labelFor(date)}`,
      title: String(r.full_address || r.docid || ''),
      detail: `${String(r.usage_name || '용도 미기재')} · 최저 ${this.money(r.min_price)} · 매각기일 ${date}${r.sale_hour ? ` ${r.sale_hour}` : ''}`,
      meta: development ? { development } : undefined,
    };
  }

  private onbidAlert(r: any, origin: 'favorite' | 'condition', conditionName: string | null): Alert {
    const date = this.dateOf(r.bid_end_dt);
    return {
      type: 'onbid',
      key: `onbid:${r.cltr_mng_no}::${r.pbct_cdtn_no}`,
      origin,
      conditionName,
      date,
      kindLabel: `공매 ${this.labelFor(date)}`,
      title: String(r.cltr_nm || r.cltr_mng_no || ''),
      detail: `${String(r.usg_mcls_nm || '용도 미기재')} · 최저입찰 ${this.money(r.lowst_bid_prc)} · 입찰마감 ${date}`,
    };
  }
}
