-- ============================================================
-- 131_trafego_casamento_por_nome.sql
-- Uma implementação só para mkt_casa_campanhas, e ela é a por semelhança.
--
-- Como chegamos aqui: a 130 criou mkt_casa_campanhas() (zero argumentos,
-- casamento só por código). Só que já existia no banco — viva, e em
-- nenhum arquivo deste repositório — uma mkt_casa_campanhas(p_limiar real
-- default 0.42), que casa por código E por semelhança de nome, junto com
-- as auxiliares mkt_limpa_nome_campanha/mkt_limpa_nome_evento.
--
-- Duas funções com o mesmo nome, uma delas com todos os argumentos
-- opcionais, e a chamada `mkt_casa_campanhas()` que está dentro de
-- mkt_sincroniza_trafego deixa de resolver:
--
--     ERROR: 42725: function mkt_casa_campanhas() is not unique
--
-- Ou seja: entre a aplicação da 130 e esta migration, o sync de tráfego
-- não roda. Não é dano de dado — é a função morrendo na segunda linha.
--
-- Decisão (Louis, 19/08): fica a por semelhança. O casamento por código
-- não acontece hoje — o código do evento não é escrito no nome da
-- campanha ([EG][$]Do zero ao investimento vs. PALESTRA-SET26-SSA-2) —
-- e esperar que o processo mude é esperar sentado.
--
-- Então esta migration:
--   1. transcreve as auxiliares que só existiam no banco;
--   2. apaga a homônima de zero argumentos criada pela 130;
--   3. reescreve a por semelhança obedecendo o que a 130 exigia —
--      strpos no lugar de LIKE, só mexer em vinculo='automatico',
--      ambiguidade fica de fora em vez de virar escolha arbitrária;
--   4. passa a registrar COMO a máquina casou (coluna `casamento`);
--   5. faz o sync chamar com o limiar explícito;
--   6. fecha o EXECUTE que a 130 tinha fechado só para a homônima.
-- ============================================================


-- ---------- 1. AS AUXILIARES, TRANSCRITAS DO BANCO ----------
-- Idênticas ao que está aplicado. Estão aqui para o repositório parar de
-- mentir sobre o que existe; nenhuma mudança de comportamento.
create or replace function mkt_limpa_nome_campanha(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(upper(coalesce(p,'')), '\[[^\]]*\]', ' ', 'g'),
             '\y(JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO|LP|LEADS|VENDAS|SYMPLA|WHATS)\y',
             ' ', 'g'),
           '[^A-Z0-9ÀÁÂÃÉÊÍÓÔÕÚÇ ]', ' ', 'g'))
$$;

create or replace function mkt_limpa_nome_evento(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(upper(coalesce(p,'')), '\[[^\]]*\]', ' ', 'g'),
             '^\s*(PALESTRA|TREINAMENTO|WORKSHOP|LIVE|MAESTRIA)\y', ' '),
           '\s+[-—]\s+.*$', ''))
$$;


-- ---------- 2. COMO A MÁQUINA CASOU ----------
-- 'automatico' diz que foi máquina; não diz se foi o código (certeza) ou
-- semelhança de nome a 0.42 (palpite). Quem for conferir a fila precisa
-- saber em qual dos dois olhar primeiro. `vinculo` não serve para isso:
-- tem check constraint de três valores e a tela lê ele.
alter table mkt_campanhas_trafego
  add column if not exists casamento text
  check (casamento is null or casamento in ('codigo','nome'));

comment on column mkt_campanhas_trafego.casamento is
  'Como a máquina achou o evento: codigo (o código está no nome da campanha) '
  'ou nome (semelhança >= limiar). Null = vínculo humano ou campanha sem evento.';


-- ---------- 3. UMA FUNÇÃO SÓ ----------
-- A da 130 sai de cena; o que ela fazia vira a primeira passada desta.
drop function if exists mkt_casa_campanhas();

