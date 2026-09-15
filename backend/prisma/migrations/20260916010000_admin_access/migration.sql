CREATE TABLE IF NOT EXISTS public.teojabi_admin_member (
  user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('MASTER', 'ADMIN')),
  previous_role public."Role" NOT NULL DEFAULT 'USER',
  granted_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teojabi_admin_member_active_idx
  ON public.teojabi_admin_member(active, access_level);

ALTER TABLE public.teojabi_admin_member ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teojabi_admin_member FROM anon, authenticated;

INSERT INTO public.teojabi_admin_member(user_id, access_level, previous_role, granted_by, active)
SELECT id, 'MASTER', 'ADMIN'::public."Role", id, true
FROM public."user"
WHERE id = '5cb3e37f-09c1-4d2d-bf34-7f68c015992f' AND role = 'ADMIN'
ON CONFLICT (user_id) DO UPDATE
SET access_level = 'MASTER', active = true, updated_at = now();
