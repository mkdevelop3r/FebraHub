-- ============================================================
-- 133_checklist_itens_novos.sql
-- Quatro entregas que o time já fazia e o checklist não cobrava:
-- Drive, Linktree, ManyChat e o envio do material ao treinador.
--
-- Pedido do Bruno (19/08): "adicionar no checklist de todos os eventos".
-- Todos = os quatro tipos que geram checklist (Palestra, Treinamento,
-- Workshop, Live). Maestria fica de fora porque tem gera_checklist=false —
-- não é evento de divulgação, e dar checklist a ela criaria pendência que
-- ninguém vai cumprir.
--
-- OS PRAZOS SÃO PALPITE MEU, derivados do ritmo que cada tipo já tem, e
-- mudá-los é um UPDATE de uma linha:
--   - Drive vem logo depois do vídeo (é onde o material passa a existir);
--   - Linktree no dia seguinte, antes da postagem começar a mandar gente
--     para o link;
--   - envio ao treinador depois de card, vídeo e link prontos — as três
--     coisas que a ação cita;
--   - ManyChat perto do fim, junto da virada para captação.
--
-- Renomear ou reprazar template NÃO mexe em ação já criada: a ação copia
-- nome, responsável e prazo no momento em que nasce. Trocar o catálogo vale
-- para evento novo; para os que já existem, é UPDATE em mkt_acoes_evento.
-- ============================================================


-- ---------- 1. AS QUATRO, NOS QUATRO TIPOS ----------
-- `not exists` no nome: rodar de novo não duplica.
insert into mkt_templates_acao
  (tipo_evento_id, nome, responsavel_padrao, prazo_dias_antes, conclusao)
select t.id, n.nome, n.responsavel, n.dias, 'manual'
from (values
  -- Palestra: card D-15, vídeo D-12, postagem/tráfego D-10, disparo D-3
  ('Palestra',    'Materiais no Drive',                        'Marketing',    12),
  ('Palestra',    'Link na Linktree',                          'Social media', 11),
  ('Palestra',    'Envio para o treinador — vídeo, card e link','Marketing',    10),
  ('Palestra',    'Automação no ManyChat',                     'Marketing',     8),
  -- Treinamento: a régua mais longa (card D-20, disparo D-3)
  ('Treinamento', 'Materiais no Drive',                        'Marketing',    18),
  ('Treinamento', 'Link na Linktree',                          'Social media', 17),
  ('Treinamento', 'Envio para o treinador — vídeo, card e link','Marketing',    16),
  ('Treinamento', 'Automação no ManyChat',                     'Marketing',    12),
  -- Workshop: card D-12, postagem/tráfego D-8
  ('Workshop',    'Materiais no Drive',                        'Marketing',    10),
  ('Workshop',    'Link na Linktree',                          'Social media',  9),
  ('Workshop',    'Envio para o treinador — vídeo, card e link','Marketing',     8),
  ('Workshop',    'Automação no ManyChat',                     'Marketing',     6),
  -- Live: régua curta (card D-5, postagem D-3). A Live não tem vídeo no
  -- catálogo; o envio ao treinador continua fazendo sentido pelo card e
  -- pelo link, que é o que ele precisa para divulgar.
  ('Live',        'Materiais no Drive',                        'Marketing',     5),
  ('Live',        'Link na Linktree',                          'Social media',  4),
  ('Live',        'Envio para o treinador — vídeo, card e link','Marketing',     4),
  ('Live',        'Automação no ManyChat',                     'Marketing',     3)
) as n(tipo, nome, responsavel, dias)
join mkt_tipos_evento t on t.nome = n.tipo
where not exists (
  select 1 from mkt_templates_acao x
   where x.tipo_evento_id = t.id and x.nome = n.nome
);


-- ---------- 2. ORDEM DO CATÁLOGO = ORDEM DO CALENDÁRIO ----------
-- `ordem` só governa a leitura do catálogo (a tela ordena o checklist pelo
-- prazo). Com quatro linhas novas no meio, os números virariam salada;
-- recalcular pelo D-x deixa o catálogo se lendo na sequência em que o
-- trabalho acontece, e continua certo na próxima vez que alguém inserir.
update mkt_templates_acao a
   set ordem = k.n
  from (
    select id, row_number() over (partition by tipo_evento_id
                                  order by prazo_dias_antes desc, nome) as n
      from mkt_templates_acao
  ) k
 where k.id = a.id and a.ordem is distinct from k.n;


-- ---------- 3. OS EVENTOS QUE JÁ EXISTEM ----------
-- O gerador (121/130) só roda no INSERT do evento, e a 125 só preenche
-- quem não tinha ação nenhuma. Os 16 ativos já têm checklist — sem este
-- bloco, as quatro entregas novas só apareceriam em evento futuro.
--
-- Escopo de propósito estreito: evento ATIVO e que ainda não aconteceu.
--   - cancelado e sem_acoes não têm checklist para completar;
--   - evento passado é histórico. Encher a agenda de agosto de pendências
--     que ninguém pode mais cumprir só produziria vermelho inútil.
--
-- A cláusula é genérica (qualquer template faltando, não só estes quatro):
-- assim ela conserta também o checklist que nasceu incompleto por qualquer
-- outro motivo, e rodar de novo não duplica nada.
insert into mkt_acoes_evento
  (evento_id, template_acao_id, nome, responsavel, prazo, conclusao, fonte_automacao)
select e.id, t.id, t.nome, t.responsavel_padrao,
       e.data_evento - t.prazo_dias_antes, t.conclusao, t.fonte_automacao
from mkt_eventos e
join mkt_templates_acao t on t.tipo_evento_id = e.tipo_evento_id
where e.status = 'ativo'
  and e.data_evento >= current_date
  and not exists (
    select 1 from mkt_acoes_evento a
     where a.evento_id = e.id and a.template_acao_id = t.id
  );


-- ---------- 4. CONFERÊNCIA ----------
-- Quantas nasceram já vencidas: o prazo é contado para trás da data do
-- evento, então evento próximo recebe item com D-x que já passou. É
-- honesto (a entrega de fato não foi feita), mas é bom saber o tamanho.
select count(*) filter (where prazo < current_date) as nasceram_vencidas,
       count(*)                                    as criadas
  from mkt_acoes_evento
 where nome in ('Materiais no Drive', 'Link na Linktree',
                'Automação no ManyChat',
                'Envio para o treinador — vídeo, card e link');
