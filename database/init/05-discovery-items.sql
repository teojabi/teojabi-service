-- Additive storage for explicitly saved source listings, feedback, conditions and analysis.
-- Existing property/favorite records remain unchanged. Application routes require JwtAuthGuard.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
CREATE TABLE IF NOT EXISTS public.discovery_item (
  user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('favorite','feedback','condition','analysis')),
  item_key text NOT NULL CHECK (length(item_key) BETWEEN 1 AND 100),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=32768),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,kind,item_key)
);
ALTER TABLE public.discovery_item ENABLE ROW LEVEL SECURITY;
-- The Nest backend is the only reader/writer. No public/anonymous direct table policy.
DO $$ BEGIN
  IF to_regclass('public."user"') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.discovery_item'::regclass AND conname='discovery_item_user_fkey'
  ) THEN
    ALTER TABLE public.discovery_item ADD CONSTRAINT discovery_item_user_fkey
      FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;
  END IF;
END $$;
COMMENT ON TABLE public.discovery_item IS 'Explicit user saved selections, independent of chat. Source listing keys are not legacy property UUIDs. Access only through authenticated per-user backend.';
COMMIT;
