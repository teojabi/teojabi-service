-- '새 매물' 알림을 대지위치 기준으로 판정할 때 쓰는 인덱스.
CREATE INDEX IF NOT EXISTS naver_address_idx ON public.naver ("대지위치");
CREATE INDEX IF NOT EXISTS disco_listing_address_idx ON public.disco_listing (address);
