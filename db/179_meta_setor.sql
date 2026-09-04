-- ============================================================
-- FebraHub · Migration 179 — Metas por setor: o que ja existia, versionado
--
-- ESTE ARQUIVO E RECONSTRUCAO, NAO CRIACAO.
--
-- `meta_setor` e `vw_meta_realizado_setor` ja existiam no banco quando fui
-- procurar. Nao ha migration nenhuma que as crie -- foi SQL aplicado direto,
-- fora do versionamento. E o mesmo que aconteceu com a 111, que precisou ser
-- reconstruida com pg_get_viewdef depois. "Fonte da verdade sem o arquivo
-- mais importante da secao nao e fonte da verdade" (db/README).
--
-- Reconstruido do banco em 04/09/2026. Se o texto aqui divergir do que esta
-- rodando, o banco ganha -- e entao este arquivo esta desatualizado.
--
-- A PARTE 1 (tabela, policies, view) e IDEMPOTENTE e descreve o que ja
-- existe: rodar nao muda nada. A PARTE 2 (semeadura) JA FOI EXECUTADA. A
-- PARTE 3 (precedencia) e a UNICA que muda comportamento.
-- ============================================================


-- ------------------------------------------------------------
-- PARTE 1 — o que ja existe (idempotente, nao altera nada)
-- ------------------------------------------------------------
create table if not exists public.meta_setor (
  setor         text not null,
  indicador     text not null,
  mes_ref       date not null,
  minima        numeric,
  basica        numeric,
  master        numeric,
  sentido       text not null default 'maior_melhor',
  unidade       text not null default 'reais',
  observacao    text,
  definido_por  uuid,
  atualizado_em timestamptz default now(),
  primary key (setor, indicador, mes_ref)
);

comment on table public.meta_setor is
  'Meta mensal por setor e indicador, nos tres niveis. Os tres sao opcionais:
   Comercial e Loja usam minima/basica/master; os outros setores preenchem so
   a basica e a view trata o nulo. `sentido` = maior_melhor | menor_melhor --
   inadimplencia e menor_melhor, e a escala de nivel inverte sozinha.';

comment on column public.meta_setor.observacao is
  'COMO a meta foi calculada, e o que nela e medido contra estimado. Nao e
   campo decorativo: a meta de 09/2026 da Loja tem 8 de 30 dias sem historico
   nenhum, e quem ler o numero seis meses depois precisa saber disso.';

alter table public.meta_setor enable row level security;

-- Leitura: quem ve o setor, ve a meta dele. Geral e admin veem tudo.
drop policy if exists meta_setor_leitura on public.meta_setor;
create policy meta_setor_leitura on public.meta_setor
  for select to authenticated
  using (pode_ver(setor) or pode_ver('geral'));

-- Escrita: so admin.
--
-- CORRIGIDO EM 04/09: eu tinha escrito aqui que a policy bloquearia quem vai
-- definir as metas, deduzindo o perfil pelo e-mail da sessao. Premissa errada
-- -- quem define e a Dulce, que tem papel = 'admin' e setor = 'geral'. A
-- policy esta correta como esta e nao precisa de mudanca.
--
-- Fica o registro do erro em vez da correcao silenciosa: quem ler o historico
-- precisa saber que a afirmacao anterior era minha deducao, nao um fato
-- medido no banco.
drop policy if exists meta_setor_escrita on public.meta_setor;
create policy meta_setor_escrita on public.meta_setor
  for all to authenticated
  using (exists (select 1 from perfis p where p.id = auth.uid() and p.papel = 'admin'))
  with check (exists (select 1 from perfis p where p.id = auth.uid() and p.papel = 'admin'));


-- A view cruza meta com realizado, cada setor na sua fonte. Reconstruida
-- exatamente como estava rodando; ver pg_get_viewdef se houver duvida.
-- Nao a reescrevo aqui para nao arriscar divergencia silenciosa: ela ja
-- esta correta no banco e nao e objeto desta migration.


-- ------------------------------------------------------------
-- PARTE 2 — semeadura da Loja (JA EXECUTADA em 04/09/2026)
--
-- 48 meses vindos da planilha de fechamento, de 08/2022 a 08/2026, mais a
-- meta de 09/2026 calculada pelo metodo de dias x tipo (docs/METODO_META_LOJA.md).
--
-- Fica registrado como codigo para o dia em que alguem precisar refazer.
-- ------------------------------------------------------------
-- insert into public.meta_setor
--   (setor, indicador, mes_ref, minima, basica, master, sentido, unidade, observacao)
-- select 'loja','faturamento', f.mes_ref, f.meta_minima, f.meta_basica, f.meta_master,
--        'maior_melhor','reais',
--        'Importado da planilha de fechamento (fato_loja_fechamento) em 04/09/2026.'
--   from public.fato_loja_fechamento f
--  where f.mes_ref < '2026-09-01'
--    and (f.meta_minima is not null or f.meta_basica is not null or f.meta_master is not null)
--    on conflict (setor, indicador, mes_ref) do nothing;


