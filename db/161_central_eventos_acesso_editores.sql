-- FebraHub - Migration 161: editor da Central tambem precisa conseguir ve-la.
-- A migration 150 autorizou Carmen, Bruno, Elis e Daniele a editar, mas o
-- menu e a view dependem do setor central-eventos/marketing. Concede o setor
-- adicional aos editores sem alterar o setor principal de cada perfil.
insert into public.perfil_setores (perfil_id, setor)
select perfil_id, 'central-eventos'
from public.evento_editor
on conflict do nothing;
notify pgrst, 'reload schema';
