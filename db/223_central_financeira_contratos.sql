-- ============================================================
-- FebraHub · Migration 223 — Central Financeira: contratos (envio + assinatura)
--
-- Base do hub de auditoria de contratos (Cursos GGB). A automação (plano
-- Autentique) vai GRAVAR nesta tabela: cada venda aprovada gera uma linha, e o
-- webhook do Autentique atualiza o status (abriu/assinou). Por ora criamos a
-- tabela + a view de leitura (guard pode_ver('financeiro')) e algumas linhas de
-- EXEMPLO, pro hub já ter o que mostrar e o financeiro validar a tela.
--
-- status: enviado -> abriu -> assinou (ou erro). "não assinou" = tudo que não
-- chegou em 'assinou'; "não abriu" = ainda em 'enviado'.
-- ============================================================

create table if not exists public.contrato_envio (
  id                 uuid primary key default gen_random_uuid(),
  venda_id           text,            -- Opportunity / original_id_venda (Salesforce)
  cpf                text,
  nome               text,
  curso              text,
  turma              text,
  valor              numeric,
  telefone           text,
  email              text,
  unidade            text,
  autentique_doc_id  text,
  link               text,            -- link de assinatura do Autentique
  status             text not null default 'enviado',
  enviado_em         timestamptz default now(),
  abriu_em           timestamptz,
  assinou_em         timestamptz,
  erro               text,
  atualizado_em      timestamptz default now()
);

do $$ begin
  alter table public.contrato_envio
    add constraint contrato_envio_status_chk
    check (status in ('enviado','abriu','assinou','erro'));
exception when duplicate_object then null; end $$;

create index if not exists contrato_envio_status_idx     on public.contrato_envio(status);
create index if not exists contrato_envio_enviado_em_idx on public.contrato_envio(enviado_em desc);
create index if not exists contrato_envio_venda_idx      on public.contrato_envio(venda_id);

alter table public.contrato_envio enable row level security;
do $$ begin
  create policy "leitura financeiro" on public.contrato_envio
    for select to authenticated using (pode_ver('financeiro'));
exception when duplicate_object then null; end $$;

-- view de leitura do hub (mesmo padrão das outras: guard dentro da view)
create or replace view public.vw_contrato_envio as
select id, venda_id, cpf, nome, curso, turma, valor, telefone, email, unidade,
       autentique_doc_id, link, status,
       enviado_em, abriu_em, assinou_em, erro, atualizado_em,
       (status = 'assinou')               as assinado,
       (status in ('abriu','assinou'))    as abriu
  from public.contrato_envio
 where pode_ver('financeiro');

-- ---- dados de EXEMPLO (marcados; remover quando a automação entrar) ----
insert into public.contrato_envio
  (venda_id, cpf, nome, curso, turma, valor, telefone, email, unidade, link, status, enviado_em, abriu_em, assinou_em)
values
  ('EXEMPLO-1','028.647.785-80','Roberto Luiz Teixeira Júnior','INTELIGÊNCIA FINANCEIRA','2026 - IF34',6000,'5571983108282','roberto@priv8consultoria.com','FEBRACIS SALVADOR 2','https://app.autentique.com.br/exemplo1','assinou', now()-interval '6 days', now()-interval '6 days'+interval '2 hours', now()-interval '5 days'),
  ('EXEMPLO-2','111.222.333-44','Marina Alves Pereira','INTELIGÊNCIA FINANCEIRA','2026 - IF34',6000,'5571991112222','marina.alves@email.com','FEBRACIS SALVADOR 2','https://app.autentique.com.br/exemplo2','assinou', now()-interval '5 days', now()-interval '5 days'+interval '40 minutes', now()-interval '4 days'),
  ('EXEMPLO-3','222.333.444-55','Carlos Henrique Dias','FORMAÇÃO EM PERFORMANCE E COMPORTAMENTO HUMANO','2026 - FGPC27',8900,'5571993334444','carlos.dias@email.com','FEBRACIS SALVADOR 2','https://app.autentique.com.br/exemplo3','abriu', now()-interval '3 days', now()-interval '2 days', null),
  ('EXEMPLO-4','333.444.555-66','Juliana Santos Rocha','INTELIGÊNCIA FINANCEIRA','2026 - IF34',6000,'5571994445555','ju.rocha@email.com','FEBRACIS SALVADOR 2','https://app.autentique.com.br/exemplo4','abriu', now()-interval '2 days', now()-interval '1 day', null),
  ('EXEMPLO-5','444.555.666-77','Pedro Gomes Lima','MASTER COACHING','2026 - MASTER06',14900,'5571995556666','pedro.lima@email.com','FEBRACIS SALVADOR 2','https://app.autentique.com.br/exemplo5','enviado', now()-interval '1 day', null, null),
  ('EXEMPLO-6','555.666.777-88','Fernanda Oliveira Castro','INTELIGÊNCIA FINANCEIRA','2026 - IF34',6000,'5571996667777','fernanda.castro@email.com','FEBRACIS SALVADOR 2','https://app.autentique.com.br/exemplo6','enviado', now()-interval '4 hours', null, null)
on conflict do nothing;

notify pgrst, 'reload schema';
