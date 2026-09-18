-- Vigia independente: uma execucao verde so e saudavel se a tabela de destino
-- tambem avancar. Alertas ficam abertos ate a recuperacao, sem duplicacao.
create table if not exists public.vigia_fontes (
  fonte text primary key,
  nome text not null,
  ativo boolean not null default true,
  tolerancia_minutos integer not null check (tolerancia_minutos > 0),
  tabela_destino text,
  coluna_relogio text,
  exigir_avanco boolean not null default true,
  execucoes_sem_avanco integer not null default 2 check (execucoes_sem_avanco > 0),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.vigia_verificacoes (
  id bigint generated always as identity primary key,
  fonte text not null references public.vigia_fontes(fonte),
  verificado_em timestamptz not null default now(),
  ultima_execucao timestamptz,
  destino_ultima timestamptz,
  destino_registros bigint,
  avancou boolean,
  sequencia_sem_avanco integer not null default 0,
  situacao text not null check (situacao in ('saudavel','atrasado','erro','sem_avanco','nao_mensurado')),
  motivo text
);
create index if not exists vigia_verificacoes_fonte_data
  on public.vigia_verificacoes(fonte, verificado_em desc);

create table if not exists public.vigia_alertas (
  id bigint generated always as identity primary key,
  fonte text not null references public.vigia_fontes(fonte),
  tipo text not null,
  aberto_em timestamptz not null default now(),
  visto_em timestamptz not null default now(),
  resolvido_em timestamptz,
  motivo text,
  notificacao_em timestamptz
);
create unique index if not exists vigia_alerta_aberto_unico
  on public.vigia_alertas(fonte, tipo) where resolvido_em is null;

insert into public.vigia_fontes
  (fonte,nome,tolerancia_minutos,tabela_destino,coluna_relogio,exigir_avanco,execucoes_sem_avanco)
values
 ('salesforce_api','Salesforce',45,'dim_turma_salesforce','sincronizado_em',true,3),
 ('blackcrm_leads','Black CRM',1560,'fato_crm_lead','sincronizado_em',true,2),
 ('conta_azul','Conta Azul',1560,'fato_contas_receber','sincronizado_em',true,2),
 ('meta_ads','Meta Ads',1560,'fato_meta_insights','atualizado_em',true,2),
 ('meta_leads','Meta Leads',1560,'fato_meta_lead','sincronizado_em',true,2),
 ('omie','Omie',1560,'fato_loja_cupom','atualizado_em',true,2),
 ('presenca','Presenca',4320,'fato_presenca','carregado_em',false,2),
 ('cispay','CISPay',1560,'fato_liquidacao_cartao','data_liquidacao',false,2),
 ('sympla','Sympla',1560,'fato_pedidos','data_atualizacao_pedido',false,2),
 ('mensagens_pedagogico','Mensagens Pedagogico',60,null,null,false,2),
 ('respostas_pedagogico','Respostas Pedagogico',60,null,null,false,2)
on conflict (fonte) do update set nome=excluded.nome,
 tolerancia_minutos=excluded.tolerancia_minutos, tabela_destino=excluded.tabela_destino,
 coluna_relogio=excluded.coluna_relogio, exigir_avanco=excluded.exigir_avanco,
 execucoes_sem_avanco=excluded.execucoes_sem_avanco, atualizado_em=now();

create or replace view public.vw_vigia_integracoes as
select f.fonte, f.nome, f.tolerancia_minutos, v.verificado_em, v.ultima_execucao,
       v.destino_ultima, v.destino_registros, v.avancou, v.situacao, v.motivo,
       a.aberto_em as alerta_desde
from public.vigia_fontes f
left join lateral (select x.* from public.vigia_verificacoes x
  where x.fonte=f.fonte order by x.verificado_em desc limit 1) v on true
left join lateral (select x.* from public.vigia_alertas x
  where x.fonte=f.fonte and x.resolvido_em is null order by x.aberto_em desc limit 1) a on true
where f.ativo;

alter table public.vigia_fontes enable row level security;
alter table public.vigia_verificacoes enable row level security;
alter table public.vigia_alertas enable row level security;
grant select on public.vw_vigia_integracoes to authenticated;
revoke all on public.vigia_fontes, public.vigia_verificacoes, public.vigia_alertas from anon, authenticated;
notify pgrst, 'reload schema';
