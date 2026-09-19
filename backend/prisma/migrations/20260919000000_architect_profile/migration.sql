CREATE TABLE IF NOT EXISTS public.architect_profile (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  office_name text NOT NULL,
  representative_name text NOT NULL,
  bio text,
  logo_url text,
  gallery_urls text,
  website_url text,
  phone text,
  email text,
  address text,
  kakao_url text,
  regions text,
  specialties text,
  business_number text,
  business_start_date text,
  business_name text,
  business_verified boolean NOT NULL DEFAULT false,
  business_status text,
  business_status_text text,
  business_checked_at timestamptz,
  status text NOT NULL DEFAULT 'PENDING',
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.architect_profile
  ADD COLUMN IF NOT EXISTS gallery_urls text,
  ADD COLUMN IF NOT EXISTS business_number text,
  ADD COLUMN IF NOT EXISTS business_start_date text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS business_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_status text,
  ADD COLUMN IF NOT EXISTS business_status_text text,
  ADD COLUMN IF NOT EXISTS business_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS architect_profile_status_idx
  ON public.architect_profile(status, sort_order);
