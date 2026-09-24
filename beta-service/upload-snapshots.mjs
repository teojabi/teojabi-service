// 스냅샷 파일을 Supabase `public.snapshots` 테이블에 upsert한다. (서버/로컬 공용)
// 서버(beta-service)는 큐레이션 재생성 후 자동 호출하고, 로컬 자동화도 같은 스크립트를 쓸 수 있다.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const files = {
  'selected-catalog': '.local/supabase/selected-catalog.json',
  'selected-zoning': '.local/supabase/selected-zoning.json',
  'selected-development': '.local/supabase/selected-development.json',
  'curation-hidden': '.local/curation-hidden.json',
  'neighborhoods': 'neighborhoods.json',
  'inventory-summary': '.local/inventory-summary.json',
  'disco-activity': '.local/disco-daily/activity.json',
};

async function readJson(relative) {
  try {
    return JSON.parse((await readFile(join(root, relative), 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const rows = [];
for (const [name, relative] of Object.entries(files)) {
  const data = await readJson(relative);
  if (data === null) continue;
  rows.push({ name, data, updated_at: new Date().toISOString() });
}

const response = await fetch(url + '/rest/v1/snapshots?on_conflict=name', {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
});
if (!response.ok) {
  console.error('스냅샷 업로드 실패', response.status, await response.text());
  process.exit(1);
}
console.log('스냅샷 업로드 완료:', rows.map((row) => row.name).join(', '));