create or replace function mkt_casa_campanhas(p_limiar real default 0.42)
returns text language plpgsql security definer set search_path = public as $$
declare v_cod int; v_nome int;
begin
  -- Passada 1 — o código do evento aparece no nome da campanha.
  --
  -- strpos e não LIKE: o código é dado editável, e um '_' ou '%' dentro
  -- dele viraria curinga (a 130 já dizia isso).
  --
  -- Sobre "dois códigos casaram": os códigos são hierárquicos —
  -- PALESTRA-SET26-SSA é prefixo de PALESTRA-SET26-SSA-2. Uma campanha
  -- que cita o segundo casa com os dois, e a regra da 130 ("count = 1,
  -- senão ignora") jogaria fora justamente o casamento certo. Aqui vale
  -- o código mais longo, desde que todos os outros caibam dentro dele.
  -- Código que não cabe é evento diferente: aí sim é ambiguidade de
  -- verdade, e a campanha fica na fila de conferência.
  with achado as (
    select c.id as campanha_id, e.id as evento_id, upper(e.codigo) as codigo
      from mkt_campanhas_trafego c
      join mkt_eventos e on e.codigo is not null
       and strpos(upper(c.nome_campanha), upper(e.codigo)) > 0
     where c.vinculo = 'automatico'
  ),
  mais_longo as (
    select distinct on (campanha_id) campanha_id, evento_id, codigo
      from achado
     order by campanha_id, length(codigo) desc, codigo
  ),
  candidato as (
    select m.campanha_id, m.evento_id
      from mais_longo m
     where not exists (
       select 1 from achado a
        where a.campanha_id = m.campanha_id
          and a.evento_id <> m.evento_id
          and strpos(m.codigo, a.codigo) = 0
     )
  )
  update mkt_campanhas_trafego c
     set evento_id = k.evento_id, casamento = 'codigo'
    from candidato k
   where c.id = k.campanha_id
     and c.evento_id is distinct from k.evento_id;
  get diagnostics v_cod = row_count;

  -- Passada 2 — semelhança de nome, só no que sobrou sem evento.
  --
  -- Três coisas que a versão viva fazia e esta não faz:
  --   - mexer em vinculo <> 'manual', que inclui 'sem_evento': campanha
  --     que uma pessoa triou como institucional era re-vinculada no sync
  --     seguinte, todo dia, para sempre;
  --   - gravar vinculo='automatico' por cima (é o default; a única coisa
  --     que isso mudava era apagar a triagem de quem passou por aqui);
  --   - resolver empate com row_number(), que escolhe qualquer um. Aqui
  --     empate no topo é ambiguidade: fica para conferência humana.
  --
  -- Diferente da passada 1, esta nunca reescreve vínculo existente:
  -- palpite não derruba o que já está lá.
  with par as (
    select c.id as camp_id, e.id as ev_id,
           similarity(mkt_limpa_nome_campanha(c.nome_campanha),
                      mkt_limpa_nome_evento(e.nome)) as s
      from mkt_campanhas_trafego c
      join mkt_eventos e
        on e.data_evento between c.data_inicio - 7 and c.data_inicio + 90
     where c.vinculo = 'automatico' and c.evento_id is null
       and e.status in ('ativo','sem_acoes')
  ),
  forte as (
    select camp_id, ev_id,
           rank() over (partition by camp_id order by s desc) as r
      from par
     where s >= p_limiar
  ),
  unico as (
    -- array_agg[1] e não min(): não existe min(uuid). Como o having já
    -- garante uma linha só, qualquer agregado serviria.
    select camp_id, (array_agg(ev_id))[1] as ev_id
      from forte
     where r = 1
     group by camp_id
    having count(*) = 1
  )
  update mkt_campanhas_trafego c
     set evento_id = u.ev_id, casamento = 'nome'
    from unico u
   where c.id = u.camp_id;
  get diagnostics v_nome = row_count;

  return format('por código %s · por nome %s', v_cod, v_nome);
end $$;


-- ---------- 4. O SYNC CHAMA COM O LIMIAR NA MÃO ----------
-- `mkt_casa_campanhas()` funcionaria de novo agora que sobrou uma só, mas
-- foi exatamente essa chamada sem argumento que quebrou quando apareceu a
-- segunda. Com o limiar escrito, uma futura sobrecarga não derruba o sync
-- em silêncio — e fica visível onde se mexe para afrouxar/apertar.
create or replace function mkt_sincroniza_trafego() returns text
language plpgsql security definer set search_path = public as $$
declare a text; b text; c text;
begin
  a := mkt_importa_campanhas_meta();
  b := mkt_casa_campanhas(0.42::real);
  c := mkt_atualiza_acao_trafego();
  return format('%s | casadas: %s | %s', a, b, c);
end $$;


-- ---------- 5. VÍNCULO HUMANO APAGA O PALPITE ----------
-- Quem passa pela tela decidiu; o rótulo de como a máquina tinha achado
-- deixa de valer. Resto da função igual ao que está aplicado.
create or replace function mkt_vincula_campanha(p_campanha_id uuid, p_evento_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from perfis p
                 where p.id = auth.uid() and p.setor in ('marketing','geral')) then
    raise exception 'sem permissão';
  end if;
  update mkt_campanhas_trafego
     set evento_id = p_evento_id,
         vinculo = case when p_evento_id is null then 'sem_evento' else 'manual' end,
         casamento = null
   where id = p_campanha_id;
  perform mkt_atualiza_acao_trafego();
end $$;


-- ---------- 6. QUEM PODE RODAR O SYNC (CONTINUAÇÃO DA 130) ----------
-- A 130 fechou mkt_casa_campanhas() — a homônima que ninguém chamava. A
-- que está viva seguia aberta para qualquer autenticado, reescrevendo
-- vínculo de campanha alheia. mkt_importa_campanhas_meta idem; as duas
-- são chamadas por dentro do sync, que é security definer e não precisa
-- do grant.
revoke execute on function mkt_casa_campanhas(real)         from public, anon, authenticated;
revoke execute on function mkt_importa_campanhas_meta(int)  from public, anon, authenticated;
grant  execute on function mkt_casa_campanhas(real)         to service_role;

notify pgrst, 'reload schema';
