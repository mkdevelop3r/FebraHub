-- ============================================================
-- FebraHub · Migration 199 — As perguntas de núcleo acompanham o TIPO
--
-- A Elis criou um evento do tipo CURSO, mas as três perguntas de núcleo saíram
-- dizendo "palestra": "recomendaria esta PALESTRA", "mudaria nesta PALESTRA",
-- "próxima PALESTRA". O texto estava chumbado na `criar_evento`, igual para
-- todo tipo.
--
-- Agora o texto acompanha o tipo (palestra/workshop/mentoria/curso), com a
-- concordância de gênero certa: "este curso", "neste curso", "num próximo
-- curso"; "esta palestra", "nesta palestra", "numa próxima palestra"; etc.
--
-- ------------------------------------------------------------
-- POR QUE MUDAR O TEXTO É SEGURO
--
-- O NPS não depende do enunciado: `vw_evento_nps` liga a pergunta por
-- `nucleo AND tipo = 'escala_0_10'`, e as respostas por `pergunta_id`. Nenhuma
-- view casa pelo texto (conferido). Trocar a redação não mexe em número nem
-- desliga resposta nenhuma -- por isso o backfill abaixo também é seguro nos
-- eventos que já receberam resposta.
-- ============================================================


-- ------------------------------------------------------------
-- 1. A função passa a montar o núcleo conforme o tipo
-- ------------------------------------------------------------
create or replace function public.criar_evento(
  p_tipo tipo_evento,
  p_titulo text,
  p_data_evento date,
  p_objetivo text default null::text,
  p_local text default null::text,
  p_responsavel_id uuid default null::uuid,
  p_tema text default null::text,
  p_setor text default 'pedagogico'::text,
  p_abre_em timestamp with time zone default null::timestamp with time zone,
  p_fecha_em timestamp with time zone default null::timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_palestra      bigint;
  v_codigo        text;
  v_prefixo       text;
  v_ano           text := to_char(p_data_evento, 'YYYY');
  v_seq           int;
  v_abre          timestamptz;
  v_fecha         timestamptz;
  v_evento        bigint;
  v_token         text;
  v_responsavel   uuid;
  v_nova_carteira boolean := false;
  -- Concordância de gênero por tipo. Ver o cabeçalho e o espelho no front
  -- (perguntasNucleo em FebraHub.jsx) — os dois têm que dizer a mesma coisa.
  v_este  text;   -- "recomendaria ___ a um colega"
  v_neste text;   -- "o que você mudaria ___"
  v_prox  text;   -- "gostaria de ver ___"
begin
  if auth.uid() is null then
    raise exception 'Faça login para criar evento';
  end if;

  if not pode_ver(p_setor) then
    raise exception 'Sem permissão para criar evento no setor %', p_setor;
  end if;

  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'Informe o título do evento';
  end if;

  if p_data_evento is null then
    raise exception 'Informe a data do evento';
  end if;

  -- ---------- quem apresenta ----------
  v_responsavel := coalesce(p_responsavel_id, auth.uid());

  if not exists (select 1 from perfis where id = v_responsavel) then
    raise exception 'Responsável não encontrado';
  end if;

  -- membro só coloca a si mesmo como responsável
  if meu_papel() <> 'admin' and v_responsavel <> auth.uid() then
    raise exception 'Só a coordenação define outro responsável';
  end if;

  -- ---------- carteira: reaproveita antes de duplicar ----------
  if p_tipo = 'palestra' then
    select id into v_palestra
      from palestras
     where lower(btrim(titulo)) = lower(btrim(p_titulo));

    if v_palestra is null then
      insert into palestras (titulo, tema, setor)
      values (btrim(p_titulo), nullif(btrim(coalesce(p_tema, '')), ''), p_setor)
      returning id into v_palestra;
      v_nova_carteira := true;
    end if;
  end if;

  -- ---------- código ----------
  v_prefixo := case p_tipo
                 when 'palestra' then 'PAL'
                 when 'workshop' then 'WKS'
                 when 'mentoria' then 'MTG'
                 else 'CUR'
               end;

  select coalesce(max(substring(codigo from '\d+$')::int), 0) + 1
    into v_seq
    from eventos
   where codigo like v_prefixo || '-' || v_ano || '-%';

  v_codigo := v_prefixo || '-' || v_ano || '-' || lpad(v_seq::text, 3, '0');

  -- ---------- janela do link ----------
  v_abre  := coalesce(p_abre_em,  (p_data_evento::timestamp at time zone 'America/Bahia'));
  v_fecha := coalesce(p_fecha_em, v_abre + interval '3 days');

  insert into eventos (codigo, tipo, setor, palestra_id, titulo, objetivo,
                       data_evento, local, responsavel_id, abre_em, fecha_em)
  values (v_codigo, p_tipo, p_setor, v_palestra, btrim(p_titulo),
          nullif(btrim(coalesce(p_objetivo, '')), ''),
          p_data_evento,
          nullif(btrim(coalesce(p_local, '')), ''),
          v_responsavel, v_abre, v_fecha)
  returning id, token into v_evento, v_token;

  -- ---------- núcleo fixo, agora com o tipo certo ----------
  case p_tipo
    when 'palestra' then v_este := 'esta palestra'; v_neste := 'nesta palestra'; v_prox := 'numa próxima palestra';
    when 'workshop' then v_este := 'este workshop'; v_neste := 'neste workshop'; v_prox := 'num próximo workshop';
    when 'mentoria' then v_este := 'esta mentoria'; v_neste := 'nesta mentoria'; v_prox := 'numa próxima mentoria';
    when 'curso'    then v_este := 'este curso';    v_neste := 'neste curso';    v_prox := 'num próximo curso';
    else                 v_este := 'este evento';   v_neste := 'neste evento';   v_prox := 'num próximo evento';
  end case;

  -- Não editáveis, sempre no fim do formulário. O NPS é o primeiro
  -- dos três de propósito: quem abandona no meio não pode levar
  -- embora justamente o número da decisão de carteira.
  insert into evento_perguntas (evento_id, ordem, texto, tipo, obrigatoria, nucleo) values
    (v_evento, 1, 'De 0 a 10, quanto você recomendaria ' || v_este || ' a um colega?',
     'escala_0_10', true,  true),
    (v_evento, 2, 'O que você mudaria ' || v_neste || '?',
     'texto_livre', false, true),
    (v_evento, 3, 'Qual tema você gostaria de ver ' || v_prox || '?',
     'texto_livre', false, true);

  return jsonb_build_object(
    'id',               v_evento,
    'codigo',           v_codigo,
    'token',            v_token,
    'palestra_id',      v_palestra,
    'nova_na_carteira', v_nova_carteira,
    'abre_em',          v_abre,
    'fecha_em',         v_fecha
  );
end $function$;


-- ------------------------------------------------------------
-- 2. Backfill: os eventos já criados (o curso da Elis) recebem o texto certo
--
-- Casado pelo PAPEL da pergunta de núcleo (tipo escala_0_10 = NPS; e os dois
-- texto_livre distinguidos pelo próprio enunciado antigo), não pela ordem --
-- que não é garantida. Só toca núcleo cujo texto ainda fala "palestra" num
-- evento que não é palestra, então roda de novo sem efeito.
-- ------------------------------------------------------------
update evento_perguntas p
   set texto = 'De 0 a 10, quanto você recomendaria '
             || case e.tipo when 'workshop' then 'este workshop'
                            when 'mentoria' then 'esta mentoria'
                            when 'curso'    then 'este curso'
                            else 'esta palestra' end
             || ' a um colega?'
  from eventos e
 where e.id = p.evento_id
   and p.nucleo and p.tipo = 'escala_0_10'
   and e.tipo <> 'palestra'
   and p.texto ilike '%palestra%';

update evento_perguntas p
   set texto = 'O que você mudaria '
             || case e.tipo when 'workshop' then 'neste workshop'
                            when 'mentoria' then 'nesta mentoria'
                            when 'curso'    then 'neste curso'
                            else 'nesta palestra' end
             || '?'
  from eventos e
 where e.id = p.evento_id
   and p.nucleo and p.tipo = 'texto_livre'
   and e.tipo <> 'palestra'
   and p.texto ilike '%mudaria%' and p.texto ilike '%palestra%';

update evento_perguntas p
   set texto = 'Qual tema você gostaria de ver '
             || case e.tipo when 'workshop' then 'num próximo workshop'
                            when 'mentoria' then 'numa próxima mentoria'
                            when 'curso'    then 'num próximo curso'
                            else 'numa próxima palestra' end
             || '?'
  from eventos e
 where e.id = p.evento_id
   and p.nucleo and p.tipo = 'texto_livre'
   and e.tipo <> 'palestra'
   and p.texto ilike '%tema%' and p.texto ilike '%palestra%';

notify pgrst, 'reload schema';

-- conferir: nenhum núcleo de evento não-palestra deve sobrar dizendo "palestra"
--   select e.tipo, p.texto from evento_perguntas p join eventos e on e.id=p.evento_id
--    where p.nucleo and e.tipo <> 'palestra' and p.texto ilike '%palestra%';
