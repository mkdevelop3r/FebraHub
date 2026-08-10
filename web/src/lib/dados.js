import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";

/* ============================================================
   AUTENTICAÇÃO
   O papel/setor vem da tabela `perfis`, nao de estado local.
   Mesmo que alguem force `papel = admin` no React, o banco
   continua devolvendo so o que a RLS permite.
   ============================================================ */

export function useSessao() {
  const [sessao, setSessao] = useState(undefined); // undefined = carregando

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return sessao;
}

export function usePerfil(sessao) {
  return useQuery({
    queryKey: ["perfil", sessao?.user?.id],
    enabled: !!sessao?.user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("id, nome, setor, papel")
        .eq("id", sessao.user.id)
        .single();
      if (error) throw error;

      // Um usuário pode ter acesso a mais de um setor (tabela perfil_setores).
      // A RLS já libera só as linhas do próprio perfil; aqui só unimos com o
      // setor do perfil. Se essa leitura falhar, o login não pode cair — no
      // pior caso o menu fica com o setor único de antes.
      const { data: extras, error: errExtras } = await supabase
        .from("perfil_setores")
        .select("setor")
        .eq("perfil_id", sessao.user.id);
      const setores = [...new Set(
        [data.setor, ...(errExtras ? [] : (extras ?? []).map((r) => r.setor))].filter(Boolean)
      )];

      return { ...data, setores };
    },
  });
}

export async function entrar(email, senha) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    // Mensagem do usuario, nao do sistema.
    if (error.message.includes("Invalid login")) {
      throw new Error("E-mail ou senha incorretos.");
    }
    throw new Error(error.message);
  }
}

export async function sair() {
  await supabase.auth.signOut();
}

/* ============================================================
   VIEWS — o front NUNCA toca em tabela crua.
   Tentar `from("fato_pagamento_base")` retorna permission denied.
   ============================================================ */

/* O PostgREST corta a resposta no "Max rows" do projeto (padrão 1000) —
   silenciosamente, sem erro. As views com dimensão de data devolvem uma
   linha por (chave, dia) e passam MUITO disso: sem paginar, o front
   recebia um pedaço arbitrário e categorias inteiras sumiam do mês.
   Aqui buscamos TODAS as páginas e conferimos com o count exato.

   `ordem` é a chave natural da view. Paginar sem ORDER BY estável deixa
   o Postgres livre pra repetir/pular linhas entre páginas. */
const PAGINA = 1000;

