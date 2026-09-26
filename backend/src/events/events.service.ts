import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type IncomingEvent = { type?: unknown; entityId?: unknown; payload?: unknown; occurredAt?: unknown };

// 요청당 최대 이벤트 수(클라이언트 배치 상한과 맞춘다).
const MAX_EVENTS = 20;
const MAX_TYPE = 40;
const MAX_ENTITY = 120;
const MAX_PAYLOAD = 4000;

const text = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 로그인 회원의 탐색·행동 이벤트를 user_event에 기록한다(회원 전용).
   * 페이로드는 자유 형식(jsonb)이며, 서버에서 크기·길이만 제한한다.
   */
  async record(userId: string, body: any) {
    const list: IncomingEvent[] = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
    const rows = list.map((event) => {
      const type = text(event?.type, MAX_TYPE);
      if (!type) throw new BadRequestException('event type required');
      const entityId = text(event?.entityId, MAX_ENTITY);
      let payload: Record<string, unknown> = {};
      if (event?.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)) {
        const serialized = JSON.stringify(event.payload);
        payload = serialized.length <= MAX_PAYLOAD ? (event.payload as Record<string, unknown>) : { truncated: true };
      }
      const occurredAt = text(event?.occurredAt, 30);
      return { type, entityId, payload, occurredAt };
    });
    if (!rows.length) return { status: 'ok', recorded: 0 };

    for (const row of rows) {
      await this.prisma.$executeRaw`
        INSERT INTO public.user_event(user_id, type, entity_id, payload, occurred_at)
        VALUES (${userId}, ${row.type}, ${row.entityId}, ${JSON.stringify(row.payload)}::jsonb,
                COALESCE(${row.occurredAt}::timestamptz, now()))`;
    }
    return { status: 'ok', recorded: rows.length };
  }
}
