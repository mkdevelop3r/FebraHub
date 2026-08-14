-- ============================================================
-- 104 — FILA DE BOAS-VINDAS: JANELA DE 3 DIAS
--
-- Substitui a versão do 99. Três correções, todas medidas:
--
-- 1. JUNTA POR PESSOA, NÃO POR PESSOA + TURMA
--    A versão anterior fazia left join com vw_pedagogico_fila em
--    (aluno_id, turma_id). Quando a turma da venda não batia — e ela
--    é campo instável — o join não achava nada e a linha vinha sem
--    nome, sem telefone e sem e-mail.
--    Efeito medido: 749 das 777 linhas vinham vazias. Só 28 eram
--    contatáveis. Agora junta com dim_alunos por doc_norm.
--
--    doc_norm e não cpf_norm de propósito: doc_norm cobre CPF e
--    CNPJ, e venda PJ também merece acolhida.
--
-- 2. EXIGE CONTATO
--    Sem telefone nem e-mail, o upsert do CRM devolve
--    "Pass at least one of number, email" e vira erro no log.
--    Quem não tem contato não entra na fila — some do ruído e
--    aparece na tela como trabalho de alguém.
--
-- 3. EXCLUI QUEM JÁ FEZ O CURSO
--    Medido: 352 das 785 pessoas na fila já tinham presença
--    registrada. Quase metade receberia "bem-vindo, sua vaga está
--    garantida" tendo assistido semanas atrás.
--
--    Limitação conhecida: só funciona para cursos que registram
--    presença. Quem comprou Team Coaching ou Coaching Individual
--    nunca aparece em fato_presenca e continua na fila mesmo tendo
--    feito. Não é grave, mas está dito.
--
-- POR QUE 3 DIAS E NÃO 30
--
-- A janela de 30 dias era rede de segurança para a primeira carga.
-- Ela funcionou: segurou 433 pessoas que nunca receberam nada. Mas
-- dessas, só 25 eram de compra recente — as outras 408 compraram
-- entre 4 e 30 dias atrás.
--
-- Mandar "bem-vindo à Febracis" para quem comprou há três semanas
-- soa a sistema que acordou atrasado, não a acolhimento. Então a
-- fila passa a atender o fluxo corrente, e os 408 viram decisão
-- separada — provavelmente com outro texto, sem o "bem-vindo".
--
-- Três dias continuam cobrindo fim de semana prolongado e falha de
-- job: com sync às 6h, 12h e 17h, ninguém fica para trás.
-- ============================================================

create or replace view vw_boas_vindas_fila as
select distinct on (a.aluno_id, a.curso_id)
       a.aluno_id,
       al.nome,
       normaliza_telefone(coalesce(nullif(a.telefone_cliente, ''), al.telefone)) as whatsapp,
       coalesce(nullif(a.email_cliente, ''), al.email)                           as email,
       case
         when normaliza_telefone(coalesce(nullif(a.telefone_cliente,''), al.telefone)) is not null
           then 'whatsapp'
         when coalesce(nullif(a.email_cliente,''), al.email) is not null
           then 'email'
       end                                                                       as canal,
       a.curso_id                        as curso,
       a.data_matricula                  as comprou_em,
       a.data_matricula + 365            as data_limite,
       current_date - a.data_matricula   as dias_desde_a_compra,
       a.turma                           as turma_id,
       a.consultor_id                    as consultor
  from fato_base_alunos a
  left join dim_alunos al on al.doc_norm = lpad(a.aluno_id, 11, '0')
 where a.status_matricula = 'Aprovada'
   and a.data_matricula >= current_date - interval '3 days'
   and a.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and coalesce(a.turma, '') not ilike '%LISBOA%'
   and coalesce(nullif(a.telefone_cliente, ''), al.telefone,
                nullif(a.email_cliente, ''), al.email) is not null
   and not exists (
     select 1 from fato_presenca p
      where p.cpf = a.aluno_id
        and norm_curso(p.curso) = norm_curso(a.curso_id)
   )
   and not exists (
     select 1 from pedagogico_envios e
      where e.aluno_id = a.aluno_id
        and e.turma_id = a.turma
        and e.tipo = 'boas_vindas'
   )
 order by a.aluno_id, a.curso_id, a.data_matricula;

comment on view vw_boas_vindas_fila is
  'Compras dos últimos 3 dias, com contato, que ainda não fizeram o
   curso e ainda não receberam boas-vindas. COMPRADOR DE VAGAS fora:
   é terceiro pagador, não aluno. Lisboa fora: outra operação.
   `data_limite` é o que a mensagem informa.';


-- ============================================================
-- OS 408 QUE FICARAM PARA TRÁS
--
-- Compraram entre 4 e 30 dias atrás e nunca receberam nada. A
-- consulta abaixo os lista — é dívida com o cliente, não lixo.
--
-- Antes de mandar qualquer coisa para eles, uma pergunta para a
-- Elis: essas pessoas receberam algum contato por outro caminho?
-- Se a confirmação de turma já as alcançou, boas-vindas atrasada
-- não acrescenta, só confunde.
--
-- Se for mandar, use outro texto — sem o "bem-vindo", algo como
-- "sua vaga no {curso} vale até {data}".
--
--   select a.aluno_id, al.nome, a.curso_id, a.data_matricula,
--          current_date - a.data_matricula as dias
--     from fato_base_alunos a
--     left join dim_alunos al on al.doc_norm = lpad(a.aluno_id,11,'0')
--    where a.status_matricula='Aprovada'
--      and a.data_matricula between current_date - 30 and current_date - 4
--      and a.tipo_matricula not in ('COMPRADOR DE VAGAS','BÔNUS - COMPRADOR DE VAGAS')
--      and coalesce(a.turma,'') not ilike '%LISBOA%'
--      and not exists (select 1 from fato_presenca p
--                       where p.cpf=a.aluno_id
--                         and norm_curso(p.curso)=norm_curso(a.curso_id))
--      and not exists (select 1 from pedagogico_envios e
--                       where e.aluno_id=a.aluno_id and e.turma_id=a.turma
--                         and e.tipo='boas_vindas')
--    order by a.data_matricula desc;
-- ============================================================
