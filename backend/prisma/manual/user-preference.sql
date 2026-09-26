-- 회원 관심 프로필(행동·저장 조건에서 파생). 알림 매칭·추천의 기반.
-- 백엔드 배포 워크플로는 prisma migrate를 실행하지 않으므로, 이 파일을 Supabase에 직접 적용한다.
--   psql "$DATABASE_URL" -f backend/prisma/manual/user-preference.sql

CREATE TABLE IF NOT EXISTS public.user_preference (
  user_id    text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  profile    jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preference ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON public.user_preference FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON public.user_preference FROM authenticated;
  END IF;
END $$;