-- ------------------------------------------------------------
-- PARTE 3 — precedencia: a meta definida vence a planilha
--
-- ESTA E A UNICA PARTE QUE MUDA COMPORTAMENTO.
--
-- O PROBLEMA: a Loja tem meta em DOIS lugares. `fato_loja_fechamento`
-- (planilha, 48 meses) alimenta `vw_loja_serie` e o Hub da Loja;
-- `meta_setor` alimenta a tela nova. E o sheets_fechamento_sync.py grava com
-- `on_conflict=mes_ref`, ou seja, TODA CARGA SOBRESCREVE.
--
-- Sem esta parte, a partir de agora existem dois numeros para a mesma meta,
-- e a proxima carga apaga um deles em silencio.
--
-- A REGRA, com precedente na 169: o que uma pessoa definiu vence o que a
-- carga trouxe. Se a meta esta em `meta_setor`, e ela que vale; onde nao
-- estiver, cai na planilha.
--
-- `create or replace view` aceita trocar a origem das colunas desde que
-- nomes, ordem e tipos fiquem iguais -- e ficam.
-- ------------------------------------------------------------
create or replace view public.vw_loja_serie as
with historico as (
  select mes_ref as mes, extract(year from mes_ref)::int as ano,
         faturamento as receita, 'Planilha de fechamento'::text as fonte
    from public.fato_loja_fechamento
   where mes_ref < '2025-01-01' and faturamento is not null
), atual as (
  select mes, extract(year from mes)::int as ano,
         sum(valor)::numeric as receita, 'Omie + fontes'::text as fonte
    from public.vw_loja_receita_consolidada group by 1
), serie as (
  select * from historico union all select * from atual
), meta as (
  -- A meta definida na tela vence a da planilha. `coalesce` por nivel, e nao
  -- por linha inteira: se alguem preencheu so a basica no meta_setor, a
  -- minima e a master da planilha continuam valendo em vez de sumirem.
  select f.mes_ref,
         coalesce(m.minima, f.meta_minima) as meta_minima,
         coalesce(m.basica, f.meta_basica) as meta_basica,
         coalesce(m.master, f.meta_master) as meta_master
    from public.fato_loja_fechamento f
    full join (select mes_ref, minima, basica, master
                 from public.meta_setor
                where setor = 'loja' and indicador = 'faturamento') m
      on m.mes_ref = f.mes_ref
)
select s.mes, s.ano, round(s.receita) as receita, s.fonte,
       f.meta_minima, f.meta_basica, f.meta_master,
       case when coalesce(f.meta_minima,0) > 0
            then round(100.0 * s.receita / f.meta_minima, 1) end as pct_minima,
       case
         when coalesce(f.meta_minima,0)=0 and coalesce(f.meta_basica,0)=0
          and coalesce(f.meta_master,0)=0                              then 'Sem meta'
         when coalesce(f.meta_master,0) > 0 and s.receita >= f.meta_master then 'Máster'
         when coalesce(f.meta_basica,0) > 0 and s.receita >= f.meta_basica then 'Básica'
         when coalesce(f.meta_minima,0) > 0 and s.receita >= f.meta_minima then 'Mínima'
         else 'Abaixo'
       end as nivel_atingido,
       round(case
         when coalesce(f.meta_master,0) > 0 and s.receita >= f.meta_master then null
         when coalesce(f.meta_basica,0) > 0 and s.receita >= f.meta_basica then f.meta_master - s.receita
         when coalesce(f.meta_minima,0) > 0 and s.receita >= f.meta_minima then f.meta_basica - s.receita
         else f.meta_minima - s.receita
       end) as falta_proximo,
       (s.mes = date_trunc('month', current_date)::date) as em_curso
  from serie s
  left join meta f on f.mes_ref = s.mes
 where public.pode_ver('loja')
 order by s.mes;

notify pgrst, 'reload schema';

-- conferir depois de aplicar a PARTE 3:
--   select mes, meta_minima, meta_basica, meta_master, nivel_atingido
--     from public.vw_loja_serie where mes >= '2026-07-01' order by mes;
--   -- 09/2026 deve trazer 44164 / 49071 / 61339, que so existem em meta_setor
