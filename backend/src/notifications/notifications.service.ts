import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type SavedRow = { kind: string; key: string; payload: any };
type Alert = {
  type: 'auction' | 'onbid';
  key: string;
  origin: 'favorite' | 'condition';
  conditionName: string | null;
  date: string;
  kindLabel: string;
  title: string;
  detail: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private auctionAlert(r: any, origin: 'favorite' | 'condition', conditionName: string | null): Alert {
    const date = this.dateOf(r.sale_date);
    return {
      type: 'auction',
      key: `auction:${r.docid}`,
      origin,
      conditionName,
      date,
      kindLabel: `경매 ${this.labelFor(date)}`,
      title: String(r.full_address || r.docid || ''),
      detail: `${String(r.usage_name || '용도 미기재')} · 최저 ${this.money(r.min_price)} · 매각기일 ${date}${r.sale_hour ? ` ${r.sale_hour}` : ''}`,
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

  async getInbox(userId: string, leadDays: number) {
    const saved = await this.prisma.$queryRaw<SavedRow[]>`
      SELECT kind, item_key AS key, payload FROM public.discovery_item
      WHERE user_id=${userId} AND kind IN ('favorite','condition')`;
    const start = this.date(0);
    const end = this.date(leadDays);
    const startStamp = this.stamp(0);
    const endStamp = this.stamp(leadDays);
    const items: Alert[] = [];

    const favAuction = saved.filter((r) => r.kind === 'favorite' && r.key.startsWith('auction:')).map((r) => r.key.slice('auction:'.length));
    const favOnbid = saved.filter((r) => r.kind === 'favorite' && r.key.startsWith('onbid:')).map((r) => r.key.slice('onbid:'.length));

    if (favAuction.length) {
      const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT docid, full_address, min_price, usage_name, sale_date, sale_hour
        FROM public.auction_item
        WHERE docid IN (${Prisma.join(favAuction)})
          AND sale_date >= ${start}::date AND sale_date <= ${end}::date
        ORDER BY sale_date ASC LIMIT 50`);
      for (const r of rows) items.push(this.auctionAlert(r, 'favorite', null));
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

    for (const savedRow of saved.filter((r) => r.kind === 'condition')) {
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

      if (wantCourt) {
        const conditions: Prisma.Sql[] = [Prisma.sql`a.sale_date >= ${start}::date AND a.sale_date <= ${end}::date`];
        if (districts.length) conditions.push(Prisma.sql`a.sigu IN (${Prisma.join(districts)})`);
        if (usages.length) conditions.push(Prisma.sql`(${Prisma.join(usages.map((u: string) => Prisma.sql`a.usage_name ILIKE ${'%' + u + '%'}`), ' OR ')})`);
        if (dealType) conditions.push(Prisma.sql`a.deal_type = ${dealType}`);
        if (maxPrice) conditions.push(Prisma.sql`a.min_price <= ${maxPrice}`);
        if (maxRate) conditions.push(Prisma.sql`a.noti_min_rate <= ${maxRate}`);
        const rows = await this.prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT a.docid, a.full_address, a.min_price, a.usage_name, a.sale_date, a.sale_hour
          FROM public.auction_item a WHERE ${Prisma.join(conditions, ' AND ')}
          ORDER BY a.sale_date ASC LIMIT 20`);
        for (const r of rows) items.push(this.auctionAlert(r, 'condition', conditionName));
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
    const list = [...dedup.values()]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 60);

    return { status: 'ready', generatedAt: new Date().toISOString(), leadDays, count: list.length, items: list };
  }
}
