-- FebraHub - Migration 156: permissao da funcao de KPIs por periodo.
-- O usuario autenticado pode executar a RPC, mas nao possui SELECT direto em
-- todas as tabelas internas. SECURITY DEFINER permite o calculo; a propria
-- consulta continua exigindo pode_ver('pedagogico') para devolver uma linha.
alter function public.pedagogico_kpis_periodo(date, date) security definer;
alter function public.pedagogico_kpis_periodo(date, date) set search_path = public;
revoke all on function public.pedagogico_kpis_periodo(date, date) from public;
grant execute on function public.pedagogico_kpis_periodo(date, date) to authenticated;
notify pgrst, 'reload schema';
