-- OS manual e cadastro humano usam data_origin = 'manual'.
-- O enum original só tinha simulado/real/integracao.

ALTER TYPE public.data_origin ADD VALUE IF NOT EXISTS 'manual';
ALTER TYPE public.data_origin ADD VALUE IF NOT EXISTS 'importado';