async function buscarTudo(nome, seletor, ordem, contarExato = true) {
  let todos = [], de = 0, total = null;
  for (;;) {
    // `count: exact` faz o PostgREST rodar a query DUAS vezes (uma pro count,
    // outra pros dados). Em view pesada isso dobra o custo e estoura o
    // statement-timeout — `contarExato: false` pula o count; a paginação para
    // sozinha quando volta uma página incompleta.
    let q = supabase
      .from(nome)
      .select(seletor, de === 0 && contarExato ? { count: "exact" } : undefined);
    for (const col of ordem ?? []) q = q.order(col, { ascending: true });
    const { data, error, count } = await q.range(de, de + PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    if (de === 0 && contarExato) total = count ?? lote.length;
    todos = todos.concat(lote);
    de += lote.length;
    // Para quando o servidor esvazia, manda página incompleta (fim) ou já
    // temos tudo que ele contou.
    if (!lote.length || lote.length < PAGINA || (total != null && todos.length >= total)) break;
  }
  return todos;
}

function useView(nome, opcoes = {}) {
  return useQuery({
    queryKey: ["view", nome],
    // Padrão 5 min; dados operacionais (ex.: fila de confirmação) passam
    // staleTime menor pra atualizar mais rápido.
    staleTime: opcoes.staleTime ?? 5 * 60 * 1000,
    // Views pesadas dão statement-timeout no primeiro acesso frio; mais uma
    // tentativa (com backoff do react-query) pega a segunda, já quente.
    retry: opcoes.retry,
    queryFn: () => buscarTudo(nome, opcoes.seletor ?? "*", opcoes.ordem, opcoes.contarExato ?? true),
  });
}

export const useComercialFunil    = () => useView("vw_comercial_funil");
/* Pódio, duas fontes. `_geral` é o hall da fama (já agregado, todos os
   tempos, ignora o filtro). `_periodo` é uma linha por venda: o front
   recorta por `data` e reagrupa, então a ordem muda com o período. */
export const useComercialRankingGeral = () => useView("vw_comercial_ranking_geral");
export const useComercialRankingPeriodo = () =>
  useView("vw_comercial_ranking_periodo", { ordem: ["data", "consultor_id", "valor"] });

/* Ranking por categoria: uma linha por venda, com `categoria` e `data`.
   Alimenta KPIs, YoY, evolução mensal e o pódio da categoria selecionada.
   A view já aplica o split 50/50 do CI e a data de largada de cada
   consultora — o front não recalcula nada disso. */
export const useComercialRankingCategoria = () =>
  useView("vw_comercial_ranking_categoria", { ordem: ["data", "categoria", "consultor_id", "valor"] });

/* Ranking histórico: uma linha por venda, incluindo quem já saiu da empresa
   (`atual` = false). É a fonte do faturamento REAL de qualquer período —
   2022 aparece com quem vendeu na época, não zerado por falta de
   consultora atual. `consultor_id_exibicao` é a chave de agrupamento. */
export const useComercialRankingHistorico = () =>
  useView("vw_comercial_ranking_historico", { ordem: ["data", "categoria", "consultor_id_exibicao", "valor"] });

/* Uma linha por matrícula: o front conta (volume) e soma (faturamento)
   por mês, pra cruzar as duas séries no mesmo gráfico. */
export const useComercialMatriculasFaturamento = () =>
  useView("vw_comercial_matriculas_faturamento", { ordem: ["data", "categoria", "valor"] });

/* Cursos vendidos por consultora — alimenta o tooltip do ranking (só GGB). */
export const useComercialCursosPorConsultora = () =>
  useView("vw_comercial_cursos_por_consultora", { ordem: ["data", "consultora", "curso", "valor"] });

/* "Geral": consolidado das 3 formações (GGB + CI + CIS). Sympla fica de
   fora — evento é outra unidade. As views já aplicam o split 50/50 do CI e
   o tratamento do Danilo; o front só soma. */
export const useComercialRankingGeralConsolidado = () =>
  useView("vw_comercial_ranking_geral_consolidado", { ordem: ["data", "consultora", "valor"] });
export const useComercialGeralMensal = () =>
  useView("vw_comercial_geral_mensal", { ordem: ["data", "valor"], retry: 2 });

/* Sympla: já agregado e sem dimensão de data — só a Jennifer, porque o
   dado do Sympla não tem vínculo de consultora. */
export const useComercialSymplaJennifer = () => useView("vw_comercial_sympla_jennifer");
/* Placar da gamificação: uma linha por VENDA (time GGB, desde jan/2025).
   O front recorta por data_pagamento e conta as cores no período.
   Sem coluna de id única: ordeno por todas as colunas discriminantes, então
   linhas empatadas são idênticas e a paginação não altera a contagem. */
export const useComercialCarinhas = () =>
  useView("vw_comercial_carinhas_ggb", { ordem: ["data_pagamento", "consultor_id", "valor", "carinha"] });

/* Detalhe das vendas verdes (auditoria da classificação). Uma linha por
   venda; a coluna `formas` mostra as formas de pagamento que a compuseram. */
export const useComercialVerdesDetalhe = () =>
  useView("vw_comercial_verdes_detalhe", { ordem: ["data", "consultora", "valor"] });
export const useFinanceiroReceita = () => useView("vw_financeiro_receita");
export const useFinanceiroInadimp = () => useView("vw_financeiro_inadimplencia");
export const useFinanceiroQualid  = () => useView("vw_financeiro_qualidade");
export const useFinanceiroPagamentos = () => useView("vw_financeiro_pagamentos");
export const useFinanceiroReceitaCategoria = () => useView("vw_financeiro_receita_categoria_total");
export const useFinanceiroCaixaHorizonte = () => useView("vw_financeiro_caixa_horizonte");
export const useFinanceiroFormasPagamento = () => useView("vw_financeiro_formas_pagamento");
// Views que a Dulce vai criar (evolução mensal + caixa CisPay). Enquanto
// não existirem, o useView devolve [] e o card mostra estado vazio honesto.
export const useFinanceiroReceitaMensal = () => useView("vw_financeiro_receita_mensal");
export const useFinanceiroCaixaMensal = () => useView("vw_financeiro_caixa_mensal");

/* Conta Azul: inadimplência, a receber e despesa. NUNCA somar com a
   receita (Salesforce) — são fontes e unidades diferentes. */
export const useFinanceiroInadimpOrigem = () => useView("vw_financeiro_inadimplencia_origem");
export const useFinanceiroAReceberHorizonte = () => useView("vw_financeiro_a_receber_horizonte");
export const useFinanceiroDespesaCategoria = () => useView("vw_financeiro_despesa_categoria");
export const useFinanceiroAPagarHorizonte = () => useView("vw_financeiro_a_pagar_horizonte");
export const useFinanceiroPagoMensal = () => useView("vw_financeiro_pago_mensal");
// Recebido por mês (caixa). Alimenta o card de Financeiro do Hub Executivo.
export const useFinanceiroRecebidoMensal = () =>
  useView("vw_financeiro_recebido_mensal", { ordem: ["mes"], staleTime: 60 * 1000, retry: 2 });

/* ============ HUB EXECUTIVO (setor 'geral') ============ */
/* Faturamento de venda: a view tem 8k+ linhas. Em vez de puxar tudo, filtro no
   servidor pelas datas recentes (aprovação OU pagamento >= `desde`) e o front
   soma o mês corrente por coalesce(data_aprovacao, data_pagamento). staleTime
   60s (operacional). */
export function useVendaFaturamentoDesde(desde) {
  return useQuery({
    queryKey: ["venda_faturamento", desde],
    enabled: !!desde,
    staleTime: 60 * 1000,
    retry: 2,
    queryFn: async () => {
      let todos = [], de = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("vw_venda_faturamento")
          .select("valor_bruto,data_aprovacao,data_pagamento")
          .or(`data_aprovacao.gte.${desde},data_pagamento.gte.${desde}`)
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        const lote = data ?? [];
        todos = todos.concat(lote);
        de += lote.length;
        if (lote.length < PAGINA) break;
      }
      return todos;
    },
  });
}
// Investimento de mídia (uma linha por campanha/mês; `gasto`). Card Marketing.
export const useMarketingInvestimento = () =>
  useView("vw_marketing_investimento", { ordem: ["mes"], staleTime: 60 * 1000, retry: 2 });
