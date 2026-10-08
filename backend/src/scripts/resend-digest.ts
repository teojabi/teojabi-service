import { NestFactory } from '@nestjs/core';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../app.module';
import { NotificationsService } from '../notifications/notifications.service';

// 오류 정정 재발송 CLI. 서버에서 실행한다(백엔드 .env 를 사용).
//   node dist/src/scripts/resend-digest.js --userIds=id1,id2 --dryRun=true
//   node dist/src/scripts/resend-digest.js --userIds=id1,id2 --dryRun=false
const DEFAULT_NOTE =
  '잠시 오류로 인해 조건 매칭이 잘못되어 정정하여 다시 보내드려요. 불편을 드려 죄송합니다. 아래는 회원님의 조건에 맞는 매물만 다시 추린 목록이에요.';

function readCliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : undefined;
}

// 로그 접근 없이 결과를 확인할 수 있도록 DB에 남긴다. Nest 초기화 실패에도 남도록 어댑터를 직접 쓴다.
async function logToDb(payload: Record<string, unknown>) {
  try {
    const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
    if (!connectionString) return;
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    await client.$executeRawUnsafe('INSERT INTO public.ops_resend_log(payload) VALUES ($1::jsonb)', JSON.stringify(payload));
    await client.$disconnect();
  } catch (error) {
    console.error('[resend-digest] DB 로그 실패:', String((error as Error)?.message ?? error));
  }
}

async function main() {
  const userIds = (readCliArg('userIds') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const note = readCliArg('note') || DEFAULT_NOTE;
  const dryRun = (readCliArg('dryRun') || 'true') !== 'false';

  await logToDb({ step: 'start', dryRun, count: userIds.length });
  if (!userIds.length) throw new Error('userIds가 필요합니다. 예: --userIds=id1,id2');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const service = app.get(NotificationsService);
    const result = await service.resendDigestForUsers(userIds, note, dryRun);
    console.log('[resend-digest] result');
    console.log(JSON.stringify(result, null, 2));
    await logToDb({ step: 'result', result });
  } finally {
    await app.close();
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? String(error.stack || '').slice(0, 3000) : '';
  console.error(`[resend-digest] 실패: ${message}`);
  await logToDb({ step: 'fatal', message, stack });
  process.exit(1);
});
