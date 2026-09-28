-- 새 매물·경공매 "신규" 매칭용 커서. (마지막 알림 기준 시각)
-- 백엔드 배포 워크플로우가 prisma migrate를 실행하지 않으므로, 이 파일을 Supabase에 직접 적용한다.
--   psql "$DATABASE_URL" -f backend/prisma/manual/notification-cursor.sql
-- 매칭은 first_seen_at > last_seen_at 인 항목만 대상으로 하고, 항목 중복은 notification_item이 막는다.

CREATE TABLE IF NOT EXISTS public.notification_source_cursor (
  source       text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_source_cursor ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.notification_source_cursor FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.notification_source_cursor FROM authenticated;
  END IF;
END $$;