// Loja: realizado vs meta do mês (realizado, pct_minima, nivel_atingido por
// mes_ref). Alimenta o card da Loja e o radar (nivel_atingido='Abaixo').
export const useLojaMetaRealizado = () =>
  useView("vw_loja_meta_realizado", { ordem: ["mes_ref"], staleTime: 60 * 1000, retry: 2 });

/* Reativação: alunos que COMPRARAM e NÃO compareceram (vw_comprou_nao_compareceu).
   Uma linha por matrícula ausente (aluno_id, curso_id, turma, valor) — a fonte
   repete algumas, então o front conta alunos distintos e soma o valor
   DEDUPLICADO por (aluno+curso+turma). Alimenta o alerta do Hub Executivo. Sem
   PII de nome, leitura liberada; ~2,4k linhas, pagina numa boa. */
export const useExecutivoReativacao = () =>
  useView("vw_comprou_nao_compareceu", { ordem: ["aluno_id", "curso_id", "turma"], staleTime: 60 * 1000, retry: 2 });

/* Concentração comercial + Top 3 consultoras (Hub Executivo) — MESMA base e
   janela pros dois, pra o % bater. Recorte no servidor: só data_pagamento nos
   últimos 30 dias (poucas centenas de linhas). O front filtra tipo_matricula
   válido, deduplica por original_id_venda com MAX(valor) (somar cru infla) e
   agrupa por consultor_id (que já vem com o NOME). staleTime 60s. */
export function useExecutivoComercial30d(desde) {
  return useQuery({
    queryKey: ["exec_comercial_30d", desde],
    enabled: !!desde,
    staleTime: 60 * 1000,
    retry: 2,
    queryFn: async () => {
      let todos = [], de = 0;
      for (;;) {
        const { data, error } = await supabase
          .from("vw_venda_faturamento")
          .select("original_id_venda,consultor_id,tipo_matricula,valor,data_pagamento")
          .gte("data_pagamento", desde)
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        const lote = data ?? [];
        todos = todos.concat(lote);
        de += lote.length;
        if (lote.length < PAGINA) break;
      }
      return todos;
    },
  });
}

/* Loja — receita própria. Curso ≠ loja: nunca entra num total conjunto.
   A receita virou CONSOLIDADA (ver useLojaReceitaTotalMes abaixo); os hooks
   antigos de KPI Omie-só / meta separada saíram junto com a mudança. */

/* Operacional da loja — vem do Omie (PDV). Produto vendido e saldo de
   prateleira. */
// Uma linha por (produto, mês): o front soma os meses do período e ranqueia.
export const useLojaProdutosVendidosMes = () =>
  useView("vw_loja_produtos_vendidos_mes", { ordem: ["mes", "produto_id"] });
// Posição de estoque (snapshot do dia): 443 produtos, ignora o período.
export const useLojaEstoque = () =>
  useView("vw_loja_estoque", { ordem: ["produto_id"] });

/* Performance por curso: quanto a loja vende DURANTE cada curso (planilha da
   gestora). Uma linha por (curso, mês). É o mesmo dinheiro da receita, visto
   por curso — NÃO somar com o total. O front recorta por mes_ref e reagrega
   por curso. `por_aluno` é recalculado após a soma (média de médias mente). */
export const useLojaPerformanceCurso = () =>
  useView("vw_loja_performance_curso", { ordem: ["mes_ref", "curso"] });

