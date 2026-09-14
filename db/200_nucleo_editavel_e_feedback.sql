-- ============================================================
-- FebraHub · Migration 200 — Núcleo editável + tipo "Feedback"
--
-- Dois pedidos:
--  1. Novo TIPO de evento "Feedback" (junto de palestra/workshop/mentoria/curso).
--  2. As 3 perguntas padrão (o NPS + duas abertas) passam a ser EDITÁVEIS e
--     REMOVÍVEIS pela Elis. Se ela editar a de recomendação, ela continua no
--     mesmo formato (escala 0-10, marcada como núcleo) e segue valendo pro NPS.
--     Se ela REMOVER a de recomendação, o evento fica sem NPS -- de propósito.
--
-- Como o NPS não depende do texto (vw_evento_nps liga por
-- `nucleo AND tipo='escala_0_10'` e por pergunta_id), editar o enunciado é
-- seguro; o que importa é manter a flag núcleo e o tipo na de recomendação.
--
-- APLICAÇÃO EM DOIS PASSOS: `alter type ... add value` não pode ser usado na
-- mesma transação em que o valor é referenciado. Rode o PASSO 1, depois o 2.
-- ============================================================

-- ------------------------------------------------------------
-- PASSO 1 (transação própria): o enum ganha "feedback"
-- ------------------------------------------------------------
alter type public.tipo_evento add value if not exists 'feedback';


-- ------------------------------------------------------------
-- PASSO 2 (depois do passo 1): as funções
--
-- criar_evento: adiciona o prefixo do feedback (FBK) e DEIXA de inserir o
-- núcleo. As 3 padrão agora são pré-carregadas e editáveis no front, e vêm pela
-- salvar_perguntas (que o front passa a chamar sempre, mesmo com lista vazia).
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

  v_responsavel := coalesce(p_responsavel_id, auth.uid());

  if not exists (select 1 from perfis where id = v_responsavel) then
    raise exception 'Responsável não encontrado';
  end if;

  if meu_papel() <> 'admin' and v_responsavel <> auth.uid() then
    raise exception 'Só a coordenação define outro responsável';
  end if;

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

  v_prefixo := case p_tipo
                 when 'palestra' then 'PAL'
                 when 'workshop' then 'WKS'
                 when 'mentoria' then 'MTG'
                 when 'feedback' then 'FBK'
                 else 'CUR'
               end;

  select coalesce(max(substring(codigo from '\d+$')::int), 0) + 1
    into v_seq
    from eventos
   where codigo like v_prefixo || '-' || v_ano || '-%';

  v_codigo := v_prefixo || '-' || v_ano || '-' || lpad(v_seq::text, 3, '0');

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

  -- O núcleo NÃO é mais inserido aqui: o front pré-carrega as 3 perguntas
  -- padrão (editáveis/removíveis) e as envia via salvar_perguntas.

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


-- salvar_perguntas: gerencia TODAS as perguntas, inclusive as padrão. Cada item
-- pode trazer "nps": true -> vira a de recomendação (marcada nucleo e travada em
-- escala_0_10). No máximo UMA vale como NPS (a primeira marcada). Sem nenhuma
-- nps, o evento fica sem NPS.
create or replace function public.salvar_perguntas(p_evento_id bigint, p_perguntas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_setor     text;
  v_item      jsonb;
  v_ordem     int := 0;
  v_total     int;
  v_nps       boolean;
  v_nps_visto boolean := false;
  v_tipo      tipo_pergunta;
begin
  select setor into v_setor from eventos where id = p_evento_id;

  if v_setor is null then
    raise exception 'Evento não encontrado';
  end if;

  if not pode_ver(v_setor) then
    raise exception 'Sem permissão para editar este evento';
  end if;

  if exists (select 1 from eventos where id = p_evento_id and travado_em is not null) then
    raise exception 'Este evento já recebeu respostas. As perguntas não podem mais mudar.';
  end if;

  if jsonb_typeof(p_perguntas) <> 'array' then
    raise exception 'Formato inválido: envie uma lista de perguntas';
  end if;

  -- Apaga TUDO (inclusive núcleo) e recria a partir da lista: é a lista que
  -- manda agora. Antes preservava o núcleo; agora ele é editável.
  delete from evento_perguntas where evento_id = p_evento_id;

  for v_item in select * from jsonb_array_elements(p_perguntas)
  loop
    v_ordem := v_ordem + 1;

    if coalesce(btrim(v_item->>'texto'), '') = '' then
      raise exception 'A pergunta % está sem texto', v_ordem;
    end if;

    v_nps := coalesce((v_item->>'nps')::boolean, false);
    if v_nps and v_nps_visto then
      v_nps := false;               -- só a primeira marcada conta como NPS
    end if;
    if v_nps then
      v_nps_visto := true;
    end if;

    -- A de NPS fica sempre escala_0_10; as demais usam o tipo enviado.
    v_tipo := case when v_nps then 'escala_0_10'::tipo_pergunta
                   else (v_item->>'tipo')::tipo_pergunta end;

    insert into evento_perguntas (evento_id, ordem, texto, tipo, obrigatoria, nucleo, opcoes)
    values (
      p_evento_id,
      v_ordem,
      btrim(v_item->>'texto'),
      v_tipo,
      coalesce((v_item->>'obrigatoria')::boolean, true),
      v_nps,
      case when v_item ? 'opcoes' and jsonb_typeof(v_item->'opcoes') = 'array'
           then array(select jsonb_array_elements_text(v_item->'opcoes'))
           end
    );
  end loop;

  select count(*) into v_total from evento_perguntas where evento_id = p_evento_id;

  return jsonb_build_object('total_no_formulario', v_total, 'tem_nps', v_nps_visto);
end $function$;

notify pgrst, 'reload schema';
