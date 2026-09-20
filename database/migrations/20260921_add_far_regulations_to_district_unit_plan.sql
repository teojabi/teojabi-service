BEGIN;

-- 지구단위계획 용적률·건폐율·높이 기준을 기존 구역 테이블에 함께 보관한다.
-- (선택 사항) 서비스는 v_far_serving_full / v_district_sources 뷰를 직접 읽어도 되고,
-- 오프라인 백업이 필요할 때만 이 컬럼을 생성해 사용한다.
-- 원본 district_far_regulation / v_far_serving* 은 그대로 둔다(비파괴).
ALTER TABLE public.district_unit_plan
  ADD COLUMN IF NOT EXISTS far_regulations jsonb;

UPDATE public.district_unit_plan AS d
SET far_regulations = grouped.rows
FROM (
  SELECT f.dgm_nm, jsonb_agg(to_jsonb(f) ORDER BY f.id) AS rows
  FROM public.v_far_serving_full AS f
  GROUP BY f.dgm_nm
) AS grouped
WHERE d.far_regulations IS NULL
  AND d.dgm_nm = grouped.dgm_nm;

CREATE INDEX IF NOT EXISTS idx_dup_far_regulations
  ON public.district_unit_plan USING gin (far_regulations jsonb_path_ops);

COMMIT;