/* Receita CONSOLIDADA por mês — soma todas as fontes (produtos/Omie + livrão,
   cursos premium, aluguel de sala, Sentido de Brincar). É a fonte oficial da
   receita da loja agora, com a meta recalculada sobre o total. Uma linha por
   mês; a série começa em mar/2025 (antes disso não havia Omie). O front soma
   os meses do recorte. Traz também as metas do mês (min/básica/máster) e o
   nível atingido sobre o consolidado. */
export const useLojaReceitaTotalMes = () =>
  useView("vw_loja_receita_total_mes", { ordem: ["mes"] });

/* Quebra da receita por FONTE (Produtos, Livrão, Cursos premium, Aluguel de
   sala, Sentido de Brincar). Uma linha por (mês, fonte); o front recorta e
   soma. Produtos é ~91%; as outras são complementos. */
export const useLojaReceitaConsolidada = () =>
  useView("vw_loja_receita_consolidada", { ordem: ["mes", "fonte"] });

/* Série mensal LONGA da receita (2022 a 2026) — a fonte muda ao longo dela:
   2022-2024 vêm da planilha de fechamento da gestora, 2025+ do consolidado
   (Omie + livrão, cursos premium, aluguel de sala, Sentido de Brincar). O
   campo `fonte` diz qual em cada mês; a transição é marcada no gráfico
   (tracejado até 2024, sólido de 2025) porque a queda entre os dois reflete
   a troca de fonte, não o negócio. Traz também a meta do mês (planilha, cobre
   2022-2026) e o nível. Meses não preenchidos (ex.: abr/2023) simplesmente
   não vêm — o gráfico pula, não desenha zero. */
export const useLojaSerie = () =>
  useView("vw_loja_serie", { ordem: ["mes"] });

/* Receita por ANO (uma linha por ano + uma com ano = null = acumulado geral).
   Alimenta a lista de anos do seletor (2022-2026) e o número de receita nos
   modos Ano e "Geral". Só receita — vendas/ticket não existem pra 2022-2024. */
export const useLojaKpisAno = () =>
  useView("vw_loja_kpis_ano", { ordem: ["ano"] });

/* KPIs por RECORTE CURTO já prontos: uma linha por período — periodo = 'hoje',
   '7dias' ou '30dias' (vendas, receita, ticket_medio). Cobre SÓ produtos
   (PDV/Omie), a única fonte com data exata de venda; livrão, cursos premium e
   aluguel são mensais e não entram no recorte diário. Alimenta os cards quando
   o filtro é "Hoje" ou "7 dias" — a agregação mensal não tem granularidade
   diária e mostraria o mês/ano inteiro. */
export const useLojaKpisPeriodo = () =>
  useView("vw_loja_kpis_periodo", { ordem: ["periodo"] });

/* Views com dimensão de data. Entregam as linhas com `data`; o front
   recorta pelo período e reagrega. Só métricas de FLUXO — estado
   (inadimplência, horizontes) é snapshot e não tem recorte. */
// `ordem` = chave natural (uma linha por dia+categoria/forma): paginação estável.
export const useFinanceiroReceitaCategoriaPeriodo = () =>
  useView("vw_financeiro_receita_categoria_periodo", { ordem: ["data", "categoria"] });
export const useFinanceiroDespesaCategoriaPeriodo = () =>
  useView("vw_financeiro_despesa_categoria_periodo", { ordem: ["data", "categoria"] });
export const useLojaReceitaPeriodo = () =>
  useView("vw_loja_receita_periodo", { ordem: ["data", "forma"] });

/* ============ MARKETING ============
   Meta Ads entrega gasto/impressão/lead por anúncio, agregado por MÊS —
   não existe linha diária, e por isso o hub não tem recorte de 7 dias.

   O que NÃO existe ainda: atribuição de venda a campanha. Nenhuma das
   views abaixo tem coluna de venda, receita ou ROI — conferido por probe
   (42703). O front marca esses campos como "em construção" e nunca
   estima: dividir faturamento por investimento sem atribuição daria um
   ROI inventado. */
export const useMarketingResumoMensal = () =>
  useView("vw_marketing_resumo_mensal", { ordem: ["mes"] });

/* Uma linha por (mês, campanha). Reconcilia EXATAMENTE com a resumo_mensal
   (investimento = Σ gasto; cpl_medio = Σ gasto_captação / Σ leads_captação),
   então é ela que sustenta o filtro por produto sem divergir dos KPIs. */
export const useMarketingDesempenho = () =>
  useView("vw_marketing_desempenho", { ordem: ["mes", "campanha_nome"] });

/* Origem das vendas por canal — cobertura começa em jun/2026 e cresce a
   cada mês; a maioria das vendas ainda cai em "Pedido". */
