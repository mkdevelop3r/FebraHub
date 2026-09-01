-- ============================================================
-- FebraHub · Migration 169 — O telefone do represado
--
-- 141 dos 453 represados apareciam como "sem telefone". Nao era dado
-- faltando: `vw_pedagogico_prazo` le contato SO de `dim_alunos`, e nunca
-- recebeu a precedencia que a 114 estabeleceu para o resto do pedagogico
-- (fato_contatos -> matricula -> dim_alunos). Medido:
--
--   141  sem telefone hoje
--    73  tem em fato_contatos
--    66  tem em fato_base_alunos.telefone_cliente
--     2  realmente nao tem em lugar nenhum
--
-- 139 de 141 sao join que faltava, nao cadastro que falta.
--
-- ONDE A CORRECAO PRECISA ENTRAR
--
-- Em `vw_pedagogico_prazo`, que materializa em `fila_prazo`. Nao adianta
-- corrigir so na `vw_represado_lista`: o script de envio le
-- `vw_prazo_fila_envio`, que junta `pedagogico_envios` com `fila_prazo` e
-- exige `f.telefone is not null`. Telefone que existisse so na tela
-- deixaria a Elis enfileirar gente que o script nunca veria sair.
--
-- (A definicao de `vw_prazo_fila_envio` no db/106 esta desatualizada: a
-- viva le os pendentes, nao a fila calculada. O banco ganha; a 106 fica
-- como registro do que foi aplicado na epoca.)
--
-- OS 2 QUE SOBRAM, E OS QUE VAO SOBRAR AMANHA
--
-- `pedagogico_contato_manual` guarda o numero digitado na tela. Tabela
-- separada em vez de update em dim_alunos ou fato_contatos porque as duas
-- sao carga: o proximo ETL passaria por cima da correcao sem avisar. Aqui
-- o dado sobrevive a carga, tem dono e tem data.
--
-- A manual VENCE de todas as fontes. Se alguem digitou, e porque a fonte
-- estava errada ou vazia — foi uma pessoa olhando aquele caso.
--
-- fila_prazo e TABELA materializada: a funcao grava no override e atualiza
-- a fila na mesma transacao, senao a correcao so apareceria na proxima
-- rodada de `atualizar_fila_prazo()`. A view ja traz o override, entao o
-- proximo refresh preserva o que foi digitado.
--
-- OS DOIS JOINS NOVOS NAO MULTIPLICAM LINHA
--
-- Regra 1 do db/README: join cru multiplica quando a chave nao e unica
-- depois de normalizada — foi o que triplicou inscritos em 39 turmas.
-- Aqui as duas chaves sao PRIMARY KEY (`fato_contatos.cpf` e
-- `pedagogico_contato_manual.cpf`), entao cada join casa no maximo uma
-- linha. Conferido antes de escrever, nao presumido.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Onde mora o telefone corrigido na mao
-- ------------------------------------------------------------
create table if not exists public.pedagogico_contato_manual (
  cpf         text primary key,
  telefone    text not null,
  editado_por uuid,
  editado_em  timestamptz not null default now()
);

comment on table public.pedagogico_contato_manual is
  'Telefone corrigido a mao na Central Pedagogica. Vence fato_contatos,
   matricula e dim_alunos: se alguem digitou, a fonte estava errada.
   Separada das cargas de proposito — ETL nao sobrescreve correcao de gente.';

-- Mesmo padrao das tabelas de fato: RLS ligada, ZERO policies. Ninguem le
-- nem escreve direto; a escrita passa pela funcao, a leitura pelas views.
alter table public.pedagogico_contato_manual enable row level security;


