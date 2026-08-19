-- ============================================================
-- 122_seed_catalogo.sql
-- Catálogo de tipos e ações — versão validada pelo Bruno
-- (transcrição fiel da planilha Fase0_Catalogo_Acoes_Eventos.xlsx)
--
-- Mudança futura de checklist = UPDATE/INSERT aqui ou direto no
-- Table editor. Nunca vira código.
-- Idempotente: limpa o catálogo antes de inserir (só é seguro
-- enquanto não houver mkt_eventos apontando pros templates — ou
-- seja, agora, na implantação).
-- ============================================================

delete from mkt_templates_acao;
delete from mkt_tipos_evento;

-- ---------- TIPOS ----------
insert into mkt_tipos_evento (prefixo, nome, gera_checklist) values
  ('[PALESTRA]',    'Palestra',    true),
  ('[TREINAMENTO]', 'Treinamento', true),
  ('[WORKSHOP]',    'Workshop',    true),
  ('[LIVE]',        'Live',        true),
  ('[MAESTRIA]',    'Maestria',    false);  -- entra na agenda, sem checklist

-- ---------- AÇÕES ----------
-- prazo_dias_antes: 15 = pronto em D-15 (15 dias antes do evento)
-- conclusao 'automatica' = o sistema marca sozinho (hoje: tráfego,
-- via campanha ativa com o código do evento — vw_mkt_trafego_evento)

with t as (select id, nome from mkt_tipos_evento)
insert into mkt_templates_acao
  (tipo_evento_id, nome, responsavel_padrao, prazo_dias_antes, conclusao, ordem)
select t.id, a.nome, a.resp, a.prazo, a.conclusao, a.ordem
from t
join (values
  -- ===== PALESTRA =====
  ('Palestra',    'Card de divulgação',              'Designer',        15, 'manual',     1),
  ('Palestra',    'Vídeo do treinador',              'Audiovisual',     12, 'manual',     2),
  ('Palestra',    'Postagem programada',             'Social media',    10, 'manual',     3),
  ('Palestra',    'Rodando no tráfego',              'Luana (tráfego)', 10, 'automatica', 4),
  ('Palestra',    'Disparo WhatsApp',                'Marketing',        3, 'manual',     5),
  -- ===== TREINAMENTO =====
  ('Treinamento', 'Card de divulgação',              'Designer',        20, 'manual',     1),
  ('Treinamento', 'Vídeo do treinador',              'Audiovisual',     18, 'manual',     2),
  ('Treinamento', 'Palestra de potencialização 1',   'Marketing',       15, 'manual',     3),
  ('Treinamento', 'Palestra de potencialização 2',   'Marketing',        8, 'manual',     4),
  ('Treinamento', 'Live',                            'Marketing',        7, 'manual',     5),
  ('Treinamento', 'Postagem programada',             'Social media',    15, 'manual',     6),
  ('Treinamento', 'Rodando no tráfego',              'Luana (tráfego)', 15, 'automatica', 7),
  ('Treinamento', 'Disparo WhatsApp',                'Marketing',        3, 'manual',     8),
  -- ===== WORKSHOP =====
  ('Workshop',    'Card de divulgação',              'Designer',        12, 'manual',     1),
  ('Workshop',    'Vídeo do treinador',              'Audiovisual',     10, 'manual',     2),
  ('Workshop',    'Postagem programada',             'Social media',     8, 'manual',     3),
  ('Workshop',    'Rodando no tráfego',              'Luana (tráfego)',  8, 'automatica', 4),
  -- ===== LIVE =====
  ('Live',        'Card de divulgação',              'Designer',         5, 'manual',     1),
  ('Live',        'Postagem programada',             'Social media',     3, 'manual',     2)
) as a(tipo, nome, resp, prazo, conclusao, ordem)
  on a.tipo = t.nome;

-- ---------- CONFERÊNCIA ----------
-- Esperado: 5 tipos, 19 ações (Palestra 5, Treinamento 8, Workshop 4, Live 2)
select t.nome as tipo, count(a.id) as acoes
from mkt_tipos_evento t
left join mkt_templates_acao a on a.tipo_evento_id = t.id
group by t.nome
order by t.nome;