export const useMarketingOrigemVendas = () =>
  useView("vw_marketing_origem_vendas", { ordem: ["mes", "canal"] });

/* Atribuição: vendas cujo comprador foi lead de anúncio ANTES da compra.
   É um PISO comprovável (~7% das vendas), não o faturamento do digital.
   Vive à parte de propósito — dividir isto pelo investimento (que é cheio)
   daria um ROI falso, comparando um parcial com um total.

   Sem `ordem`: são poucas dezenas de linhas, e a view é pesada o bastante
   pra estourar o statement timeout na primeira execução fria — o retry
   padrão do QueryClient pega a segunda, já com o plano quente. */
export const useMarketingAtribuicao = () =>
  useView("vw_marketing_atribuicao_campanha", { retry: 2 });

/* ============ PEDAGÓGICO / SUCESSO DO CLIENTE ============
   Foco em SAÚDE (acompanhamento), não lista de tarefas. Tudo vem do
   Salesforce. Conclusão, notas e NPS não são medidos — não existem na fonte.
   Presença cobre só as turmas com credenciamento confiável (176 de 197). */

// KPIs de recompra (fidelização): uma linha agregada — alunos únicos,
// matrículas, cursos por aluno, taxa de recompra.
export const usePedagogicoKpis = () => useView("vw_pedagogico_kpis");
// KPIs de presença: comparecimento geral + cobertura (turmas credenciadas).
export const usePedagogicoPresencaKpis = () => useView("vw_pedagogico_presenca_kpis");
// Taxa de comparecimento por TRIMESTRE (série). `matriculas` é o tamanho da
// amostra — o front de-enfatiza trimestres com poucas (<~30) matrículas.
export const usePedagogicoPresencaTempo = () =>
  useView("vw_pedagogico_presenca_tempo", { ordem: ["periodo"] });
// Cursos que mais fidelizam (taxa_recompra por curso). `alunos` = amostra.
export const usePedagogicoRecompraCurso = () =>
  useView("vw_pedagogico_recompra_curso", { ordem: ["curso"] });
// Cursos com mais falta (taxa_comparecimento por curso; piores no topo no front).
export const usePedagogicoPresencaCurso = () =>
  useView("vw_pedagogico_presenca_curso", { ordem: ["curso"] });
// Painel de Maestros: os clientes VIP (compraram MAESTRIA). `_completo` já
// junta as anotações editáveis (apelido/empresa/faturamento/observacoes) aos
// campos do maestro; a chave é `cpf` (= aluno_id em maestro_anotacao). PII
// restrita ao setor. Ordeno por chave estável; o front reordena por investido.
export const usePedagogicoMaestrosCompleto = () =>
  useView("vw_pedagogico_maestros_completo", { ordem: ["total_investido", "nome"] });
// KPIs do grupo de maestros: total + contadores de validade da Maestria
// (validos, perto_vencer, vencidos). Validade = 12 meses desde a compra da
// MAESTRIA; "vencido" é benefício expirado (oportunidade de renovação), não
// deixou de ser maestro. Uma linha só.
export const usePedagogicoMaestrosKpis = () =>
  useView("vw_pedagogico_maestros_kpis");
// Anotações cruas (maestro_anotacao) — a view _completo não expõe `cargo`, e
// aqui o form de edição pré-preenche esse campo. RLS libera só ao pedagógico.
export const usePedagogicoMaestroAnotacoes = () =>
  useView("maestro_anotacao", { ordem: ["aluno_id"] });
// Retenção (entrada manual): casos crus (fato_retencao), o resumo
// (vw_pedagogico_retencao: total_casos/retidos/cancelados/taxa) e os motivos
// (vw_pedagogico_retencao_motivos: motivo, retidos vs cancelados).
export const usePedagogicoRetencaoCasos = () =>
  useView("fato_retencao", { ordem: ["data_ligacao", "id"] });
export const usePedagogicoRetencao = () =>
  useView("vw_pedagogico_retencao");
export const usePedagogicoRetencaoMotivos = () =>
  useView("vw_pedagogico_retencao_motivos", { ordem: ["motivo"] });

/* AUTOMAÇÃO DE CONFIRMAÇÕES (operacional — staleTime 60s). O painel traz uma
   linha por turma futura com os contadores do fluxo e a `pendencia` pronta. */
export const usePedagogicoPainel = () =>
  useView("vw_pedagogico_painel", { ordem: ["data_inicio", "turma_id"], staleTime: 60 * 1000 });
