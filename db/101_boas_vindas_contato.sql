-- ============================================================
-- 101 — FILA DE BOAS-VINDAS: JUNÇÃO E CONTATO
--
-- Aplicado em 11/08/2026.
--
-- NOTA: o 104 substitui esta view, encurtando a janela de 30 para
-- 3 dias. Este arquivo fica como registro do que foi aplicado e
-- por quê — a correção da junção, que é o que importa, veio aqui.
--
-- PROBLEMA
--
-- A versão do 99 fazia left join com vw_pedagogico_fila em
-- (aluno_id, turma_id). A turma da venda é campo instável, então
-- quando não batia o join não achava nada e a linha vinha sem nome,
-- sem telefone e sem e-mail.
--
-- Medido: 749 das 777 linhas vinham vazias. Só 28 contatáveis.
-- O CRM devolvia "Pass at least one of number, email" e virava erro
-- no log a cada execução.
--
-- CORREÇÃO
--
-- Junta com dim_alunos por doc_norm, sem passar pela turma.
-- Resultado: 775 contatáveis.
--
-- doc_norm e não cpf_norm de propósito: doc_norm cobre CPF e CNPJ.
-- Venda PJ também merece acolhida, e é justamente quem cpf_norm
-- (só 11 dígitos) deixaria de fora.
--
-- E exige contato no where: quem não tem telefone nem e-mail não
-- entra na fila, em vez de entrar e falhar no CRM.
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
   and a.data_matricula >= current_date - interval '30 days'
   and a.tipo_matricula not in ('COMPRADOR DE VAGAS', 'BÔNUS - COMPRADOR DE VAGAS')
   and coalesce(a.turma, '') not ilike '%LISBOA%'
   and coalesce(nullif(a.telefone_cliente, ''), al.telefone,
                nullif(a.email_cliente, ''), al.email) is not null
   and not exists (
     select 1 from pedagogico_envios e
      where e.aluno_id = a.aluno_id
        and e.turma_id = a.turma
        and e.tipo = 'boas_vindas'
   )
 order by a.aluno_id, a.curso_id, a.data_matricula;
