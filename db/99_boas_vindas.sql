-- ============================================================
-- 99 — BOAS-VINDAS NA COMPRA
--
-- APLICADO. Conferido no banco em 13/08/2026. Foi rodado por blocos.
-- Depende de 95, 96, 97, 98.
--
-- Terceiro `tipo` na mesma máquina de `pedagogico_envios`:
--   confirmacao      link do grupo, antes da turma   (já existe)
--   prazo_vencendo   prazo acabando, com turma       (98)
--   boas_vindas      no ato da compra                (aqui)
--
-- TEXTO APROVADO PELA OPERAÇÃO:
--
--   Olá, {nome}! 👋
--
--   Somos do setor pedagógico da Febracis Salvador e viemos te dar
--   as boas-vindas.
--
--   Sua vaga no {curso} está garantida e vale até {data_limite}.
--
--   Em breve entramos em contato para combinar a melhor turma para
--   você. Qualquer dúvida até lá, é só responder por aqui.
--
--   Seja muito bem-vindo!
--
-- POR QUE A MENSAGEM NÃO FALA DA TURMA
--
-- A turma que aparece na venda é frequentemente ficção comercial:
-- a consultora vende "IF34 de setembro" para quem nunca pretendeu
-- ir em setembro. Prometer data errada na primeira mensagem estraga
-- a confiança logo no começo.
--
-- POR QUE NÃO FALA DE HORÁRIO NEM LOCAL
--
-- `local` está nulo nas 10 turmas futuras e três não têm horário —
-- inclusive CIS-GL252 e CIS-GL253, as maiores. Campo vazio em
-- mensagem automática é pior que mensagem curta.
--
-- POR QUE FALA DO PRAZO
--
-- Existem hoje 974 pessoas com prazo vencido, e boa parte nunca
-- soube que tinha prazo. A boas-vindas é o lugar mais barato de
-- resolver isso: "vale até 08/08/2027" lido em voz alta soa a
-- garantia, não a cobrança. E quando a mensagem de prazo chegar
-- aos 90 dias, ela não é surpresa — é a segunda parte de algo que
-- já foi dito.
-- ============================================================


-- ------------------------------------------------------------
-- QUEM RECEBE
--
-- Compra recente, com contato, que ainda não recebeu boas-vindas.
--
-- Reaproveita `vw_pedagogico_fila` para resolver contato: ela já
-- normaliza o WhatsApp, cai para e-mail quando não há telefone,
-- marca telefone inválido, e junta por `doc_norm` — que cobre CPF
-- e CNPJ, ao contrário de `cpf_norm`, que só aceita 11 dígitos.
-- Para boas-vindas isso importa: venda PJ também merece acolhida.
--
-- Mesmas exclusões da fila de prazo:
--   COMPRADOR DE VAGAS  é terceiro pagador, não é aluno
--   LISBOA              outra operação
-- ------------------------------------------------------------
create or replace view vw_boas_vindas_fila as
select distinct on (a.aluno_id, a.curso_id)
       a.aluno_id,
       f.nome,
       f.whatsapp,
       f.email,
       f.canal,
       a.curso_id                    as curso,
       a.data_matricula              as comprou_em,
       a.data_matricula + 365        as data_limite,
       current_date - a.data_matricula as dias_desde_a_compra,
       a.turma                       as turma_id,
       a.consultor_id                as consultor
  from fato_base_alunos a
  left join vw_pedagogico_fila f
         on f.aluno_id = a.aluno_id and f.turma_id = a.turma
 where a.status_matricula = 'Aprovada'
   and a.data_matricula >= current_date - interval '30 days'
   and a.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and coalesce(a.turma, '') not ilike '%LISBOA%'
   and not exists (
     select 1 from pedagogico_envios e
      where e.aluno_id = a.aluno_id
        and e.turma_id = a.turma
        and e.tipo = 'boas_vindas'
   )
 order by a.aluno_id, a.curso_id, a.data_matricula;