-- ------------------------------------------------------------
-- 2. A view do prazo passa a usar a precedencia da 114
--
-- `create or replace` exige mesmas colunas, na mesma ordem: a lista de
-- saida abaixo e identica a que estava rodando. So mudou o QUE alimenta
-- nome, telefone e email.
-- ------------------------------------------------------------
create or replace view public.vw_pedagogico_prazo as
with cursos_com_registro as (
  select distinct norm_curso(fato_presenca.curso) as c
    from fato_presenca
   where fato_presenca.data_registro >= (current_date - '1 year 6 mons'::interval)
), matricula as (
  select a.aluno_id as cpf,
         a.curso_id as curso,
         min(a.data_matricula) as comprou_em,
         min(a.data_matricula) + 365 as vence_em,
         max(a.consultor_id) as consultor,
         min(a.turma) as turma_da_venda,
         string_agg(distinct a.tipo_matricula, ', '::text) as tipos,
         bool_or(a.tipo_matricula = any (array['Taxa de Transferência'::text,
                                               'Taxa de Transferência Isento'::text,
                                               'Transferido'::text])) as ja_transferiu,
         -- contato que veio na propria venda (2a fonte da 114)
         max(nullif(btrim(a.telefone_cliente), '')) as tel_venda,
         max(nullif(btrim(a.email_cliente), ''))    as email_venda
    from fato_base_alunos a
    join cursos_com_registro cr on cr.c = norm_curso(a.curso_id)
   where a.status_matricula = 'Aprovada'::text
     and a.data_matricula >= (current_date - '3 years'::interval)
     and (a.tipo_matricula <> all (array['COMPRADOR DE VAGAS'::text,
                                         'BÔNUS - COMPRADOR DE VAGAS'::text]))
   group by a.aluno_id, a.curso_id
), ja_fez as (
  select distinct m_1.cpf, m_1.curso
    from matricula m_1
    join fato_presenca p on p.cpf = m_1.cpf and norm_curso(p.curso) = norm_curso(m_1.curso)
), proxima_turma as (
  select norm_curso(dim_turmas.curso) as c,
         min(dim_turmas.data_inicio) as proxima,
         min(dim_turmas.turma_id) as turma_id
    from dim_turmas
   where dim_turmas.data_inicio > current_date
   group by (norm_curso(dim_turmas.curso))
)
select m.cpf,
       coalesce(ct.nome, al.nome)                                   as nome,
       coalesce(cm.telefone, ct.celular, m.tel_venda, al.telefone)  as telefone,
       coalesce(ct.email, m.email_venda, al.email)                  as email,
       m.curso,
       m.comprou_em,
       m.vence_em,
       m.vence_em - current_date as dias_restantes,
       m.consultor,
       m.turma_da_venda,
       m.tipos,
       m.ja_transferiu,
       pt.turma_id as proxima_turma,
       pt.proxima  as proxima_turma_em,
       case
         when m.vence_em < current_date then 'vencido'::text
         when m.vence_em > ((select vw_calendario_horizonte.ate from vw_calendario_horizonte))
              then 'aguardando calendario'::text
         when pt.proxima is null or pt.proxima > m.vence_em then 'sem turma no prazo'::text
         when (m.vence_em - current_date) <= 90 then 'vencendo'::text
         else 'no prazo'::text
       end as situacao
  from matricula m
  left join ja_fez f on f.cpf = m.cpf and f.curso = m.curso
  left join dim_alunos al on al.cpf_norm = m.cpf
  left join fato_contatos ct on ct.cpf = m.cpf
  left join public.pedagogico_contato_manual cm on cm.cpf = m.cpf
  left join proxima_turma pt on pt.c = norm_curso(m.curso)
 where f.cpf is null;


-- ------------------------------------------------------------
-- 3. Gravar o telefone pela tela
--
-- Normaliza para digitos, tolera o 55 na frente e exige DDD + numero.
-- "(71) 99999-8888", "5571999998888" e "71999998888" gravam igual.
-- ------------------------------------------------------------
create or replace function public.salvar_contato_manual(p_cpf text, p_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $FN$
declare
  v_cpf text;
  v_tel text;
  v_linhas int;
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  v_cpf := lpad(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), 11, '0');
  if length(v_cpf) <> 11 then
    raise exception 'CPF inválido';
  end if;

  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_tel) in (12, 13) and left(v_tel, 2) = '55' then
    v_tel := substr(v_tel, 3);
  end if;
  if length(v_tel) not in (10, 11) then
    raise exception 'Telefone inválido: informe DDD + número (10 ou 11 dígitos)';
  end if;

  insert into pedagogico_contato_manual (cpf, telefone, editado_por, editado_em)
  values (v_cpf, v_tel, auth.uid(), now())
  on conflict (cpf) do update
    set telefone    = excluded.telefone,
        editado_por = excluded.editado_por,
        editado_em  = now();

  -- fila_prazo e materializada: sem isto a correcao so apareceria no
  -- proximo `atualizar_fila_prazo()`, e o script de envio continuaria
  -- enxergando "sem telefone".
  update fila_prazo set telefone = v_tel where cpf = v_cpf;
  get diagnostics v_linhas = row_count;

  return jsonb_build_object('cpf', v_cpf, 'telefone', v_tel, 'linhas_fila', v_linhas);
end $FN$;

revoke execute on function public.salvar_contato_manual(text, text) from anon;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- DEPOIS DE APLICAR: recarregar a fila. Sem isto os 139 continuam sem
-- telefone na tela — a tabela materializada ainda tem a versao antiga.
--
--   select public.atualizar_fila_prazo();
--
-- conferir (esperado: 453 | ~2)
--   select count(*) as lista, count(*) filter (where telefone is null) as sem_telefone
--     from public.vw_represado_lista;
-- ------------------------------------------------------------
