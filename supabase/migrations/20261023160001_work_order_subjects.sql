-- Catálogo de assuntos da OS (por cidade) e vínculo na ordem.

CREATE TABLE IF NOT EXISTS public.work_order_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_work_order_subjects_org
  ON public.work_order_subjects (organization_id, active, sort_order);

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.work_order_subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_label text;

COMMENT ON TABLE public.work_order_subjects IS
  'Assuntos cadastráveis da ordem de serviço. A OS é sempre manual e exige um assunto.';

ALTER TABLE public.work_order_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_order_subjects_select ON public.work_order_subjects;
CREATE POLICY work_order_subjects_select ON public.work_order_subjects
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS work_order_subjects_write ON public.work_order_subjects;
CREATE POLICY work_order_subjects_write ON public.work_order_subjects
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.work_order_subjects FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_subjects TO authenticated;
GRANT ALL ON public.work_order_subjects TO service_role;

INSERT INTO public.work_order_subjects (organization_id, name, sort_order)
SELECT o.id, v.name, v.sort_order
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('Manutenção emergencial de radar', 10),
    ('Manutenção emergencial de semáforo', 20),
    ('Manutenção emergencial de câmeras', 30),
    ('Manutenção preventiva de radar', 40),
    ('Manutenção preventiva de semáforo', 50),
    ('Manutenção preventiva de câmeras', 60),
    ('Manutenção emergencial de sensor', 70),
    ('Manutenção preventiva de sensor', 80),
    ('Sinalizar via pública', 90),
    ('Acompanhar obras', 100),
    ('Desobstrução e limpeza de via pública', 110),
    ('Atendimento a acidente', 120),
    ('Remoção de cabos na via', 130),
    ('Controle de engarrafamento', 140),
    ('Reparo de conectividade', 150),
    ('Inspeção de equipamento', 160)
) AS v(name, sort_order)
ON CONFLICT (organization_id, name) DO NOTHING;

-- Ocorrências que já têm OS deixam de aparecer como pendentes.
UPDATE public.alerts
SET state = 'os_aberta'
WHERE incident_id IS NOT NULL
  AND state NOT IN ('resolvido', 'falso positivo', 'os_aberta');
