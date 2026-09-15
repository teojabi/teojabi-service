BEGIN;

ALTER TABLE public.seoul_building_register
  ADD COLUMN IF NOT EXISTS pnu varchar(19);

WITH unique_address AS (
  SELECT "대지위치", min(pnu) AS pnu
  FROM public.master_land
  WHERE pnu ~ '^11[0-9]{17}$' AND "대지위치" IS NOT NULL
  GROUP BY "대지위치"
  HAVING count(DISTINCT pnu) = 1
)
UPDATE public.seoul_building_register AS register
SET pnu = land.pnu
FROM unique_address AS land
WHERE register.pnu IS NULL
  AND register."대지위치" = land."대지위치";

CREATE INDEX IF NOT EXISTS seoul_building_register_pnu_idx
  ON public.seoul_building_register (pnu)
  WHERE pnu IS NOT NULL;

COMMIT;
