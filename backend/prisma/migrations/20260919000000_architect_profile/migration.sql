CREATE TABLE IF NOT EXISTS public.architect_profile (
  id text PRIMARY KEY,
  user_id text NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  office_name text NOT NULL,
  representative_name text NOT NULL,
  bio text,
  logo_url text,
  website_url text,
  phone text,
  email text,
  address text,
  kakao_url text,
  regions text,
  specialties text,
  status text NOT NULL DEFAULT 'PENDING',
  featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS architect_profile_status_idx
  ON public.architect_profile(status, sort_order);