/* FILA DE PRAZO. Aluno tem 1 ano da compra pra fazer o curso; passando disso
   paga taxa de transferência (cobrada de verdade). Toda a lógica vive no banco
   (migration 97) — o front só lê, não recalcula, não filtra setor (RLS já
   filtra). O card-resumo é 1 linha. `presenca_carregada_em` PRECISA aparecer na
   tela: a carga é manual e a fonte anterior morreu sem esse aviso.

   NOTA: a UI saiu do Hub Pedagógico (vai pra outro hub). Estes hooks ficam aqui
   prontos pra reuso — a UI (CardFilaPrazo/FilaPrazo/etc.) está no commit 7459d8b
   se precisar restaurar. As views são pesadas: contarExato:false é obrigatório
   (o count exato do PostgREST dobra o custo e estoura o statement_timeout). */
export const usePedagogicoPrazoResumo = () =>
  useView("vw_pedagogico_prazo_resumo", { staleTime: 60 * 1000, retry: 2, contarExato: false });
// A fila de ligação: 1 linha por pessoa, mais urgente primeiro (vence_em_dias).
// Sem coluna de valor de propósito — a linha do aluno é CONSUMIDOR DE VAGAS,
// zero por construção; somar zeros destruiria a confiança na tela.
export const usePedagogicoPrazoPessoa = () =>
  useView("vw_pedagogico_prazo_pessoa", { ordem: ["vence_em_dias", "cpf"], staleTime: 60 * 1000, retry: 2, contarExato: false });
// Detalhe por pessoa: as linhas de vw_pedagogico_prazo_salvador daquele CPF.
export function usePedagogicoPrazoDetalhe(cpf) {
  return useQuery({
    queryKey: ["prazo_detalhe", cpf],
    enabled: !!cpf,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pedagogico_prazo_salvador")
        .select("cpf,curso,comprou_em,vence_em,dias_restantes,situacao,turma_da_venda,proxima_turma_em,tipos,ja_transferiu")
        .eq("cpf", cpf)
        .order("dias_restantes");
      if (error) throw error;
      return data ?? [];
    },
  });
}
// Urgentes SEM telefone: fila de trabalho, não erro. `motivo` diz o que fazer
// (CPF sem cadastro, venda PJ, e-mail no lugar do CPF).
export const usePedagogicoPrazoSemContato = () =>
  useView("vw_pedagogico_prazo_sem_contato", { ordem: ["dias_restantes"], staleTime: 60 * 1000, retry: 2, contarExato: false });
// "Sem turma no prazo" — decisão de CALENDÁRIO, não de ligação. Recorte no
// servidor por `situacao` (atributo de exibição, não setor); o front só agrupa
// por curso pra mostrar quantas turmas precisam existir e até quando.
export function usePedagogicoSemTurma() {
  return useQuery({
    queryKey: ["prazo_sem_turma"],
    staleTime: 60 * 1000,
    retry: 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pedagogico_prazo_salvador")
        .select("cpf,curso,dias_restantes,vence_em")
        .eq("situacao", "sem turma no prazo");
      if (error) throw error;
      return data ?? [];
    },
  });
}
// Quem deve receber a mensagem de prazo (vencendo + tem telefone + tem turma
// antes do vencimento + ainda não recebeu). A contagem é o tamanho da fila.
export const usePrazoFilaEnvio = () =>
  useView("vw_prazo_fila_envio", { ordem: ["dias_restantes"], staleTime: 60 * 1000, retry: 2, contarExato: false });
// O que voltou das mensagens: 1 linha por status; o front soma.
export const usePrazoEnviosStatus = () =>
  useView("vw_prazo_envios_status", { staleTime: 60 * 1000, retry: 2, contarExato: false });
/* Enfileira a mensagem — NÃO envia. Grava a intenção em pedagogico_envios pro
   disparador existente consumir. Única escrita da tela. Devolve
   { enfileirados, restantes_na_fila }. Só authenticated (pode_ver pedagógico). */
export async function enfileirarPrazoVencendo(limite) {
  const { data, error } = await supabase.rpc("enfileirar_prazo_vencendo", { p_limite: limite });
  if (error) throw new Error(error.message);
  return data;
}

/* ESCRITA (exceção sancionada ao "front só lê view"): a tabela
   maestro_anotacao tem policy de INSERT/UPDATE com pode_ver('pedagogico').
   A gravação vai com o JWT da sessão; a RLS barra quem não for do setor.
   Erros sobem pro form tratar. */
