CREATE TABLE IF NOT EXISTS public.platform_firewall (
  id smallint PRIMARY KEY CHECK (id = 1),
  site_allow jsonb NOT NULL DEFAULT '[]'::jsonb,
  site_deny jsonb NOT NULL DEFAULT '[]'::jsonb,
  mng_allow jsonb NOT NULL DEFAULT '[]'::jsonb,
  city_login jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.platform_firewall (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_firewall ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_firewall FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_firewall TO postgres, service_role;

COMMENT ON TABLE public.platform_firewall IS
  'Regras de acesso por IP da plataforma. Só a API (service_role) lê e grava; o Nginx aplica.';
