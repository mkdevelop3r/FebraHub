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

async function buscarTudo(nome, seletor, ordem) {
  let todos = [], de = 0, total = null;
  for (;;) {
    let q = supabase
      .from(nome)
      .select(seletor, de === 0 ? { count: "exact" } : undefined);
    for (const col of ordem ?? []) q = q.order(col, { ascending: true });
    const { data, error, count } = await q.range(de, de + PAGINA - 1);
    if (error) throw error;
    const lote = data ?? [];
    if (de === 0) total = count ?? lote.length;
    todos = todos.concat(lote);
    de += lote.length;
    // Para quando o servidor esvazia ou já temos tudo que ele contou.
    if (!lote.length || (total != null && todos.length >= total)) break;
  }
  return todos;
}

function useView(nome, opcoes = {}) {
  return useQuery({
    queryKey: ["view", nome],
    staleTime: 5 * 60 * 1000,
    queryFn: () => buscarTudo(nome, opcoes.seletor ?? "*", opcoes.ordem),
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
  useView("vw_comercial_geral_mensal", { ordem: ["data", "valor"] });

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

/* Loja — receita própria. Curso ≠ loja: nunca entra num total conjunto. */
export const useLojaKpis = () => useView("vw_loja_kpis");
export const useLojaReceita = () => useView("vw_loja_receita");
export const useLojaReceitaMensal = () => useView("vw_loja_receita_mensal");

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

export const useMarketingOrigem   = () => useView("vw_marketing_origem");
export const usePedagogicoTurmas  = () => useView("vw_pedagogico_turmas");
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