comment on view vw_boas_vindas_fila is
  'Compras dos últimos 30 dias que ainda não receberam boas-vindas.
   A janela de 30 dias é rede de segurança para a primeira carga e
   para falha de sincronia — em regime normal a fila terá as
   compras do dia. `data_limite` é o que a mensagem informa.';


-- ------------------------------------------------------------
-- REGISTRAR O ENVIO
--
-- Mesma correção do 98: `pedagogico_envios` é registro do que já
-- foi feito, não fila de saída. Quem dispara é o workflow do CRM,
-- acionado pela tag que o script aplica. Esta função é chamada
-- pelo script DEPOIS da tag, e grava 'aceito'.
--
-- Gravar 'pendente' criaria uma linha que bloqueia o reenvio de uma
-- mensagem que nunca saiu — e em boas-vindas isso é pior: a pessoa
-- comprou e nunca é acolhida, sem que nada acuse erro.
--
-- ATENÇÃO NA PRIMEIRA EXECUÇÃO: a janela de 30 dias vai pegar
-- todas as compras do último mês de uma vez. Rodar com limite
-- pequeno, conferir o texto no WhatsApp de verdade, e só então
-- abrir. Mensagem de acolhimento com erro é pior que mensagem
-- nenhuma — é a primeira coisa que o cliente lê da Febracis.
-- ------------------------------------------------------------
create or replace function registrar_envio_boas_vindas(p_limite int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gravados int;
begin
  if not pode_ver('pedagogico') then
    raise exception 'Sem permissão';
  end if;

  insert into pedagogico_envios (aluno_id, turma_id, origem, tipo, status, canal, enviado_em, criado_em)
  select f.aluno_id, f.turma_id, 'venda', 'boas_vindas', 'aceito', f.canal, now(), now()
    from (select * from vw_boas_vindas_fila
           where canal in ('whatsapp', 'email')
           order by comprou_em desc
           limit p_limite) f;

  get diagnostics v_gravados = row_count;

  return jsonb_build_object(
    'registrados',       v_gravados,
    'restantes_na_fila', (select count(*) from vw_boas_vindas_fila
                           where canal in ('whatsapp','email')),
    'sem_contato',       (select count(*) from vw_boas_vindas_fila
                           where canal = 'sem_contato' or canal is null)
  );
end $$;

revoke execute on function registrar_envio_boas_vindas from anon;


-- ------------------------------------------------------------
-- PAINEL DAS TRÊS FILAS
--
-- Uma tela só para as três mensagens, porque são a mesma máquina.
-- ------------------------------------------------------------
create or replace view vw_pedagogico_mensagens as
select tipo,
       count(*)                                        as total,
       count(*) filter (where status = 'pendente')      as pendentes,
       count(*) filter (where status = 'aceito')        as enviados,
       count(*) filter (where status = 'erro')          as com_erro,
       count(resposta)                                  as responderam,
       max(criado_em)::date                             as ultimo
  from pedagogico_envios
 where pode_ver('pedagogico')
 group by tipo;

grant select on vw_boas_vindas_fila, vw_pedagogico_mensagens to authenticated;


-- ============================================================
-- COMO RODAR A PRIMEIRA VEZ
--
--   select * from vw_boas_vindas_fila order by comprou_em desc;
--   (script aplica a tag para 5) e então:
--   select registrar_envio_boas_vindas(5);   -- cinco, e leia no celular
--   select * from vw_pedagogico_mensagens;
--
-- ============================================================


-- ============================================================
-- SOBRE "NO ATO DA COMPRA"
--
-- O sync roda às 6h, 12h e 17h. A mensagem sai em até 5 horas, e
-- compra fechada à noite sai às 6h do dia seguinte. Praticamente
-- ninguém dorme sem receber.
--
-- Instantâneo de verdade exigiria webhook do Salesforce em vez de
-- carga agendada. Não precisa ser este projeto.
-- ============================================================
