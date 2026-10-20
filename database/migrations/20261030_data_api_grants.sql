-- 2026-10-30 이후 Supabase는 public 스키마의 새 테이블에 Data API 권한을 자동 부여하지 않는다.
-- 이 프로젝트의 Data API(PostgREST) 접근은 Edge Function의 service_role만 사용한다.
-- anon/authenticated에는 부여하지 않는다(기존 공개 범위 유지).
--
-- 주의: 이 스크립트는 현재 존재하는 public 테이블에만 적용된다.
--       앞으로 새 테이블을 만드는 마이그레이션에는 아래를 함께 넣어야 한다.
--         grant select, insert, update, delete on public.<table> to service_role;

do $$
declare
  r record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('grant select, insert, update, delete on public.%I to service_role', r.tablename);
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;