export async function salvarMaestroAnotacao(anotacao) {
  const { error } = await supabase.from("maestro_anotacao").upsert(anotacao, { onConflict: "aluno_id" });
  if (error) throw new Error(error.message);
}
// Retenção: sem `id` insere um caso novo; com `id` atualiza (ex.: mudar o
// desfecho de 'pendente' para 'retido'/'cancelado' depois da ligação).
export async function salvarRetencao(registro) {
  const { id, ...campos } = registro;
  const q = id != null
    ? supabase.from("fato_retencao").update(campos).eq("id", id)
    : supabase.from("fato_retencao").insert(campos);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

/* ============ AVALIAÇÃO DE EVENTOS (Hub Pedagógico) ============
   Sistema NOVO por token/QR (não é o fato_avaliacao_evento antigo, via Make).
   Toda ESCRITA passa pelas funções SECURITY DEFINER — nunca insert/update
   direto (não há policy de escrita; tentativa direta falha). Leitura respeita
   RLS pode_ver('setor'): não filtrar por setor no front. */

// Carteira de palestras (vw_carteira): alimenta o seletor de título quando o
// tipo é 'palestra', pra edição repetida cair na MESMA linha (não parte o NPS
// acumulado). Traz status, edições e nps_acumulado (só com respostas ≥ 5).
export const useCarteira = () =>
  useView("vw_carteira", { ordem: ["titulo"], staleTime: 60 * 1000, retry: 2 });

// Eventos do setor (RLS filtra). Lista + estado do link. `codigo`/`token`/
// janelas/travado_em vêm daqui; a contagem de respostas cruza com vw_evento_nps.
export const useEventos = () =>
  useView("eventos", { ordem: ["data_evento", "id"], staleTime: 60 * 1000, retry: 2 });

// NPS por evento (vw_evento_nps): respostas, promotores/neutros/detratores e o
// nps (só com ≥ 5 respostas; senão null). Alimenta a contagem na lista e o
// resultado — nunca o NPS sozinho.
export const useEventoNps = () =>
  useView("vw_evento_nps", { ordem: ["evento_id"], staleTime: 60 * 1000, retry: 2 });

// Média por pergunta numérica (vw_evento_notas): media só com ≥ 5 respostas.
export const useEventoNotas = () =>
  useView("vw_evento_notas", { ordem: ["evento_id", "nucleo", "ordem"], staleTime: 60 * 1000, retry: 2 });

// Texto livre (vw_evento_textos): uma linha por resposta escrita.
export const useEventoTextos = () =>
  useView("vw_evento_textos", { ordem: ["evento_id", "pergunta_id"], staleTime: 60 * 1000, retry: 2 });

// Perguntas de um evento (tabela evento_perguntas, RLS pode_ver do setor):
// alimenta o editor ao abrir um evento existente. Núcleo primeiro (false<true),
// depois ordem — a mesma ordem do formulário.
export function useEventoPerguntas(eventoId) {
  return useQuery({
    queryKey: ["evento_perguntas", eventoId],
    enabled: eventoId != null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evento_perguntas")
        .select("id,ordem,texto,tipo,obrigatoria,nucleo,opcoes")
        .eq("evento_id", eventoId)
        .order("nucleo").order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Decisão de carteira: ativa | em_observacao | aposentada, com motivo obrigatório
// (o banco recusa sem motivo). Só authenticated com pode_ver do setor.
export async function definirStatusCarteira(palestraId, status, motivo) {
  const { data, error } = await supabase.rpc("definir_status_carteira", { p_palestra_id: palestraId, p_status: status, p_motivo: motivo });
  if (error) throw new Error(error.message);
  return data;
}

// Perfis que a sessão enxerga (o próprio; admin vê todos) — seletor de
// responsável. A RLS já limita: não-admin recebe só a própria linha, que é o
// default. `criar_evento` recusa não-admin tentando pôr outra pessoa; o front
// não replica essa regra — mostra o erro do banco se vier.
export function usePerfisVisiveis() {
  return useQuery({
    queryKey: ["perfis_visiveis"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("perfis").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* Escrita via RPC. `criar_evento` insere o evento + as 3 perguntas de núcleo e
   devolve { id, codigo, token, palestra_id, nova_na_carteira, abre_em, fecha_em }.
   `salvar_perguntas` grava só as perguntas da Elis (o núcleo já entrou). Erros
   sobem com a mensagem do banco pro form/toast — inclusive a de permissão. */
export async function criarEvento(campos) {
  const { data, error } = await supabase.rpc("criar_evento", campos);
  if (error) throw new Error(error.message);
  return data;
}
export async function salvarPerguntas(eventoId, perguntas) {
  const { data, error } = await supabase.rpc("salvar_perguntas", { p_evento_id: eventoId, p_perguntas: perguntas });
  if (error) throw new Error(error.message);
  return data;
}

/* ============ AUTOMAÇÃO — DRAWER DA TURMA (bloco 2) ============
   O drawer edita dim_turmas por turma_id. Escrita gated pela RLS
   pode_ver('pedagogico'); sem policy o update volta 42501/403 e o form mostra
   "Você não tem permissão para editar" (não contornamos). Preservo `code` e
   `status` do erro pra o front distinguir permissão de falha genérica. */
export async function salvarTurma(turmaId, campos) {
  const { error } = await supabase.from("dim_turmas").update(campos).eq("turma_id", turmaId);
  if (error) { const e = new Error(error.message); e.code = error.code; e.status = error.status; throw e; }
}

// Linha de dim_turmas da turma aberta: campos de leitura (curso/datas/cidade) +
// os editáveis. RLS libera só ao pedagógico; anon vê a estrutura, não as linhas.
export function useTurmaDim(turmaId) {
  return useQuery({
    queryKey: ["turma_dim", turmaId],
    enabled: turmaId != null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dim_turmas")
        .select("turma_id,curso,sigla,data_inicio,data_fim,cidade,horario_credenciamento,horario_inicio,horario_fim,local,endereco,capacidade,nome_comercial,link_grupo")
        .eq("turma_id", turmaId)
        .limit(1);
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

// Sugestão de pré-preenchimento: a última turma PASSADA de mesma sigla
// (data_inicio anterior à turma aberta), ordenada desc. Só os campos que o
// drawer sugere; o front preenche o input, não grava.
export function useTurmaSugestao(sigla, dataInicio, turmaId) {
  return useQuery({
    queryKey: ["turma_sugestao", sigla, dataInicio, turmaId],
    enabled: !!sigla,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase
        .from("dim_turmas")
        .select("horario_credenciamento,horario_inicio,horario_fim,local,endereco,capacidade,nome_comercial,data_inicio")
        .eq("sigla", sigla)
        .order("data_inicio", { ascending: false })
        .limit(1);
      if (turmaId != null) q = q.neq("turma_id", turmaId);
      if (dataInicio) q = q.lt("data_inicio", dataInicio);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? [])[0] ?? null;
    },
  });
}

// Fila de confirmação da turma (pendentes, com PII). Sem coluna de status — são
// os que ainda não receberam. `aluno_id` é o CPF.
export function useFilaTurma(turmaId) {
  return useQuery({
    queryKey: ["fila_turma", turmaId],
    enabled: turmaId != null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vw_pedagogico_fila")
        .select("aluno_id,nome,canal,telefone_bruto,telefone_invalido")
        .eq("turma_id", turmaId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// Envios já disparados da turma (com status e erro_msg). Sem nome — só CPF.
export function useEnviosTurma(turmaId) {
  return useQuery({
    queryKey: ["envios_turma", turmaId],
    enabled: turmaId != null,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedagogico_envios")
        .select("aluno_id,canal,status,erro_msg,enviado_em,tipo")
        .eq("turma_id", turmaId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const useEventosDesempenho = () => useView("vw_eventos_desempenho");
export const useDiretoriaConsol   = () => useView("vw_diretoria_consolidado");

/* Status de atualização das integrações — uma linha por fonte. O `rotulo`
   já vem formatado ("Atualizado hoje", "Nunca sincronizado", etc.). */
export const useIntegracaoStatus  = () => useView("vw_integracao_status");

/* ============================================================
   AGREGAÇÃO — as views vem agrupadas por mes.
   O KPI compara o ultimo mes fechado com o anterior.
   ============================================================ */

export function porMes(linhas, campoMes = "mes", campoValor = "valor") {
  const mapa = new Map();
  for (const l of linhas) {
    if (!l[campoMes]) continue; // linhas sem data ficam fora do grafico — e aparecem no card de qualidade
    const k = l[campoMes];
    mapa.set(k, (mapa.get(k) ?? 0) + Number(l[campoValor] ?? 0));
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, valor]) => ({ mes, valor }));
}

/* O mês corrente está incompleto. Comparar 14 dias de julho contra
   junho inteiro produz "-99%" — um número tecnicamente correto e
   completamente enganoso. O KPI usa o último mês FECHADO; o mês em
   curso aparece à parte, rotulado como parcial. */
const mesCorrente = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

export function variacao(serie) {
  const corrente = mesCorrente();
  const fechados = serie.filter((s) => s.mes < corrente);
  const parcial = serie.find((s) => s.mes === corrente) ?? null;

  if (!fechados.length)
    return { atual: parcial?.valor ?? 0, delta: null, up: true, parcial: null, mes: parcial?.mes };

  const atual = fechados.at(-1).valor;
  const anterior = fechados.at(-2)?.valor;

  const base = {
    atual,
    mes: fechados.at(-1).mes,
    parcial: parcial ? parcial.valor : null,
    serie: fechados,
  };

  if (!anterior) return { ...base, delta: null, up: true };

  const pct = ((atual - anterior) / Math.abs(anterior)) * 100;
  return { ...base, delta: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`, up: pct >= 0 };
}

export const moeda = (v) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: Math.abs(v) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(v ?? 0);

export const numero = (v) => new Intl.NumberFormat("pt-BR").format(v ?? 0);

export const rotuloMes = (iso) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")
    : "—";
