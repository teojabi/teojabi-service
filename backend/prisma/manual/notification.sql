-- 알림 설정/발송 기록 테이블.
-- 백엔드 배포 워크플로는 prisma migrate를 실행하지 않으므로, 이 파일을 Supabase에 직접 적용한다.
--   psql "$DATABASE_URL" -f backend/prisma/manual/notification.sql
-- RLS 사용 + anon/authenticated 권한 회수(서비스는 service_role/소유자로 접근).

CREATE TABLE IF NOT EXISTS public.notification_preference (
  user_id     text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  email       boolean NOT NULL DEFAULT true,
  web_push    boolean NOT NULL DEFAULT false,
  kakao       boolean NOT NULL DEFAULT false,
  favorites   boolean NOT NULL DEFAULT true,
  conditions  boolean NOT NULL DEFAULT true,
  lead_days   integer NOT NULL DEFAULT 7,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_delivery (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  dedupe_key  text NOT NULL UNIQUE,
  channel     text NOT NULL,
  item_count  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'SENT',
  error       text,
  sent_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_delivery_user_idx ON public.notification_delivery(user_id, sent_at DESC);

ALTER TABLE public.notification_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.notification_preference FROM anon;
    REVOKE ALL ON public.notification_delivery FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.notification_preference FROM authenticated;
    REVOKE ALL ON public.notification_delivery FROM authenticated;
  END IF;
END $$;
