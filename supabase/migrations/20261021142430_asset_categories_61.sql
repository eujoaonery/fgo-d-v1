-- Catálogo mínimo de categorias do inventário (§6.1).
insert into public.asset_categories (organization_id, slug, label, marker_kind, sort_order)
select o.id, v.slug, v.label, v.marker_kind, v.sort_order
from public.organizations o
cross join (
  values
    ('camera', 'Câmera de vigilância', 'camera', 10),
    ('radar', 'Radar de trânsito', 'camera', 20),
    ('semaforo', 'Semáforo inteligente', 'semaforo', 30),
    ('sensor', 'Sensor urbano', 'sensor', 40),
    ('conectividade', 'Ponto de conectividade', 'conectividade', 50),
    ('totem', 'Totem de estacionamento', 'sensor', 60),
    ('onibus', 'Veículo de transporte', 'sensor', 70),
    ('balanca', 'Balança rodoviária', 'sensor', 80),
    ('cancela', 'Cancela automática', 'sensor', 90),
    ('painel', 'Painel LED', 'semaforo', 100),
    ('fiscalizacao-autonoma', 'Veículo autônomo de fiscalização', 'camera', 110),
    ('patinete', 'Patinete elétrico', 'sensor', 120),
    ('moto-agente', 'Motocicleta de agente', 'equipe', 130),
    ('viatura', 'Viatura', 'equipe', 140)
) as v(slug, label, marker_kind, sort_order)
on conflict (organization_id, slug) do update
set label = excluded.label,
    marker_kind = excluded.marker_kind,
    sort_order = excluded.sort_order;
