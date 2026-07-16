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
      return data;
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

function useView(nome, seletor = "*", opcoes = {}) {
  return useQuery({
    queryKey: ["view", nome],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = supabase.from(nome).select(seletor);
      if (opcoes.ordenar) q = q.order(opcoes.ordenar, { ascending: false, nullsFirst: false });
      if (opcoes.limite) q = q.limit(opcoes.limite);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export const useComercialFunil    = () => useView("vw_comercial_funil");
export const useComercialRanking  = () => useView("vw_comercial_ranking");
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

export const useMarketingOrigem   = () => useView("vw_marketing_origem");
export const usePedagogicoTurmas  = () => useView("vw_pedagogico_turmas");
export const useEventosDesempenho = () => useView("vw_eventos_desempenho");
export const useDiretoriaConsol   = () => useView("vw_diretoria_consolidado");

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
