import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function loadEnvFile() {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(match[1] in process.env)) process.env[match[1]] = value;
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  loadEnvFile();
  const info: Record<string, unknown> = {
    step: 'diag',
    cwd: process.cwd(),
    envFile: existsSync(resolve(process.cwd(), '.env')),
    hasDb: Boolean(process.env.DATABASE_URL),
    dbPrefix: String(process.env.DATABASE_URL || '').slice(0, 24),
    scriptsExists: existsSync(resolve(process.cwd(), 'dist/src/scripts/resend-digest.js')),
    scripts: existsSync(resolve(process.cwd(), 'dist/src/scripts')) ? readdirSync(resolve(process.cwd(), 'dist/src/scripts')) : [],
    node: process.version,
  };
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  await client.$executeRawUnsafe('INSERT INTO public.ops_resend_log(payload) VALUES ($1::jsonb)', JSON.stringify(info));
  await client.$disconnect();
  console.log(JSON.stringify(info));
}

main().catch(async (error) => {
  console.error('[ops-diag] 실패:', String((error as Error)?.message ?? error));
  process.exit(1);
});
