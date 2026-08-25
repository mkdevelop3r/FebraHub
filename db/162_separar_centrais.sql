-- FebraHub - Migration 162: Central Febracis != Central de Eventos.
-- A 161 concedeu o setor operacional a todas as editoras do calendario por
-- causa da sobreposicao das duas telas. Carmen e Elis podem editar detalhes
-- do calendario via evento_editor, mas isso nao lhes concede a operacao de
-- demandas do Marketing.
delete from public.perfil_setores ps
using public.perfis p
where p.id = ps.perfil_id
  and ps.setor = 'central-eventos'
  and p.nome in ('Carmen Acassia', 'Elis Figueiredo');
notify pgrst, 'reload schema';
