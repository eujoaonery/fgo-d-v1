-- Novo estado: ocorrência sai da fila pendente quando uma OS é aberta e vinculada.
ALTER TYPE public.alert_state ADD VALUE IF NOT EXISTS 'os_aberta';
