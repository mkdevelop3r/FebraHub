# Índice das migrations

Ordem de aplicação e o que cada uma faz. Gerado a partir do cabeçalho de cada arquivo.

| # | Arquivo | O que faz |
|---|---------|-----------|
| 00 | `00_rebuild_views.sql` | FebraHub · REBUILD COMPLETO DAS VIEWS |
| 01 | `01_padronizacao_nomes.sql` | FebraHub · Migration 01 — Padronização de nomes |
| 02 | `02_chaves_fks_indices.sql` | FebraHub · Migration 02 — Chaves, FKs e Índices |
| 03 | `03_ponte_sympla_perfis.sql` | FebraHub · Migration 03 |
| 04 | `04_campos_sympla.sql` | FebraHub · Migration 04 — Campos que o Sympla manda e a |
| 05 | `05_rls_views_hubs.sql` | FebraHub · Migration 05 — Acesso por setor (RLS efetiva) |
| 06 | `06_cispay.sql` | FebraHub · Migration 06 — CisPay (schedules-ex) |
| 07 | `07_categorias_cursos.sql` | FebraHub · Migration 07 — Categoria de curso |
| 07b | `07b_categorias_restantes.sql` | FebraHub · Migration 07b — classifica os cursos restantes |
| 08 | `08_views_categoria.sql` | FebraHub · Migration 08 — Views de receita por categoria (corrigida) |
| 09 | `09_views_mensais.sql` | FebraHub · Migration 09 — Séries mensais (Hub Executivo) |
| 10 | `10_contaazul.sql` | FebraHub · Migration 10 — Conta Azul (contas a receber) |
| 11 | `11_views_loja.sql` | FebraHub · Migration 11 — Hub Loja (via Conta Azul) |
| 12 | `12_inadimplencia_origem.sql` | FebraHub · Migration 12 — Inadimplência com origem |
| 13 | `13_contaazul_pagar.sql` | FebraHub · Migration 13 — Conta Azul: Contas a PAGAR (despesas) |
| 14 | `14_views_filtro_data.sql` | FebraHub · Migration 14 — Views com dimensão de data (filtro) |
| 14b | `14b_views_periodo_completas.sql` | FebraHub · Migration 14b — Completa as views _periodo |
| 15 | `15_gamificacao_comercial.sql` | FebraHub · Migration 15 — Gamificação Comercial (carinhas) |
| 15b | `15b_ranking_ggb.sql` | FebraHub · Migration 15b — Ranking e gamificação restritos ao time GGB |
| 15c | `15c_fotos_consultoras.sql` | FebraHub · Migration 15c — Liga fotos às consultoras GGB |
| 16 | `16_carinhas_v2.sql` | FebraHub · Migration 16 — Gamificação v2 (carinhas por composição) |
| 16b | `16b_placar_data_largada.sql` | FebraHub · Migration 16b — Placar com data de largada |
| 16c | `16c_placar_filtravel.sql` | FebraHub · Migration 16c — Placar filtrável por período |
| 17 | `17_ranking_filtravel.sql` | FebraHub · Migration 17 — Ranking (pódio) filtrável por período |
| 17b | `17b_ranking_geral.sql` | FebraHub · Migration 17b — Ranking geral acumulado (hall da fama) |
| 18 | `18_consultora_categoria.sql` | FebraHub · Migration 18 — Vínculo consultora × categoria + ranking |
| 18b | `18b_fotos_novas.sql` | FebraHub · Migration 18b — Fotos de Cássia, Marlany, Jennifer |
| 18c | `18c_sympla_jennifer.sql` | FebraHub · Migration 18c — View Sympla da Jennifer (corrigida) |
| 19 | `19_ranking_historico.sql` | FebraHub · Migration 19 — Ranking histórico por período (Interpretação 1) |
| 19b | `19b_carinhas_so_ggb.sql` | FebraHub · Migration 19b — Carinhas só do time GGB |
| 20 | `20_matriculas_faturamento.sql` | FebraHub · Migration 20 — Matrículas vs. Faturamento por mês/categoria |
| 20b | `20b_ranking_cursos_hover.sql` | FebraHub · Migration 20b — Cursos por consultora (para o hover do ranking) |
| 21 | `21_ranking_geral_consolidado.sql` | FebraHub · Migration 21 — Ranking GERAL consolidado (Dulce) |
| 21b | `21b_geral_kpis_graficos.sql` | FebraHub · Migration 21b — KPIs e gráficos no modo GERAL |
| 22 | `22_dedup_faturamento.sql` | FebraHub · Migration 22 — Correção de faturamento (dedup + comprador de vaga) |
| 23 | `23_views_dedup_comercial.sql` | FebraHub · Migration 23 — Views do Comercial com faturamento deduplicado |
| 24 | `24_split_cis.sql` | FebraHub · Migration 24 — Splits: CIS Global, Coaching Individual, Mentorias |
| 25 | `25_views_financeiro.sql` | FebraHub · Migration 25 — Views do Financeiro corrigidas |
| 26 | `26_nome_curto_pmc.sql` | FebraHub · Migration 26 — Nome curto dos cursos, PMC01 e hover no Geral |
| 27 | `27_views_comercial_final.sql` | FebraHub · Migration 27 — Views do Comercial (SUBSTITUI a 23) |
| 28 | `28_detalhe_carinhas_verdes.sql` | FebraHub · Migration 28 — Detalhamento das vendas com carinha verde |
| 29 | `29_integracao_status.sql` | FebraHub · Migration 29 — Status de atualização das integrações |
| 30 | `30_fix_receita.sql` | FebraHub · Migration 30 — Corrige vw_financeiro_receita |
| 31 | `31_formas_pix_separado.sql` | FebraHub · Migration 31 — Separa PIX de Cartão no gráfico de formas |
| 32 | `32_conciliacao_cispay.sql` | FebraHub · Migration 32 — Conciliação CisPay × Salesforce |
| 33 | `33_conciliacao_ajustada.sql` | FebraHub · Migration 33 — Conciliação CisPay ajustada |
| 34 | `34_leads_salvador.sql` | FebraHub · Migration 34 — Leads da unidade Salvador |
| 35 | `35_meta_ads.sql` | FebraHub · Migration 35 — Estrutura para Meta Ads |
| 36 | `36_meta_leads_cpl.sql` | FebraHub · Migration 36 — Meta Ads cruzado com leads (CPL real) |
| 37 | `37_origem_vendas.sql` | FebraHub · Migration 37 — Origem das vendas (canal) |
| 38 | `38_origem_vendas_otimizada.sql` | FebraHub · Migration 38 — Origem das vendas (otimizada) |
| 39 | `39_categoria_marketing.sql` | FebraHub · Migration 39 — Categoria de marketing nas campanhas |
| 40 | `40_atribuicao.sql` | FebraHub · Migration 40 — Atribuição lead → venda (piso comprovável) |
| 41 | `41_setor_marketing.sql` | FebraHub · Migration 41 — Setor 'marketing' nas views |
| 42 | `42_omie_loja.sql` | FebraHub · Migration 42 — Loja (Omie): vendas e estoque |
| 43 | `43_fix_bigint.sql` | FebraHub · Migration 43 — IDs do Omie para bigint |
| 44 | `44_loja_produtos_mes.sql` | FebraHub · Migration 44 — Produtos vendidos por mês (Loja/Omie) |
| 45 | `45_estoque_custo.sql` | FebraHub · Migration 45 — Estoque a valor de custo |
| 46 | `46_loja_receita_omie.sql` | FebraHub · Migration 46 — Receita da Loja passa a vir do Omie |
| 47 | `47_fix_kpis_loja.sql` | FebraHub · Migration 47 — Corrige KPIs da Loja |
| 48 | `48_loja_pagamentos.sql` | FebraHub · Migration 48 — Formas de pagamento da Loja (Omie) |
| 49 | `49_loja_faturamento_curso.sql` | FebraHub · Migration 49 — Faturamento da loja por curso (Sheets) |
| 50 | `50_loja_metas.sql` | FebraHub · Migration 50 — Metas da loja (Sheets) |
| 51 | `51_loja_kpis_geral.sql` | FebraHub · Migration 51 — KPIs da Loja com linha "Geral" |
| 52 | `52_loja_kpis_mes.sql` | FebraHub · Migration 52 — KPIs da Loja por mês |
| 53 | `53_loja_nivel_meta.sql` | FebraHub · Migration 53 — Nível de meta explícito e robusto |
| 54 | `54_loja_meta_proximo.sql` | FebraHub · Migration 54 — Meta: nível batido + quanto falta |
| 55 | `55_loja_premium_outros.sql` | FebraHub · Migration 55 — Cursos premium e outras receitas da loja |
| 56 | `56_loja_consolidada_final.sql` | FebraHub · Migration 56 — Receita consolidada da loja (oficial) |
| 57 | `57_loja_fechamento.sql` | FebraHub · Migration 57 — Fechamento oficial da loja (planilha) |
| 58 | `58_loja_serie_unificada.sql` | FebraHub · Migration 58 — Série histórica unificada da loja |
| 59 | `59_loja_kpis_dia.sql` | FebraHub · Migration 59 — KPIs da loja por dia |
| 60 | `60_excluir_revolution.sql` | FebraHub · Migration 60 — REVOLUTION e Holding fora do faturamento |
| 61 | `61_pedagogico_sucesso.sql` | FebraHub · Migration 61 — Hub Pedagógico / Sucesso do Cliente |
| 62 | `62_add_data_aprovacao.sql` | FebraHub · Migration 62 — data_aprovacao na vw_venda_faturamento |
| 63 | `63_comercial_data_aprovacao.sql` | FebraHub · Migration 63 — data_aprovacao nas views comerciais |
| 64 | `64_pedagogico_presenca.sql` | FebraHub · Migration 64 — Presença / "comprou e não compareceu" |
| 65 | `65_pedagogico_saude.sql` | FebraHub · Migration 65 — Pedagógico: visão de saúde geral |
| 66 | `66_pedagogico_grade.sql` | FebraHub · Migration 66 — Grade pedagógica (filtro do hub) |
| 67 | `67_pedagogico_grade_views.sql` | FebraHub · Migration 67 — Views pedagógicas filtradas pela grade |
| 68 | `68_pedagogico_recompra_grade.sql` | FebraHub · Migration 68 — Recompra filtrada pela grade pedagógica |
| 69 | `69_pedagogico_ajustes.sql` | FebraHub · Migration 69 — Ajustes no pedagógico |
| 70 | `70_pedagogico_maestros.sql` | FebraHub · Migration 70 — Maestros (clientes de acompanhamento próximo) |
| 71 | `71_maestros_detalhe.sql` | FebraHub · Migration 71 — Maestros: detalhamento com identificação |
| 72 | `72_maestros_validade.sql` | FebraHub · Migration 72 — Validade da Maestria (12 meses) |
| 73 | `73_pedagogico_nps.sql` | FebraHub · Migration 73 — Avaliações / NPS (GGB manual + eventos via Make) |
| 74 | `74_pedagogico_nps_eventos.sql` | FebraHub · Migration 74 — NPS de eventos (resposta individual via Make) |
| 75 | `75_evento_simplificar.sql` | FebraHub · Migration 75 — Simplifica fato_avaliacao_evento |
| 76 | `76_evento_antiduplicata.sql` | FebraHub · Migration 76 — Proteção contra duplicata no NPS de eventos |
| 77 | `77_evento_webhook.sql` | FebraHub · Migration 77 (revisada) — Ajustes para o webhook |
| 78 | `78_avaliacao_unificada.sql` | FebraHub · Migration 78 — Avaliações manuais (Eventos + GGB) |
| 79 | `79_maestros_anotacoes.sql` | FebraHub · Migration 79 — Anotações editáveis dos maestros |
| 80 | `80_acesso_gestora_pedagogico.sql` | FebraHub · Migration 80 (corrigida) — Acesso da gestora do Pedagógico |
| 81 | `81_avaliacao_nota_treinador.sql` | FebraHub · Migration 81 — nota do treinador na view de avaliação |
| 82 | `82_retencao_e_maestro.sql` | FebraHub · Migration 82 — Base de retenção + ajuste maestro |
| 83 | `83_nome_gestora.sql` | FebraHub · Migration 83 — Nome da gestora do Pedagógico |
| 84 | `84_marketing_atribuicao_fix.sql` | FebraHub · Migration 84 — Corrige atribuição de marketing |
| 85 | `85_reconciliacao_stone.sql` | FebraHub · Migration 85 — Reconciliação CisPay/Stone × Salesforce |
| 86 | `86_grades_life_business.sql` | FebraHub · Migration 86 — Grades Life e Business (análise Dulce) |
| 87 | `87_recebido_mensal_fix.sql` | FebraHub · Migration 87 — Corrige recebido mensal (fonte defasada) |
| 88 | `88_remover_smart_notas.sql` | FebraHub · Migration 88 — Remover Smart Notas da Central de APIs |
| 89 | `89_eventos_avaliacao.sql` | FebraHub · Migration 89 — Avaliação de eventos por QR (palestras, eventos, perguntas, respostas, funções, trigger de trava, RLS e views) |
| 90 | `90_eventos_sympla_id.sql` | FebraHub · Migration 90 — Coluna eventos.sympla_evento_id (ponte Sympla, fora do formulário) |
| 92 | `92_represado_fonte_viva.sql` | FebraHub · Migration 92 — Represado sobre a fonte viva |
| 93 | `93_presenca_por_dia.sql` | FebraHub · Migration 93 — Presença por dia + conserto do CPF |
| 94 | `94_represado_fonte_presenca.sql` | FebraHub · Migration 94 — Represado sobre presença, validado contra o Salesforce |
| 95 | `95_prazo_do_aluno.sql` | FebraHub · Migration 95 — Prazo do aluno (1 ano da compra) |
| 96 | `96_limpeza_fila_prazo.sql` | FebraHub · Migration 96 — Limpeza da fila de prazo |
| 97 | `97_tipo_matricula.sql` | FebraHub · Migration 97 — Tipo de matrícula (recria a cadeia de views do prazo) |
| 98 | `98_prazo_mensagens.sql` | FebraHub · Migration 98 — Mensagem de prazo vencendo (enfileirar, não envia) |
| 99 | `99_boas_vindas.sql` | FebraHub · Migration 99 — Boas-vindas na compra (registrar_envio_boas_vindas) |
| 99b | `99b_prazo_timeout.sql` | FebraHub · Migration 99b — Folga de statement_timeout (authenticated 15s) para a fila de prazo |
| 100 | `100_registro_por_pessoa.sql` | FebraHub · Migration 100 — Registro de envio por pessoa |
| 101 | `101_boas_vindas_contato.sql` | FebraHub · Migration 101 — Fila de boas-vindas: junção e contato |
| 102 | `102_constraints_envios.sql` | FebraHub · Migration 102 — Constraints de pedagogico_envios |
| 103 | `103_prazo_sem_pode_ver.sql` | FebraHub · Migration 103 — Tirar pode_ver() da view base do prazo |
| 104 | `104_boas_vindas_3_dias.sql` | FebraHub · Migration 104 — Fila de boas-vindas: janela de 3 dias |
| 105 | `105_indices_fila_prazo.sql` | FebraHub · Migration 105 — Índices da fila de prazo |
| 106 | `106_conter_marketing_e_materializar_prazo.sql` | FebraHub · Migration 106 — Conter a view de marketing e materializar a fila de prazo |
| 107 | `107_disparo_por_turma.sql` | FebraHub · Migration 107 — Disparo por turma (disparar_turma, vw_turma_fila_envio, vw_turma_envios) |
| 108 | `108_faturamento_mensal_aprovacao.sql` | FebraHub · Migration 108 — Faturamento mensal por aprovação (fonte canônica dos dois hubs) |
| 109 | `109_qualidade_sem_status_periodo.sql` | FebraHub · Migration 109 — Qualidade "sem status" por período |
| 110 | `110_respostas_de_volta.sql` | FebraHub · Migration 110 — Respostas de volta (registrar_respostas, marcar_resposta, vw_turma_status/resumo) |
| 111 | `111_represado_lista_e_disparo.sql` | FebraHub · Migration 111 — Represados: a lista e o disparo (reconstruída do banco) |
| 112 | `112_respostas_so_com_contato.sql` | FebraHub · Migration 112 — Fila de respostas: só quem dá para consultar |
| 113 | `113_turma_inscritos.sql` | FebraHub · Migration 113 — Inscritos da turma, incluindo quem não foi enfileirado |
| 114 | `114_contatos.sql` | FebraHub · Migration 114 — Contato vindo de fato_contatos (relatório dedicado do Salesforce) |
| 115 | `115_so_turma_de_verdade.sql` | FebraHub · Migration 115 — Só turma de verdade na Central (grade_pedagogico + vw_turma_inscritos) |
| 116 | — | número livre: a tentativa de `vw_turmas_central` que ocupava o 116 nunca foi aplicada e foi absorvida pela 117 |
| 117 | `117_central_estado_real.sql` | FebraHub · Migration 117 — vw_turmas_central: transcrição do que está aplicado (APLICADA) |
| 118 | `118_inscritos_sem_triplicar.sql` | FebraHub · Migration 118 — vw_turma_inscritos: join → exists (CIS Global triplicava) |
