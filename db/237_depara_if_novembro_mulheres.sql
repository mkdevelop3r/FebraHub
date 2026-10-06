-- 237 - Origem do formulario da nova campanha de IF para mulheres
-- Nome conferido em fato_meta_insights em 06/10/2026.

insert into public.mkt_origem_campanha (fonte, campanha_nome, observacao)
values (
  'Forms-Inteligência Financeira Facebook',
  '[IF][LEADS][NOVEMBRO] —IF PARA MULHERES',
  'Formulario Meta da campanha iniciada em 06/10/2026.'
)
on conflict (fonte, campanha_nome) do update
set observacao = excluded.observacao;

notify pgrst, 'reload schema';
