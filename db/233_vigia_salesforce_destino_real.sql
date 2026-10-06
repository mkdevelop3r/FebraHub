-- ============================================================
-- 233 - Vigia do Salesforce acompanha alunos E pagamentos
--
-- O sync de 15 minutos grava students + payments, mas o vigia observava
-- dim_turma_salesforce, destino do credenciamento (outra rotina). Cada carga
-- comercial valida parecia "rodou sem gravar". O relogio abaixo so avanca
-- quando as duas tabelas realmente receberam a carga.
-- ============================================================

begin;

alter table public.fato_base_alunos
  add column if not exists sincronizado_em timestamptz;
alter table public.fato_pagamento_base
  add column if not exists sincronizado_em timestamptz;

-- Evita um falso atraso entre aplicar a migration e a primeira carga nova.
update public.fato_base_alunos
   set sincronizado_em = now()
 where sincronizado_em is null;
update public.fato_pagamento_base
   set sincronizado_em = now()
 where sincronizado_em is null;

alter table public.fato_base_alunos
  alter column sincronizado_em set default now();
alter table public.fato_pagamento_base
  alter column sincronizado_em set default now();

create or replace view public.vw_salesforce_sync_destino as
select least(
         (select max(a.sincronizado_em) from public.fato_base_alunos a),
         (select max(p.sincronizado_em) from public.fato_pagamento_base p)
       ) as sincronizado_em,
       (select count(*) from public.fato_base_alunos) as alunos,
       (select count(*) from public.fato_pagamento_base) as pagamentos;

comment on view public.vw_salesforce_sync_destino is
  'Checkpoint real da carga Salesforce: so avanca quando alunos e pagamentos avancam.';

grant select on public.vw_salesforce_sync_destino to service_role;
revoke all on public.vw_salesforce_sync_destino from anon, authenticated;

update public.vigia_fontes
   set nome = 'Salesforce',
       tabela_destino = 'vw_salesforce_sync_destino',
       coluna_relogio = 'sincronizado_em',
       exigir_avanco = true,
       execucoes_sem_avanco = 3,
       atualizado_em = now()
 where fonte = 'salesforce_api';

notify pgrst, 'reload schema';
commit;

