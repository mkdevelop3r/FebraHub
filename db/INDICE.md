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
| 115 | `115_so_turma_de_verdade.sql` | FebraHub · Migration 115 — Só turma de verdade na Central. Restou o comentário da coluna `grade_pedagogico`; o update do LIVRÃO e a definição de `vw_turma_inscritos` saíram do executável (ver cabeçalho e a 118) |
| 116 | — | número livre: a tentativa de `vw_turmas_central` que ocupava o 116 nunca foi aplicada e foi absorvida pela 117 |
| 117 | `117_central_estado_real.sql` | FebraHub · Migration 117 — vw_turmas_central: transcrição do que está aplicado (APLICADA) |
| 118 | `118_inscritos_sem_triplicar.sql` | FebraHub · Migration 118 — vw_turma_inscritos: join → exists. Definição VÁLIDA da view (39 turmas de CIS Global triplicavam) |
| 119 | `119_auditoria_gate.sql` | FebraHub · Migration 119 — Auditoria: `pode_ver('auditoria')` nas 4 views + policy em `dim_peso_etapa`. **NÃO APLICADA** — hoje qualquer autenticado lê o placar inteiro |
| 120–126 | — | migrations da Central de Eventos que já estavam na árvore (fundação, seed, funções, sync, regras, cruzamento). Não indexadas por mim: não fui eu que escrevi |
| 127 | `127_central_eventos_acesso.sql` | FebraHub · Migration 127 — Central de Eventos: policies em `mkt_tipos_evento` e `mkt_unidades` + vínculo perfil↔unidade e gestor_marketing do Bruno (APLICADA) |
| 128 | `128_central_eventos_trafego.sql` | FebraHub · Migration 128 — Fase 4, Tráfego: `vinculo`/`conta_id`/`objetivo`, `mkt_casa_campanhas`, `mkt_atualiza_acao_trafego`, `mkt_sincroniza_trafego` e as views de acompanhamento (APLICADA em 18/08, indexada só em 19/08) |
| 129 | `129_pedagogico_fonte_presenca.sql` | FebraHub · Migration 129 — Hub Pedagógico sobre a fonte viva: presença passa a sair de `vw_turmas_mensuraveis`/`fato_presenca`, nunca de `fato_credenciamento` |
| 130 | `130_trafego_correcoes.sql` | FebraHub · Migration 130 — Correções da 128: carimbo de conclusão preservado pelo trigger, evento passado não é desmarcado, `fonte_automacao` no lugar de `conclusao='automatica'`, casamento determinístico, fila respeita `sem_evento`, EXECUTE revogado de `authenticated` (APLICADA em 19/08). O bloco 6 teve de ganhar `data_fim`: a view viva já tinha essa coluna, e `create or replace view` não derruba coluna — sem isso a migration inteira falha |
| 131 | `131_trafego_casamento_por_nome.sql` | FebraHub · Migration 131 — `mkt_casa_campanhas` volta a ser uma só. A 130 criou uma homônima de zero argumentos ao lado da versão por semelhança que vivia só no banco, e `mkt_casa_campanhas()` virou ambígua: o sync morria em *42725 function is not unique*. Fica a por semelhança (decisão Louis, 19/08), agora obedecendo a 130 — `strpos`, só `vinculo='automatico'`, empate não vira escolha arbitrária —, com as auxiliares `mkt_limpa_nome_*` transcritas, coluna `casamento` ('codigo'/'nome') e EXECUTE fechado (APLICADA em 19/08) |
| 132 | `132_central_eventos_cancelamento.sql` | FebraHub · Migration 132 — Cancelar evento com motivo obrigatório (`mkt_cancelar_evento`/`mkt_reativar_evento`, só gestor), e apagar da agenda do Google vira cancelamento em vez de sumiço: um BEFORE DELETE converte a exclusão e preserva o checklist. O tráfego para de marcar ação de evento cancelado (APLICADA em 19/08) |
| 133 | `133_checklist_itens_novos.sql` | FebraHub · Migration 133 — Drive, Linktree, ManyChat e envio ao treinador entram no catálogo dos quatro tipos que geram checklist; prazos derivados do ritmo de cada tipo. Backfill nos eventos ativos e futuros: 64 ações em 16 eventos, nenhuma nascida vencida (APLICADA em 19/08) |
| 134 | `134_formas_pagamento_periodo.sql` | FebraHub · Migration 134 — Formas de pagamento com granularidade diária para responder aos filtros Ano/Mês/7 dias |
| 135 | `135_formas_pagamento_compatibilidade.sql` | FebraHub · Migration 135 — Preserva a view acumulada para o front publicado e separa a nova view diária filtrável |
| 136 | `136_inadimplencia_periodo.sql` | FebraHub · Migration 136 — Inadimplência filtrável por Ano/Mês/7 dias conforme a data de vencimento |
| 137 | `137_comercial_matriculas_reais.sql` | FebraHub · Migration 137 — Total de matrículas passa a contar alunos aprovados, não vendas deduplicadas |
| 138 | `138_financeiro_receita_categoria_detalhe.sql` | FebraHub · Migration 138 — Detalhamento da receita financeira por categoria e produto/evento |
| 139 | `139_agenda_sync.sql` | FebraHub · Migration 139 (aplicada como `138_agenda_sync`, renumerada por colisão com a 138 do Financeiro) — A agenda do Google entra sozinha na Central: `mkt_sincroniza_agenda` insere evento futuro, atualiza data e nome, e NUNCA apaga nem cancela (sumido vira relatório, não ação). `mkt_classifica_pendentes` extrai o bloco anônimo da 125 para o sync poder reaproveitar as regras. Consumida por `etl/agenda_sync.py` (APLICADA em 20/08) |
| 140 | `140_tipos_mentoria_evento.sql` | FebraHub · Migration 140 — Mentoria e Evento entram no catálogo da Central. Mentoria não gera checklist (como Maestria): as 13 já existentes são sala de reunião, que não se divulga. Evento gera, com as 9 ações da Palestra clonadas por `insert ... select`. Os eventos antigos em `sem_acoes` não são reclassificados — tipo nulo ali é decisão do Bruno (APLICADA em 20/08) |
| 140b | `140b_financeiro_caixa_extrato_cispay.sql` | FebraHub · Migration 140b — Caixa recebido passa a usar `checking-account` (dinheiro que se moveu) em vez de `schedules-ex`, que é projeção. Do Codex; renomeada de 140 por colisão |
| 141 | `141_mentorias_reclassificadas.sql` | FebraHub · Migration 141 — As 12 mentorias antigas (não 13) ganham o tipo Mentoria via `mkt_aplicar_classificacao`. Filtro é `ilike 'mentoria%'`, começa com a palavra: `%mentoria%` pegaria as duas Palestras de "vender mentoria" e trocaria o tipo delas, deixando 18 ações órfãs. A Masterclass fica na fila do Bruno (APLICADA em 20/08) |
| 142 | `142_agendamento_da_postagem.sql` | FebraHub · Migration 142 — "Postagem programada" passa a pedir para quando a postagem está agendada. `pede_agendamento` no template e copiado para a ação (padrão da casa, e evita depender de policy em `mkt_templates_acao`); `agendado_para` guarda. `mkt_marcar_acao` ganha 3º argumento OPCIONAL — a versão de 2 args é derrubada antes, senão a chamada fica ambígua como na 130. Desmarcar limpa o horário (APLICADA em 20/08) |
| 143 | `143_conferir_antes_de_concluir.sql` | FebraHub · Migration 143 — "Envio para o treinador" só conclui depois de conferir Link, Card e Vídeo um a um. `confirmar_itens text[]` no template e copiado para a ação; a tela desenha a lista que vier, sem conhecer os itens. Portão de tela, não restrição do banco — as marcações não são gravadas porque "concluída" já significa que os três foram feitos (APLICADA em 20/08) |
| 144 | `144_publico_por_evento.sql` | FebraHub · Migration 144 — `vw_mkt_publico_evento`: inscritos do Sympla ou matrículas aprovadas do Salesforce numa coluna só, com a `fonte` declarada. Turma casa por DATA exata (nome do curso tem similaridade de 0,014 a 0,714 e não serve) e só para evento do tipo Treinamento — sem esse recorte, reunião interna herdava alunos da turma do dia. Gate `pode_ver('marketing')` no `where`, como a 119 (APLICADA em 20/08) |
| 145 | `145_vendas_do_treinamento.sql` | FebraHub · Migration 145 — A view de público ganha `vendas` e `receita`, contando só venda direta (`Matrícula`); quem consome vaga comprada antes conta como pessoa, não como venda. Nulos fora do Salesforce — no Sympla a pergunta não tem resposta, e 0 seria uma. `drop`+`create` porque `create or replace` recusa coluna nova no meio (42P16) (APLICADA em 20/08) |
| 145b | `145b_financeiro_status_pagamento_periodo.sql` | FebraHub · Migration 145b — Status de pagamento por mês, consolidando por venda antes de contar para o donut não inflar matrículas. Do Codex; renomeada de 145 por colisão |
| 146 | `146_setor_central_eventos.sql` | FebraHub · Migration 146 — Setor `central-eventos`: opera evento sem ver lead, campanha e investimento. Entra em 5 policies (eventos, ações, tipos, unidades, resultados) e fica FORA de `mkt_leads` e `mkt_campanhas_trafego` de propósito. Fecha de carona um buraco: `sel_mkt_acoes` e `sel_mkt_resultados` não checavam setor nenhum, só unidade (APLICADA em 24/08) |
| 146b | `146b_setor_central_eventos_constraint.sql` | FebraHub · Migration 146b — `perfis.setor` aceita o valor novo. Havia DUAS checks com listas diferentes na mesma coluna, valendo a interseção; viraram uma. O mesmo defeito existe em `papel` (`gestor` é impossível hoje) e ficou registrado, não corrigido (APLICADA em 24/08) |
| 150 | `150_central_eventos.sql` | Central Febracis — kanban das turmas de Salvador, detalhes manuais, permissão explícita de edição e view dos meses atual/próximo (**NÃO APLICADA**) |
| 164 | `164_periodo_limites.sql` | FebraHub · Migration 164 — `vw_periodo_limites`: o seletor de período para de nascer cego fora do Financeiro e da Loja. O intervalo navegável saía das quatro views de fluxo (`vw_financeiro_receita_categoria_periodo`, `..._despesa_...`, `vw_loja_receita_periodo`, `vw_loja_serie`), todas com `pode_ver` no `where` — marketing, comercial, pedagógico e central-eventos recebiam vazio e caíam no fallback do front, um mês e um ano só ("Agosto 2026", setas mortas), desde que o filtro global nasceu em jul/2026. A view nova devolve `min_mes`/`max_mes` e nada mais, **sem `pode_ver` de propósito** (única do projeto): régua não é métrica, e o valor dentro do mês continua travado onde estava. `max_mes` limitado ao mês corrente porque `fato_contas_receber` tem vencimento até abr/2027 |
| 165 | `165_periodo_limites_sem_anon.sql` | FebraHub · Migration 165 — `revoke select ... from anon` na `vw_periodo_limites`. O `grant` da 164 era só para `authenticated`, mas objeto novo em `public` nasce com o default privilege do Supabase, que inclui `anon`: conferido com a chave pública do front, deslogada, retornava 200 com as duas datas. Nas demais views o `pode_ver()` fecha por dentro (sem sessão, `auth.uid()` null → false → zero linhas); esta é a única sem gate, então o fechamento vem do privilégio. Seguro porque o front só lê a view depois do login |
| 168 | `168_represado_validade_inteira.sql` | FebraHub · Migration 168 — Represado passa a ser a validade inteira (`situacao <> 'vencido'`, com turma antes de vencer) em vez da janela de 90 dias: 48 -> 453 pessoas, 312 com telefone, nas mesmas 6 turmas. A tela virou agrupada por turma e a pergunta mudou — quem cabe nesta turma, nao quem esta pegando fogo. O corte LISBOA fica (as 55 nao tem nome, telefone, e-mail nem CPF de 11 digitos). O DISPARO nao acompanhou a lista de proposito: `disparar_represados` ganhou `p_prazo_maximo` (padrao 90) e `pode_disparar` segue a mesma regra, senao um clique mandaria mensagem para ~300 pessoas. Ganhou tambem `p_turma_id`. Derruba as assinaturas antigas antes de criar (42725, licao da 130/131) |
| 169 | `169_contato_do_represado.sql` | FebraHub · Migration 169 — O telefone do represado. Dos 141 sem telefone, 73 estavam em `fato_contatos` e 66 em `fato_base_alunos.telefone_cliente`: `vw_pedagogico_prazo` lia so `dim_alunos` e nunca recebeu a precedencia da 114. Sobram 2 de verdade. A correcao entra na view do prazo (que materializa em `fila_prazo`), nao na `vw_represado_lista` — o script le `vw_prazo_fila_envio`, que exige `fila_prazo.telefone`. Mais `pedagogico_contato_manual` + `salvar_contato_manual()` para digitar na tela: tabela separada porque dim_alunos e fato_contatos sao carga e o ETL sobrescreveria; o manual vence todas as fontes. A funcao atualiza `fila_prazo` na mesma transacao. **Exige `select atualizar_fila_prazo();` depois** |
