-- 알림함 소프트 삭제(지움) 지원.
-- 하드 삭제하면 조회 시 매칭이 다시 생성되어 알림이 계속 reappear 하므로, '지움' 시각을 기록하고 목록에서 제외한다.
ALTER TABLE public.notification_item ADD COLUMN IF NOT EXISTS cleared_at timestamptz;
CREATE INDEX IF NOT EXISTS notification_item_user_active_idx ON public.notification_item(user_id) WHERE cleared_at IS NULL;
