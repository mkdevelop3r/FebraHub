import { Component, useState, useMemo, useRef, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import Avaliacao from "./Rotas/Avaliacao.jsx";
import CentralEventos from "./Rotas/CentralEventos.jsx";
import {
  TrendingUp, Wallet, Megaphone, GraduationCap, ShoppingBag, CalendarDays,
  LayoutDashboard, Lock, Mail, AlertTriangle, Package, LogOut, Power,
  Database, ShieldAlert, Loader2, ArrowRight, Bell,
  Clock, Receipt, Hourglass, ChevronLeft, ChevronRight, ChevronDown,
  Smile, Frown, Meh, Crown, Gift, X, ArrowUpRight,
  Users, Target, Construction, Percent, Filter, ChevronUp,
  Boxes, PackageX, Repeat, UserCheck, BookOpen, ShieldCheck,
  Check, Pencil, Star, Plus, PhoneCall, Send, Link2, ClipboardList, ClipboardCheck,
  Search, MoreHorizontal, Gauge,
} from "lucide-react";
import {
  useSessao, usePerfil, entrar, sair,
  useComercialRankingHistorico, useComercialSymplaJennifer, useComercialCarinhas,
  useComercialVerdesDetalhe,
  useComercialMatriculasFaturamento, useComercialCursosPorConsultora,
  useComercialRankingGeralConsolidado, useComercialGeralMensal, useComercialMatriculasPeriodo, useFaturamentoMensal,
  useFinanceiroPagamentosPeriodo, useFinanceiroQualidadePeriodo,
  useFinanceiroCaixaHorizonte, useFinanceiroFormasPagamento,
  useFinanceiroReceitaMensal, useFinanceiroCaixaMensal,
  useFinanceiroInadimp, useFinanceiroInadimpOrigem, useFinanceiroAReceberHorizonte,
  useFinanceiroAPagarHorizonte, useFinanceiroPagoMensal,
  useFinanceiroReceitaCategoriaPeriodo, useFinanceiroReceitaCategoriaDetalhe, useFinanceiroDespesaCategoriaPeriodo,
  useLojaReceitaPeriodo, useLojaReceitaTotalMes, useLojaReceitaConsolidada,
  useLojaSerie, useLojaKpisAno, useLojaKpisPeriodo,
  useLojaProdutosVendidosMes, useLojaEstoque, useLojaPerformanceCurso,
  useMarketingResumoMensal, useMarketingDesempenho, useMarketingOrigemVendas,
  useMarketingSaudeCaptacao, useMarketingCaptacaoDiaria,
  usePedagogicoKpis, usePedagogicoPresencaKpis, usePedagogicoPresencaTempo,
  usePedagogicoRecompraCurso, usePedagogicoPresencaCurso,
  usePedagogicoMaestrosCompleto, usePedagogicoMaestrosKpis, usePedagogicoMaestroAnotacoes,
  usePedagogicoRetencaoCasos, usePedagogicoRetencao, usePedagogicoRetencaoMotivos,
  usePedagogicoPainel,
  useVendaFaturamentoDesde, useFinanceiroRecebidoMensal,
  useMarketingInvestimento, useLojaMetaRealizado,
  useExecutivoReativacao,
  useTurmaDim, useTurmaSugestao,
  useTurmasCentral, useTurmaInscritosResumo, useTurmaInscritos, dispararTurma, marcarResposta,
  useRepresadoLista, dispararRepresados, usePresencaSaude, useTurmasMensuraveis, usePresencaCobertura,
  useCarteira, usePerfisVisiveis, criarEvento, salvarPerguntas,
  useEventos, useEventoNps, useEventoNotas, useEventoTextos, useEventoPerguntas, definirStatusCarteira,
  salvarMaestroAnotacao, salvarRetencao, salvarTurma,
  useEventosDesempenho,
  useAuditoriaKpi, useAuditoriaGaps, useAuditoriaConsultora, useConformidadeVenda,
  useIntegracaoStatus,
  porMes, moeda, numero,
} from "./lib/dados";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/* ============ DESIGN TOKENS ============ */
const C = {
  void: "#08080A",
  panel: "rgba(14,14,16,.72)",
  card: "rgba(255,255,255,.028)",
  cardLine: "rgba(255,255,255,.08)",
  hair: "rgba(255,255,255,.05)",
  gold: "#E4C06A",
  goldTop: "#F2D488",
  goldBase: "#B8934A",
  text: "#F5F3EE",
  bright: "#EDEBE4",
  muted: "#8B8B90",
  faint: "#6A6A70",
  dim: "#5B5B62",
  down: "#E06C75",
  warn: "#E6B04D",
  up: "#6FCF97",
};

const GROTESK = "'Space Grotesk', system-ui, sans-serif";
const SANS = "'Manrope', system-ui, sans-serif";

// Altura máxima do CORPO de um painel de BI. O conteúdo rola dentro do
// card (overflow interno) em vez de esticar a página — é o que faz o Hub
// caber numa tela. Um só valor pra todos os hubs herdarem o mesmo ritmo.
const ALTURA_PAINEL = 260;

const HUBS = [
  { key: "comercial",  nome: "Comercial",  Icone: TrendingUp,    desc: "Pódio de consultoras e placar da semana" },
  { key: "financeiro", nome: "Financeiro", Icone: Wallet,        desc: "Receita por curso e cobertura" },
  { key: "marketing",  nome: "Marketing",  Icone: Megaphone,     desc: "Origem de leads e campanhas" },
  /* Operação do Marketing, como a Central Pedagógica é a do Pedagógico:
     `setor` existe porque a chave não é o próprio setor. */
  { key: "central-eventos", setor: "marketing", nome: "Central de Eventos", Icone: CalendarDays,
    desc: "Agenda, checklist de divulgação e o que está atrasado" },
  { key: "pedagogico", nome: "Pedagógico", Icone: GraduationCap, desc: "Turmas, matrículas e conclusão" },
  /* A Central é operação, não setor: quem enxerga é quem tem o setor
     'pedagogico'. `setor` existe só por isso — nos outros, a chave já é o
     próprio setor. */
  { key: "central", setor: "pedagogico", nome: "Central Pedagógica", Icone: ClipboardList, desc: "Operação: turmas, represados e presença" },
  /* Placar fechado: setor próprio ('auditoria'), concedido por perfil_setores
     a gestão de marketing, gestão comercial, CEO e gerência. NÃO pode ser
     'comercial' — as consultoras têm esse setor e cairiam dentro. */
  { key: "auditoria",  nome: "Auditoria",  Icone: ClipboardCheck, titulo: "Auditoria Comercial",
    desc: "Febracis Bahia · conformidade ao processo de vendas" },
  { key: "eventos",    nome: "Eventos",    Icone: CalendarDays,  desc: "Ingressos e receita líquida" },
  { key: "loja",       nome: "Loja",       Icone: ShoppingBag,   desc: "Vendas, formas de pagamento e recebimento" },
  { key: "estoque",    nome: "Estoque",    Icone: Package,       desc: "Sem fonte conectada" },
];

const agrupar = (linhas, chave, valor) => {
  const m = new Map();
  for (const l of linhas) m.set(l[chave] ?? "—", (m.get(l[chave] ?? "—") ?? 0) + Number(l[valor] ?? 0));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([rotulo, v]) => ({ rotulo, valor: v }));
};

// "Sem vínculo" não é categoria de produto: é pagamento que entrou sem
// matrícula casada. Nunca disputa o topo do ranking como se fosse curso.
const ehSemVinculo = (cat) => /sem[\s_]?v[ií]nculo|n[aã]o[_\s]?determinad|indefinid/i.test(cat ?? "");

/* ============ PERÍODO GLOBAL ============
   Recorta só métricas de FLUXO (receita/despesa por categoria, receita da
   loja) pela coluna `data`. Métricas de ESTADO — inadimplência, a receber
   e a pagar por horizonte, status de pagamento — são snapshot do agora e
   ignoram o filtro. As linhas de evolução mostram a série inteira sempre. */
const PERIODOS = [
  { key: "ano", label: "Ano" },
  { key: "mes", label: "Mês" },
  { key: "7d", label: "7 dias" },
  { key: "hoje", label: "Hoje" },
];

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const chaveMes = (a, m) => `${a}-${String(m + 1).padStart(2, "0")}`;

/* O recorte é ancorado em (ano, mês) escolhidos, não no "hoje" fixo.
   `fim` nunca passa de hoje — mês/ano futuro não inventa dia que não veio. */
function intervaloDe({ modo, ano, mesIdx }) {
  const h = new Date();
  const hoje = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate()));
  const menor = (a, b) => (a < b ? a : b);
  if (modo === "mes") {
    return {
      inicio: iso(new Date(ano, mesIdx, 1)),
      fim: menor(iso(new Date(ano, mesIdx + 1, 0)), hoje), // dia 0 = último do mês
      rotulo: `${MESES[mesIdx]} ${ano}`,
    };
  }
  if (modo === "7d") {
    const f = new Date(h.getFullYear(), h.getMonth(), h.getDate());
    return {
      inicio: iso(new Date(f.getFullYear(), f.getMonth(), f.getDate() - 6)),
      fim: hoje,
      rotulo: "Últimos 7 dias",
    };
  }
  if (modo === "hoje") {
    return { inicio: hoje, fim: hoje, rotulo: "Hoje" };
  }
  return { inicio: iso(new Date(ano, 0, 1)), fim: menor(iso(new Date(ano, 11, 31)), hoje), rotulo: String(ano) };
}

/* Janela anterior equivalente para comparações de força. Mês e ano voltam
   um período de calendário e preservam o avanço da janela atual (mês/ano
   corrente parcial); 7 dias e hoje usam a janela imediatamente anterior. */
function intervaloAnterior({ inicio, fim, modo }) {
  const ler = (s) => {
    const [a, m, d] = String(s).split("-").map(Number);
    return new Date(a, m - 1, d);
  };
  const i = ler(inicio), f = ler(fim);
  if (modo === "mes") {
    const ai = i.getFullYear(), mi = i.getMonth() - 1;
    const ultimoDia = new Date(ai, mi + 1, 0).getDate();
    return {
      inicio: iso(new Date(ai, mi, 1)),
      fim: iso(new Date(ai, mi, Math.min(f.getDate(), ultimoDia))),
    };
  }
  if (modo === "ano") {
    const ano = i.getFullYear() - 1;
    return { inicio: iso(new Date(ano, 0, 1)), fim: iso(new Date(ano, f.getMonth(), f.getDate())) };
  }
  const dias = Math.round((f - i) / 86400000) + 1;
  const anteriorFim = new Date(i.getFullYear(), i.getMonth(), i.getDate() - 1);
  return {
    inicio: iso(new Date(anteriorFim.getFullYear(), anteriorFim.getMonth(), anteriorFim.getDate() - dias + 1)),
    fim: iso(anteriorFim),
  };
}

/* Limites de navegação saem do DADO, não do calendário: o primeiro mês com
   movimento (união das views _periodo) até o mês atual. Nada de 2024/2026
   chumbado — se a base crescer pra trás, a navegação cresce junto. */
/* Lista de categorias derivada do dado + Sympla (que vive noutra view). */
function useCategoriasDisponiveis() {
  const r = useComercialRankingHistorico();
  return useMemo(() => {
    const set = new Set();
    for (const x of r.data ?? []) if (x.categoria && !CAT_SEM_BOTAO(x.categoria)) set.add(String(x.categoria));
    const ord = (c) => { const i = ORDEM_CAT.indexOf(c); return i < 0 ? 99 : i; };
    // Geral primeiro (padrão), depois as formações + Mentoria, Sympla por último.
    return [CAT_GERAL, ...[...set].sort((a, b) => ord(a) - ord(b) || a.localeCompare(b)), CAT_SYMPLA];
  }, [r.data]);
}

function useRangeDatas() {
  const a = useFinanceiroReceitaCategoriaPeriodo();
  const b = useFinanceiroDespesaCategoriaPeriodo();
  const c = useLojaReceitaPeriodo();
  // A loja (gestora RLS) não enxerga as views financeiras, então os anos dela
  // saíam só de `c`, que traz só 2026. A série longa da loja cobre 2022-2026,
  // então entra como fonte dos anos (e do minMes). Cada view usa sua coluna de
  // data: `data` nas _periodo, `mes` na série. Para quem não é da loja ela vem
  // vazia (RLS), sem efeito nos outros hubs.
  const d = useLojaSerie();
  return useMemo(() => {
    const h = new Date();
    const maxMes = chaveMes(h.getFullYear(), h.getMonth());
    let min = null;
    const anos = new Set();
    const somar = (src, campo) => {
      for (const r of src ?? []) {
        const dt = String(r[campo] ?? "").slice(0, 10);
        if (!dt) continue;
        if (!min || dt < min) min = dt;
        anos.add(Number(dt.slice(0, 4)));
      }
    };
    for (const src of [a.data, b.data, c.data]) somar(src, "data");
    somar(d.data, "mes");
    const minMes = min ? min.slice(0, 7) : maxMes;
    const lista = anos.size ? [...anos].sort((x, y) => y - x) : [h.getFullYear()];
    return { minMes, maxMes: maxMes < minMes ? minMes : maxMes, anos: lista };
  }, [a.data, b.data, c.data, d.data]);
}

const PeriodoCtx = createContext(null);
const usePeriodo = () => useContext(PeriodoCtx);

/* ============ CATEGORIA (só Hub Comercial) ============
   Cada categoria é uma UNIDADE DE NEGÓCIO separada: o filtro recorta os
   painéis pra uma delas, e não existe opção "todas" de propósito — somar
   faturamento de categorias diferentes num total único não significa nada.
   Os valores de `categoria` saem da própria view (não chumbados aqui);
   só os rótulos feios ganham um nome apresentável. */
const CAT_SYMPLA = "Sympla";
const CAT_GERAL = "Geral"; // consolidado GGB + CI + CIS (padrão); Sympla fica fora
const ROTULO_CAT = { CI: "Coach Individual", "Coaching Individual": "Coach Individual" };
const rotuloCat = (c) => ROTULO_CAT[c] ?? c;
const ORDEM_CAT = ["GGB", "CIS", "CI", "Coaching Individual", "Mentoria"];
// Categorias que somam no Geral (backend) mas não viram botão próprio: "Sem
// categoria" é bucket de qualidade, "Evento" já aparece via Sympla, e
// "Franquia"/"Outro" foram tirados da barra a pedido. Só oculta o botão —
// os dados e o total do Geral seguem intactos.
const CAT_SEM_BOTAO = (c) =>
  /sem[\s_]?categoria|^\s*evento\s*$|^\s*franquia\s*$|^\s*outros?\s*$|indefinid|n[aã]o[_\s]?determinad/i.test(c ?? "");

const CategoriaCtx = createContext(null);
const useCategoria = () => useContext(CategoriaCtx);

// Título de vazio de fluxo, ciente do "Hoje" (que vem vazio com frequência).
const tituloVazioFluxo = (modo) => modo === "hoje" ? "Sem movimentação hoje" : "Nenhuma movimentação no período";

// Recorte de fluxo pela coluna de data. ISO compara como string.
// `campo` varia por view: as _periodo usam `data`; as carinhas, `data_pagamento`.
const noPeriodo = (linhas, { inicio, fim }, campo = "data") =>
  (linhas ?? []).filter((r) => {
    const d = String(r[campo] ?? "").slice(0, 10);
    return d && d >= inicio && d <= fim;
  });

// Reagrega as linhas do período somando `campos` por `chave`.
const somarPor = (linhas, chave, campos) => {
  const m = new Map();
  for (const l of linhas) {
    const k = l[chave] ?? "—";
    const a = m.get(k) ?? { [chave]: k, ...Object.fromEntries(campos.map((c) => [c, 0])) };
    for (const c of campos) a[c] += Number(l[c] ?? 0);
    m.set(k, a);
  }
  return [...m.values()];
};

// Série mensal padrão: {mes, valor, parcial}. O mês corrente tem só alguns
// dias — fica marcado como parcial pra sair tracejado e fora do domínio Y.
const serieMensal = (linhas, campo) => {
  const d = new Date();
  const cm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return (linhas ?? [])
    .map((r) => ({ mes: r.mes, valor: Number(r[campo] ?? 0) }))
    .filter((r) => r.mes)
    .sort((a, b) => String(a.mes).localeCompare(String(b.mes)))
    .map((r) => ({ ...r, parcial: String(r.mes).slice(0, 10) === cm }));
};

// Horizonte vem rotulado "1 · até 30 dias": ordeno pelo prefixo numérico e
// só mostro o texto. É linha do tempo (30/60/90), não ranking por valor.
const porHorizonte = (linhas, campo) =>
  (linhas ?? [])
    .map((r) => ({
      ord: String(r.horizonte ?? ""),
      rotulo: String(r.horizonte ?? "—").replace(/^\s*\d+\s*·\s*/, ""),
      valor: Number(r[campo] ?? 0),
      parcelas: Number(r.parcelas ?? 0),
    }))
    .sort((a, b) => a.ord.localeCompare(b.ord));

/* ============ PRIMITIVOS ============ */

function Delta({ delta, up, sufixo }) {
  if (delta == null) return <span style={{ fontSize: 12, color: C.faint }}>—</span>;
  const cor = up ? C.up : C.down;
  return (
    <span style={{ fontSize: 12, fontWeight: 800, color: cor }}>
      {up ? "▲" : "▼"} {String(delta).replace(/[+-]/, "")} {sufixo}
    </span>
  );
}

function Spark({ serie, cor }) {
  if (!serie || serie.length < 2) return null;
  const vals = serie.map((s) => s.valor);
  const max = Math.max(...vals), min = Math.min(...vals);
  const r = max - min || 1;
  const step = 52 / (serie.length - 1);
  const pts = serie.map((s, i) => `${i * step},${18 - ((s.valor - min) / r) * 15}`);
  return (
    <svg width="52" height="20" viewBox="0 0 52 20">
      <polyline points={pts.join(" ")} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Kpi({ label, valor, unidade, delta, up, serie, nota, destaque, parcial }) {
  const borda = destaque ? `1px solid ${destaque}44` : `1px solid ${C.cardLine}`;
  return (
    <div style={{ background: C.card, border: borda, borderRadius: 15, padding: 18 }}>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 11 }}>{label}</div>
      <div style={{ fontFamily: GROTESK, fontSize: 26, fontWeight: 700, letterSpacing: "-.5px", color: destaque ?? C.text }}>
        {valor}
        {unidade && <span style={{ fontSize: 15, color: C.muted, fontWeight: 600 }}> {unidade}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <Delta delta={delta} up={up} />
        {serie ? <Spark serie={serie} cor={up ? C.up : C.down} /> : nota && (
          <span style={{ fontSize: 11, color: C.faint }}>{nota}</span>
        )}
      </div>
      {parcial != null && (
        <div style={{ fontSize: 11, color: C.faint, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.hair}` }}>
          Mês em curso: <b style={{ color: C.muted }}>{parcial}</b> (parcial)
        </div>
      )}
    </div>
  );
}

/* Rodapé discreto: quando cada fonte que alimenta o hub foi atualizada.
   Usa o `rotulo` já formatado da view. Neutro quando fresco (hoje/ontem);
   alerta quando velho (ha_dias), com erro/parcial (falha real) ou nunca.
   "Nunca sincronizado" do Salesforce é manual (import de CSV), não falha —
   por isso sai âmbar com nota "manual", nunca vermelho como um erro. */
const FONTES_MANUAIS = new Set(["salesforce"]); // sync registrado à mão

function visualFonte(r) {
  if (r.status === "erro" || r.status === "parcial")
    return { cor: C.down, alerta: true, nota: "falha na última sincronização" };
  if (r.frescor === "nunca")
    return { cor: C.warn, alerta: true, manual: FONTES_MANUAIS.has(r.fonte) };
  if (r.frescor === "ha_dias")
    return { cor: C.warn, alerta: true };
  return { cor: C.up, alerta: false }; // hoje / ontem, ok
}

// Nome de exibição de fonte que o hub cita mas a view ainda não registra.
const NOME_FONTE = { clint: "Clint" };

function RodapeIntegracoes({ fontes }) {
  const st = useIntegracaoStatus();
  const mapa = new Map((st.data ?? []).map((r) => [r.fonte, r]));
  // Fonte pedida que não está na view ainda não foi registrada no controle
  // de sync. Some-la do rodapé esconderia a lacuna — aparece como "não
  // registrado" em âmbar. Hubs cujas fontes existem seguem idênticos.
  const itens = fontes.map((f) => mapa.get(f) ?? {
    fonte: f, nome_exibicao: NOME_FONTE[f] ?? f,
    rotulo: "Não registrado", frescor: "nunca", status: "ok", ausente: true,
  });
  if (!st.data || !itens.length) return null;
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 18px",
      marginTop: 20, paddingTop: 12, borderTop: `1px solid ${C.hair}`,
    }}>
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: C.dim }}>
        Atualização das fontes
      </span>
      {itens.map((r) => {
        const v = visualFonte(r);
        return (
          <span key={r.fonte} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}
            title={r.ultima_sync ? `Última sincronização: ${new Date(r.ultima_sync).toLocaleString("pt-BR")}` : "Sem registro de sincronização"}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: v.cor, flexShrink: 0 }} />
            <span style={{ color: C.muted, fontWeight: 600 }}>{r.nome_exibicao}</span>
            <span style={{ color: v.alerta ? v.cor : C.faint }}>{r.rotulo}</span>
            {v.manual && <span style={{ color: C.faint }}>· atualização manual (CSV)</span>}
            {r.ausente && <span style={{ color: C.faint }}>· integração ainda não registrada</span>}
            {v.nota && <span style={{ color: v.cor }}>· {v.nota}</span>}
          </span>
        );
      })}
    </div>
  );
}

/* Painel. Com `altura`, o cabeçalho fica fixo e só o CORPO rola
   (overflow-y interno) — o card nunca passa da altura, então a página
   não cresce. Sem `altura`, cresce com o conteúdo (comportamento antigo). */
function Bloco({ titulo, canto, children, sem, altura }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16,
      overflow: "hidden", marginBottom: 20,
      display: "flex", flexDirection: "column", minHeight: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: `1px solid ${C.hair}`, flexShrink: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.bright }}>{titulo}</span>
        {canto && <span style={{ fontSize: 11, color: C.faint }}>{canto}</span>}
      </div>
      <div
        className={altura ? "rolagem" : undefined}
        style={{
          padding: sem ? 0 : "16px 20px",
          ...(altura ? { maxHeight: altura, overflowY: "auto" } : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* Popover ancorado — o pai precisa ser position:relative. O backdrop fixo
   captura o clique fora pra fechar. */
function Popover({ aberto, onFechar, children, largura = 150 }) {
  if (!aberto) return null;
  return (
    <>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div className="rolagem" style={{
        position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41,
        background: "#15151a", border: `1px solid ${C.cardLine}`, borderRadius: 10,
        padding: 4, minWidth: largura, maxHeight: 264, overflowY: "auto",
        boxShadow: "0 12px 32px rgba(0,0,0,.5)",
      }}>
        {children}
      </div>
    </>
  );
}

const itemPop = (ativo) => ({
  display: "block", width: "100%", textAlign: "left", padding: "7px 10px",
  borderRadius: 7, border: "none", cursor: "pointer", fontFamily: SANS,
  fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
  background: ativo ? `${C.gold}1F` : "transparent",
  color: ativo ? C.gold : C.muted,
});

/* Ano: dropdown com os anos que têm dado + "Geral" (todo o histórico).
   "Geral" é acumulado: zera o recorte de ano. Só o Hub Loja lê a flag hoje;
   nos demais hubs o recorte vira a base inteira, o que é uma visão válida. */
function SeletorAno() {
  const { ano, setAno, anos, geral, setGeral } = usePeriodo();
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setAberto((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12,
        fontWeight: 700, color: C.gold, background: "rgba(255,255,255,.04)",
        border: `1px solid ${C.cardLine}`, borderRadius: 9, padding: "6px 10px", cursor: "pointer",
      }}>
        {geral ? "Geral" : ano} <ChevronDown size={13} />
      </button>
      <Popover aberto={aberto} onFechar={() => setAberto(false)} largura={110}>
        <button style={itemPop(geral)} onClick={() => { setGeral(true); setAberto(false); }}>Geral</button>
        {anos.map((a) => (
          <button key={a} style={itemPop(!geral && a === ano)} onClick={() => { setAno(a); setAberto(false); }}>{a}</button>
        ))}
      </Popover>
    </div>
  );
}

/* Mês: ‹ Julho 2026 › — setas navegam com virada de ano; o rótulo abre a
   lista pra pular direto. Os limites vêm do dado. */
function SeletorMes() {
  const { ano, mesIdx, irMes, setMesAno, minMes, maxMes, rotulo } = usePeriodo();
  const [aberto, setAberto] = useState(false);

  const vizinho = (delta) => {
    let m = mesIdx + delta, a = ano;
    if (m < 0) { m = 11; a -= 1; }
    if (m > 11) { m = 0; a += 1; }
    return chaveMes(a, m);
  };
  const podeVoltar = vizinho(-1) >= minMes;
  const podeAvancar = vizinho(1) <= maxMes;

  // Todos os meses navegáveis, do mais recente pro mais antigo.
  const lista = useMemo(() => {
    const out = [];
    let a = Number(maxMes.slice(0, 4)), m = Number(maxMes.slice(5, 7)) - 1;
    while (chaveMes(a, m) >= minMes && out.length < 360) {
      out.push({ a, m });
      m -= 1; if (m < 0) { m = 11; a -= 1; }
    }
    return out;
  }, [minMes, maxMes]);

  const seta = (ativo) => ({
    display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 28,
    borderRadius: 7, border: `1px solid ${C.cardLine}`, background: "rgba(255,255,255,.04)",
    color: ativo ? C.muted : C.dim, cursor: ativo ? "pointer" : "default", opacity: ativo ? 1 : 0.45,
  });

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
      <button style={seta(podeVoltar)} disabled={!podeVoltar} onClick={() => irMes(-1)} aria-label="Mês anterior">
        <ChevronLeft size={14} />
      </button>
      <button onClick={() => setAberto((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12,
        fontWeight: 700, color: C.gold, background: "rgba(255,255,255,.04)",
        border: `1px solid ${C.cardLine}`, borderRadius: 9, padding: "6px 10px",
        cursor: "pointer", minWidth: 118, justifyContent: "center",
      }}>
        {rotulo} <ChevronDown size={13} />
      </button>
      <button style={seta(podeAvancar)} disabled={!podeAvancar} onClick={() => irMes(1)} aria-label="Próximo mês">
        <ChevronRight size={14} />
      </button>
      <Popover aberto={aberto} onFechar={() => setAberto(false)} largura={140}>
        {lista.map(({ a, m }) => (
          <button key={chaveMes(a, m)} style={itemPop(a === ano && m === mesIdx)}
            onClick={() => { setMesAno(a, m); setAberto(false); }}>
            {MESES[m]} {a}
          </button>
        ))}
      </Popover>
    </div>
  );
}

/* Seletor de categoria — ao lado dos filtros de período. Só aparece no
   Hub Comercial, único lugar onde a categoria recorta algo. */
function SeletorCategoria() {
  const { categoria, setCategoria, categorias } = useCategoria();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: ".5px" }}>
        Categoria
      </span>
      <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.04)", border: `1px solid ${C.cardLine}`, borderRadius: 10, padding: 3 }}>
        {categorias.map((c) => {
          const ativo = c === categoria;
          return (
            <button key={c} onClick={() => setCategoria(c)} aria-pressed={ativo} style={{
              fontFamily: SANS, fontSize: 11.5, fontWeight: 700, padding: "6px 11px",
              borderRadius: 7, border: "none", cursor: "pointer", whiteSpace: "nowrap",
              background: ativo ? `${C.gold}1F` : "transparent",
              color: ativo ? C.gold : C.muted,
            }}>
              {rotuloCat(c)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Seletor de período — no topo, ao lado do sino. */
function SeletorPeriodo() {
  const { modo, escolherModo } = usePeriodo();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {modo === "ano" && <SeletorAno />}
      {modo === "mes" && <SeletorMes />}
      {modo === "7d" && <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, whiteSpace: "nowrap" }}>Últimos 7 dias</span>}
      {modo === "hoje" && <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, whiteSpace: "nowrap" }}>Hoje</span>}
      <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.04)", border: `1px solid ${C.cardLine}`, borderRadius: 10, padding: 3 }}>
        {PERIODOS.map((p) => {
          const ativo = p.key === modo;
          return (
            <button
              key={p.key}
              onClick={() => escolherModo(p.key)}
              aria-pressed={ativo}
              style={{
                fontFamily: SANS, fontSize: 11.5, fontWeight: 700, padding: "6px 11px",
                borderRadius: 7, border: "none", cursor: "pointer",
                background: ativo ? `${C.gold}1F` : "transparent",
                color: ativo ? C.gold : C.muted,
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Foto da consultora. O PNG já vem circular e com moldura dourada própria,
   então nada de borda/recorte extra — só dimensiona. Se a imagem falhar ou
   não existir, cai nas iniciais em vez de quebrar o card. */
function Avatar({ url, nome, tam = 64 }) {
  const [erro, setErro] = useState(false);
  const iniciais = (nome ?? "").split(/[\s.]+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join("") || "?";
  if (!url || erro) {
    return (
      <div style={{
        width: tam, height: tam, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(150deg,#3a3a40,#1c1c20)",
        border: `1px solid ${C.gold}66`, color: C.gold,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: Math.round(tam * 0.34),
      }}>
        {iniciais}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={nome ?? ""}
      onError={() => setErro(true)}
      style={{ width: tam, height: tam, objectFit: "contain", flexShrink: 0, display: "block" }}
    />
  );
}

/* Alterna a fonte do pódio: recorte do filtro global x hall da fama. */
function ToggleVisao({ valor, onChange }) {
  return (
    <span style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.04)", border: `1px solid ${C.cardLine}`, borderRadius: 9, padding: 2, flexShrink: 0 }}>
      {[{ key: "periodo", label: "Período" }, { key: "geral", label: "Geral" }].map((o) => {
        const ativo = o.key === valor;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} aria-pressed={ativo} style={{
            fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "4px 10px",
            borderRadius: 7, border: "none", cursor: "pointer",
            background: ativo ? `${C.gold}1F` : "transparent",
            color: ativo ? C.gold : C.muted,
          }}>
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/* Card do pódio. O 1º lugar ganha moldura dourada, coroa e número maior —
   a Beatriz está muito à frente e o card precisa dizer isso de relance. */
const nomeConsultoraExibicao = (nome) =>
  /^larissa\s+imaculada\b/i.test(String(nome ?? "")) ? "Larissa Lima" : nome;

function CardPodio({ c, pos }) {
  const primeiro = pos === 1;
  const ex = c.atual === false; // ex-consultor: sem foto, marcado discreto
  return (
    <div style={{
      background: primeiro ? `linear-gradient(150deg, ${C.gold}14, rgba(255,255,255,.02))` : C.card,
      border: `1px solid ${primeiro ? `${C.gold}55` : C.cardLine}`,
      borderRadius: 12, padding: "12px 8px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 5, textAlign: "center",
      opacity: ex ? 0.78 : 1,
    }}>
      {primeiro && <Crown size={13} style={{ color: C.gold }} />}
      <div style={{ position: "relative", lineHeight: 0 }}>
        <Avatar url={ex ? null : c.foto_url} nome={c.consultora} tam={primeiro ? 58 : 46} />
        <span style={{
          position: "absolute", bottom: -2, right: -2, minWidth: 18, height: 18, padding: "0 4px",
          borderRadius: 9, fontSize: 9.5, fontWeight: 800, fontFamily: GROTESK,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: primeiro ? `linear-gradient(150deg, ${C.goldTop}, ${C.goldBase})` : "#22222a",
          color: primeiro ? "#100c04" : C.muted,
          border: `1px solid ${primeiro ? C.goldTop : C.cardLine}`,
        }}>
          {pos}º
        </span>
      </div>
      <div style={{ fontSize: primeiro ? 12.5 : 11.5, fontWeight: 700, color: ex ? C.muted : C.bright, lineHeight: 1.25 }}>
        {nomeConsultoraExibicao(c.consultora)}
      </div>
      {ex && (
        <span style={{
          fontSize: 8.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase",
          color: C.dim, border: `1px solid ${C.cardLine}`, borderRadius: 4, padding: "0 4px",
        }}>
          ex-consultora
        </span>
      )}
      <div style={{
        fontFamily: GROTESK, fontSize: primeiro ? 19 : 16, fontWeight: 700,
        letterSpacing: "-.5px", color: ex ? C.muted : (primeiro ? C.gold : C.text),
      }}>
        {moeda(c.receita)}
      </div>
      {/* `sub` só é usado pelo Sympla (eventos/ingressos). Sem ela, o
          texto original de vendas/ticket segue idêntico. */}
      <div style={{ fontSize: 9.5, color: C.faint, lineHeight: 1.3 }}>
        {c.sub ?? <>{numero(c.vendas)} vendas · ticket {moeda(c.ticket_medio)}</>}
      </div>
    </div>
  );
}

/* Envolve o CardPodio (sem tocar nele) e revela os cursos da consultora.
   O tooltip é `fixed` porque o Bloco tem overflow:hidden e cortaria um
   absolute. Clique também abre/fecha — TV não tem mouse. */
function CardComCursos({ c, pos, cursos }) {
  const [ancora, setAncora] = useState(null);
  const ref = useRef(null);
  const tem = cursos && cursos.length > 0;
  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAncora({ x: r.left + r.width / 2, y: r.bottom + 6 });
  };
  const fechar = () => setAncora(null);
  return (
    <div
      ref={ref}
      style={{ position: "relative", cursor: tem ? "pointer" : "default" }}
      onMouseEnter={tem ? abrir : undefined}
      onMouseLeave={tem ? fechar : undefined}
      onClick={tem ? () => (ancora ? fechar() : abrir()) : undefined}
    >
      <CardPodio c={c} pos={pos} />
      {tem && ancora && (
        <div style={{
          position: "fixed", left: ancora.x, top: ancora.y, transform: "translateX(-50%)",
          zIndex: 60, pointerEvents: "none",
          background: "#15151a", border: `1px solid ${C.cardLine}`, borderRadius: 10,
          padding: "9px 11px", minWidth: 220, maxWidth: 300,
          boxShadow: "0 12px 32px rgba(0,0,0,.55)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.gold, marginBottom: 5 }}>
            Top cursos · {c.consultora}
          </div>
          {cursos.map((cu) => (
            <div key={cu.curso} style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: C.bright, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cu.curso}>
                {cu.curso_curto ?? cu.curso}
              </span>
              <span style={{ fontSize: 9.5, color: C.faint, flexShrink: 0 }}>{numero(cu.vendas)}×</span>
              <span style={{ fontFamily: GROTESK, fontSize: 11.5, fontWeight: 700, color: C.gold, flexShrink: 0 }}>
                {moeda(cu.receita)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Detalhe das vendas verdes de uma consultora, no período. A coluna `formas`
   é o ponto: deixa a classificação AUDITÁVEL (pedido do financeiro). O
   link_salesforce abre a oportunidade em nova aba. Painel lateral (drawer)
   com scroll interno — cabe numa TV sem empurrar o resto. */
function LinhaConsultoraCursos({ c, cursos, max }) {
  const [ancora, setAncora] = useState(null);
  const ref = useRef(null);
  const tem = cursos && cursos.length > 0;
  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAncora({ x: r.left + Math.min(r.width * 0.48, 210), y: r.bottom + 5 });
  };
  const fechar = () => setAncora(null);
  const nome = nomeConsultoraExibicao(c.consultora);
  return (
    <div ref={ref} onMouseEnter={tem ? abrir : undefined} onMouseLeave={tem ? fechar : undefined}
      onClick={tem ? () => (ancora ? fechar() : abrir()) : undefined}
      style={{ display: "grid", gridTemplateColumns: "1fr 105px", gap: 12, alignItems: "center",
        padding: "7px 16px", borderBottom: `1px solid ${C.hair}`, cursor: tem ? "pointer" : "default" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 5, minWidth: 0 }}>
          <span title={c.consultora} style={{ fontSize: 11.5, fontWeight: 600,
            color: c.atual === false ? C.faint : C.bright, fontStyle: c.atual === false ? "italic" : "normal",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nome}
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>
            {numero(c.vendas)} venda{c.vendas === 1 ? "" : "s"}
          </span>
        </div>
        <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
          <div style={{ width: `${(Math.abs(c.receita) / max) * 100}%`, height: "100%", borderRadius: 3,
            background: c.atual === false ? C.faint : `linear-gradient(90deg, ${C.goldBase}, ${C.gold})` }} />
        </div>
      </div>
      <span style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, textAlign: "right",
        color: c.atual === false ? C.faint : C.text }}>{moeda(c.receita)}</span>
      {tem && ancora && (
        <div style={{ position: "fixed", left: ancora.x, top: ancora.y, transform: "translateX(-50%)", zIndex: 60,
          pointerEvents: "none", background: "#15151a", border: `1px solid ${C.cardLine}`, borderRadius: 10,
          padding: "9px 11px", minWidth: 220, maxWidth: 300, boxShadow: "0 12px 32px rgba(0,0,0,.55)" }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.gold, marginBottom: 5 }}>
            Cursos vendidos · {nome}
          </div>
          {cursos.map((cu) => (
            <div key={cu.curso} style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
              <span title={cu.curso} style={{ fontSize: 11, color: C.bright, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cu.curso_curto ?? cu.curso}
              </span>
              <span style={{ fontSize: 9.5, color: C.faint, flexShrink: 0 }}>{numero(cu.vendas)}×</span>
              <span style={{ fontFamily: GROTESK, fontSize: 11.5, fontWeight: 700, color: C.gold, flexShrink: 0 }}>{moeda(cu.receita)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListaConsultorasCursos({ linhas, cursosPorConsultora, top = 4 }) {
  const [aberto, setAberto] = useState(false);
  const max = Math.max(...linhas.map((c) => Math.abs(c.receita)), 1);
  const visiveis = !aberto && linhas.length > top ? linhas.slice(0, top) : linhas;
  return (
    <div>
      {visiveis.map((c) => <LinhaConsultoraCursos key={c.consultor_id ?? c.consultora} c={c} max={max}
        cursos={cursosPorConsultora.get(c.consultora)} />)}
      {linhas.length > top && <VerTodas aberto={aberto} resto={linhas.length - top} onClick={() => setAberto((v) => !v)} />}
    </div>
  );
}

function PainelVerdes({ consultora, rotulo, linhas, carregando, erro, onFechar }) {
  return (
    <>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.55)" }} />
      <div className="rolagem" style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 71, width: "min(560px, 94vw)",
        background: "#101014", borderLeft: `1px solid ${C.cardLine}`,
        boxShadow: "-18px 0 48px rgba(0,0,0,.5)", display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${C.hair}`, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Smile size={15} style={{ color: C.up }} />
              <span style={{ fontSize: 14.5, fontWeight: 800, color: C.bright }}>Vendas verdes · {consultora}</span>
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 3 }}>
              {rotulo} · 100% Pix/transferência/dinheiro · {linhas.length} venda{linhas.length === 1 ? "" : "s"}
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{
            width: 30, height: 30, borderRadius: 8, flexShrink: 0, cursor: "pointer",
            background: "rgba(255,255,255,.05)", border: `1px solid ${C.cardLine}`, color: C.muted,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <Estado
            carregando={carregando}
            erro={erro}
            vazio={!linhas.length}
            vazioTitulo="Sem vendas verdes no período"
            vazioDica={`Nenhuma venda 100% Pix/transferência/dinheiro de ${consultora} em ${rotulo}.`}
          >
            {linhas.map((v, i) => (
              <div key={i} style={{ padding: "12px 20px", borderBottom: `1px solid ${C.hair}` }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.cliente || "—"}
                  </span>
                  <span style={{ fontFamily: GROTESK, fontSize: 14, fontWeight: 700, color: C.up, flexShrink: 0 }}>
                    {moeda(v.valor)}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{v.curso || "—"}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10.5, color: C.faint }}>{v.data ? String(v.data).slice(0, 10) : "—"}</span>
                  {/* `formas` é o que torna a classificação auditável. */}
                  {v.formas && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: C.up, background: `${C.up}18`,
                      border: `1px solid ${C.up}44`, borderRadius: 5, padding: "1px 7px",
                    }}>
                      {v.formas}
                    </span>
                  )}
                  {v.link_salesforce && (
                    <a href={v.link_salesforce} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: C.gold, textDecoration: "none", marginLeft: "auto" }}>
                      Salesforce <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </Estado>
        </div>
      </div>
    </>
  );
}

/* Linha do placar. As verdes rendem brinde a cada 10; a barra mede só o
   progresso pro próximo. Vermelha é contador puro — sem punição visível. */
function LinhaPlacar({ p, onVerdes }) {
  const MAX_CHIPS = 5;
  const contagem = (Icone, cor, n, titulo, onClick) => {
    const clicavel = onClick && n > 0;
    return (
      <span
        onClick={clicavel ? onClick : undefined}
        title={clicavel ? "Ver as vendas verdes (auditável)" : titulo}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          cursor: clicavel ? "pointer" : "default",
          borderBottom: clicavel ? `1px dotted ${cor}` : "1px dotted transparent",
        }}
      >
        <Icone size={13} style={{ color: cor }} />
        <b style={{ fontFamily: GROTESK, fontSize: 13, color: n > 0 ? C.text : C.dim }}>{n}</b>
      </span>
    );
  };

  return (
    <div style={{ padding: "7px 14px", borderBottom: `1px solid ${C.hair}`, display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar url={p.foto_url} nome={p.consultora} tam={30} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.consultora}
          </span>
          {/* Um chip por presente. O "?" é o prêmio — brinde surpresa. */}
          {p.presentes > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
              {Array.from({ length: Math.min(p.presentes, MAX_CHIPS) }).map((_, i) => (
                <span key={i} title="Brinde surpresa" style={{
                  display: "flex", alignItems: "center", gap: 2, fontSize: 10, fontWeight: 800,
                  color: "#100c04", background: `linear-gradient(150deg, ${C.goldTop}, ${C.goldBase})`,
                  border: `1px solid ${C.goldTop}`, padding: "1px 5px", borderRadius: 5, flexShrink: 0,
                }}>
                  <Gift size={11} /> ?
                </span>
              ))}
              {p.presentes > MAX_CHIPS && (
                <b style={{ fontSize: 10.5, fontWeight: 800, color: C.gold }}>×{p.presentes}</b>
              )}
            </span>
          )}
        </div>

        <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden", marginTop: 6, maxWidth: 300 }}>
          <div style={{
            width: `${((p.verdes % 10) / 10) * 100}%`, height: "100%", borderRadius: 3,
            background: `linear-gradient(90deg, ${C.up}99, ${C.up})`,
          }} />
        </div>
        <div style={{ fontSize: 10, color: C.faint, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
          faltam <b style={{ color: C.muted }}>{p.faltam}</b> pro próximo
          <Gift size={10} style={{ color: C.gold }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {contagem(Smile, C.up, p.verdes, "Verde — venda 100% Pix, transferência ou dinheiro", onVerdes)}
        {contagem(Meh, C.warn, p.amarelas, "Amarela — venda mista (parte Pix, parte cartão)")}
        {contagem(Frown, C.down, p.vermelhas, "Vermelha — venda 100% Stone")}
      </div>
    </div>
  );
}

/* Título de seção — separa blocos temáticos dentro de um hub. */
function SecaoTitulo({ titulo, canto }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "26px 0 14px" }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, color: C.bright }}>{titulo}</h2>
      {canto && <span style={{ fontSize: 11.5, color: C.faint, textAlign: "right" }}>{canto}</span>}
    </div>
  );
}

/* Alterna entre o top-N e a lista inteira. Ranking longo empurraria os
   outros cards pra fora da primeira tela — a Dulce vê os 5 que importam
   e abre o resto só se precisar. */
function VerTodas({ aberto, resto, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "9px 20px", textAlign: "center", background: "none",
      border: "none", borderBottom: `1px solid ${C.hair}`, cursor: "pointer",
      fontFamily: SANS, fontSize: 11.5, fontWeight: 700, letterSpacing: ".3px", color: C.gold,
    }}>
      {aberto ? "Ver menos ▴" : `Ver todas · +${resto} ▾`}
    </button>
  );
}

/* Lista densa: rótulo, valor, variação. É o formato que a Dulce
   consegue ler de relance sem interpretar gráfico. Com `top`, mostra
   só os N primeiros e esconde o resto atrás do "ver todas". */
function Lista({ linhas, formatar = moeda, total, top }) {
  const [aberto, setAberto] = useState(false);
  const max = Math.max(...linhas.map((l) => Math.abs(l.valor)), 1);
  const limitar = top && !aberto && linhas.length > top;
  const visiveis = limitar ? linhas.slice(0, top) : linhas;
  return (
    <div>
      {visiveis.map((l) => (
        <div key={l.rotulo} style={{
          display: "grid", gridTemplateColumns: "1fr 120px", gap: 14, alignItems: "center",
          padding: "8px 20px", borderBottom: `1px solid ${C.hair}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, marginBottom: 5,
              color: l.orfa ? C.faint : C.bright,
              fontStyle: l.orfa ? "italic" : "normal",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={l.rotulo}>
              {l.rotulo}
            </div>
            <div style={{ height: 3, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div style={{
                width: `${(Math.abs(l.valor) / max) * 100}%`, height: "100%", borderRadius: 3,
                background: l.orfa ? C.faint : `linear-gradient(90deg, ${C.goldBase}, ${C.gold})`,
              }} />
            </div>
          </div>
          <span style={{
            fontFamily: GROTESK, fontSize: 14.5, fontWeight: 700, textAlign: "right",
            color: l.orfa ? C.faint : C.text,
          }}>
            {formatar(l.valor)}
          </span>
        </div>
      ))}
      {top && linhas.length > top && (
        <VerTodas aberto={aberto} resto={linhas.length - top} onClick={() => setAberto((a) => !a)} />
      )}
      {total != null && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 120px", gap: 14,
          padding: "11px 20px", background: "rgba(255,255,255,.02)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.bright }}>Total</span>
          <span style={{ fontFamily: GROTESK, fontSize: 15, fontWeight: 700, textAlign: "right", color: C.gold }}>
            {formatar(total)}
          </span>
        </div>
      )}
    </div>
  );
}

/* Chip de KPI compacto — faixa horizontal do design: ícone + label +
   valor + delta/nota. `hero` deixa o card dourado (o número-âncora). */
function ChipKpi({ Icone, label, valor, unidade, delta, up, nota, hero, compacto, sub, className, deltaBrilha, deltaNota, subCentralizado, deltaAbaixo }) {
  return (
    <div className={className} style={{
      display: "flex", alignItems: "center", gap: compacto ? 9 : 12, minHeight: compacto ? 56 : 78,
      background: "rgba(255,255,255,.03)",
      border: `1px solid ${hero ? `${C.gold}38` : C.cardLine}`,
      borderRadius: compacto ? 10 : 13, padding: compacto ? "8px 11px" : "13px 15px",
    }}>
      <span style={{
        width: compacto ? 25 : 30, height: compacto ? 25 : 30, flexShrink: 0, borderRadius: compacto ? 7 : 8,
        background: hero ? `${C.gold}24` : "rgba(255,255,255,.05)",
        color: hero ? C.gold : "#C9C9CE",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icone size={compacto ? 13 : 15} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: compacto ? 10 : 11, color: C.muted, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: compacto ? 5 : 7, flexWrap: "wrap" }}>
          <span style={{ fontFamily: GROTESK, fontSize: compacto ? 18 : 22, fontWeight: 700, letterSpacing: "-.5px", color: hero ? C.gold : C.text }}>
            {valor}
            {unidade && <span style={{ fontSize: compacto ? 11 : 12, color: C.muted, fontWeight: 600 }}> {unidade}</span>}
          </span>
          {delta != null
            ? <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5,
                whiteSpace: deltaAbaixo ? "normal" : "nowrap",
                flexBasis: deltaAbaixo ? "100%" : undefined,
                flexWrap: deltaAbaixo ? "wrap" : "nowrap",
                lineHeight: deltaAbaixo ? 1.2 : undefined }}>
              <span className={deltaBrilha ? (up ? "deltaBrilhaUp" : "deltaBrilhaDown") : undefined}
                style={{ fontSize: compacto ? 10 : 11, fontWeight: 800, color: up ? C.up : C.down }}>
                {up ? "▲" : "▼"} {String(delta).replace(/[+-]/, "")}
              </span>
              {deltaNota && <span style={{ fontSize: compacto ? 9.5 : 10.5, fontWeight: 600, color: C.faint }}>{deltaNota}</span>}
              </span>
            : nota && <span style={{ fontSize: compacto ? 9.5 : 11, fontWeight: 800, color: C.muted }}>{nota}</span>}
        </div>
        {/* Linha secundária opcional (ex.: líquido abaixo do bruto). Sem
            `sub`, o chip renderiza igual a antes. */}
        {sub && <div style={{ fontSize: subCentralizado ? 8.5 : (compacto ? 9.5 : 10.5), color: C.faint, marginTop: 1,
          whiteSpace: "nowrap",
          overflow: subCentralizado ? "visible" : "hidden",
          textOverflow: subCentralizado ? "clip" : "ellipsis",
          marginLeft: subCentralizado ? -42 : undefined,
          width: subCentralizado ? "calc(100% + 42px)" : undefined,
          textAlign: subCentralizado ? "center" : "left" }}>{sub}</div>}
      </div>
    </div>
  );
}

/* Metas mensais totais do Comercial. A mínima é sempre 90% da básica;
   metas individuais das consultoras não entram neste KPI. */
const METAS_COMERCIAL = {
  "2025-01": { basica: 880000, master: 1100000 },
  "2025-03": { basica: 890171.25, master: 1186895 },
  "2025-04": { basica: 960000, master: 1250000 },
  "2025-05": { basica: 900000, master: 1200000 },
  "2025-06": { basica: 960000, master: 1200000 },
  "2025-07": { basica: 920000, master: 1150000 },
  "2025-08": { basica: 1400000, master: 1798198 },
  "2025-10": { basica: 960000, master: 1200000 },
  "2025-11": { basica: 815000, master: 1000000 },
  "2025-12": { basica: 815000, master: 1000000 },
  "2026-01": { basica: 815000, master: 1000000 },
  "2026-02": { basica: 708800, master: 886000 },
  "2026-03": { basica: 800000, master: 1000000 },
  "2026-04": { basica: 800000, master: 1000000 },
  "2026-05": { basica: 1049000, master: 1500000 },
  "2026-06": { basica: 708800, master: 886000 },
  "2026-07": { basica: 724500, master: 896000 },
  "2026-08": { basica: 810365.4, master: 1013000 },
};

class LimiteErroMeta extends Component {
  constructor(props) {
    super(props);
    this.state = { falhou: false, mensagem: "" };
  }
  static getDerivedStateFromError(erro) {
    return { falhou: true, mensagem: String(erro?.message ?? erro ?? "erro desconhecido") };
  }
  componentDidCatch(erro) { console.error("Falha no velocímetro da meta comercial", erro); }
  render() {
    return this.state.falhou
      ? <ChipKpi compacto className="kpiTopoComercial" Icone={Gauge} label="% da meta" valor="—" nota="meta temporariamente indisponível" />
      : this.props.children;
  }
}

function VelocimetroMeta({ realizado, meta, disponivel = true }) {
  if (!disponivel || !meta) {
    return <ChipKpi compacto className="kpiTopoComercial" Icone={Gauge} label="% da meta" valor="—"
      nota={!disponivel ? "disponível no Geral · Mês" : "meta não cadastrada"} />;
  }

  const valorRealizado = Number(realizado);
  const basica = Number(meta.basica);
  const master = Number(meta.master);
  if (![valorRealizado, basica, master].every(Number.isFinite) || basica <= 0 || master <= 0) {
    return <ChipKpi compacto className="kpiTopoComercial" Icone={Gauge} label="% da meta" valor="—" nota="dados da meta inválidos" />;
  }

  const minima = basica * 0.9;
  const alvo = valorRealizado < minima
    ? { nome: "mínima", valor: minima }
    : valorRealizado < basica
      ? { nome: "básica", valor: basica }
      : { nome: "master", valor: master };
  const percentual = (valorRealizado / alvo.valor) * 100;
  const ponteiro = Math.max(0, Math.min(percentual, 100));
  const angulo = -180 + ponteiro * 1.8;
  const cor = percentual >= 100 ? C.up : percentual >= 75 ? "#B9D532" : percentual >= 45 ? "#F0B84B" : C.down;
  const diferenca = Math.max(alvo.valor - valorRealizado, 0);
  const mensagem = valorRealizado >= master
    ? `Master superada em ${moeda(valorRealizado - master)}`
    : `Faltam ${moeda(diferenca)} para a ${alvo.nome}`;

  return (
    <div className="kpiTopoComercial" title={`${moeda(valorRealizado)} de ${moeda(alvo.valor)} · meta ${alvo.nome}`} style={{
      minHeight: 72, padding: "7px 10px 6px", borderRadius: 10,
      background: "rgba(255,255,255,.03)", border: `1px solid ${C.cardLine}`,
      display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0,
      "--cor-meta": cor, animation: "metaBrilho 2.4s ease-in-out infinite",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.muted, fontWeight: 700 }}>
        <Gauge size={13} /> % da meta · {alvo.nome}
      </div>
      <div style={{ position: "relative", width: 120, height: 39, overflow: "hidden", margin: "-1px auto 0" }}>
        <div aria-hidden="true" style={{
          position: "absolute", width: 120, height: 120, left: 0, top: 0, borderRadius: "50%",
          background: "conic-gradient(from 270deg, #E0565B 0deg, #F0B84B 85deg, #B9D532 135deg, #39B97A 180deg, transparent 180deg)",
        }} />
        <div style={{ position: "absolute", width: 92, height: 92, left: 14, top: 14, borderRadius: "50%", background: C.void }} />
        <div style={{
          position: "absolute", width: 39, height: 8, left: 60, top: 34,
          background: "#D9DEE1", clipPath: "polygon(0 8%, 100% 40%, 100% 60%, 0 92%)",
          transformOrigin: "0 50%", "--angulo-meta": `${angulo}deg`,
          animation: "metaPonteiro 1s cubic-bezier(.2,.8,.25,1) both",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,.65))",
        }} />
        <div style={{
          position: "absolute", width: 14, height: 14, left: 53, top: 31, borderRadius: "50%",
          background: "#D9DEE1", border: `2px solid ${C.void}`, boxShadow: "0 1px 3px rgba(0,0,0,.7)",
        }}>
          <span style={{
            position: "absolute", width: 4, height: 4, left: 3, top: 3, borderRadius: "50%", background: C.void,
          }} />
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: -1, textAlign: "center" }}>
          <span style={{ fontFamily: GROTESK, fontSize: 18, lineHeight: 1, fontWeight: 800, color: cor }}>
            {percentual.toFixed(1).replace(".", ",")}%
          </span>
        </div>
      </div>
      <div style={{ fontSize: 9, color: valorRealizado >= master ? C.up : C.muted, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {mensagem}
      </div>
    </div>
  );
}

/* Donut SVG + legenda. `segmentos`: [{rotulo, valor, cor}]. As % são
   calculadas do total real — nada chumbado. */
function Donut({ segmentos, size = 132, centroValor, centroLabel, centroCor, centroSize = 27 }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const stroke = 15, r = size / 2 - stroke / 2 - 1, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flex: 1, minWidth: 0 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={stroke} />
          {total > 0 && segmentos.map((s, i) => {
            const dash = (s.valor / total) * circ;
            const c = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.cor}
              strokeWidth={stroke} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-acc} />;
            acc += dash;
            return c;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 12px" }}>
          <div style={{ fontFamily: GROTESK, fontSize: centroSize, fontWeight: 700, color: centroCor ?? C.gold, lineHeight: 1, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{centroValor}</div>
          <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, marginTop: 3, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{centroLabel}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, minWidth: 0 }}>
        {segmentos.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.cor, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: "#C9C9CE", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.rotulo}</span>
            <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: C.text }}>{total > 0 ? Math.round((s.valor / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Receita por categoria — barras horizontais do design. Ranqueada pela
   receita da UNIDADE (o que fica na Febracis), nunca pelo bruto. No
   Coaching o bruto se divide 50/50: a metade da unidade é sólida, a do
   coach é hachurada (aparece, mas não conta como receita da casa).
   "Sem vínculo" fica por último, cinza — é cobertura, não produto. */
function BarrasCategoria({ reais, orfas, semVinc, cobertura, detalhesPorCategoria = new Map() }) {
  const [detalheAberto, setDetalheAberto] = useState(null);
  const max = Math.max(...reais.map((r) => r.unidade), 1);
  const total = [...reais, ...orfas].reduce((s, r) => s + Number(r.unidade ?? 0), 0);
  const abrirDetalhe = (e, r, fixo = false) => {
    const detalhes = detalhesPorCategoria.get(r.categoria);
    if (!detalhes?.length || r.orfa) return;
    const box = e.currentTarget.getBoundingClientRect();
    setDetalheAberto({ categoria: r.categoria, x: Math.max(12, Math.min(window.innerWidth - 372, box.right + 10)), y: Math.max(12, box.top - 4), fixo });
  };
  const barra = (r, i) => (
    <div key={r.categoria}
      onMouseEnter={(e) => abrirDetalhe(e, r)}
      onMouseLeave={() => { if (!detalheAberto?.fixo) setDetalheAberto(null); }}
      onClick={(e) => detalheAberto?.fixo && detalheAberto.categoria === r.categoria
        ? setDetalheAberto(null) : abrirDetalhe(e, r, true)}
      style={{ cursor: detalhesPorCategoria.get(r.categoria)?.length && !r.orfa ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: r.orfa ? C.faint : C.bright, fontStyle: r.orfa ? "italic" : "normal", display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.categoria}>{r.categoria}</span>
          {!r.orfa && <span style={{ fontSize: 10.2, color: C.muted, flexShrink: 0 }}>
            {total > 0 ? `${((r.unidade / total) * 100).toFixed(1).replace(".", ",")}% da receita` : "0% da receita"}
          </span>}
          {r.repasse > 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", color: C.warn, background: `${C.warn}24`, border: `1px solid ${C.warn}4d`, padding: "1px 6px", borderRadius: 5, flexShrink: 0 }}>50/50</span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexShrink: 0 }}>
          <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: r.orfa ? C.faint : (i === 0 ? C.gold : C.text) }}>{moeda(r.unidade)}</span>
          {!r.orfa && r.variacaoForca != null && (
            <span title="Variação da participação na receita vs. período anterior"
              style={{ minWidth: 48, textAlign: "right", fontSize: 9.5, fontWeight: 800,
                color: r.variacaoForca >= 0 ? C.up : C.down }}>
              {r.variacaoForca >= 0 ? "▲" : "▼"} {Math.abs(r.variacaoForca).toFixed(1).replace(".", ",")} p.p.
            </span>
          )}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,.05)", overflow: "hidden", display: "flex" }}>
        <div style={{
          width: `${(r.unidade / max) * 100}%`, height: "100%", borderRadius: 5,
          background: r.orfa ? C.faint : (i === 0 ? `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})` : "linear-gradient(90deg, #d9b866, #7d6634)"),
        }} />
        {r.repasse > 0 && (
          <div style={{ width: `${(r.repasse / max) * 100}%`, height: "100%", background: `repeating-linear-gradient(45deg, ${C.gold}38 0 3px, transparent 3px 6px)` }} />
        )}
      </div>
      {r.repasse > 0 && <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>bruto {moeda(r.bruto)} · 50% repassado ao coach ({moeda(r.repasse)})</div>}
      {r.orfa && <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>pagamento sem matrícula casada — não é um produto</div>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
      {reais.map(barra)}
      {orfas.map((o, i) => barra(o, reais.length + i))}
      {detalheAberto && (() => {
        const itens = detalhesPorCategoria.get(detalheAberto.categoria) ?? [];
        return (
          <div className="receitaDetalheScroll" onClick={(e) => e.stopPropagation()} style={{
            position: "fixed", left: detalheAberto.x, top: detalheAberto.y, zIndex: 80,
            width: 360, maxWidth: "calc(100vw - 24px)", maxHeight: 340, overflowY: "auto",
            padding: "12px 18px 12px 13px", background: "#141418", border: `1px solid ${C.gold}55`,
            borderRadius: 11, boxShadow: "inset 0 12px 12px -14px rgba(0,0,0,.9), inset 0 -12px 12px -14px rgba(0,0,0,.9), 0 16px 38px rgba(0,0,0,.62)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.gold, textTransform: "uppercase", letterSpacing: ".45px" }}>{detalheAberto.categoria}</div>
                <div style={{ fontSize: 9.5, color: C.faint, marginTop: 2 }}>participação dentro da categoria</div>
              </div>
              {detalheAberto.fixo && <button onClick={() => setDetalheAberto(null)} style={{ border: "none", background: "none", color: C.muted, cursor: "pointer" }}><X size={14} /></button>}
            </div>
            {itens.map((d) => (
              <div key={d.nomeCompleto} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 9,
                alignItems: "baseline", padding: "7px 0", borderTop: `1px solid ${C.hair}` }}>
                <span title={d.nomeCompleto} style={{ fontSize: 11.5, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.nome}</span>
                <span style={{ fontSize: 10, color: C.muted }}>{numero(d.vendas)}×</span>
                <span style={{ minWidth: 88, textAlign: "right" }}>
                  <b style={{ display: "block", fontFamily: GROTESK, fontSize: 11.5, color: C.text }}>{moeda(d.unidade)}</b>
                  <small style={{ fontSize: 9.5, color: C.gold }}>{d.pct.toFixed(1).replace(".", ",")}%</small>
                </span>
              </div>
            ))}
            {!detalheAberto.fixo && <div style={{ fontSize: 9, color: C.faint, marginTop: 7, textAlign: "center" }}>clique na categoria para manter aberto</div>}
          </div>
        );
      })()}
      <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: `1px solid ${C.hair}` }}>
        <AlertTriangle size={12} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
          Ranqueado pela receita da unidade — o que fica na Febracis, não o bruto.
          {semVinc > 0 && <> “Sem vínculo” ({moeda(semVinc)}) fora do ranking de produtos.</>}
          {cobertura != null && <> Cobertura: {cobertura.toFixed(0)}% da receita com categoria identificada.</>}
        </span>
      </div>
    </div>
  );
}

/* Evolução mensal — linha simples do design. Escala uniforme (viewBox em
   px reais, sem preserveAspectRatio="none", senão os marcadores viram
   elipses e a linha esmaga). O mês corrente é parcial: sai tracejado e o
   domínio do eixo Y IGNORA ele — poucos dias de receita não podem
   comprimir a escala dos meses fechados. */
/* `formatar` existe porque nem toda série é dinheiro grande: custo por lead
   vive na casa dos centavos e o `moeda` compacto arredondaria R$ 2,01 pra
   R$ 2. Sem o prop, o comportamento é o de antes. */
/* Props opt-in (todas com default que PRESERVA o comportamento antigo, então
   Financeiro e Marketing seguem idênticos):
   - `rotularVar=false`  esconde os ▲%/▼% mês a mês (poluíam o gráfico).
   - `soDestaques=true`  rotula só máximo, mínimo e mês atual, não todos.
   - `yRedondo=true`     eixo Y com poucos marcadores arredondados (R$0/35mil/70mil).
   - `meta` array paralelo a `serie` = linha de referência (meta mínima do mês). */
const ARRED_META = "#6BA8E5"; // linha de meta: azul discreto, distinto do dourado da receita
function LinhaEvolucao({ serie, cor = C.gold, idGrad = "fillEvol", inverso = false, formatar = moeda, mostrarNota = true, rotularParcial = true, meta = null, metaLabel = "meta", rotularVar = true, soDestaques = false, yRedondo = false, interativo = false }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (serie.length < 2) return null;
  const W = 720, H = 228, padL = 54, padR = 14, padT = 44, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB, plotBottom = padT + plotH;

  const temMeta = Array.isArray(meta) && meta.some((v) => v != null);
  const metaVals = temMeta ? meta.filter((v) => v != null) : [];

  // Domínio: meses FECHADOS + a linha de meta (se houver). Com `yRedondo`,
  // arredonda o topo pra cima (68k → 70k) e ancora em 0, pra os marcadores
  // do eixo saírem redondos.
  const fechados = serie.filter((s) => !s.parcial).map((s) => s.valor);
  const dom = [...(fechados.length ? fechados : serie.map((s) => s.valor)), ...metaVals];
  let vMax = Math.max(...dom), vMin = Math.min(...dom);
  if (vMax === vMin) { vMax = vMax || 1; vMin = 0; }
  if (yRedondo) {
    vMin = 0;
    const pot = Math.pow(10, Math.floor(Math.log10(vMax || 1)));
    vMax = Math.ceil((vMax || 1) / pot) * pot;
  } else {
    const folga = (vMax - vMin) * 0.08;
    vMax += folga; vMin = Math.max(0, vMin - folga);
  }

  const n = serie.length;
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const y = (v) => Math.max(padT, Math.min(plotBottom, plotBottom - ((v - vMin) / (vMax - vMin || 1)) * plotH));
  const pts = serie.map((s, i) => [x(i), y(s.valor)]);

  const parcialIdx = serie.findIndex((s) => s.parcial);
  const temParcial = parcialIdx > 0;

  // Linha em SEGMENTOS por estilo: 'parcial' (entra no mês em curso, tracejado
  // leve), 'prov' (ponto com `provisorio` — ex.: fonte planilha 2022-24,
  // tracejado) e 'solido' (o resto). Consecutivos do mesmo estilo viram uma
  // polyline. Sem nenhum `provisorio` nem parcial, vira uma única linha sólida
  // — comportamento idêntico ao de antes (Financeiro/Marketing intactos).
  const segEstiloDe = (i) => {
    if (serie[i + 1].parcial) return "parcial";
    if (serie[i].provisorio || serie[i + 1].provisorio) return "prov";
    return "solido";
  };
  const segmentos = [];
  for (let i = 0; i < n - 1; i++) {
    const e = segEstiloDe(i);
    const ult = segmentos.at(-1);
    if (ult && ult.estilo === e) ult.pts.push(pts[i + 1]);
    else segmentos.push({ estilo: e, pts: [pts[i], pts[i + 1]] });
  }
  // Área só sob os pontos SÓLIDOS (fechados e não-provisórios) — bloco contíguo.
  const solidoIdx = serie.map((s, i) => i).filter((i) => !serie[i].provisorio && !serie[i].parcial);
  const areaPts = solidoIdx.map((i) => pts[i]);
  const area = areaPts.length > 1
    ? `M ${areaPts.map((p) => p.join(",")).join(" L ")} L ${areaPts.at(-1)[0]},${plotBottom} L ${areaPts[0][0]},${plotBottom} Z`
    : "";

  // Linha de meta: segmentos contíguos de meses com meta definida (não liga
  // por cima de buracos, senão inventaria meta onde não há).
  const metaSegs = [];
  if (temMeta) {
    let run = [];
    serie.forEach((s, i) => {
      if (meta[i] != null) run.push([x(i), y(meta[i])]);
      else { if (run.length > 1) metaSegs.push(run); run = []; }
    });
    if (run.length > 1) metaSegs.push(run);
  }

  const yticks = [vMin, (vMin + vMax) / 2, vMax];
  const alvo = 7, passo = Math.max(1, Math.round((n - 1) / (alvo - 1)));
  const xticks = [];
  for (let i = 0; i < n; i += passo) xticks.push(i);
  if (xticks.at(-1) !== n - 1) xticks.push(n - 1);
  const mesAno = (iso) => {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") + "/" + String(d.getFullYear()).slice(2);
  };
  const hover = hoverIdx != null ? serie[hoverIdx] : null;
  const hoverPrev = hoverIdx > 0 ? serie[hoverIdx - 1]?.valor : null;
  const hoverDelta = hoverPrev > 0 ? ((hover.valor - hoverPrev) / hoverPrev) * 100 : null;
  const tooltipW = 142;
  const tooltipX = hoverIdx == null ? 0 : Math.max(padL, Math.min(W - padR - tooltipW, x(hoverIdx) - tooltipW / 2));

  // Quais pontos ganham rótulo de valor. `soDestaques`: só máximo, mínimo
  // (entre meses fechados) e o mês atual — em vez de um rótulo em cada tick.
  const fechadosI = serie.map((s, i) => i).filter((i) => !serie[i].parcial);
  const iMax = fechadosI.reduce((b, i) => serie[i].valor > serie[b].valor ? i : b, fechadosI[0] ?? 0);
  const iMin = fechadosI.reduce((b, i) => serie[i].valor < serie[b].valor ? i : b, fechadosI[0] ?? 0);
  const rotulados = soDestaques
    ? [...new Set([iMax, iMin, ...(temParcial ? [parcialIdx] : [])])]
    : xticks;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => interativo && setHoverIdx(null)}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}>
        <defs>
          <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={cor} stopOpacity="0.16" />
            <stop offset="1" stopColor={cor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yticks.map((v, i) => {
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,.06)" strokeWidth="1" />
              <text x={padL - 9} y={yy + 3.5} fontSize="11" textAnchor="end" fill={C.faint} fontFamily={SANS}>{formatar(v)}</text>
            </g>
          );
        })}
        {area && <path d={area} fill={`url(#${idGrad})`} />}
        {/* Meta: linha de referência azul tracejada, distinta da receita. */}
        {metaSegs.map((seg, i) => (
          <polyline key={"meta" + i} points={seg.map((p) => p.join(",")).join(" ")} fill="none"
            stroke={ARRED_META} strokeWidth="1.4" strokeDasharray="5 4" strokeLinecap="round" opacity="0.85" />
        ))}
        {/* Linha da receita, em segmentos: sólido = consolidado; tracejado =
            planilha (provisório) ou mês em curso. */}
        {segmentos.map((s, i) => (
          <polyline key={"seg" + i} points={s.pts.map((p) => p.join(",")).join(" ")} fill="none"
            stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            strokeDasharray={s.estilo === "solido" ? undefined : "5 4"}
            opacity={s.estilo === "parcial" ? 0.6 : s.estilo === "prov" ? 0.85 : 1} />
        ))}
        {/* pontinho nos meses rotulados + o ponto parcial destacado (vazado) */}
        {xticks.map((i) => serie[i].parcial ? null : (
          <circle key={"d" + i} cx={pts[i][0]} cy={pts[i][1]} r="2.4" fill={cor} />
        ))}
        {temParcial && <circle cx={pts[parcialIdx][0]} cy={pts[parcialIdx][1]} r="3.5" fill={C.void} stroke={cor} strokeWidth="1.6" />}
        {/* rótulos de dados. Variação (▲%) só com rotularVar; "parcial" só com
            rotularParcial; o valor sempre. */}
        {rotulados.map((i) => {
          const [lx, ly] = pts[i];
          const val = serie[i].valor;
          const prev = serie[i - 1]?.valor;
          const d = prev ? ((val - prev) / prev) * 100 : null;
          const parc = serie[i].parcial;
          const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          const baseY = Math.max(26, ly - 12);
          return (
            <g key={"lbl" + i}>
              {parc && rotularParcial && (
                <text x={lx} y={baseY - 13} fontSize="10" fontWeight="700" textAnchor={anchor} fill={C.faint} fontFamily={SANS}>parcial</text>
              )}
              {rotularVar && !parc && d != null && (
                <text x={lx} y={baseY - 13} fontSize="10.5" fontWeight="800" textAnchor={anchor} fill={(inverso ? d <= 0 : d >= 0) ? C.up : C.down} fontFamily={SANS}>
                  {d >= 0 ? "▲" : "▼"} {Math.abs(d).toFixed(0)}%
                </text>
              )}
              <text x={lx} y={baseY} fontSize="11.5" fontWeight="700" textAnchor={anchor} fill={parc ? C.faint : C.bright} fontFamily={GROTESK}>{formatar(val)}</text>
            </g>
          );
        })}
        {xticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} fontSize="11" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fill={C.faint} fontFamily={SANS}>
            {mesAno(serie[i].mes)}
          </text>
        ))}
        {interativo && hover && (
          <g pointerEvents="none">
            <line x1={x(hoverIdx)} y1={padT} x2={x(hoverIdx)} y2={plotBottom}
              stroke={cor} strokeWidth="1" strokeDasharray="3 4" opacity=".45" />
            <circle cx={pts[hoverIdx][0]} cy={pts[hoverIdx][1]} r="5.5" fill={C.void} stroke={cor} strokeWidth="2.5" />
            <rect x={tooltipX} y="4" width={tooltipW} height="36" rx="7"
              fill="#17171b" stroke={`${cor}66`} strokeWidth="1" />
            <text x={tooltipX + 9} y="18" fontSize="10" fontWeight="700" fill={C.muted} fontFamily={SANS}>
              {mesAno(hover.mes)}{hover.parcial ? " · parcial" : ""}
            </text>
            <text x={tooltipX + 9} y="32" fontSize="11.5" fontWeight="800" fill={C.bright} fontFamily={GROTESK}>
              {formatar(hover.valor)}
            </text>
            {hoverDelta != null && (
              <text x={tooltipX + tooltipW - 9} y="32" fontSize="10.5" fontWeight="800" textAnchor="end"
                fill={(inverso ? hoverDelta <= 0 : hoverDelta >= 0) ? C.up : C.down} fontFamily={SANS}>
                {hoverDelta >= 0 ? "▲" : "▼"} {Math.abs(hoverDelta).toFixed(0)}%
              </text>
            )}
          </g>
        )}
        {interativo && serie.map((_, i) => {
          const esquerda = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
          const direita = i === n - 1 ? W - padR : (x(i) + x(i + 1)) / 2;
          return <rect key={`hit-${i}`} x={esquerda} y={padT} width={direita - esquerda} height={plotH}
            fill="transparent" style={{ cursor: "crosshair" }} onMouseEnter={() => setHoverIdx(i)} />;
        })}
      </svg>
      {temMeta && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.faint, marginTop: 4 }}>
          <span style={{ width: 16, height: 0, borderTop: `1.4px dashed ${ARRED_META}`, flexShrink: 0 }} /> {metaLabel}
        </div>
      )}
      {mostrarNota && (
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>
          Último ponto = mês em curso (parcial), não comparável a mês fechado. Escala do eixo Y calculada só sobre meses fechados.
        </div>
      )}
    </>
  );
}

// Rótulo curto de barra: "2,1 mi" / "550 mil" — adapta à ordem de grandeza.
const compacto = (v) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v ?? 0);
const mesCurto = (ym, comAno = false) => {
  const chave = String(ym ?? "").slice(0, 7);
  const d = new Date(`${chave}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return chave || "—";
  const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const rotulo = mes.charAt(0).toUpperCase() + mes.slice(1);
  return comAno ? `${rotulo}/${String(d.getFullYear()).slice(2)}` : rotulo;
};
const ordenarMeses = (serie) => [...(serie ?? [])]
  .sort((a, b) => String(a.mes ?? "").slice(0, 7).localeCompare(String(b.mes ?? "").slice(0, 7)));
const AZUL_ANTERIOR = "#6BA8E5";
const COR_VARIACAO_ALTA = "#B7F34A";
const COR_VARIACAO_QUEDA = "#FF6B5F";

/* Evolução do faturamento: barras do período + linha do MESMO PERÍODO do
   ano anterior. A linha é comparação histórica, não meta — não existe meta
   no banco, e pintar uma referência como meta seria inventar cobrança. */
function BarrasEvolucao({ serie, anoAnterior, onSelecionarMes }) {
  const [detalheIdx, setDetalheIdx] = useState(null);
  if (!serie.length) return null;
  const W = 720, H = 250, padL = 10, padR = 10, padT = 34, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB, base = padT + plotH;
  const max = Math.max(...serie.flatMap((s) => [s.valor, s.anterior]), 1);
  const n = serie.length, slot = plotW / n, bw = Math.min(38, slot * 0.58);
  const cx = (i) => padL + slot * i + slot / 2;
  const y = (v) => base - (v / max) * plotH;
  const ptsAnt = serie.map((s, i) => [cx(i), y(s.anterior)]);
  const temAnterior = serie.some((s) => s.anterior > 0);

  return (
    <>
      <div style={{ position: "relative" }} onMouseLeave={() => setDetalheIdx(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <linearGradient id="gradBarEvol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.goldTop} />
            <stop offset="1" stopColor={C.goldBase} />
          </linearGradient>
          <pattern id="hachBarEvol" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.gold} strokeWidth="3" opacity="0.4" />
          </pattern>
        </defs>

        {serie.map((s, i) => (
          <g key={s.mes}>
            <rect
              x={cx(i) - bw / 2} y={y(s.valor)} width={bw} height={Math.max(0, base - y(s.valor))} rx="3"
              fill={s.parcial ? "url(#hachBarEvol)" : "url(#gradBarEvol)"}
              stroke={s.parcial ? C.gold : "none"}
              strokeDasharray={s.parcial ? "4 3" : undefined}
              strokeWidth={s.parcial ? 1 : 0}
            />
          </g>
        ))}

        {temAnterior && (
          <>
            <polyline points={ptsAnt.map((p) => p.join(",")).join(" ")} fill="none"
              stroke={AZUL_ANTERIOR} strokeWidth="1.6" strokeDasharray="5 4" strokeLinecap="round" />
            {ptsAnt.map(([x0, y0], i) => {
              const anterior = Number(serie[i].anterior ?? 0);
              if (anterior <= 0) return null;
              const pct = ((Number(serie[i].valor ?? 0) - anterior) / anterior) * 100;
              const subiu = pct > 0, caiu = pct < 0;
              const cor = subiu ? COR_VARIACAO_ALTA : caiu ? COR_VARIACAO_QUEDA : C.faint;
              // O selo respeita uma distância mínima do valor monetário.
              const valorY = y(Number(serie[i].valor ?? 0)) - 6;
              const acima = valorY - 27;
              const abaixo = valorY + 27;
              const cabeAcima = acima - 8 >= 2;
              const cabeAbaixo = abaixo + 8 <= base - 2;
              const cy = cabeAcima && (!cabeAbaixo || Math.abs(acima - y0) >= Math.abs(abaixo - y0))
                ? acima
                : Math.min(base - 10, abaixo);
              const texto = `${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
              const largura = Math.max(42, 25 + texto.length * 5.5);
              const bx = Math.max(2, Math.min(W - largura - 2, x0 - largura / 2));
              const by = cy - 8;
              return (
                <g key={serie[i].mes}>
                  <circle cx={x0} cy={y0} r="2" fill={AZUL_ANTERIOR} />
                  <rect x={bx} y={by} width={largura} height="16" rx="5"
                    fill="#111217" fillOpacity="0.96" stroke={cor} strokeWidth="1" />
                  {subiu
                    ? <polygon points={`${bx + 6},${cy + 3} ${bx + 14},${cy + 3} ${bx + 10},${cy - 4}`} fill={cor} />
                    : caiu
                      ? <polygon points={`${bx + 6},${cy - 4} ${bx + 14},${cy - 4} ${bx + 10},${cy + 3}`} fill={cor} />
                      : <rect x={bx + 6} y={cy - 1} width="8" height="2" fill={cor} />}
                  <text x={bx + 18} y={cy + 3} fontSize="9.5" fontWeight="900" fill={cor} fontFamily={GROTESK}>
                    {texto}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {/* Valores são a última camada de dados: nenhuma linha pode cruzá-los. */}
        {serie.map((s, i) => (
          <text key={`valor-${s.mes}`} x={cx(i)} y={y(s.valor) - 6} fontSize="10" fontWeight="700" textAnchor="middle"
            fill={s.parcial ? C.faint : C.bright} fontFamily={GROTESK}
            stroke={C.void} strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">
            {compacto(s.valor)}
          </text>
        ))}

        {serie.map((s, i) => (
          <text key={s.mes} x={cx(i)} y={H - 9} fontSize="10.5" textAnchor="middle" fill={C.faint} fontFamily={SANS}>
            {mesCurto(s.mes, true)}
          </text>
        ))}

        {/* Faixas invisíveis ampliam a área de interação sem alterar nenhuma
            camada visual já pronta do gráfico. */}
        {serie.map((s, i) => (
          <rect key={`hit-${s.mes}`} x={padL + slot * i} y="0" width={slot} height={H}
            fill="transparent" style={{ cursor: "pointer", outline: "none" }}
            onMouseEnter={() => setDetalheIdx(i)}
            onClick={() => onSelecionarMes?.(s.mes)}
            aria-label={`Detalhes de ${mesCurto(s.mes, true)}`} />
        ))}
      </svg>
      {detalheIdx != null && (() => {
        const s = serie[detalheIdx];
        const anterior = Number(s.anterior ?? 0);
        const atual = Number(s.valor ?? 0);
        const variacao = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
        const diferenca = atual - anterior;
        const borda = variacao == null ? C.gold : variacao >= 0 ? COR_VARIACAO_ALTA : COR_VARIACAO_QUEDA;
        return (
          <div style={{
            position: "absolute", zIndex: 8, top: 6,
            left: `${(cx(detalheIdx) / W) * 100}%`,
            transform: detalheIdx === 0 ? "translateX(0)" : detalheIdx === n - 1 ? "translateX(-100%)" : "translateX(-50%)",
            minWidth: 190, padding: "9px 11px", pointerEvents: "none",
            background: "rgba(15,15,18,.97)", border: `1px solid ${borda}66`, borderRadius: 9,
            boxShadow: "0 10px 28px rgba(0,0,0,.48)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.gold, marginBottom: 6 }}>
              {mesCurto(s.mes, true)} {s.parcial ? "· parcial" : "· fechado"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 10.5, color: C.muted }}>
              <span>Faturamento {String(s.mes).slice(0, 4)}</span>
              <b style={{ color: C.bright }}>{moeda(atual)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 4, fontSize: 10.5, color: C.muted }}>
              <span>Mesmo mês {anoAnterior}</span>
              <b style={{ color: AZUL_ANTERIOR }}>{anterior > 0 ? moeda(anterior) : "sem base"}</b>
            </div>
            {variacao != null && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginTop: 6, paddingTop: 6,
                borderTop: `1px solid ${C.hair}`, fontSize: 10.5, fontWeight: 800, color: variacao >= 0 ? COR_VARIACAO_ALTA : COR_VARIACAO_QUEDA }}>
                <span>{variacao >= 0 ? "Acima" : "Abaixo"} do ano anterior</span>
                <span>{variacao >= 0 ? "+" : "−"}{moeda(Math.abs(diferenca))} · {Math.abs(variacao).toFixed(0)}%</span>
              </div>
            )}
          </div>
        );
      })()}
      </div>

      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
        Último mês tracejado = <b style={{ color: C.muted }}>parcial</b> (em andamento).
        {temAnterior
          ? <> Linha azul = mesmos meses de {anoAnterior} — <b style={{ color: C.muted }}>não é meta</b>.</>
          : <> Sem histórico de {anoAnterior} nesta categoria para comparar.</>}
      </div>
    </>
  );
}

/* Matrículas (volume) x Faturamento (R$) no mesmo gráfico, com DOIS eixos:
   contagem e reais não dividem escala. Cruzar as duas séries responde "o
   crescimento veio de vender mais ou de vender mais caro?". */
function MatriculasVsFaturamento({ serie }) {
  if (!serie.length) return null;
  const W = 720, H = 200, padL = 34, padR = 44, padT = 18, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB, base = padT + plotH;
  const maxMat = Math.max(...serie.map((s) => s.matriculas), 1);
  const maxFat = Math.max(...serie.map((s) => s.faturamento), 1);
  const n = serie.length, slot = plotW / n, bw = Math.min(34, slot * 0.5);
  const cx = (i) => padL + slot * i + slot / 2;
  const yMat = (v) => base - (v / maxMat) * plotH;
  const yFat = (v) => base - (v / maxFat) * plotH;
  const ptsFat = serie.map((s, i) => [cx(i), yFat(s.faturamento)]);
  const idxParcial = serie.findIndex((s) => s.parcial);
  const ultSolido = idxParcial > 0 ? idxParcial : n - 1;
  const solido = ptsFat.slice(0, ultSolido + 1).map((p) => p.join(",")).join(" ");
  const tracejado = idxParcial > 0
    ? [ptsFat[idxParcial - 1], ptsFat[idxParcial]].map((p) => p.join(",")).join(" ") : null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4, fontSize: 10.5, color: C.muted, fontWeight: 600 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: `linear-gradient(150deg, ${C.goldTop}, ${C.goldBase})` }} /> Matrículas
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 13, height: 0, borderTop: `2px solid ${C.up}` }} /> Faturamento
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <linearGradient id="gradMat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.goldTop} /><stop offset="1" stopColor={C.goldBase} />
          </linearGradient>
          <pattern id="hachMat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.gold} strokeWidth="3" opacity="0.4" />
          </pattern>
        </defs>

        {/* eixo esquerdo = volume; direito = R$ */}
        {[0, 0.5, 1].map((f, i) => {
          const yy = base - f * plotH;
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,.06)" strokeWidth="1" />
              <text x={padL - 6} y={yy + 3} fontSize="9" textAnchor="end" fill={C.faint} fontFamily={SANS}>
                {Math.round(maxMat * f)}
              </text>
              <text x={W - padR + 6} y={yy + 3} fontSize="9" textAnchor="start" fill={C.up} opacity="0.8" fontFamily={SANS}>
                {compacto(maxFat * f)}
              </text>
            </g>
          );
        })}

        {serie.map((s, i) => (
          <rect key={s.mes} x={cx(i) - bw / 2} y={yMat(s.matriculas)} width={bw}
            height={Math.max(0, base - yMat(s.matriculas))} rx="2"
            fill={s.parcial ? "url(#hachMat)" : "url(#gradMat)"}
            stroke={s.parcial ? C.gold : "none"} strokeDasharray={s.parcial ? "3 2" : undefined}
            strokeWidth={s.parcial ? 1 : 0} />
        ))}

        <polyline points={solido} fill="none" stroke={C.up} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {tracejado && <polyline points={tracejado} fill="none" stroke={C.up} strokeWidth="1.8" strokeDasharray="4 3" opacity="0.7" />}
        {ptsFat.map(([x0, y0], i) => (
          <circle key={i} cx={x0} cy={y0} r="2.2"
            fill={serie[i].parcial ? C.void : C.up} stroke={C.up} strokeWidth={serie[i].parcial ? 1.2 : 0} />
        ))}


        {serie.map((s, i) => (
          <text key={s.mes} x={cx(i)} y={H - 7} fontSize="9.5" textAnchor="middle" fill={C.faint} fontFamily={SANS}>
            {mesCurto(s.mes, true)}
          </text>
        ))}
      </svg>

      <div style={{ fontSize: 10, color: C.faint, marginTop: 5, lineHeight: 1.45 }}>
        Sobem juntas = crescimento por <b style={{ color: C.muted }}>volume</b> (mais vendas). Faturamento
        subindo mais que as matrículas = <b style={{ color: C.muted }}>ticket maior</b>. Último mês tracejado = parcial.
      </div>
    </>
  );
}

/* Caixa recebido — card destaque verde. Cobre SÓ a CisPay; a Stone
   ainda não está integrada. Rotulado "Caixa CisPay (parcial)" — nunca
   como caixa total, senão vira número que engana. */
function CaixaCard({ serie, semFonte }) {
  if (semFonte || !serie.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 8 }}>
        <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Caixa CisPay</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Database size={14} style={{ color: C.faint, marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
            Aguardando a view <b style={{ color: C.muted }}>vw_financeiro_caixa_mensal</b>. Quando existir, mostra o caixa recebido da CisPay (parcial — Stone fora).
          </span>
        </div>
      </div>
    );
  }
  const atual = serie.at(-1).valor;
  const ant = serie.at(-2)?.valor;
  const pct = ant ? ((atual - ant) / Math.abs(ant)) * 100 : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
      <div>
        <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>Caixa CisPay <span style={{ color: C.faint }}>· parcial</span></div>
        <div style={{ fontFamily: GROTESK, fontSize: 32, fontWeight: 700, letterSpacing: "-1px", marginTop: 6, color: C.up }}>{moeda(atual)}</div>
        {pct != null && (
          <div style={{ fontSize: 12, fontWeight: 800, color: pct >= 0 ? C.up : C.down, marginTop: 4 }}>
            {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs mês anterior
          </div>
        )}
      </div>
      <div style={{ height: 34, marginTop: 10 }}><Spark serie={serie} cor={C.up} /></div>
    </div>
  );
}

function Estado({ carregando, erro, vazio, children, vazioTitulo, vazioDica }) {
  if (carregando)
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 9, justifyContent: "center", padding: "56px 0" }}>
        <Loader2 size={16} className="girar" style={{ color: C.goldBase }} />
        <span style={{ fontSize: 13, color: C.faint }}>Carregando</span>
      </div>
    );
  if (erro)
    return (
      <div style={{ display: "flex", gap: 11, padding: "28px 0" }}>
        <ShieldAlert size={16} style={{ color: C.down, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13.5, color: C.bright, fontWeight: 600 }}>Não foi possível carregar</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>{erro.message}</div>
        </div>
      </div>
    );
  if (vazio)
    return (
      <div style={{ display: "flex", gap: 11, padding: "28px 0" }}>
        <Database size={16} style={{ color: C.faint, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 13.5, color: C.muted, fontWeight: 600 }}>{vazioTitulo ?? "Sem dados neste recorte"}</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
            {vazioDica ?? "Ou a fonte não foi conectada, ou seu perfil não tem acesso a este setor."}
          </div>
        </div>
      </div>
    );
  return children;
}

/* ============ HUB EXECUTIVO (Diretoria/Dulce · setor 'geral') ============
   Visão de mês corrente, navegável. Nada de somar unidades diferentes — cada
   card é do seu setor e clica pro hub detalhado. Grafite + dourado. */
const isoDia = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const noMesYM = (v, ym) => String(v ?? "").slice(0, 7) === ym;
const ymCorrente = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
/* Recebido do mês: SEMPRE o mês mais recente COM lançamento na view (max mes),
   nunca R$ 0 pro mês corrente ainda vazio. `fechado` = o mais recente é
   anterior ao mês atual (rótulo "último fechado"). Quando agosto começar a
   receber, o card passa a mostrar agosto sozinho — sem mexer no código. */
const recebidoMaisRecente = (rows, ymAtual) => {
  const arr = rows ?? [];
  if (!arr.length) return null;
  const ultima = arr.reduce((a, b) => (String(a.mes) > String(b.mes) ? a : b));
  const ym = String(ultima.mes).slice(0, 7);
  return { valor: Number(ultima.recebido ?? 0), mes: ultima.mes, ym, fechado: ym < ymAtual };
};

/* Inadimplência ACUMULADA (estoque): total histórico de parcelas vencidas —
   valor e contagem de vw_financeiro_inadimplencia. É outra grandeza que o
   Recebido (fluxo do mês): não se somam nem se contradizem. `pct` = quanto da
   carteira (recebido + vencido) está vencido. */
const inadimplenciaResumo = (inadRows, recebRows) => {
  const arr = inadRows ?? [];
  const valor = arr.reduce((s, r) => s + Number(r.valor_vencido ?? 0), 0);
  const parcelas = arr.reduce((s, r) => s + Number(r.vencidas ?? 0), 0);
  const recebido = (recebRows ?? []).reduce((s, r) => s + Number(r.recebido ?? 0), 0);
  const carteira = recebido + valor;
  return { valor, parcelas, pct: carteira > 0 ? (valor / carteira) * 100 : null };
};

// Só o primeiro nome + primeiro sobrenome — os nomes vêm inteiros ("Larissa
// Lima dos Santos Barbosa Santana") e estouram o card.
const primeiroNome = (n) => {
  const p = String(n ?? "").trim().split(/\s+/).filter(Boolean);
  return p.length <= 2 ? p.join(" ") : `${p[0]} ${p[1]}`;
};

/* Reativação pedagógica: alunos que COMPRARAM e NÃO compareceram
   (vw_comprou_nao_compareceu). Conta alunos distintos (aluno_id) e soma o valor
   DEDUPLICADO por (aluno_id, curso_id, turma) — a fonte repete algumas
   matrículas e somar cru infla. Oportunidade de reativação, não receita. */
const resumoReativacao = (rows) => {
  const arr = rows ?? [];
  const alunos = new Set(), combos = new Set();
  let valor = 0;
  for (const r of arr) {
    alunos.add(String(r.aluno_id));
    const k = `${r.aluno_id}|${r.curso_id}|${r.turma}`;
    if (!combos.has(k)) { combos.add(k); valor += Number(r.valor ?? 0); }
  }
  return { alunos: alunos.size, valor, temDados: arr.length > 0 };
};

/* Receita comercial dos últimos 30 dias por consultora. Usa a mesma view
   consolidada do ranking Geral do Comercial: venda deduplicada, nome resolvido
   em dim_consultores e recorte pela data de aprovação (venda, não caixa). */
const rankConsultoras30d = (rows, desde) => {
  const porCons = new Map();
  for (const r of rows ?? []) {
    const data = String(r.data_aprovacao ?? r.data ?? "").slice(0, 10);
    if (!data || data < desde) continue;
    const c = r.consultora ?? "—";
    const v = Number(r.valor_bruto ?? r.valor ?? 0);
    porCons.set(c, (porCons.get(c) ?? 0) + v);
  }
  const rank = [...porCons.entries()]
    .map(([nome, receita]) => ({ nome, receita }))
    .sort((a, b) => b.receita - a.receita);
  const total = rank.reduce((s, r) => s + r.receita, 0);
  const lider = rank[0] ?? null;
  return {
    total,
    top3: rank.slice(0, 3).map((r) => ({ ...r, pct: total > 0 ? (r.receita / total) * 100 : null })),
    concentracao: lider && total > 0 ? (lider.receita / total) * 100 : null,
    lider: lider ? lider.nome : null,
    temDados: rank.length > 0,
  };
};

// Bloco 1: faturamento do mês — número grande + comparação com o MESMO período
// do mês anterior (mesmos dias decorridos). Clica pro Comercial.
function HeroFaturamento({ fat, ateDia, carregando, erro, onIr }) {
  const up = fat.up, temComp = fat.delta != null;
  return (
    <button onClick={onIr} style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
      background: `linear-gradient(135deg, ${C.gold}14, transparent 60%), ${C.card}`,
      border: `1px solid ${C.gold}3D`, borderRadius: 18, padding: "20px 22px", marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: C.gold }}>Faturamento do mês · até dia {ateDia}</span>
        <ArrowUpRight size={16} style={{ color: C.faint }} />
      </div>
      {carregando ? (
        <div style={{ margin: "12px 0 4px", color: C.faint, fontSize: 14 }}>Carregando…</div>
      ) : erro ? (
        <div style={{ margin: "12px 0 4px", color: C.down, fontSize: 13 }}>Não foi possível carregar o faturamento.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", margin: "8px 0 2px" }}>
            <span style={{ fontFamily: GROTESK, fontSize: 40, fontWeight: 700, letterSpacing: "-1px", color: C.gold, lineHeight: 1 }}>{moeda(fat.atual)}</span>
            {temComp && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 15, fontWeight: 800, color: up ? C.up : C.down }}>
                {up ? "▲" : "▼"} {Math.abs(fat.delta).toFixed(1).replace(".", ",")}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            {temComp
              ? <>vs {moeda(fat.ant)} no mesmo período do mês passado ({ateDia} {ateDia === 1 ? "dia" : "dias"})</>
              : fat.compErro
                ? <>comparação com o mês passado indisponível</>
                : <>sem base comparável no mês passado</>}
          </div>
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 5 }}>valor vendido · por data de aprovação</div>
        </>
      )}
    </button>
  );
}

// Bloco 2: radar de alertas — só o que é crítico, com cor. Vazio = tudo certo.
function RadarAlertas({ alertas }) {
  if (!alertas.length) return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 14, padding: "12px 16px", marginBottom: 20 }}>
      <ShieldCheck size={16} style={{ color: C.up }} />
      <span style={{ fontSize: 12.5, color: C.muted }}>Nada crítico agora. Inadimplência, meta da loja e concentração comercial sob controle.</span>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
      {alertas.map((a, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, background: `${a.cor}12`, border: `1px solid ${a.cor}44`, borderRadius: 12, padding: "10px 13px", flex: "1 1 240px", minWidth: 220, maxWidth: 360 }}>
          <a.Icone size={16} style={{ color: a.cor, flexShrink: 0 }} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titulo}</span>
            <span style={{ display: "block", fontSize: 10.5, color: C.faint }}>{a.valor ? <b style={{ color: a.cor }}>{a.valor}</b> : null}{a.valor && a.sub ? " · " : ""}{a.sub}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// Bloco 3: card de setor navegável (mês corrente).
function CardSetor({ Icone, titulo, linhas, nota, estado, onIr }) {
  return (
    <button onClick={onIr} style={{
      display: "flex", flexDirection: "column", gap: 10, textAlign: "left", cursor: "pointer",
      background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 14, padding: "14px 16px", minHeight: 118,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: `${C.gold}1E`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Icone size={14} /></span>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.bright }}>{titulo}</span>
        </span>
        <ArrowUpRight size={15} style={{ color: C.faint }} />
      </div>
      {estado?.carregando ? <span style={{ fontSize: 12, color: C.faint }}>Carregando…</span>
        : estado?.erro ? <span style={{ fontSize: 12, color: C.down }}>Fonte indisponível</span>
          : (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              {linhas.map((l, i) => (
                <span key={i} style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: GROTESK, fontSize: 18, fontWeight: 700, color: l.cor ?? C.text }}>{l.valor}</span>
                  <span style={{ display: "block", fontSize: 10, color: C.faint }}>{l.label}</span>
                </span>
              ))}
            </div>
          )}
      {nota && <span style={{ fontSize: 10, color: C.dim, marginTop: "auto" }}>{nota}</span>}
    </button>
  );
}

// Bloco 3: Top 3 consultoras (30 dias) — reconhecimento, não alerta. Mesma base
// e período do alerta de concentração; o % bate com ele.
function CardTopConsultoras({ top3, estado, onIr }) {
  return (
    <button onClick={onIr} style={{
      display: "flex", flexDirection: "column", gap: 10, textAlign: "left", cursor: "pointer",
      background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 14, padding: "14px 16px", minHeight: 118,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: `${C.gold}1E`, color: C.gold, display: "flex", alignItems: "center", justifyContent: "center" }}><Crown size={14} /></span>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.bright }}>Top 3 consultoras</span>
        </span>
        <ArrowUpRight size={15} style={{ color: C.faint }} />
      </div>
      {estado?.carregando ? <span style={{ fontSize: 12, color: C.faint }}>Carregando…</span>
        : estado?.erro ? <span style={{ fontSize: 12, color: C.down }}>Fonte indisponível</span>
          : !top3.length ? <span style={{ fontSize: 12, color: C.faint }}>Sem vendas nos últimos 30 dias</span>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {top3.map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontFamily: GROTESK, fontSize: 12, fontWeight: 700, color: i === 0 ? C.gold : C.faint, width: 12, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{primeiroNome(r.nome)}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
                      <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: C.text }}>{moeda(r.receita)}</span>
                      <span style={{ fontSize: 10, color: C.faint, width: 32, textAlign: "right" }}>{r.pct != null ? `${Math.round(r.pct)}%` : "—"}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
      <span style={{ fontSize: 10, color: C.dim, marginTop: "auto" }}>últimos 30 dias · reconhecimento</span>
    </button>
  );
}

function HubExecutivo({ onIr }) {
  const hoje = new Date();
  const Y = hoje.getFullYear(), Mo = hoje.getMonth(), Di = hoje.getDate();
  const ym = `${Y}-${String(Mo + 1).padStart(2, "0")}`;
  const inicioMes = isoDia(new Date(Y, Mo, 1)), fimMes = isoDia(new Date(Y, Mo, Di));
  const inicioAnt = isoDia(new Date(Y, Mo - 1, 1));
  const ultDiaAnt = new Date(Y, Mo, 0).getDate();
  const fimAnt = isoDia(new Date(Y, Mo - 1, Math.min(Di, ultDiaAnt)));
  const desde30 = isoDia(new Date(Y, Mo, Di - 30)); // últimos 30 dias (concentração/top 3)

  /* Bloco 1 — faturamento do mês. O VALOR vem da fonte canônica
     (vw_faturamento_mensal): o que foi VENDIDO no mês, por data de aprovação,
     deduplicado por venda no banco. É a mesma fonte do card do Hub Comercial —
     é isso que garante que os dois mostram o mesmo número.

     A COMPARAÇÃO com o mesmo período do mês passado precisa de granularidade
     de dia, que a view mensal não tem: sai da base linha a linha, aplicando o
     MESMO critério (data de aprovação + dedup por venda) pra ser comparável. */
  const fatMensal = useFaturamentoMensal();
  const fatHook = useVendaFaturamentoDesde(inicioAnt);
  const fat = useMemo(() => {
    const linhaMes = (fatMensal.data ?? []).find((r) => noMesYM(r.mes, ym));
    const atual = Number(linhaMes?.faturamento_bruto ?? 0);
    const soma = (ini, fim) => {
      const porVenda = new Map(); // MAX(valor_bruto) por venda, como na view
      for (const r of fatHook.data ?? []) {
        const d = String(r.data_aprovacao ?? r.data_pagamento ?? "").slice(0, 10);
        if (!(d >= ini && d <= fim)) continue;
        const k = r.original_id_venda ?? `${d}|${r.valor_bruto}`;
        porVenda.set(k, Math.max(porVenda.get(k) ?? 0, Number(r.valor_bruto ?? 0)));
      }
      let s = 0;
      for (const v of porVenda.values()) s += v;
      return s;
    };
    // Sem a base do mês passado não dá pra comparar — e "sem base" é diferente
    // de "falhou ao carregar": o card diz qual dos dois é.
    const ant = fatHook.error ? null : soma(inicioAnt, fimAnt);
    return {
      atual, ant,
      compErro: !!fatHook.error,
      delta: ant > 0 ? ((atual - ant) / ant) * 100 : null,
      up: ant != null && atual >= ant,
    };
  }, [fatMensal.data, fatHook.data, fatHook.error, ym, inicioAnt, fimAnt]);

  // Fontes dos demais blocos.
  const inadimp = useFinanceiroInadimp();
  const lojaMeta = useLojaMetaRealizado();
  const reativ = useExecutivoReativacao();
  const cons30 = useComercialRankingGeralConsolidado();
  const matriculasExec = useComercialMatriculasPeriodo();
  const recMensal = useFinanceiroRecebidoMensal();
  const mktInv = useMarketingInvestimento();
  const pedK = usePedagogicoKpis();
  const pedP = usePedagogicoPresencaKpis();

  const inad = useMemo(() => inadimplenciaResumo(inadimp.data, recMensal.data), [inadimp.data, recMensal.data]);
  const lojaRow = useMemo(() => (lojaMeta.data ?? []).find((r) => noMesYM(r.mes_ref, ym)), [lojaMeta.data, ym]);
  const lojaAbaixo = lojaRow && String(lojaRow.nivel_atingido ?? "").trim().toLowerCase() === "abaixo";
  const reativacao = useMemo(() => resumoReativacao(reativ.data), [reativ.data]);
  const consultoras = useMemo(() => rankConsultoras30d(cons30.data, desde30), [cons30.data, desde30]);

  /* Bloco 2 — radar. Status de integração saiu daqui: saúde de API é assunto da
     Central de APIs, não decisão de diretoria. No lugar, dois alertas de
     NEGÓCIO: reativação pedagógica (dinheiro parado, sempre visível) e
     concentração comercial (risco — só aparece se a líder passar de 40%). */
  const alertas = [
    /* "Reativação pedagógica" era ambíguo ao lado da fila de prazo: parecia o
       mesmo assunto. São perguntas diferentes e continuam sendo — aqui é quem
       NÃO APARECEU numa turma que já aconteceu; lá é quem está perdendo o
       direito de fazer o curso. O rótulo agora diz qual das duas é. */
    ...(reativacao.temDados && reativacao.alunos > 0 ? [{ cor: C.warn, Icone: PhoneCall, titulo: "Compraram e faltaram", valor: moeda(reativacao.valor), sub: `${numero(reativacao.alunos)} alunos · turmas já realizadas` }] : []),
    ...(inad.valor > 0 ? [{ cor: C.warn, Icone: AlertTriangle, titulo: "Inadimplência acumulada", valor: moeda(inad.valor), sub: `${numero(inad.parcelas)} parcelas vencidas` }] : []),
    ...(lojaAbaixo ? [{ cor: C.down, Icone: ShoppingBag, titulo: "Loja abaixo da meta", valor: fmtPct(lojaRow.pct_minima), sub: "da meta mínima" }] : []),
    ...(consultoras.concentracao != null && consultoras.concentracao > 40 ? [{ cor: C.down, Icone: AlertTriangle, titulo: "Concentração comercial", valor: `${Math.round(consultoras.concentracao)}%`, sub: `da receita de 30 dias em ${consultoras.lider ? primeiroNome(consultoras.lider) : "1 consultora"}` }] : []),
  ];

  /* Bloco 3 — cards por setor (mês corrente). Faturamento e matrículas usam as
     mesmas fontes canônicas do Hub Comercial. Matrícula conta quem estuda
     (Matrícula + CONSUMIDOR DE VAGAS), nunca o comprador terceiro. */
  const com = useMemo(() => {
    const linhaMes = (fatMensal.data ?? []).find((r) => noMesYM(r.mes, ym));
    const mat = (matriculasExec.data ?? [])
      .filter((r) => noMesYM(r.data, ym))
      .reduce((s, r) => s + Number(r.matriculas ?? 0), 0);
    return { fat: Number(linhaMes?.faturamento_bruto ?? 0), mat };
  }, [fatMensal.data, matriculasExec.data, ym]);
  const recebido = useMemo(() => recebidoMaisRecente(recMensal.data, ym), [recMensal.data, ym]);
  const investMes = useMemo(() => (mktInv.data ?? []).filter((r) => noMesYM(r.mes, ym)).reduce((s, r) => s + Number(r.gasto ?? 0), 0), [mktInv.data, ym]);
  const recompra = pedK.data?.[0]?.taxa_recompra;
  const comparec = pedP.data?.[0]?.taxa_comparecimento_geral;

  return (
    <>
      <style>{`
        .execCards { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 680px)  { .execCards { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1040px) { .execCards { grid-template-columns: repeat(3, 1fr); } }
      `}</style>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.bright }}>Visão executiva</h2>
        <span style={{ fontSize: 11.5, color: C.faint }}>{hoje.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })} · mês corrente</span>
      </div>

      {/* Bloco 1 */}
      <HeroFaturamento fat={fat} ateDia={Di} carregando={fatMensal.isLoading} erro={fatMensal.error} onIr={() => onIr("comercial")} />

      {/* Bloco 2 */}
      <RadarAlertas alertas={alertas} />

      {/* Bloco 3 */}
      <div className="execCards">
        <CardSetor Icone={TrendingUp} titulo="Comercial" onIr={() => onIr("comercial")}
          estado={{ carregando: fatMensal.isLoading || matriculasExec.isLoading, erro: fatMensal.error ?? matriculasExec.error }}
          linhas={[{ label: "faturamento bruto", valor: moeda(com.fat), cor: C.gold }, { label: "matrículas", valor: numero(com.mat) }]} />
        <CardSetor Icone={Wallet} titulo="Financeiro" onIr={() => onIr("financeiro")}
          estado={{ carregando: recMensal.isLoading, erro: recMensal.error }}
          linhas={[
            { label: recebido ? `recebido em ${dataCurta(recebido.mes)}${recebido.fechado ? " · último fechado" : ""}` : "recebido no mês", valor: recebido ? moeda(recebido.valor) : "—", cor: C.up },
            { label: "inadimplência acumulada", valor: moeda(inad.valor), cor: inad.valor > 0 ? C.warn : C.text },
          ]}
          nota={inad.parcelas ? `${numero(inad.parcelas)} parcelas vencidas${inad.pct != null ? ` · ${inad.pct.toFixed(1).replace(".", ",")}% da carteira` : ""}` : null} />
        <CardSetor Icone={ShoppingBag} titulo="Loja" onIr={() => onIr("loja")}
          estado={{ carregando: lojaMeta.isLoading, erro: lojaMeta.error }}
          linhas={lojaRow
            ? [{ label: "realizado", valor: moeda(lojaRow.realizado), cor: C.gold }, { label: "da meta mín.", valor: fmtPct(lojaRow.pct_minima), cor: lojaAbaixo ? C.down : C.up }]
            : [{ label: "meta do mês", valor: "—" }]}
          nota={lojaRow ? `nível: ${lojaRow.nivel_atingido}` : null} />
        <CardSetor Icone={Megaphone} titulo="Marketing" onIr={() => onIr("marketing")}
          estado={{ carregando: mktInv.isLoading, erro: mktInv.error }}
          linhas={[{ label: "investimento", valor: moeda(investMes), cor: C.gold }]}
          nota="Receita e ROI não são atribuíveis nesta base" />
        <CardSetor Icone={GraduationCap} titulo="Pedagógico" onIr={() => onIr("pedagogico")}
          estado={{ carregando: pedK.isLoading, erro: pedK.error }}
          linhas={[{ label: "recompra (grade)", valor: fmtPct(recompra, 1), cor: C.gold }, { label: "comparecimento", valor: fmtPct(comparec), cor: C.up }]} />
        <CardTopConsultoras top3={consultoras.top3} estado={{ carregando: cons30.isLoading, erro: cons30.error }} onIr={() => onIr("comercial")} />
      </div>
    </>
  );
}

/* ============ HUBS SETORIAIS ============ */

function HubComercial() {
  const { inicio, fim, rotulo, modo, ano, mesIdx, setMesAno, escolherModo } = usePeriodo();
  const { categoria } = useCategoria();
  const [visao, setVisao] = useState("periodo");
  const rankCat = useComercialRankingHistorico();
  const sympla = useComercialSymplaJennifer();
  const carinhas = useComercialCarinhas();
  const verdesDet = useComercialVerdesDetalhe();
  const matfat = useComercialMatriculasFaturamento();
  const cursos = useComercialCursosPorConsultora();
  const geralCons = useComercialRankingGeralConsolidado();
  const geralMensal = useComercialGeralMensal();
  const matriculasPeriodo = useComercialMatriculasPeriodo();
  const fatMensal = useFaturamentoMensal();

  // Consultora com o detalhe de verdes aberto (null = fechado).
  const [verdesDe, setVerdesDe] = useState(null);

  const ehSympla = categoria === CAT_SYMPLA;
  const ehGeral = categoria === CAT_GERAL;
  // Carinhas são do time GGB; aparecem no GGB e no consolidado Geral.
  const ehGGB = String(categoria ?? "").toUpperCase() === "GGB";
  const mostraCarinhas = ehGGB || ehGeral;
  const anoAnterior = new Date().getFullYear() - 1;

  // Vendas da categoria, uma linha por venda (inclui quem já saiu — é o que
  // faz 2022 mostrar faturamento real). No Geral, a fonte de FLUXO (KPIs,
  // evolução, matrículas) é a view consolidada mensal, que já soma as 3
  // formações; nas categorias, é o histórico filtrado.
  const vendasCat = useMemo(
    () => (rankCat.data ?? []).filter((r) => String(r.categoria) === categoria),
    [rankCat.data, categoria]
  );
  const linhasFluxo = ehGeral ? (geralMensal.data ?? []) : vendasCat;
  const carregFluxo = ehGeral ? geralMensal.isLoading : rankCat.isLoading;
  const erroFluxo = ehGeral ? geralMensal.error : rankCat.error;

  /* FATURAMENTO conta por data de APROVAÇÃO — o que foi VENDIDO no período,
     independente de quando o pagamento cai. Mesma regra da view canônica
     vw_faturamento_mensal; o que já foi PAGO (caixa) é outra métrica e vive no
     Financeiro (recebido). Era o critério de pagamento aqui que fazia agosto
     aparecer como R$ 278 mil enquanto o Executivo mostrava R$ 647 mil.
     Onde não há data_aprovacao (linhas antigas) cai no pagamento, via
     coalesce, pra não sumir nada. */
  const curto = modo === "hoje" || modo === "7d";
  const recorte = (linhas, faixa, campoPag = "data") =>
    (linhas ?? []).filter((r) => {
      const d = String(r.data_aprovacao ?? r[campoPag] ?? "").slice(0, 10);
      return d && d >= faixa.inicio && d <= faixa.fim;
    });
  /* Carinhas e verdes ficam de fora da regra: ali o assunto É a forma de
     PAGAMENTO (o placar conta pagamentos, não vendas). Só o recorte curto
     segue por aprovação, como já era — uma venda aprovada hoje é o movimento
     do dia. */
  const recortePag = (linhas, faixa, campoPag = "data") =>
    curto ? recorte(linhas, faixa, campoPag) : noPeriodo(linhas, faixa, campoPag);

  /* Faturamento canônico por mês (`YYYY-MM` -> bruto), da view única que o Hub
     Executivo também lê. Já vem deduplicado por venda do banco. */
  const canonPorMes = useMemo(() => {
    const m = new Map();
    for (const r of fatMensal.data ?? []) {
      const k = String(r.mes ?? "").slice(0, 7);
      if (k) m.set(k, Number(r.faturamento_bruto ?? 0));
    }
    return m;
  }, [fatMensal.data]);

  /* Soma canônica de um recorte, quando ele é um conjunto de meses inteiros
     (Mês / Ano) e a visão é o Geral — a view não tem categoria nem dia.
     Devolve null quando não se aplica (Hoje/7d, categoria, view indisponível):
     aí o front soma linha a linha, pelo mesmo critério de aprovação. */
  const somaCanonica = (faixa) => {
    if (!ehGeral || curto || !canonPorMes.size) return null;
    const de = faixa.inicio.slice(0, 7), ate = faixa.fim.slice(0, 7);
    let s = 0;
    for (const [m, v] of canonPorMes) if (m >= de && m <= ate) s += v;
    return s;
  };

  /* KPIs do período. O Comercial mostra só o BRUTO (valor_bruto = valor
     vendido): a consultora vendeu o valor cheio, o repasse não é decisão
     dela — e o líquido, após repasses, é assunto do Financeiro. As
     matrículas somam conta_matricula — comprador de vaga é receita, mas não
     é aluno, e vem com 0. YoY compara o MESMO recorte um ano atrás. */
  const kpi = useMemo(() => {
    const somaB = (ls) => ls.reduce((s, r) => s + Number(r.valor_bruto ?? 0), 0);
    const dentro = recorte(linhasFluxo, { inicio, fim }, "data");
    const menosUmAno = (d) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    const faixaAnt = { inicio: menosUmAno(inicio), fim: menosUmAno(fim) };
    const antes = recorte(linhasFluxo, faixaAnt, "data");
    // No Geral, o valor sai da fonte canônica (mesmo número do Hub Executivo);
    // nas categorias e nos recortes curtos, do somatório por aprovação.
    const bruto = somaCanonica({ inicio, fim }) ?? somaB(dentro);
    const brutoAnt = somaCanonica(faixaAnt) ?? somaB(antes);
    const matsBase = (matriculasPeriodo.data ?? []).filter((r) =>
      ehGeral || String(r.categoria) === categoria);
    const matriculas = noPeriodo(matsBase, { inicio, fim })
      .reduce((s, r) => s + Number(r.matriculas ?? 0), 0);
    return {
      receita: bruto,
      matriculas,
      ticket: matriculas ? bruto / matriculas : null,
      yoy: brutoAnt > 0 ? ((bruto - brutoAnt) / brutoAnt) * 100 : null,
    };
  }, [linhasFluxo, matriculasPeriodo.data, categoria, inicio, fim, canonPorMes, ehGeral, curto]);

  const metaComercialMes = modo === "mes" ? METAS_COMERCIAL[chaveMes(ano, mesIdx)] : null;
  const filtrarPeloMes = (mes) => {
    const chave = String(mes ?? "").slice(0, 7);
    const novoAno = Number(chave.slice(0, 4));
    const novoMes = Number(chave.slice(5, 7)) - 1;
    if (!Number.isInteger(novoAno) || !Number.isInteger(novoMes) || novoMes < 0 || novoMes > 11) return;
    setMesAno(novoAno, novoMes);
    escolherModo("mes");
  };

  /* Evolução do ano corrente contra o ano anterior, mês a mês. Em agosto/26,
     por exemplo, mostra jan–ago/26 nas barras e jan–ago/25 na linha. Isso
     evita que uma janela móvel misture dois anos em cada uma das séries. */
  const evolucao = useMemo(() => {
    // No Geral, as barras vêm da mesma fonte do card — senão o gráfico
    // contaria por pagamento e mostraria outro número que o KPI acima.
    let porMes = canonPorMes;
    if (!ehGeral || !canonPorMes.size) {
      porMes = new Map();
      for (const r of linhasFluxo) {
        const m = String(r.data_aprovacao ?? r.data ?? "").slice(0, 7);
        if (m) porMes.set(m, (porMes.get(m) ?? 0) + Number(r.valor_bruto ?? 0)); // Comercial = bruto
      }
    }
    const h = new Date();
    const chave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const atual = chave(h);
    return Array.from({ length: h.getMonth() + 1 }, (_, k) => {
      const d = new Date(h.getFullYear(), k, 1);
      const m = chave(d);
      const mAnt = `${d.getFullYear() - 1}-${m.slice(5)}`;
      return { mes: m, valor: porMes.get(m) ?? 0, anterior: porMes.get(mAnt) ?? 0, parcial: m === atual };
    });
  }, [linhasFluxo, canonPorMes, ehGeral]);

  const geral = visao === "geral";

  /* Matrículas x faturamento por mês, dentro do recorte. Conta as linhas
     (volume) e soma o valor (R$) — duas grandezas, dois eixos. O mês é o da
     APROVAÇÃO (a coluna `mes` das views é mês de pagamento, outro critério) e,
     no Geral, o R$ vem da fonte canônica pra bater com o card. */
  const matFat = useMemo(() => {
    if (ehSympla) return [];
    const origem = linhasFluxo;
    const dentro = recorte(origem, { inicio, fim }, "data");
    const m = new Map();
    const matsBase = (matriculasPeriodo.data ?? []).filter((r) =>
      ehGeral || String(r.categoria) === categoria);
    for (const r of noPeriodo(matsBase, { inicio, fim })) {
      const k = String(r.data ?? "").slice(0, 7);
      if (!k) continue;
      const a = m.get(k) ?? { mes: k, matriculas: 0, faturamento: 0 };
      a.matriculas += Number(r.matriculas ?? 0);
      m.set(k, a);
    }
    for (const r of dentro) {
      const k = String(r.data_aprovacao ?? r.data ?? r.mes ?? "").slice(0, 7);
      if (!k) continue;
      const a = m.get(k) ?? { mes: k, matriculas: 0, faturamento: 0 };
      a.faturamento += Number(r.valor_bruto ?? 0);     // Comercial = bruto
      m.set(k, a);
    }
    const h = new Date();
    const atual = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
    return ordenarMeses([...m.values()])
      .map((x) => {
        return {
          ...x,
          faturamento: (ehGeral && canonPorMes.has(x.mes)) ? canonPorMes.get(x.mes) : x.faturamento,
          parcial: x.mes === atual,
        };
      });
  }, [linhasFluxo, matriculasPeriodo.data, categoria, inicio, fim, ehSympla, ehGeral, canonPorMes]);

  /* Top 5 cursos por consultora — em TODAS as categorias (menos Sympla, que
     é evento). No Geral, junta os cursos de todas as categorias que a
     consultora vendeu; na categoria, só os dela. Receita em BRUTO, pra bater
     com o número do card. Exibe curso_curto (abreviação oficial). Mesmo
     recorte do pódio: em "Geral" (visão) é todos os tempos, senão o período. */
  const cursosPorConsultora = useMemo(() => {
    if (ehSympla) return new Map();
    const doFiltro = ehGeral
      ? (cursos.data ?? [])
      : (cursos.data ?? []).filter((r) => String(r.categoria) === categoria);
    const base = geral ? doFiltro : recorte(doFiltro, { inicio, fim }, "data");
    const porNome = new Map();
    for (const r of base) {
      const nome = String(r.consultora ?? "");
      if (!porNome.has(nome)) porNome.set(nome, new Map());
      const cm = porNome.get(nome);
      const k = String(r.curso ?? "—");
      const a = cm.get(k) ?? { curso: k, curso_curto: r.curso_curto ?? r.curso, vendas: 0, receita: 0 };
      a.vendas += 1;
      a.receita += Number(r.valor_bruto ?? 0);
      cm.set(k, a);
    }
    const out = new Map();
    for (const [nome, cm] of porNome) {
      out.set(nome, [...cm.values()].sort((a, b) => b.receita - a.receita).slice(0, 5));
    }
    return out;
  }, [cursos.data, ehSympla, ehGeral, categoria, geral, inicio, fim]);

  /* Produto campeão do período: uma linha da view representa uma venda.
     Ordena primeiro por quantidade e usa faturamento bruto como desempate. */
  const maisVendido = useMemo(() => {
    if (ehSympla) return null;
    const origem = ehGeral
      ? (cursos.data ?? [])
      : (cursos.data ?? []).filter((r) => String(r.categoria) === categoria);
    const agrupado = new Map();
    for (const r of recorte(origem, { inicio, fim }, "data")) {
      const chave = String(r.curso ?? "").trim();
      if (!chave) continue;
      const atual = agrupado.get(chave) ?? {
        nome: r.curso_curto ?? r.curso, vendas: 0, receita: 0,
      };
      atual.vendas += 1;
      atual.receita += Number(r.valor_bruto ?? 0);
      agrupado.set(chave, atual);
    }
    return [...agrupado.values()]
      .sort((a, b) => b.vendas - a.vendas || b.receita - a.receita)[0] ?? null;
  }, [cursos.data, ehSympla, ehGeral, categoria, inicio, fim]);

  /* Pódio. Sympla vem de outra view (agregada, sem data): uma consultora só,
     medida em receita líquida/eventos/ingressos. */
  const podio = useMemo(() => {
    if (ehSympla) {
      return (sympla.data ?? []).map((s) => ({
        consultor_id: s.consultora,
        consultora: s.consultora,
        foto_url: s.foto_url,
        receita: Number(s.receita_liquida ?? 0),
        sub: `${numero(s.eventos)} eventos · ${numero(s.ingressos)} ingressos`,
      }));
    }
    // Geral usa a view consolidada (chave = consultora, sem coluna de
    // exibição); as categorias usam o histórico (chave de exibição).
    const origem = ehGeral ? (geralCons.data ?? []) : vendasCat;
    const base = geral ? origem : recorte(origem, { inicio, fim }, "data");
    const m = new Map();
    for (const r of base) {
      const k = ehGeral ? (r.consultora ?? "—") : (r.consultor_id_exibicao ?? r.consultora ?? "—");
      const a = m.get(k) ?? {
        consultor_id: k, consultora: r.consultora, foto_url: r.foto_url,
        atual: r.atual !== false, receita: 0, vendas: 0,
      };
      a.receita += Number(r.valor_bruto ?? 0); // Comercial ranqueia por bruto (valor vendido)
      a.vendas += 1;
      m.set(k, a);
    }
    return [...m.values()]
      .map((a) => ({ ...a, ticket_medio: a.vendas ? a.receita / a.vendas : 0 }))
      .sort((x, y) => y.receita - x.receita);
  }, [ehSympla, ehGeral, sympla.data, geralCons.data, vendasCat, geral, inicio, fim]);

  const fonte = ehSympla ? sympla : ehGeral ? geralCons : rankCat;

  /* A view entrega uma linha por venda. A identidade das 3 consultoras vem
     da base inteira (sem recorte) e as contagens, só do período — assim o
     time aparece completo mesmo num período em que alguém não vendeu, com
     zero honesto em vez de sumir do placar. */
  const { linhas, totalPeriodo } = useMemo(() => {
    const time = new Map();
    for (const r of carinhas.data ?? []) {
      const k = r.consultor_id ?? r.consultora ?? "—";
      if (!time.has(k)) {
        time.set(k, {
          consultor_id: r.consultor_id, consultora: r.consultora, foto_url: r.foto_url,
          verdes: 0, amarelas: 0, vermelhas: 0,
        });
      }
    }
    for (const r of recortePag(carinhas.data, { inicio, fim }, "data_pagamento")) {
      const a = time.get(r.consultor_id ?? r.consultora ?? "—");
      if (!a) continue;
      const cor = String(r.carinha ?? "").trim().toLowerCase();
      if (cor === "verde") a.verdes += 1;
      else if (cor === "amarelo") a.amarelas += 1;
      else if (cor === "vermelho") a.vermelhas += 1;
    }
    const arr = [...time.values()]
      .map((a) => ({ ...a, presentes: Math.floor(a.verdes / 10), faltam: 10 - (a.verdes % 10) }))
      .sort((x, y) => y.verdes - x.verdes || x.vermelhas - y.vermelhas);
    return { linhas: arr, totalPeriodo: arr.reduce((s, a) => s + a.verdes + a.amarelas + a.vermelhas, 0) };
  }, [carinhas.data, inicio, fim]);

  // Vendas verdes da consultora aberta, recortadas pelo mesmo período do
  // filtro global (view = uma linha por venda; filtro por nome + data).
  const verdesLinhas = useMemo(() => {
    if (!verdesDe) return [];
    return recortePag(
      (verdesDet.data ?? []).filter((v) => String(v.consultora) === verdesDe),
      { inicio, fim }, "data"
    ).map((v) => ({
      data: v.data, cliente: v.cliente, curso: v.curso,
      valor: Number(v.valor ?? 0), formas: v.formas, link_salesforce: v.link_salesforce,
    }));
  }, [verdesDet.data, verdesDe, inicio, fim]);

  /* "Hoje" tende a vir vazio (poucas vendas/dia). Em vez de uma tela de
     zeros que parece erro, um estado honesto. Sympla ignora o período, então
     não entra nessa regra. */
  const semMovimentoHoje = modo === "hoje" && !ehSympla && !carregFluxo && !erroFluxo
    && kpi.receita === 0 && kpi.matriculas === 0;
  if (semMovimentoHoje) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center", gap: 8, padding: "64px 24px",
        background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16,
      }}>
        <Database size={22} style={{ color: C.faint }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: C.bright }}>Sem movimentação hoje</div>
        <div style={{ fontSize: 12.5, color: C.faint, maxWidth: 420, lineHeight: 1.55 }}>
          Nenhuma venda registrada em {rotuloCat(categoria)} hoje ({fim}). O volume é de poucas vendas por dia —
          troque o período no topo (Mês/Ano) pra ver o histórico.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* No Geral, deixa explícito o que está somado. Migration 27: passou a
          incluir todas as categorias comerciais (não só GGB+CI+CIS). */}
      {ehGeral && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          padding: "7px 12px", marginBottom: 10, borderRadius: 9,
          background: `${C.gold}0F`, border: `1px solid ${C.gold}33`,
        }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: C.gold }}>Geral · todas as categorias</span>
          <span style={{ fontSize: 10.5, color: C.faint }}>
            consolidado do Comercial (GGB, CI, CIS, Mentoria, eventos, sem categoria) · bruto vendido, por data de aprovação; o que já foi pago é caixa e fica no Financeiro.
          </span>
        </div>
      )}

      {/* Faixa compacta: cada categoria é uma unidade de negócio, nunca somada. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 8, marginBottom: 10 }}>
        {/* Só o bruto vendido: o líquido (após repasses) vive no Financeiro,
            que é onde a informação faz sentido. */}
        <ChipKpi compacto hero className="kpiTopoComercial" Icone={Wallet}
          label={ehSympla ? "Receita · Sympla" : "Faturamento bruto · valor vendido"}
          valor={ehSympla ? moeda(podio[0]?.receita ?? 0) : moeda(kpi.receita)}
          nota={ehSympla ? "líquida · todos os tempos" : `${rotulo} · por aprovação`} />
        <ChipKpi compacto className="kpiTopoComercial" Icone={Receipt} label={ehSympla ? "Ingressos" : "Total de matrículas"}
          valor={ehSympla ? numero(sympla.data?.[0]?.ingressos ?? 0) : numero(kpi.matriculas)}
          nota={ehSympla ? `${numero(sympla.data?.[0]?.eventos ?? 0)} eventos` : `${rotulo} · alunos aprovados`} />
        <ChipKpi compacto className="kpiTopoComercial" Icone={TrendingUp} label="Ticket médio"
          valor={ehSympla ? "—" : (kpi.ticket != null ? moeda(kpi.ticket) : "—")}
          nota={ehSympla ? "não medível no Sympla" : "receita ÷ matrículas"} />
        <ChipKpi compacto className="kpiTopoComercial" deltaBrilha Icone={TrendingUp} label="vs. ano anterior"
          valor={kpi.yoy != null ? `${kpi.yoy >= 0 ? "+" : ""}${kpi.yoy.toFixed(0)}%` : "—"}
          delta={kpi.yoy != null ? `${Math.abs(kpi.yoy).toFixed(0)}%` : null}
          up={kpi.yoy >= 0}
          nota={kpi.yoy == null ? `sem base de ${anoAnterior}` : `vs. ${anoAnterior}`} />
        {/* Não existe meta no banco — chip fica honesto em vez de inventar. */}
        <LimiteErroMeta key={`${modo}-${ano}-${mesIdx}-${categoria}`}>
          <VelocimetroMeta realizado={kpi.receita} meta={metaComercialMes}
            disponivel={ehGeral && modo === "mes"} />
        </LimiteErroMeta>
        {/* A ponte lead→venda não é confiável — não dá pra medir conversão. */}
        <ChipKpi compacto className="kpiTopoComercial" Icone={Crown} label="Mais vendido"
          valor={maisVendido?.nome ?? "—"}
          nota={maisVendido ? `${numero(maisVendido.vendas)} venda${maisVendido.vendas === 1 ? "" : "s"} · ${rotulo}` : "sem vendas no período"} />
      </div>

      {/* Evolução à esquerda, consultoras à direita — cabe numa tela de TV. */}
      <div className="gridCom">
        <div>
        <Bloco titulo="Evolução do faturamento" canto={`${rotuloCat(categoria)} · ${new Date().getFullYear()} vs. ${anoAnterior}`}>
          <Estado
            carregando={carregFluxo}
            erro={erroFluxo}
            vazio={ehSympla || !linhasFluxo.length}
            vazioTitulo={ehSympla ? "Sympla não tem série mensal" : undefined}
            vazioDica={ehSympla ? "A view do Sympla é agregada e não traz data — sem dimensão temporal, não há evolução mensal honesta a mostrar." : undefined}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4, fontSize: 10.5, color: C.muted, fontWeight: 600 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: `linear-gradient(150deg, ${C.goldTop}, ${C.goldBase})` }} /> {new Date().getFullYear()}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 13, height: 0, borderTop: `2px dashed ${AZUL_ANTERIOR}` }} /> {anoAnterior} · mesmos meses
              </span>
            </div>
            <BarrasEvolucao serie={evolucao} anoAnterior={anoAnterior} onSelecionarMes={filtrarPeloMes} />
          </Estado>
        </Bloco>

        {/* Sympla é evento, outra natureza — não entra neste cruzamento. */}
        {!ehSympla && (
          <Bloco titulo="Matrículas vs. Faturamento" canto={`${rotuloCat(categoria)} · ${rotulo}`}>
            <Estado
              carregando={ehGeral ? geralMensal.isLoading : matfat.isLoading}
              erro={ehGeral ? geralMensal.error : matfat.error}
              vazio={!matFat.length}
              vazioTitulo="Nenhuma matrícula no período"
              vazioDica={`Nada entre ${inicio} e ${fim}. Troque o período no topo.`}
            >
              <MatriculasVsFaturamento serie={matFat} />
            </Estado>
          </Bloco>
        )}
        </div>

        <div>
          <Bloco
            titulo={`Consultoras · ${rotuloCat(categoria)}`}
            canto={
              <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 10 }}>
                  {ehSympla ? "todos os tempos" : geral ? "todos os tempos" : rotulo}
                </span>
                {!ehSympla && <ToggleVisao valor={visao} onChange={setVisao} />}
              </span>
            }
          >
            <Estado
              carregando={fonte.isLoading}
              erro={fonte.error}
              vazio={!podio.length}
              vazioTitulo={ehSympla || geral ? undefined : "Nenhuma venda no período"}
              vazioDica={ehSympla || geral ? undefined : `Nenhuma venda entre ${inicio} e ${fim}. Troque o período no topo, ou veja em "Geral".`}
            >
              {/* Hover com cursos em todas as categorias, menos Sympla (evento,
                  sem cursos). Sympla usa o card puro, sem wrapper. */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(Math.max(podio.length, 1), 3)}, 1fr)`, gap: 8 }}>
                {podio.slice(0, 3).map((c, i) => (
                  ehSympla
                    ? <CardPodio key={c.consultor_id ?? c.consultora} c={c} pos={i + 1} />
                    : <CardComCursos key={c.consultor_id ?? c.consultora} c={c} pos={i + 1}
                        cursos={cursosPorConsultora.get(c.consultora)} />
                ))}
              </div>
              {podio.length > 3 && (
                <div style={{ marginTop: 8 }}>
                  <ListaConsultorasCursos linhas={podio.slice(3)}
                    cursosPorConsultora={cursosPorConsultora} top={4} />
                </div>
              )}
            </Estado>
          </Bloco>

      {/* Carinhas são do time GGB. Aparecem no GGB e no consolidado Geral
          (que inclui o GGB); nas demais categorias o bloco nem aparece. */}
      {mostraCarinhas && (
      <Bloco titulo="Placar · carinhas" canto={`${rotulo} · GGB · público`} sem altura={210}>
        <Estado
          carregando={carinhas.isLoading}
          erro={carinhas.error}
          vazio={!totalPeriodo}
          vazioTitulo={tituloVazioFluxo(modo)}
          vazioDica={`Nenhuma venda classificada entre ${inicio} e ${fim}. É normal: o negócio vende em lote — troque o período no topo.`}
        >
          {linhas.map((p) => (
            <LinhaPlacar key={p.consultor_id ?? p.consultora} p={p}
              onVerdes={() => setVerdesDe(p.consultora)} />
          ))}
          <div style={{ display: "flex", gap: 8, padding: "10px 20px", background: "rgba(255,255,255,.02)" }}>
            <AlertTriangle size={12} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
              <b style={{ color: C.up }}>Verde</b> = venda 100% Pix, transferência ou dinheiro.{" "}
              <b style={{ color: C.warn }}>Amarela</b> = mistura (parte Pix, parte cartão).{" "}
              <b style={{ color: C.down }}>Vermelha</b> = 100% Stone. A cada{" "}
              <b style={{ color: C.muted }}>10 verdes</b>, um brinde surpresa. A base vai desde
              jan/2025 e está recortada pelo período do topo. Placar público: todas veem o de todas.
            </span>
          </div>
        </Estado>
      </Bloco>
      )}
        </div>
      </div>

      <RodapeIntegracoes fontes={ehSympla ? ["sympla"] : ["salesforce", "cispay"]} />

      {verdesDe && (
        <PainelVerdes
          consultora={verdesDe}
          rotulo={rotulo}
          linhas={verdesLinhas}
          carregando={verdesDet.isLoading}
          erro={verdesDet.error}
          onFechar={() => setVerdesDe(null)}
        />
      )}
    </>
  );
}

// Paleta das fatias de "Formas de pagamento" — dourado desbotando pro cinza.
const PALETA_FORMAS = [C.gold, C.goldBase, "#8B8B90", "#55555c", C.up, C.warn];

// Miolo do donut de formas: rótulo curto (último token), pra não vazar do
// centro. O nome completo fica na legenda ao lado. "Cartão/PIX CisPay" → "CisPay".
const abreviaForma = (s) => {
  const toks = String(s ?? "").trim().split(/[\s/]+/).filter(Boolean);
  return toks.length ? toks.at(-1) : "—";
};

function HubFinanceiro() {
  const { inicio, fim, rotulo, modo } = usePeriodo();
  const recCat = useFinanceiroReceitaCategoriaPeriodo();
  const recCatDetalhe = useFinanceiroReceitaCategoriaDetalhe();
  const pagPeriodo = useFinanceiroPagamentosPeriodo();
  const qualid = useFinanceiroQualidadePeriodo();
  const caixaHor = useFinanceiroCaixaHorizonte();
  const fpag = useFinanceiroFormasPagamento();
  const recMensal = useFinanceiroReceitaMensal();
  const caixaMensal = useFinanceiroCaixaMensal();
  const recebidoMensal = useFinanceiroRecebidoMensal();
  const inadOrig = useFinanceiroInadimpOrigem();
  const inadimp = useFinanceiroInadimp();
  const aReceberHor = useFinanceiroAReceberHorizonte();
  const despCat = useFinanceiroDespesaCategoriaPeriodo();
  const aPagarHor = useFinanceiroAPagarHorizonte();
  const pagoMensal = useFinanceiroPagoMensal();

  // Ranqueio pela receita_unidade (o que fica na Febracis), separo o
  // "Sem vínculo" pra ele nunca aparecer no topo como se fosse produto,
  // e calculo a cobertura: quanto da receita tem categoria identificada.
  const categorias = useMemo(() => {
    // `repasse` (migration 27) cobre coach, holding do CIS e treinadores de
    // mentoria — não só o coach. Nome antigo era repasse_coach.
    const recorte = somarPor(noPeriodo(recCat.data, { inicio, fim }), "categoria",
      ["receita_bruta", "receita_unidade", "repasse", "vendas"]);
    let rows = recorte.map((r) => ({
      categoria: ehSemVinculo(r.categoria) ? "Sem vínculo" : (r.categoria ?? "—"),
      vendas: Number(r.vendas ?? 0),
      bruto: Number(r.receita_bruta ?? 0),
      unidade: Number(r.receita_unidade ?? 0),
      repasse: Number(r.repasse ?? 0),
      orfa: ehSemVinculo(r.categoria),
    }));
    const total = rows.reduce((s, r) => s + r.unidade, 0);
    const anterior = intervaloAnterior({ inicio, fim, modo });
    const recorteAnterior = somarPor(noPeriodo(recCat.data, anterior), "categoria", ["receita_unidade"]);
    const totalAnterior = recorteAnterior.reduce((s, r) => s + Number(r.receita_unidade ?? 0), 0);
    const participacaoAnterior = new Map(recorteAnterior.map((r) => [
      ehSemVinculo(r.categoria) ? "Sem vínculo" : (r.categoria ?? "—"),
      totalAnterior > 0 ? (Number(r.receita_unidade ?? 0) / totalAnterior) * 100 : 0,
    ]));
    rows = rows.map((r) => ({
      ...r,
      variacaoForca: total > 0 && totalAnterior > 0
        ? (r.unidade / total) * 100 - Number(participacaoAnterior.get(r.categoria) ?? 0)
        : null,
    }));
    const reais = rows.filter((r) => !r.orfa).sort((a, b) => b.unidade - a.unidade);
    const orfas = rows.filter((r) => r.orfa);
    const vendasTot = rows.reduce((s, r) => s + r.vendas, 0);
    const semVinc = orfas.reduce((s, r) => s + r.unidade, 0);
    return { reais, orfas, total, vendasTot, semVinc, cobertura: total ? ((total - semVinc) / total) * 100 : null };
  }, [recCat.data, inicio, fim, modo]);

  /* Comparativo do KPI principal: somente no filtro Mês, porque comparar Ano,
     Hoje ou 7 dias contra um mês inteiro misturaria janelas diferentes. */
  const receitaMesAnterior = useMemo(() => {
    if (modo !== "mes") return null;
    const anoMes = String(inicio).slice(0, 7);
    const a = Number(anoMes.slice(0, 4));
    const m = Number(anoMes.slice(5, 7)) - 1;
    const anterior = new Date(a, m - 1, 1);
    const ai = anterior.getFullYear(), mi = anterior.getMonth();
    const de = iso(new Date(ai, mi, 1));
    const ate = iso(new Date(ai, mi + 1, 0));
    return noPeriodo(recCat.data, { inicio: de, fim: ate })
      .reduce((s, r) => s + Number(r.receita_unidade ?? 0), 0);
  }, [recCat.data, inicio, modo]);
  const deltaReceitaMes = receitaMesAnterior > 0
    ? ((categorias.total - receitaMesAnterior) / receitaMesAnterior) * 100
    : null;

  const detalhesReceitaCategoria = useMemo(() => {
    const categoriasMap = new Map();
    for (const r of noPeriodo(recCatDetalhe.data, { inicio, fim })) {
      const categoria = ehSemVinculo(r.categoria) ? "Sem vínculo" : String(r.categoria ?? "—");
      if (!categoriasMap.has(categoria)) categoriasMap.set(categoria, new Map());
      const produtos = categoriasMap.get(categoria);
      const chave = String(r.curso ?? "Sem identificação");
      const atual = produtos.get(chave) ?? {
        nome: r.curso_curto ?? r.curso ?? "Sem identificação",
        nomeCompleto: r.curso ?? "Sem identificação", vendas: 0, unidade: 0,
      };
      atual.vendas += Number(r.vendas ?? 0);
      atual.unidade += Number(r.receita_unidade ?? 0);
      produtos.set(chave, atual);
    }
    const saida = new Map();
    for (const [categoria, produtos] of categoriasMap) {
      const itens = [...produtos.values()].sort((a, b) => b.unidade - a.unidade);
      const totalCategoria = itens.reduce((s, item) => s + item.unidade, 0);
      saida.set(categoria, itens.map((item) => ({
        ...item, pct: totalCategoria > 0 ? (item.unidade / totalCategoria) * 100 : 0,
      })));
    }
    return saida;
  }, [recCatDetalhe.data, inicio, fim]);

  /* Status de pagamento, somando as origens. A view vem por ANO, e isso
     importa: "sem status" é PASSIVO ANTIGO. Era 44% em 2021 e 31% em 2023;
     caiu pra 4,5% em 2025 e 0% em 2026, quando o sync do CisPay passou a
     trazer o status automático. Somar tudo dava 15,3% e alarmava sobre um
     problema já resolvido — dava a entender que a inadimplência recente é
     duvidosa, e ela não é.

     Então o painel segue o ANO DO PERÍODO SELECIONADO (com fallback no último
     ano com matrícula, pra não zerar num ano sem base): trocar o seletor troca
     o número, em vez de mostrar sempre a mesma média. Esta view só tem
     granularidade de ANO — a taxa de "sem status" do chip, que reage mês a
     mês, vem da vw_financeiro_qualidade_periodo (logo abaixo).
     O donut usa o total INCLUINDO sem_status — assim "Sem status" segue como
     fatia honesta, não sumido do denominador. */
  const pagPorAno = useMemo(() => {
    const somar = (linhas) => {
      let pagos = 0, pend = 0, perd = 0, sem = 0, matr = 0;
      for (const r of linhas) {
        pagos += Number(r.pagos ?? 0); pend += Number(r.pendentes ?? 0);
        perd += Number(r.perdidos ?? 0); sem += Number(r.sem_status ?? 0);
        matr += Number(r.matriculas ?? 0);
      }
      const tot = pagos + pend + perd + sem;
      return {
        pagos, pend, perd, sem, matr, tot,
        pctPago: tot ? (pagos / tot) * 100 : null,
        pctEmAberto: tot ? (pend / tot) * 100 : null,
        pctSem: matr ? (sem / matr) * 100 : (tot ? (sem / tot) * 100 : null),
      };
    };
    const de = String(inicio).slice(0, 7), ate = String(fim).slice(0, 7);
    const linhas = (pagPeriodo.data ?? []).filter((r) => r.mes != null && Number(r.matriculas ?? 0) > 0);
    const recorte = linhas.filter((r) => {
      const mes = String(r.mes).slice(0, 7);
      return mes >= de && mes <= ate;
    });
    const ano = Number(String(inicio).slice(0, 4));
    return {
      ano,
      periodo: modo === "mes" ? dataCurta(`${de}-01`) : (modo === "ano" ? String(ano) : rotulo),
      recente: somar(recorte),
      foraDoFiltro: false,
    };
  }, [pagPeriodo.data, inicio, fim, modo, rotulo]);
  const pagTot = pagPorAno.recente;

  /* Taxa de "sem status" do PERÍODO selecionado (migration 109). A view vem
     por MÊS com `total` e `sem_status` brutos; pra juntar meses do período a
     conta é sum(sem_status) / sum(total) — média das porcentagens mensais
     distorce quando os meses têm volumes diferentes (2023 dá 13,3% somando e
     15,1% na média das médias).

     O chip mostra só a taxa e o rótulo do período. A segunda linha só aparece
     quando calar seria mentir: em Hoje/7 dias a view mensal não tem
     granularidade de dia (o número é o do mês), e quando não há venda no
     período não existe taxa nenhuma pra mostrar. */
  const semStatus = useMemo(() => {
    const de = String(inicio).slice(0, 7), ate = String(fim).slice(0, 7);
    let total = 0, sem = 0;
    for (const r of qualid.data ?? []) {
      const m = String(r.mes ?? "").slice(0, 7);
      if (!m || m < de || m > ate) continue;
      total += Number(r.total ?? 0);   // brutos: a soma é sobre eles,
      sem += Number(r.sem_status ?? 0); // nunca sobre os percentuais mensais
    }
    const pct = total ? (sem / total) * 100 : null;
    const curto = modo === "hoje" || modo === "7d";
    return {
      total, sem, pct,
      sub: pct == null ? "sem venda no período" : (curto ? "taxa do mês · a fonte é mensal" : null),
    };
  }, [qualid.data, inicio, fim, modo]);

  const aReceber = useMemo(
    () => (caixaHor.data ?? []).reduce((s, r) => s + Number(r.a_receber ?? 0), 0),
    [caixaHor.data]
  );

  // Formas de pagamento: a view é diária e este agrupamento respeita o
  // intervalo global usado pelos demais fluxos do Financeiro.
  const formas = useMemo(() => {
    return somarPor(noPeriodo(fpag.data, { inicio, fim }), "forma", ["receita"])
      .map((r) => ({ rotulo: r.forma ?? "—", valor: Number(r.receita ?? 0) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .map((f, i) => ({ ...f, cor: PALETA_FORMAS[i % PALETA_FORMAS.length] }));
  }, [fpag.data, inicio, fim]);

  // Evolução mensal da receita (Salesforce). Mês corrente sai parcial.
  const evolucao = useMemo(() => serieMensal(recMensal.data, "receita"), [recMensal.data]);

  // Caixa CisPay. Contrato: { mes, caixa }. View pode não existir ainda.
  const caixaSerie = useMemo(() => serieMensal(caixaMensal.data, "caixa"), [caixaMensal.data]);

  /* ---- Inadimplência (Conta Azul) ---- */
  const vencidos = useMemo(
    () => somarPor(noPeriodo(inadOrig.data, { inicio, fim }), "origem", ["valor_vencido", "parcelas_vencidas"])
      .map((r) => ({
        rotulo: String(r.origem ?? "—"),
        valor: Number(r.valor_vencido ?? 0),
        parcelas: Number(r.parcelas_vencidas ?? 0),
      }))
      .filter((r) => r.valor > 0)
      .sort((a, b) => b.valor - a.valor),
    [inadOrig.data, inicio, fim]
  );
  const vencidoTot = vencidos.reduce((s, r) => s + r.valor, 0);
  const parcelasVencidas = vencidos.reduce((s, r) => s + r.parcelas, 0);
  const aReceber30_90 = useMemo(() => porHorizonte(aReceberHor.data, "a_receber"), [aReceberHor.data]);
  const aReceberTot = aReceber30_90.reduce((s, r) => s + r.valor, 0);

  /* ---- Despesa (Conta Azul) — "pra onde vai o dinheiro" ---- */
  // O prefixo "(-)" já vem do dado; ranqueio pelo total lançado.
  const despesas = useMemo(
    () => somarPor(noPeriodo(despCat.data, { inicio, fim }), "categoria", ["total", "pago"])
      .map((r) => ({ rotulo: String(r.categoria ?? "—"), valor: Number(r.total ?? 0), pago: Number(r.pago ?? 0) }))
      .filter((r) => r.valor > 0)
      .sort((a, b) => b.valor - a.valor),
    [despCat.data, inicio, fim]
  );
  const despesaTot = despesas.reduce((s, r) => s + r.valor, 0);
  const despesaPaga = despesas.reduce((s, r) => s + r.pago, 0);
  const aPagar = useMemo(() => porHorizonte(aPagarHor.data, "a_pagar"), [aPagarHor.data]);
  const aPagarTot = aPagar.reduce((s, r) => s + r.valor, 0);
  const evolDespesa = useMemo(() => serieMensal(pagoMensal.data, "pago"), [pagoMensal.data]);

  const statusSeg = [
    { rotulo: "Pago", valor: pagTot.pagos, cor: C.up },
    { rotulo: "Em aberto", valor: pagTot.pend, cor: C.warn },
    { rotulo: "Negado", valor: pagTot.perd, cor: C.down },
    { rotulo: "Sem status", valor: pagTot.sem, cor: "#55555c" },
  ];
  const pctPagoCentro = pagTot.tot ? Math.round((pagTot.pagos / pagTot.tot) * 100) : 0;
  const ticket = categorias.vendasTot ? categorias.total / categorias.vendasTot : null;
  const formasTot = formas.reduce((s, f) => s + f.valor, 0);
  const leaderPct = formasTot ? Math.round((formas[0].valor / formasTot) * 100) : 0;
  const evolSemFonte = !!recMensal.error || evolucao.length < 2;
  const caixaSemFonte = !!caixaMensal.error || !caixaSerie.length;
  // Recebido: sempre o mês mais recente com lançamento (independe do filtro).
  const recebido = recebidoMaisRecente(recebidoMensal.data, ymCorrente());
  const inad = inadimplenciaResumo(inadimp.data, recebidoMensal.data);

  /* Leitura executiva do mês mais recente. Receita/categorias/ticket usam a
     mesma fonte do gráfico; caixa usa o extrato real da CisPay. */
  const movimentosMes = useMemo(() => {
    const porMes = new Map();
    for (const r of recCat.data ?? []) {
      const mes = String(r.data ?? r.mes ?? "").slice(0, 7);
      if (!mes) continue;
      const item = porMes.get(mes) ?? { total: 0, vendas: 0, categorias: new Map() };
      const valor = Number(r.receita_unidade ?? 0);
      item.total += valor;
      item.vendas += Number(r.vendas ?? 0);
      const cat = ehSemVinculo(r.categoria) ? "Sem vínculo" : String(r.categoria ?? "—");
      item.categorias.set(cat, (item.categorias.get(cat) ?? 0) + valor);
      porMes.set(mes, item);
    }
    const deFiltro = String(inicio).slice(0, 7), ateFiltro = String(fim).slice(0, 7);
    const mesesDisponiveis = [...porMes.keys()]
      .filter((mes) => mes >= deFiltro && mes <= ateFiltro)
      .sort();
    const atualMes = mesesDisponiveis.at(-1);
    const atual = atualMes ? porMes.get(atualMes) : null;
    const d = atualMes ? new Date(`${atualMes}-01T00:00:00`) : null;
    if (d) d.setMonth(d.getMonth() - 1);
    const anteriorMes = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
    const anterior = anteriorMes ? porMes.get(anteriorMes) : null;
    const deltaPct = (a, b) => b > 0 ? ((a - b) / b) * 100 : null;
    const categoria = (base, nome) => Number(base?.categorias.get(nome) ?? 0);
    const eventoAtual = categoria(atual, "Evento"), eventoAnterior = categoria(anterior, "Evento");
    const ggbAtual = categoria(atual, "GGB"), ggbAnterior = categoria(anterior, "GGB");
    const ticketAtual = atual?.vendas ? atual.total / atual.vendas : null;
    const ticketAnterior = anterior?.vendas ? anterior.total / anterior.vendas : null;
    const caixaAtual = caixaSerie.find((r) => String(r.mes).slice(0, 7) === atualMes)?.valor ?? null;
    const caixaAnterior = caixaSerie.find((r) => String(r.mes).slice(0, 7) === anteriorMes)?.valor ?? null;
    return {
      atualMes, anteriorMes,
      evento: anterior ? eventoAtual - eventoAnterior : null,
      ggb: deltaPct(ggbAtual, ggbAnterior),
      caixa: caixaAtual != null && caixaAnterior > 0 ? deltaPct(caixaAtual, caixaAnterior) : null,
      ticket: ticketAtual != null && ticketAnterior > 0 ? deltaPct(ticketAtual, ticketAnterior) : null,
    };
  }, [recCat.data, caixaSerie, inicio, fim]);
  // Percentual = status das matrículas; R$ = posição real a receber na CisPay.
  // Não multiplicar o percentual pela receita: isso seria uma estimativa.
  const emAbertoValor = aReceber;

  const conversaoCaixa = useMemo(() => {
    const de = String(inicio).slice(0, 7), ate = String(fim).slice(0, 7);
    const caixa = caixaSerie
      .filter((r) => {
        const mes = String(r.mes).slice(0, 7);
        return mes >= de && mes <= ate;
      })
      .reduce((s, r) => s + Number(r.valor ?? 0), 0);
    const pct = categorias.total > 0 ? (caixa / categorias.total) * 100 : null;
    if (modo !== "mes") return { caixa, pct, deltaPp: null };

    const d = new Date(`${de}-01T00:00:00`);
    d.setMonth(d.getMonth() - 1);
    const mesAnterior = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const receitaAnterior = (recCat.data ?? [])
      .filter((r) => String(r.data ?? r.mes ?? "").slice(0, 7) === mesAnterior)
      .reduce((s, r) => s + Number(r.receita_unidade ?? 0), 0);
    const caixaAnterior = caixaSerie.find((r) => String(r.mes).slice(0, 7) === mesAnterior)?.valor ?? 0;
    const pctAnterior = receitaAnterior > 0 ? (Number(caixaAnterior) / receitaAnterior) * 100 : null;
    return { caixa, pct, deltaPp: pct != null && pctAnterior != null ? pct - pctAnterior : null };
  }, [inicio, fim, modo, caixaSerie, categorias.total, recCat.data]);

  return (
    <>
      {/* Faixa de KPIs compactos — âncora dourada + 4 métricas do mês */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <ChipKpi hero className="kpiTopoFinanceiro" Icone={Wallet} label="Recebido líquido" valor={moeda(categorias.total)}
          delta={deltaReceitaMes != null ? `${Math.abs(deltaReceitaMes).toFixed(0)}%` : null}
          up={deltaReceitaMes >= 0} deltaBrilha
          deltaNota={deltaReceitaMes != null ? "vs. mês anterior" : null}
          nota={rotulo}
          sub={modo === "mes" && deltaReceitaMes == null ? "sem base no mês anterior" : null} />
        {/* Qualidade do dado do PERÍODO selecionado — trocar o ano troca o
            número (2026: 0% · 2024: 8,8% · 2023: 13,3%). Sem média histórica:
            somar tudo escondia que o buraco é passivo antigo, já corrigido.
            "Vendas", não "pagamentos": a view deduplica por original_id_venda
            antes de contar, então a unidade é a venda, não a linha de
            pagamento (uma venda parcelada é uma só aqui). */}
        <ChipKpi className="kpiTopoFinanceiro" Icone={Percent} label="Conversão em caixa"
          valor={conversaoCaixa.pct != null ? conversaoCaixa.pct.toFixed(0) : "—"} unidade="%"
          delta={conversaoCaixa.deltaPp != null ? `${Math.abs(conversaoCaixa.deltaPp).toFixed(0)} p.p.` : null}
          up={conversaoCaixa.deltaPp >= 0}
          deltaNota={conversaoCaixa.deltaPp != null ? "vs. mês anterior" : null}
          nota={conversaoCaixa.pct != null ? rotulo : "sem base"}
          sub={conversaoCaixa.pct != null ? `${moeda(conversaoCaixa.caixa)} de ${moeda(categorias.total)}` : null}
          subCentralizado />
        <ChipKpi className="kpiTopoFinanceiro" Icone={Receipt} label="Ticket médio" valor={ticket != null ? moeda(ticket) : "—"} nota={rotulo} />
        <ChipKpi className="kpiTopoFinanceiro" Icone={Hourglass} label="A receber" valor={moeda(aReceber)} nota="CisPay · posição atual" />
        <ChipKpi className="kpiTopoFinanceiro" Icone={Receipt} label={recebido ? `Recebido em ${dataCurta(recebido.mes)}` : "Recebido"}
          valor={recebido ? moeda(recebido.valor) : "—"}
          nota={recebido ? (recebido.fechado ? "último fechado · fluxo do mês" : "mês corrente · fluxo") : "sem lançamento"} />
      </div>

      {/* Linha 1: categoria (larga) · status donut · caixa destaque */}
      <div className="finRow1" style={{ marginBottom: 16 }}>
        <Bloco titulo="Receita por categoria" canto={rotulo} altura={ALTURA_PAINEL}>
          <Estado
            carregando={recCat.isLoading}
            erro={recCat.error}
            vazio={!categorias.reais.length && !categorias.orfas.length}
            vazioTitulo={tituloVazioFluxo(modo)}
            vazioDica={`Nenhuma receita com data entre ${inicio} e ${fim}. É normal: o negócio vende em lote — troque o período no topo.`}
          >
            <BarrasCategoria reais={categorias.reais} orfas={categorias.orfas}
              semVinc={categorias.semVinc} cobertura={categorias.cobertura}
              detalhesPorCategoria={detalhesReceitaCategoria} />
          </Estado>
        </Bloco>

        <Bloco titulo="Principais movimentos do mês"
          canto={movimentosMes.atualMes && movimentosMes.anteriorMes ? `${movimentosMes.atualMes} vs ${movimentosMes.anteriorMes}` : null}
          altura={ALTURA_PAINEL}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {[
              ["Evento", movimentosMes.evento, "moeda", "ganhou", "perdeu"],
              ["GGB", movimentosMes.ggb, "pct", "cresceu", "caiu"],
              ["Caixa CisPay", movimentosMes.caixa, "pct", "cresceu", "caiu"],
              ["Ticket médio", movimentosMes.ticket, "pct", "subiu", "caiu"],
            ].map(([nome, valor, tipo, verboPositivo, verboNegativo]) => {
              const positivo = valor != null && valor >= 0;
              const medida = valor == null ? null : tipo === "moeda"
                ? moeda(Math.abs(valor))
                : `${Math.abs(valor).toFixed(0)}%`;
              const frase = valor == null
                ? `${nome} sem base para comparação`
                : `${nome} ${positivo ? verboPositivo : verboNegativo} ${medida}`;
              return <div key={nome} style={{ padding: "10px 0", borderBottom: `1px solid ${C.hair}` }}>
                <b style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 14,
                  color: valor == null ? C.faint : (positivo ? C.up : C.down), fontFamily: GROTESK }}>
                  <span aria-hidden="true" style={{ fontSize: 12 }}>{valor == null ? "⚪" : (positivo ? "🟢" : "🔴")}</span>
                  <span>{frase}</span>
                </b>
              </div>;
            })}
            <div style={{ padding: "10px 0" }}>
              <b style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 14, color: C.warn, fontFamily: GROTESK }}>
                <span aria-hidden="true" style={{ fontSize: 12 }}>{pagTot.pctEmAberto != null ? "🟠" : "⚪"}</span>
                <span>{pagTot.pctEmAberto != null
                  ? `Em aberto representa ${pagTot.pctEmAberto.toFixed(1)}% · ${moeda(emAbertoValor)}`
                  : "Em aberto sem base disponível"}</span>
              </b>
            </div>
          </div>
        </Bloco>

      </div>

      {/* Linha 2: evolução mensal (larga) · formas de pagamento donut */}
      <div className="finRow2">
        <Bloco titulo="Evolução mensal da receita" canto="R$ · Receita" altura={ALTURA_PAINEL}>
          {recMensal.isLoading ? (
            <Estado carregando />
          ) : evolSemFonte ? (
            <div style={{ display: "flex", gap: 9, padding: "8px 0" }}>
              <Database size={15} style={{ color: C.faint, marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Aguardando a view mensal</div>
                <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
                  Quando <b style={{ color: C.muted }}>vw_financeiro_receita_mensal</b> existir, a linha aparece aqui — com o mês em curso tracejado (parcial).
                </div>
              </div>
            </div>
          ) : (
            <LinhaEvolucao serie={evolucao} interativo rotularVar={false} soDestaques yRedondo />
          )}
        </Bloco>

        <Bloco titulo="Formas de pagamento" canto={rotulo} altura={ALTURA_PAINEL}>
          <Estado carregando={fpag.isLoading} erro={fpag.error} vazio={!formas.length}>
            <Donut segmentos={formas} size={118} centroSize={17} centroValor={formas[0] ? abreviaForma(formas[0].rotulo) : "—"} centroLabel={`${leaderPct}% líder`} centroCor={C.gold} />
          </Estado>
        </Bloco>
      </div>

      <div style={{ marginTop: 16 }}>
        <Bloco titulo="Status de pagamento"
          canto={pagTot.tot ? `${pagPorAno.periodo ?? ""} · ${pctPagoCentro}% pago` : null}>
          <Estado carregando={pagPeriodo.isLoading} erro={pagPeriodo.error} vazio={!pagTot.tot}>
            <Donut segmentos={statusSeg} centroValor={`${pctPagoCentro}%`} centroLabel="pago" centroCor={C.up} />
            <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.hair}` }}>
              {pagTot.sem > 0 ? (
                <>
                  <AlertTriangle size={12} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
                    {pagTot.pctSem != null ? `${pagTot.pctSem.toFixed(1)}% sem status` : "Parte sem status"} em {pagPorAno.periodo} — Stone/legado batido a mão. <b style={{ color: C.muted }}>Não é inadimplência.</b>
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck size={12} style={{ color: C.up, marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
                    Todas as matrículas de {pagPorAno.periodo} vêm com status (sync CisPay).
                  </span>
                </>
              )}
            </div>
            {pagPorAno.foraDoFiltro && (
              <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
                sem base em {String(inicio).slice(0, 4)} — mostrando {pagPorAno.ano}
              </div>
            )}
          </Estado>
        </Bloco>
      </div>

      {/* ============ INADIMPLÊNCIA ============ */}
      <SecaoTitulo titulo="Inadimplência por vencimento"
        canto={`${numero(parcelasVencidas)} parcelas · ${moeda(vencidoTot)} · vencimento em ${rotulo}`} />
      <div className="finRow2">
        <Bloco titulo="Vencidos por origem" canto={vencidoTot ? `${moeda(vencidoTot)} · ${rotulo}` : rotulo} sem altura={ALTURA_PAINEL}>
          <Estado carregando={inadOrig.isLoading} erro={inadOrig.error} vazio={!vencidos.length}
            vazioTitulo={`Sem vencidos em ${rotulo}`}
            vazioDica="Nenhuma parcela que venceu neste período continua inadimplente hoje. Troque o período para consultar vencimentos anteriores.">
            <Lista linhas={vencidos} total={vencidoTot} />
          </Estado>
        </Bloco>
        <Bloco titulo="A receber por horizonte" canto="30 / 60 / 90 dias" sem altura={ALTURA_PAINEL}>
          <Estado carregando={aReceberHor.isLoading} erro={aReceberHor.error} vazio={!aReceber30_90.length}>
            <Lista linhas={aReceber30_90} total={aReceberTot} />
          </Estado>
        </Bloco>
      </div>

      {/* ============ DESPESAS ============ */}
      <SecaoTitulo titulo="Despesas — para onde vai o dinheiro" canto="Conta Azul · despesa e caixa, não receita" />
      <div className="finRow2" style={{ marginBottom: 16 }}>
        <Bloco titulo="Despesa por categoria" canto={rotulo} sem altura={ALTURA_PAINEL}>
          <Estado
            carregando={despCat.isLoading}
            erro={despCat.error}
            vazio={!despesas.length}
            vazioTitulo={tituloVazioFluxo(modo)}
            vazioDica={`Nenhuma despesa com data entre ${inicio} e ${fim}. Troque o período no topo.`}
          >
            <Lista linhas={despesas} total={despesaTot} top={6} />
            <div style={{ display: "flex", gap: 8, padding: "10px 20px", background: "rgba(255,255,255,.02)" }}>
              <AlertTriangle size={12} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
                Total = despesa lançada. Já pago: <b style={{ color: C.muted }}>{moeda(despesaPaga)}</b>
                {despesaTot > 0 && <> ({((despesaPaga / despesaTot) * 100).toFixed(0)}%)</>} — o resto ainda vence.
              </span>
            </div>
          </Estado>
        </Bloco>
        <Bloco titulo="A pagar por vencimento" canto={aPagarTot ? `${moeda(aPagarTot)} · posição atual` : "posição atual"} sem altura={ALTURA_PAINEL}>
          <Estado carregando={aPagarHor.isLoading} erro={aPagarHor.error} vazio={!aPagar.length}>
            <Lista linhas={aPagar} total={aPagarTot} />
          </Estado>
        </Bloco>
      </div>

      <Bloco titulo="Evolução da despesa" canto="R$ pago · mês" altura={ALTURA_PAINEL}>
        {pagoMensal.isLoading ? (
          <Estado carregando />
        ) : pagoMensal.error || evolDespesa.length < 2 ? (
          <Estado vazio />
        ) : (
          <LinhaEvolucao serie={evolDespesa} cor={C.down} idGrad="fillDesp" inverso
            interativo rotularVar={false} soDestaques yRedondo />
        )}
      </Bloco>

      <RodapeIntegracoes fontes={["salesforce", "conta_azul", "cispay"]} />
    </>
  );
}

/* ============ MARKETING ============
   O que é REAL: investimento, leads e custo por lead — vêm do Meta Ads.
   O que NÃO existe: atribuição de venda a campanha. Sem ela não há venda
   atribuída, faturamento atribuído, ROI nem conversão — e estimar qualquer
   um deles seria inventar o número mais político do hub. Esses campos
   aparecem desenhados e marcados "em construção", nunca preenchidos. */

// Reais com centavos. O `moeda` global compacta e arredonda pra 1 casa —
// bom pra R$ 415 mil, péssimo pra um CPL de R$ 2,01 (viraria "R$ 2").
const reaisCent = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

const somaMeses = (k, d) => {
  let a = Number(k.slice(0, 4)), m = Number(k.slice(5, 7)) - 1 + d;
  a += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return chaveMes(a, m);
};

/* O Meta entrega gasto e leads agregados por MÊS — não existe linha diária.
   "7 dias" e "Hoje" não têm recorte possível nesta fonte: devolver vazio se
   leria como "não investimos nada", então o hub cai no mês corrente e diz
   por quê (`diario`). O comparativo é o período equivalente anterior: ano
   contra ano (mesmos meses), mês contra mês.

   `geral` = todos os anos. Não tem período anterior (é a base inteira), e
   por isso devolve `ant: null` — as variações somem em vez de comparar com
   um passado que não existe. */
function recorteMkt({ modo, ano, mesIdx }, geral) {
  const h = new Date();
  const mesAtual = chaveMes(h.getFullYear(), h.getMonth());
  if (geral) {
    return {
      de: "0000-01", ate: mesAtual, rotulo: "Todos os anos",
      rotuloAnt: null, ant: null, diario: false, geral: true,
    };
  }
  if (modo === "ano") {
    const ate = `${ano}-12` > mesAtual ? mesAtual : `${ano}-12`;
    return {
      de: `${ano}-01`, ate, rotulo: String(ano), rotuloAnt: String(ano - 1), diario: false,
      ant: { de: `${ano - 1}-01`, ate: somaMeses(ate, -12) },
    };
  }
  const k = modo === "mes" ? chaveMes(ano, mesIdx) : mesAtual;
  const [ka, km] = [Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1];
  return {
    de: k, ate: k, rotulo: `${MESES[km]} ${ka}`, rotuloAnt: "mês anterior",
    diario: modo !== "mes",
    ant: { de: somaMeses(k, -1), ate: somaMeses(k, -1) },
  };
}

// Janela nula = "não existe período anterior" (modo Todos os anos): devolve
// vazio, e as variações somem em vez de comparar com um passado inventado.
const noMesMkt = (linhas, janela) =>
  !janela ? [] : (linhas ?? []).filter((r) => {
    const k = String(r.mes ?? "").slice(0, 7);
    return k && k >= janela.de && k <= janela.ate;
  });

/* Reduz as linhas por campanha ao MESMO formato da vw_marketing_resumo_mensal.
   Conferido linha a linha: investimento = Σ gasto, leads = Σ leads,
   gasto/leads de captação = Σ das campanhas de tipo "Captação". Por isso
   filtrar por produto não muda a fórmula de nenhum KPI — só o conjunto. */
const mensalDeCampanhas = (linhas) => {
  const m = new Map();
  for (const l of linhas ?? []) {
    const k = String(l.mes ?? "").slice(0, 10);
    if (!k) continue;
    const a = m.get(k) ?? { mes: k, investimento: 0, leads: 0, gasto_captacao: 0, leads_captacao: 0 };
    a.investimento += Number(l.gasto ?? 0);
    a.leads += Number(l.leads ?? 0);
    if (/capta/i.test(l.tipo ?? "")) {
      a.gasto_captacao += Number(l.gasto ?? 0);
      a.leads_captacao += Number(l.leads ?? 0);
    }
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
};

/* CPL nunca é média de médias: é Σ gasto de captação ÷ Σ leads de captação.
   Só campanha de captação gera lead — dividir pelo investimento TOTAL daria
   um custo por lead inflado, e a cobertura (`pctCapt`) mostra a diferença. */
const totaisMkt = (linhas) => {
  const t = { investimento: 0, leads: 0, gastoCapt: 0, leadsCapt: 0, mesesSemLead: 0 };
  for (const r of linhas) {
    const inv = Number(r.investimento ?? 0);
    t.investimento += inv;
    t.leads += Number(r.leads ?? 0);
    t.gastoCapt += Number(r.gasto_captacao ?? 0);
    t.leadsCapt += Number(r.leads_captacao ?? 0);
    if (inv > 0 && !Number(r.leads ?? 0)) t.mesesSemLead += 1;
  }
  t.cpl = t.leadsCapt ? t.gastoCapt / t.leadsCapt : null;
  t.pctCapt = t.investimento ? (t.gastoCapt / t.investimento) * 100 : null;
  return t;
};

const varMkt = (a, b) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const rotuloVar = (p) => (p == null ? null : `${Math.abs(p).toFixed(0)}%`);

/* KPI que ainda não tem fonte. Fica desenhado, esmaecido e com o motivo:
   escondê-lo apagaria a lacuna, e preenchê-lo seria inventar. */
function ChipEmBreve({ Icone, label, nota }) {
  return (
    <div title={nota} style={{
      display: "flex", alignItems: "center", gap: 9, minHeight: 56,
      background: "rgba(255,255,255,.015)", border: `1px dashed ${C.cardLine}`,
      borderRadius: 10, padding: "8px 11px",
    }}>
      <span style={{
        width: 25, height: 25, flexShrink: 0, borderRadius: 7, background: "rgba(255,255,255,.04)",
        color: C.dim, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icone size={13} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.faint, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ fontFamily: GROTESK, fontSize: 14.5, fontWeight: 700, color: C.dim, letterSpacing: "-.3px" }}>em construção</div>
        {nota && <div style={{ fontSize: 9.5, color: C.dim, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nota}</div>}
      </div>
    </div>
  );
}

/* Categorias da vw_marketing_desempenho. A ordem é fixa (as duas que geram
   lead primeiro), mas a LISTA vem do dado — categoria nova no banco aparece
   sozinha, sem passar por aqui. */
const ORDEM_CAT_MKT = ["CIS", "GGB", "LL", "Eventos", "Outros"];

/* Barra segmentada genérica, no mesmo desenho do seletor de período. */
function Segmentado({ opcoes, valor, onChange, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {label && (
        <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: ".5px" }}>
          {label}
        </span>
      )}
      <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.04)", border: `1px solid ${C.cardLine}`, borderRadius: 10, padding: 3 }}>
        {opcoes.map((o) => {
          const ativo = o.key === valor;
          return (
            <button key={String(o.key)} onClick={() => onChange(o.key)} aria-pressed={ativo} style={{
              fontFamily: SANS, fontSize: 11, fontWeight: 700, padding: "5px 9px",
              borderRadius: 7, border: "none", cursor: "pointer", whiteSpace: "nowrap",
              background: ativo ? `${C.gold}1F` : "transparent",
              color: ativo ? C.gold : C.muted,
            }}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Filtro travado — Canal e Status. O controle aparece porque foi pedido no
   desenho, mas desabilitado: o dado que o alimentaria (canal da venda com
   cobertura, status do lead) ainda não existe. */
function FiltroTravado({ label }) {
  return (
    <button disabled title="em construção — sem fonte para este recorte" style={{
      display: "flex", alignItems: "center", gap: 6, cursor: "not-allowed",
      background: "rgba(255,255,255,.02)", border: `1px dashed ${C.cardLine}`,
      borderRadius: 9, padding: "6px 10px", fontFamily: SANS,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.dim }}>em construção</span>
      <ChevronDown size={12} style={{ color: C.dim }} />
    </button>
  );
}

/* Categoria do Marketing = produto da campanha. Vocabulário próprio ("FCIS",
   "EG", "CIS 247"…), sem interseção com as categorias do Comercial — por
   isso não usa o seletor global. São dezenas de valores: dropdown, não
   barra de botões. Aqui "todos" faz sentido (é um orçamento só de mídia),
   ao contrário do Comercial, onde categoria é unidade de negócio separada. */
function SeletorProduto({ produtos, valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: ".5px" }}>Categoria</span>
      <button onClick={() => setAberto((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 11.5,
        fontWeight: 700, color: C.gold, background: "rgba(255,255,255,.04)",
        border: `1px solid ${C.cardLine}`, borderRadius: 9, padding: "6px 10px",
        cursor: "pointer", maxWidth: 240,
      }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {valor ?? "Todos os produtos"}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0 }} />
      </button>
      <Popover aberto={aberto} onFechar={() => setAberto(false)} largura={252}>
        <button style={itemPop(valor == null)} onClick={() => { onChange(null); setAberto(false); }}>
          Todos os produtos
        </button>
        {produtos.map((p) => (
          <button key={p.nome} style={itemPop(valor === p.nome)}
            onClick={() => { onChange(p.nome); setAberto(false); }}>
            {p.nome} · {moeda(p.gasto)}
          </button>
        ))}
      </Popover>
    </div>
  );
}

/* Investimento (R$, barras) x Leads (volume, linha) mês a mês. Dois eixos —
   reais e contagem não dividem escala. Responde "gastamos mais e trouxemos
   mais lead, ou só gastamos mais?". */
function InvestimentoXLeads({ serie }) {
  if (!serie.length) return null;
  const W = 720, H = 200, padL = 42, padR = 42, padT = 18, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB, base = padT + plotH;
  const maxInv = Math.max(...serie.map((s) => s.investimento), 1);
  const maxLead = Math.max(...serie.map((s) => s.leads), 1);
  const n = serie.length, slot = plotW / n, bw = Math.min(34, slot * 0.5);
  const cx = (i) => padL + slot * i + slot / 2;
  const yInv = (v) => base - (v / maxInv) * plotH;
  const yLead = (v) => base - (v / maxLead) * plotH;
  const pts = serie.map((s, i) => [cx(i), yLead(s.leads)]);
  const idxParcial = serie.findIndex((s) => s.parcial);
  const ultSolido = idxParcial > 0 ? idxParcial : n - 1;
  const solido = pts.slice(0, ultSolido + 1).map((p) => p.join(",")).join(" ");
  const tracejado = idxParcial > 0
    ? [pts[idxParcial - 1], pts[idxParcial]].map((p) => p.join(",")).join(" ") : null;
  const alvo = 12, passo = Math.max(1, Math.ceil(n / alvo));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4, fontSize: 10.5, color: C.muted, fontWeight: 600 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: `linear-gradient(150deg, ${C.goldTop}, ${C.goldBase})` }} /> Investimento
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 13, height: 0, borderTop: `2px solid ${C.up}` }} /> Leads
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <defs>
          <linearGradient id="gradInv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.goldTop} /><stop offset="1" stopColor={C.goldBase} />
          </linearGradient>
          <pattern id="hachInv" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.gold} strokeWidth="3" opacity="0.4" />
          </pattern>
        </defs>

        {/* eixo esquerdo = R$ investido; direito = volume de leads */}
        {[0, 0.5, 1].map((f, i) => {
          const yy = base - f * plotH;
          return (
            <g key={i}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,.06)" strokeWidth="1" />
              <text x={padL - 6} y={yy + 3} fontSize="9" textAnchor="end" fill={C.faint} fontFamily={SANS}>
                {compacto(maxInv * f)}
              </text>
              <text x={W - padR + 6} y={yy + 3} fontSize="9" textAnchor="start" fill={C.up} opacity="0.8" fontFamily={SANS}>
                {Math.round(maxLead * f)}
              </text>
            </g>
          );
        })}

        {serie.map((s, i) => (
          <rect key={s.mes} x={cx(i) - bw / 2} y={yInv(s.investimento)} width={bw}
            height={Math.max(0, base - yInv(s.investimento))} rx="2"
            fill={s.parcial ? "url(#hachInv)" : "url(#gradInv)"}
            stroke={s.parcial ? C.gold : "none"} strokeDasharray={s.parcial ? "3 2" : undefined}
            strokeWidth={s.parcial ? 1 : 0} />
        ))}

        <polyline points={solido} fill="none" stroke={C.up} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {tracejado && <polyline points={tracejado} fill="none" stroke={C.up} strokeWidth="1.8" strokeDasharray="4 3" opacity="0.7" />}
        {pts.map(([x0, y0], i) => (
          <circle key={i} cx={x0} cy={y0} r="2.2"
            fill={serie[i].parcial ? C.void : C.up} stroke={C.up} strokeWidth={serie[i].parcial ? 1.2 : 0} />
        ))}

        {serie.map((s, i) => (i % passo === 0 || i === n - 1) && (
          <text key={s.mes} x={cx(i)} y={H - 7} fontSize="9.5" textAnchor="middle" fill={C.faint} fontFamily={SANS}>
            {mesCurto(String(s.mes).slice(0, 7))}
          </text>
        ))}
      </svg>
    </>
  );
}

/* Performance por campanha. Investimento, leads e CPL são reais. Vendas,
   receita e ROI ficam na tabela como colunas vazias marcadas "em breve" —
   o desenho já reserva o lugar, mas nenhuma delas existe na view (conferido
   por probe: 42703). Agrupa por produto e expande sob clique. */
function TabelaCampanhas({ grupos }) {
  const [abertos, setAbertos] = useState(() => new Set());
  const alternar = (p) => setAbertos((s) => {
    const n = new Set(s);
    n.has(p) ? n.delete(p) : n.add(p);
    return n;
  });
  const cols = "minmax(130px,1fr) 78px 92px 92px 56px 80px 60px 74px 50px";
  const cel = (extra) => ({ fontFamily: GROTESK, fontSize: 12.5, fontWeight: 700, textAlign: "right", ...extra });
  const vazia = { fontSize: 11.5, textAlign: "right", color: C.dim, fontStyle: "italic" };

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 780 }}>
        <div style={{
          display: "grid", gridTemplateColumns: cols, gap: 10, padding: "0 20px 9px",
          borderBottom: `1px solid ${C.hair}`, fontSize: 9.5, fontWeight: 800,
          letterSpacing: ".5px", textTransform: "uppercase", color: C.dim,
        }}>
          <span>Campanha</span>
          <span>Categoria</span>
          <span>Tipo</span>
          <span style={{ textAlign: "right" }}>Investimento</span>
          <span style={{ textAlign: "right" }}>Leads</span>
          <span style={{ textAlign: "right" }}>Custo/lead</span>
          <span style={{ textAlign: "right", color: C.faint }}>Vendas</span>
          <span style={{ textAlign: "right", color: C.faint }}>Receita</span>
          <span style={{ textAlign: "right", color: C.faint }}>ROI</span>
        </div>

        {grupos.map((g) => {
          const aberto = abertos.has(g.produto);
          return (
            <div key={g.produto}>
              <div onClick={() => alternar(g.produto)} role="button" tabIndex={0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), alternar(g.produto))}
                style={{
                  display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "center",
                  padding: "9px 20px", borderBottom: `1px solid ${C.hair}`, cursor: "pointer",
                  background: aberto ? "rgba(255,255,255,.022)" : "transparent",
                }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {aberto ? <ChevronUp size={13} style={{ color: C.gold, flexShrink: 0 }} /> : <ChevronDown size={13} style={{ color: C.faint, flexShrink: 0 }} />}
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.chave}>
                    {g.chave}
                  </span>
                  <span style={{ fontSize: 10, color: C.dim, flexShrink: 0 }}>· {g.campanhas.length}</span>
                </span>
                <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.categoria}>{g.categoria}</span>
                <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.tipo}</span>
                <span style={cel({ color: C.gold })}>{moeda(g.gasto)}</span>
                <span style={cel({ color: C.text })}>{g.leads ? numero(g.leads) : "—"}</span>
                <span style={cel({ color: g.cpl != null ? C.text : C.dim })}>{g.cpl != null ? reaisCent(g.cpl) : "—"}</span>
                <span style={vazia}>em breve</span>
                <span style={vazia}>em breve</span>
                <span style={vazia}>em breve</span>
              </div>

              {aberto && g.campanhas.map((c) => (
                <div key={c.nome} style={{
                  display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "center",
                  padding: "7px 20px 7px 40px", borderBottom: `1px solid ${C.hair}`,
                  background: "rgba(255,255,255,.012)",
                }}>
                  <span style={{ fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.nome}>{c.nome}</span>
                  <span style={{ fontSize: 10.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.categoria}>{c.categoria}</span>
                  <span style={{ fontSize: 10.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.tipo}</span>
                  <span style={cel({ fontSize: 11.5, color: C.muted })}>{moeda(c.gasto)}</span>
                  <span style={cel({ fontSize: 11.5, color: C.muted })}>{c.leads ? numero(c.leads) : "—"}</span>
                  <span style={cel({ fontSize: 11.5, color: c.cpl != null ? C.muted : C.dim })}>{c.cpl != null ? reaisCent(c.cpl) : "—"}</span>
                  <span style={vazia}>—</span>
                  <span style={vazia}>—</span>
                  <span style={vazia}>—</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Vendas com origem confirmada em anúncio.

   BLOCO SEPARADO DA PERFORMANCE POR CAMPANHA, DE PROPÓSITO. O investimento
   da tabela de performance é o valor CHEIO da campanha; o faturamento aqui
   é um PISO (~7% das vendas — só as que casaram com um lead de anúncio).
   Dividir um pelo outro daria um ROI falso: parcial sobre total. Por isso
   os dois números convivem na tela sem nenhuma operação entre eles. */
const ROTULO_SEM_CAMPANHA = "anúncio — campanha não identificada";

function VendasAtribuidas({ linhas }) {
  const cols = "minmax(150px,1fr) 88px 62px 96px";
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 420 }}>
        <div style={{
          display: "grid", gridTemplateColumns: cols, gap: 10, padding: "0 20px 9px",
          borderBottom: `1px solid ${C.hair}`, fontSize: 9.5, fontWeight: 800,
          letterSpacing: ".5px", textTransform: "uppercase", color: C.dim,
        }}>
          <span>Campanha</span>
          <span>Categoria</span>
          <span style={{ textAlign: "right" }}>Vendas</span>
          <span style={{ textAlign: "right" }}>Faturamento</span>
        </div>
        {linhas.map((l) => (
          <div key={l.chave} style={{
            display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "center",
            padding: "8px 20px", borderBottom: `1px solid ${C.hair}`,
          }}>
            <span style={{
              fontSize: 12, fontWeight: l.semCampanha ? 500 : 600,
              color: l.semCampanha ? C.faint : C.bright,
              fontStyle: l.semCampanha ? "italic" : "normal",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={l.rotulo}>
              {l.rotulo}
            </span>
            <span style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {l.semCampanha ? "—" : l.categoria}
            </span>
            <span style={{ fontFamily: GROTESK, fontSize: 12.5, fontWeight: 700, textAlign: "right", color: l.semCampanha ? C.faint : C.text }}>
              {numero(l.vendas)}
            </span>
            <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, textAlign: "right", color: l.semCampanha ? C.faint : C.gold }}>
              {moeda(l.faturamento)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Origem das vendas por canal. Duas grandezas por linha (quantas vendas e
   quanto), então não cabe no `Lista` — a barra é pelo valor. */
function CanaisVenda({ linhas }) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <div>
      {linhas.map((l) => (
        <div key={l.canal} style={{ padding: "9px 20px", borderBottom: `1px solid ${C.hair}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.canal}>{l.canal}</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: C.faint }}>{numero(l.vendas)} {l.vendas === 1 ? "venda" : "vendas"}</span>
              <span style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: C.text }}>{moeda(l.valor)}</span>
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
            <div style={{ width: `${(l.valor / max) * 100}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C.goldBase}, ${C.gold})` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Funil desenhado, não medido. Só "Leads gerados" tem número: as etapas
   seguintes dependem do acompanhamento do pedagógico, que ainda não entrega
   dado. As larguras abaixo são DECORAÇÃO — por isso cada etapa sem fonte
   sai tracejada, sem número e escrita "sem medição". */
const ETAPAS_FUNIL = [
  { nome: "Leads gerados", larg: 100 },
  { nome: "Contato realizado", larg: 76 },
  { nome: "Reunião / visita", larg: 54 },
  { nome: "Matrícula", larg: 36 },
];

function FunilConversao({ leads }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {ETAPAS_FUNIL.map((e, i) => {
        const real = i === 0;
        return (
          <div key={e.nome} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: `${e.larg}%`, minWidth: 92, height: 34, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 12px", gap: 10,
              background: real ? `linear-gradient(90deg, ${C.goldBase}, ${C.gold})` : "rgba(255,255,255,.025)",
              border: real ? "none" : `1px dashed ${C.cardLine}`,
            }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: real ? "#100c04" : C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.nome}
              </span>
              <span style={{ fontFamily: GROTESK, fontSize: real ? 14 : 11.5, fontWeight: 700, color: real ? "#100c04" : C.dim, flexShrink: 0, fontStyle: real ? "normal" : "italic" }}>
                {real ? numero(leads) : "sem medição"}
              </span>
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Construction size={13} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
          Em construção — aguardando integração do pedagógico. Só <b style={{ color: C.bright }}>leads gerados</b> é
          medido hoje; as etapas seguintes não têm fonte, e as larguras acima são desenho, não proporção.
        </span>
      </div>
    </div>
  );
}

const mktNoIntervaloMensal = (linhas, per) => {
  const inicio = per.inicio.slice(0, 7);
  const fim = per.fim.slice(0, 7);
  return (linhas ?? []).filter((l) => {
    const mes = String(l.mes ?? "").slice(0, 7);
    return mes && mes >= inicio && mes <= fim;
  });
};

const mktObjetivo = (linha) => {
  if (linha.objetivo) return linha.objetivo;
  const nome = String(linha.campanha_nome ?? "").toLowerCase();
  if (/whats|mensag/.test(nome)) return "WhatsApp";
  if (/alcance/.test(nome)) return "Alcance";
  if (/tr[aá]fego/.test(nome)) return "Tráfego";
  if (/lead|capta|cadastro|formul/.test(nome)) return "Captação";
  return "Outro";
};

const mktGeraLead = (linha) => {
  if (typeof linha.gera_lead === "boolean") return linha.gera_lead;
  if (linha.gera_lead != null) return String(linha.gera_lead) === "true";
  return /whats|mensag|lead|capta|cadastro|formul/i.test(String(linha.campanha_nome ?? ""));
};

function HubMarketing() {
  const per = usePeriodo();
  const saude = useMarketingSaudeCaptacao();
  const captacao = useMarketingCaptacaoDiaria();
  const desempenho = useMarketingDesempenho();
  const consultas = [saude, captacao, desempenho];
  const [semLeadAberto, setSemLeadAberto] = useState(false);

  const resumo = useMemo(() => {
    const linhas = noPeriodo(captacao.data, per, "dia");
    return linhas.reduce((a, l) => ({
      leads: a.leads + Number(l.leads ?? 0),
      origem: a.origem + Number(l.com_origem ?? 0),
      telefone: a.telefone + Number(l.com_telefone ?? 0),
    }), { leads: 0, origem: 0, telefone: 0 });
  }, [captacao.data, per.inicio, per.fim]);

  const performance = useMemo(
    () => mktNoIntervaloMensal(desempenho.data, per),
    [desempenho.data, per.inicio, per.fim]
  );

  const totaisPerformance = useMemo(() => performance.reduce((a, l) => ({
    gasto: a.gasto + Number(l.gasto ?? 0),
    leads: a.leads + Number(l.leads ?? 0),
  }), { gasto: 0, leads: 0 }), [performance]);

  const porCategoria = useMemo(() => {
    const ordem = ["CIS", "GGB", "LL", "Eventos", "Outros"];
    const mapa = new Map(ordem.map((categoria) => [categoria, { categoria, gasto: 0, leads: 0 }]));
    for (const l of performance) {
      const categoria = l.categoria || "Outros";
      const atual = mapa.get(categoria) ?? { categoria, gasto: 0, leads: 0 };
      atual.gasto += Number(l.gasto ?? 0);
      atual.leads += Number(l.leads ?? 0);
      mapa.set(categoria, atual);
    }
    return [...mapa.values()].map((l) => ({ ...l, cpl: l.leads > 0 ? l.gasto / l.leads : null }));
  }, [performance]);

  const porCampanha = useMemo(() => {
    const mapa = new Map();
    for (const l of performance) {
      const nome = l.campanha_nome || "Campanha sem nome";
      const atual = mapa.get(nome) ?? {
        campanha_nome: nome, categoria: l.categoria || "Outros", gasto: 0, leads: 0,
      };
      atual.gasto += Number(l.gasto ?? 0);
      atual.leads += Number(l.leads ?? 0);
      mapa.set(nome, atual);
    }
    return [...mapa.values()].map((l) => ({
      ...l, cpl: l.leads > 0 ? l.gasto / l.leads : null,
    }));
  }, [performance]);

  const campanhasComCpl = useMemo(
    () => porCampanha.filter((l) => l.cpl != null).sort((a, b) => a.cpl - b.cpl),
    [porCampanha]
  );
  const campanhasSemLead = useMemo(
    () => porCampanha.filter((l) => l.cpl == null).sort((a, b) => b.gasto - a.gasto),
    [porCampanha]
  );
  const gastoSemLead = useMemo(
    () => campanhasSemLead.reduce((s, l) => s + l.gasto, 0),
    [campanhasSemLead]
  );

  const alerta = saude.data?.[0];
  const maiorGastoCategoria = Math.max(1, ...porCategoria.map((l) => l.gasto));
  const pct = (parte, total) => total > 0 ? Math.round(parte / total * 100) : 0;

  return (
    <Estado
      carregando={consultas.some((q) => q.isLoading)}
      erro={consultas.find((q) => q.error)?.error}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {alerta?.alerta && (
          <div style={{
            display: "flex", alignItems: "center", gap: 11, padding: "12px 15px",
            borderRadius: 11, border: `1px solid ${C.down}66`,
            background: `linear-gradient(90deg, ${C.down}1f, ${C.down}08)`,
          }}>
            <AlertTriangle size={18} color={C.down} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.bright, fontSize: 13.5, fontWeight: 750 }}>
                Captação parada há {numero(alerta.dias_sem_lead)} dias
              </div>
              <div style={{ color: C.muted, fontSize: 11.5, marginTop: 2 }}>
                Nenhum lead novo desde {alerta.ultimo_lead ? new Date(`${String(alerta.ultimo_lead).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "a última sincronização"}. Verifique a ponte do CRM.
              </div>
            </div>
          </div>
        )}

        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 26px",
          minHeight: 48, padding: "9px 15px", borderRadius: 11,
          background: C.card, border: `1px solid ${C.cardLine}`,
        }}>
          <span style={{ color: C.muted, fontSize: 11, fontWeight: 750, textTransform: "uppercase", letterSpacing: ".08em" }}>
            Performance · {per.rotulo}
          </span>
          <span style={{ color: C.bright, fontSize: 14 }}><b>{numero(totaisPerformance.leads)}</b> leads atribuíveis</span>
          <span style={{ color: C.bright, fontSize: 14 }}><b>{moeda(totaisPerformance.gasto)}</b> investidos</span>
          <span style={{ color: C.goldTop, fontSize: 17, fontWeight: 800 }}>
            {totaisPerformance.leads > 0 ? `${moeda(totaisPerformance.gasto / totaisPerformance.leads)} CPL` : "sem lead atribuível"}
          </span>
          <span style={{ flexBasis: "100%", color: C.faint, fontSize: 10.5 }}>
            Qualidade da captação no CRM: {numero(resumo.leads)} cadastros · {pct(resumo.origem, resumo.leads)}% com origem · {pct(resumo.telefone, resumo.leads)}% com telefone
          </span>
        </div>

        <Bloco titulo="Investimento e CPL por categoria" canto="comparação de eficiência">
          <div style={{ display: "flex", flexDirection: "column", gap: 13, padding: "4px 0 2px" }}>
            {porCategoria.map((l) => (
              <div key={l.categoria} style={{ display: "grid", gridTemplateColumns: "82px minmax(160px, 1fr) 112px 150px", gap: 12, alignItems: "center" }}>
                <div style={{ color: C.bright, fontSize: 12.5, fontWeight: 750 }}>{l.categoria}</div>
                <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.055)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(l.gasto > 0 ? 2 : 0, l.gasto / maiorGastoCategoria * 100)}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${C.goldBase}, ${C.goldTop})` }} />
                </div>
                <div style={{ color: C.muted, fontSize: 11.5, textAlign: "right", whiteSpace: "nowrap" }}>{moeda(l.gasto)}</div>
                <div style={{ color: l.cpl != null ? C.up : C.faint, fontSize: 11.5, fontWeight: l.cpl != null ? 750 : 500, textAlign: "right", whiteSpace: "nowrap" }}>
                  {l.cpl != null ? `${moeda(l.cpl)} / lead` : "sem lead atribuível"}
                </div>
              </div>
            ))}
          </div>
        </Bloco>

        <Bloco titulo="Campanhas com CPL" canto="menor CPL primeiro">
          {campanhasComCpl.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                <thead><tr>
                  {["Campanha", "Categoria", "Investimento", "Leads", "CPL"].map((h, i) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: i < 2 ? "left" : "right", color: C.faint, fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", borderBottom: `1px solid ${C.cardLine}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{campanhasComCpl.map((l) => (
                  <tr key={l.campanha_nome} style={{ borderBottom: `1px solid ${C.hair}` }}>
                    <td style={{ padding: "10px", color: C.bright, fontSize: 11.5, fontWeight: 650, borderLeft: `2px solid ${C.up}` }}>{l.campanha_nome}</td>
                    <td style={{ padding: "10px", color: C.muted, fontSize: 11 }}>{l.categoria}</td>
                    <td style={{ padding: "10px", color: C.bright, fontSize: 11.5, textAlign: "right", whiteSpace: "nowrap" }}>{moeda(l.gasto)}</td>
                    <td style={{ padding: "10px", color: C.bright, fontSize: 11.5, textAlign: "right" }}>{numero(l.leads)}</td>
                    <td style={{ padding: "10px", color: C.goldTop, fontSize: 12.5, fontWeight: 800, textAlign: "right" }}>{moeda(l.cpl)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Estado vazio vazioTitulo="Sem campanha com CPL" vazioDica="Nenhuma campanha tem gasto e lead atribuível no recorte." />}
        </Bloco>

        <div style={{ border: `1px solid ${C.cardLine}`, borderRadius: 11, background: C.card, overflow: "hidden" }}>
          <button type="button" onClick={() => setSemLeadAberto((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", color: C.bright, background: "transparent", border: 0, cursor: "pointer", fontFamily: SANS, textAlign: "left" }}>
            {semLeadAberto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            <b style={{ fontSize: 12.5 }}>Campanhas sem lead atribuível</b>
            <span style={{ color: C.goldTop, fontSize: 12, marginLeft: "auto" }}>{moeda(gastoSemLead)}</span>
          </button>
          <div style={{ padding: semLeadAberto ? "0 14px 12px" : "0 14px 11px", color: C.muted, fontSize: 11.5, lineHeight: 1.45 }}>
            Investimento em alcance, landing page e WhatsApp; o cadastro ou contato acontece fora do Meta.
          </div>
          {semLeadAberto && campanhasSemLead.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.hair}`, padding: "5px 14px 10px" }}>
              {campanhasSemLead.map((l) => (
                <div key={l.campanha_nome} style={{ display: "flex", gap: 12, justifyContent: "space-between", padding: "7px 0", color: C.muted, fontSize: 11.5 }}>
                  <span>{l.campanha_nome} · {l.categoria}</span><b style={{ color: C.bright, whiteSpace: "nowrap" }}>{moeda(l.gasto)}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, padding: "0 2px" }}>
          A série de captação começa em 17/07/2026, data da migração do CRM. Não há dado de canal antes disso.
        </div>
      </div>
    </Estado>
  );
}

function HubMarketingLegado() {
  const per = usePeriodo();
  const resumo = useMarketingResumoMensal();
  const desemp = useMarketingDesempenho();
  const canais = useMarketingOrigemVendas();
  const atrib = { data: [] };
  const [produto, setProduto] = useState(null);
  const [categoria, setCategoria] = useState(null);
  const [geral, setGeral] = useState(false);
  const [agruparPor, setAgruparPor] = useState("produto");

  const r = useMemo(() => recorteMkt(per, geral), [per.modo, per.ano, per.mesIdx, geral]);

  // Categorias vindas do dado, na ordem de leitura acordada.
  const categorias = useMemo(() => {
    const set = new Set();
    for (const l of desemp.data ?? []) if (l.categoria) set.add(String(l.categoria));
    const ord = (c) => { const i = ORDEM_CAT_MKT.indexOf(c); return i < 0 ? 99 : i; };
    return [...set].sort((a, b) => ord(a) - ord(b) || a.localeCompare(b));
  }, [desemp.data]);

  // Produtos da categoria escolhida, ordenados pelo que mais consome verba.
  const produtos = useMemo(() => {
    const m = new Map();
    for (const l of desemp.data ?? []) {
      if (categoria != null && l.categoria !== categoria) continue;
      const p = l.produto ?? "—";
      m.set(p, (m.get(p) ?? 0) + Number(l.gasto ?? 0));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nome, gasto]) => ({ nome, gasto }));
  }, [desemp.data, categoria]);

  /* Trocar de categoria pode deixar o produto escolhido fora da lista. Em vez
     de um efeito que zera o estado, o produto ATIVO é derivado: se não existe
     na categoria atual, vale "todos". */
  const prodAtivo = produto != null && produtos.some((p) => p.nome === produto) ? produto : null;

  const campanhas = useMemo(
    () => (desemp.data ?? []).filter((l) =>
      (categoria == null || l.categoria === categoria) &&
      (prodAtivo == null || l.produto === prodAtivo)),
    [desemp.data, categoria, prodAtivo]
  );

  /* Sem recorte de categoria/produto a série vem da resumo_mensal (a view
     oficial dos KPIs); com recorte, é reconstruída das campanhas. As duas
     reconciliam exatamente, então o número não pula ao ligar o filtro. */
  const serie = useMemo(() => {
    if (categoria == null && prodAtivo == null && resumo.data?.length)
      return [...resumo.data].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
    return mensalDeCampanhas(campanhas); // também é o fallback se a resumo falhar
  }, [categoria, prodAtivo, resumo.data, campanhas]);

  const t = useMemo(() => totaisMkt(noMesMkt(serie, r)), [serie, r]);
  const tAnt = useMemo(() => totaisMkt(noMesMkt(serie, r.ant)), [serie, r]);

  const vInv = varMkt(t.investimento, tAnt.investimento);
  const vLead = varMkt(t.leads, tAnt.leads);
  const vCpl = t.cpl != null && tAnt.cpl != null ? varMkt(t.cpl, tAnt.cpl) : null;

  // Linhas de campanha já recortadas pelo período — base de tudo que é
  // "no recorte" (quebras, tabela, contador da barra de filtros).
  const campanhasPeriodo = useMemo(() => noMesMkt(campanhas, r), [campanhas, r]);

  /* Séries dos gráficos: RESPEITAM o período escolhido. Em "Todos os anos" a
     janela cobre a base inteira, então o gráfico volta a mostrar tudo — é o
     mesmo caminho de código, sem exceção. */
  const serieGrafico = useMemo(() => {
    const d = new Date();
    const cm = chaveMes(d.getFullYear(), d.getMonth());
    return noMesMkt(serie, r).map((x) => ({
      mes: x.mes,
      investimento: Number(x.investimento ?? 0),
      leads: Number(x.leads ?? 0),
      gastoCapt: Number(x.gasto_captacao ?? 0),
      leadsCapt: Number(x.leads_captacao ?? 0),
      parcial: String(x.mes).slice(0, 7) === cm,
    }));
  }, [serie, r]);

  // CPL mês a mês: recalculado por mês (gasto de captação ÷ leads de
  // captação), nunca a média das médias. Mês sem lead não vira ponto zero —
  // fica fora da série, porque "R$ 0 por lead" seria mentira.
  const serieCpl = useMemo(
    () => serieGrafico
      .filter((x) => x.leadsCapt > 0)
      .map((x) => ({ mes: x.mes, valor: x.gastoCapt / x.leadsCapt, parcial: x.parcial })),
    [serieGrafico]
  );

  const porCategoria = useMemo(() => agrupar(campanhasPeriodo, "categoria", "gasto"), [campanhasPeriodo]);

  /* Tabela agrupada por produto ou por categoria — a chave é a única coisa
     que muda, então a agregação é a mesma nos dois modos. */
  const grupos = useMemo(() => {
    const eCapt = (l) => /capta/i.test(l.tipo ?? "");
    const m = new Map();
    for (const l of campanhasPeriodo) {
      const k = String(l[agruparPor] ?? "—");
      const g = m.get(k) ?? {
        chave: k, gasto: 0, leads: 0, gastoCapt: 0, leadsCapt: 0,
        tipos: new Set(), cats: new Set(), campanhas: new Map(),
      };
      const gasto = Number(l.gasto ?? 0), leads = Number(l.leads ?? 0);
      g.gasto += gasto; g.leads += leads;
      if (eCapt(l)) { g.gastoCapt += gasto; g.leadsCapt += leads; }
      if (l.tipo) g.tipos.add(l.tipo);
      if (l.categoria) g.cats.add(String(l.categoria));
      // Mesma campanha em meses diferentes vira uma linha só no recorte.
      const nome = l.campanha_nome ?? "—";
      const c = g.campanhas.get(nome) ?? {
        nome, tipo: l.tipo ?? "—", categoria: l.categoria ?? "—",
        gasto: 0, leads: 0, gastoCapt: 0, leadsCapt: 0,
      };
      c.gasto += gasto; c.leads += leads;
      if (eCapt(l)) { c.gastoCapt += gasto; c.leadsCapt += leads; }
      g.campanhas.set(nome, c);
      m.set(k, g);
    }
    const resumir = (s, sufixo) => (s.size === 1 ? [...s][0] : s.size ? `${s.size} ${sufixo}` : "—");
    return [...m.values()]
      .map((g) => ({
        ...g,
        tipo: resumir(g.tipos, "tipos"),
        categoria: resumir(g.cats, "categorias"),
        cpl: g.leadsCapt ? g.gastoCapt / g.leadsCapt : null,
        campanhas: [...g.campanhas.values()]
          .map((c) => ({ ...c, cpl: c.leadsCapt ? c.gastoCapt / c.leadsCapt : null }))
          .sort((a, b) => b.gasto - a.gasto),
      }))
      .sort((a, b) => b.gasto - a.gasto);
  }, [campanhasPeriodo, agruparPor]);

  /* Vendas atribuídas, agregadas por campanha dentro do recorte. Segue o
     período e a categoria; NÃO segue o produto — a view não tem essa
     dimensão, e filtrar por algo que ela não conhece devolveria vazio como
     se não houvesse venda. "Sem campanha" é uma categoria própria da view
     (nome_campanha vem nulo), então só aparece em "Todas". */
  const atribuidas = useMemo(() => {
    const m = new Map();
    for (const l of noMesMkt(atrib.data ?? [], r)) {
      if (categoria != null && l.categoria !== categoria) continue;
      const semCampanha = !l.nome_campanha;
      const chave = `${l.categoria ?? "—"}|${l.nome_campanha ?? ""}`;
      const a = m.get(chave) ?? {
        chave, semCampanha,
        rotulo: semCampanha ? ROTULO_SEM_CAMPANHA : String(l.nome_campanha),
        categoria: l.categoria ?? "—", vendas: 0, faturamento: 0,
      };
      a.vendas += Number(l.vendas_atribuidas ?? 0);
      a.faturamento += Number(l.faturamento_atribuido ?? 0);
      m.set(chave, a);
    }
    return [...m.values()].sort((a, b) => b.faturamento - a.faturamento);
  }, [atrib.data, r, categoria]);

  const totalAtrib = useMemo(() => atribuidas.reduce(
    (s, a) => ({ vendas: s.vendas + a.vendas, faturamento: s.faturamento + a.faturamento }),
    { vendas: 0, faturamento: 0 }
  ), [atribuidas]);

  const canaisPeriodo = useMemo(() => {
    const m = new Map();
    for (const l of noMesMkt(canais.data ?? [], r)) {
      const k = l.canal ?? "—";
      const a = m.get(k) ?? { canal: k, vendas: 0, valor: 0 };
      a.vendas += Number(l.vendas ?? 0);
      a.valor += Number(l.valor ?? 0);
      m.set(k, a);
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  }, [canais.data, r]);

  const nota = (txt) => (
    <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
      <AlertTriangle size={12} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }}>{txt}</span>
    </div>
  );

  return (
    <Estado carregando={desemp.isLoading || resumo.isLoading} erro={desemp.error} vazio={!desemp.data?.length}
      vazioTitulo="Sem dados de mídia"
      vazioDica="A vw_marketing_desempenho não retornou linhas — ou a sincronização do Meta Ads não rodou, ou seu perfil não tem acesso a marketing.">

      {/* filtros do hub: produto é real; canal e status ficam travados */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "10px 14px", marginBottom: 16, borderRadius: 12,
        background: "rgba(255,255,255,.022)", border: `1px solid ${C.cardLine}`,
      }}>
        <Filter size={13} style={{ color: C.faint, flexShrink: 0 }} />
        <Segmentado label="Período" valor={geral} onChange={setGeral}
          opcoes={[{ key: false, label: "Filtro do topo" }, { key: true, label: "Todos os anos" }]} />
        {categorias.length > 0 && (
          <Segmentado label="Categoria" valor={categoria} onChange={setCategoria}
            opcoes={[{ key: null, label: "Todas" }, ...categorias.map((c) => ({ key: c, label: c }))]} />
        )}
        <SeletorProduto produtos={produtos} valor={prodAtivo} onChange={setProduto} />
        <FiltroTravado label="Canal" />
        <FiltroTravado label="Status" />
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>
          {r.rotulo} · {numero(campanhasPeriodo.length)} campanhas no recorte
        </span>
      </div>

      {geral && nota(
        <>Mostrando <b style={{ color: C.muted }}>todos os anos</b> (a base do Meta Ads começa em jan/2024).
          O filtro de período do topo fica sem efeito neste hub enquanto isso estiver ligado, e as variações
          somem — não existe período anterior à base inteira.</>
      )}

      {!geral && r.diario && nota(
        <>O Meta Ads entrega gasto e leads <b style={{ color: C.muted }}>agregados por mês</b> — não existe
          recorte diário nesta fonte. Mostrando <b style={{ color: C.muted }}>{r.rotulo}</b>. Use Ano ou Mês no filtro do topo.</>
      )}

      <SecaoTitulo titulo="Mídia paga"
        canto={r.rotuloAnt ? `${r.rotulo} · variação vs ${r.rotuloAnt}` : `${r.rotulo} · base inteira, sem comparativo`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginBottom: 12 }}>
        <ChipKpi compacto hero Icone={Megaphone} label="Investimento em mídia"
          valor={moeda(t.investimento)}
          delta={rotuloVar(vInv)} up={vInv != null ? vInv >= 0 : undefined}
          nota={vInv == null ? (r.geral ? "base inteira" : "sem base anterior") : undefined}
          sub={`Meta Ads · ${r.rotulo}`} />
        <ChipKpi compacto Icone={Users} label="Leads gerados"
          valor={numero(t.leads)}
          delta={rotuloVar(vLead)} up={vLead != null ? vLead >= 0 : undefined}
          nota={vLead == null ? (r.geral ? "base inteira" : "sem base anterior") : undefined}
          sub={t.mesesSemLead
            ? `${t.mesesSemLead} ${t.mesesSemLead === 1 ? "mês" : "meses"} com verba e sem rastreio de lead`
            : "formulário de lead do Meta"} />
        <ChipKpi compacto Icone={Target} label="Custo por lead"
          valor={t.cpl != null ? reaisCent(t.cpl) : "—"}
          delta={rotuloVar(vCpl)} up={vCpl != null ? vCpl <= 0 : undefined}
          nota={vCpl == null ? (t.cpl == null ? "sem lead no recorte" : r.geral ? "base inteira" : "sem base anterior") : undefined}
          sub={t.pctCapt != null
            ? `sobre ${moeda(t.gastoCapt)} de captação · ${t.pctCapt.toFixed(0)}% da verba`
            : "sem verba de captação no recorte"} />
      </div>
      {t.pctCapt != null && t.pctCapt < 99 && nota(
        <>O custo por lead usa <b style={{ color: C.muted }}>só a verba de captação</b> ({moeda(t.gastoCapt)} de {moeda(t.investimento)}).
          Campanhas de venda, evento e live não geram lead de formulário — dividir o investimento total pelos
          leads daria um custo por lead maior que o real.</>
      )}

      <SecaoTitulo titulo="Retorno" canto="não é calculável com a cobertura de hoje" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 6 }}>
        <ChipEmBreve Icone={Percent} label="Conversão lead → venda" nota="status do lead no Clint é sempre OPEN" />
        <ChipEmBreve Icone={TrendingUp} label="ROI total" nota="exigiria dividir piso por valor cheio" />
      </div>
      {nota(
        <>Existe atribuição, mas só de <b style={{ color: C.muted }}>piso</b> — as vendas que casaram com um lead de
          anúncio (bloco abaixo). O investimento é o valor <b style={{ color: C.muted }}>cheio</b> da campanha.
          Dividir um pelo outro daria um ROI falso, parcial sobre total; por isso ele fica em branco em vez de
          receber uma conta que parece certa.</>
      )}

      <SecaoTitulo titulo="Evolução" canto={`${r.rotulo} · segue o recorte escolhido`} />
      <div className="gridCom">
        <Bloco titulo="Investimento × Leads" canto={`mês a mês · ${r.rotulo}`}>
          {serieGrafico.length < 2
            ? <Estado vazio vazioTitulo="Um mês só não faz série"
                vazioDica={`O recorte "${r.rotulo}" tem ${serieGrafico.length === 1 ? "um mês" : "nenhum mês"} com veiculação. Escolha Ano no filtro do topo, ou "Todos os anos" aqui, para ver a evolução.`} />
            : <InvestimentoXLeads serie={serieGrafico} />}
        </Bloco>
        <Bloco titulo="Investimento por categoria" canto={r.rotulo} sem altura={ALTURA_PAINEL}>
          {porCategoria.length
            ? <Lista linhas={porCategoria} formatar={moeda} total={t.investimento} />
            : <div style={{ padding: "16px 20px" }}>
                <Estado vazio vazioTitulo={tituloVazioFluxo(per.modo)} vazioDica="Nenhuma campanha com gasto neste recorte." />
              </div>}
        </Bloco>
      </div>

      <Bloco titulo="Custo por lead" canto={`mês a mês · menor é melhor · ${r.rotulo}`}>
        {serieCpl.length < 2
          ? <Estado vazio vazioTitulo="Sem série de custo por lead"
              vazioDica={`O custo por lead só existe em mês com campanha de captação e lead registrado — o recorte "${r.rotulo}" tem ${serieCpl.length === 1 ? "só um" : "nenhum"}.`} />
          : <>
              <LinhaEvolucao serie={serieCpl} cor={C.up} idGrad="fillCpl" inverso formatar={reaisCent} />
              <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
                Meses sem lead de captação ficam fora da série — “R$ 0 por lead” não existe.
              </div>
            </>}
      </Bloco>

      <Bloco titulo="Performance por campanha" canto={`${r.rotulo} · clique na linha para abrir`} sem altura={340}>
        <div style={{ padding: "12px 20px 4px" }}>
          <Segmentado label="Agrupar por" valor={agruparPor} onChange={setAgruparPor}
            opcoes={[{ key: "produto", label: "Produto" }, { key: "categoria", label: "Categoria" }]} />
        </div>
        {grupos.length
          ? <TabelaCampanhas grupos={grupos} />
          : <div style={{ padding: "16px 20px" }}>
              <Estado vazio vazioTitulo={tituloVazioFluxo(per.modo)} vazioDica="Nenhuma campanha com veiculação neste recorte." />
            </div>}
      </Bloco>

      {/* Bloco à parte da tabela acima, e assim deve continuar: aqui é piso
          atribuído, lá é investimento cheio. Nenhuma conta entre os dois. */}
      <Bloco titulo="Vendas com origem confirmada em anúncio"
        canto={`${r.rotulo} · ordenado por faturamento`} sem altura={300}>
        <div style={{ padding: "12px 20px 14px", display: "flex", gap: 8, borderBottom: `1px solid ${C.hair}` }}>
          <AlertTriangle size={13} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55 }}>
            Vendas cujo comprador foi lead de anúncio antes da compra — <b style={{ color: C.bright }}>piso
            comprovável, cerca de 7% das vendas</b>. A influência real do digital é maior; isto é o que se prova.
            Não é ROI nem faturamento total.
          </span>
        </div>
        {atrib.error
          ? <div style={{ padding: "16px 20px" }}>
              <Estado vazio vazioTitulo="Não foi possível carregar a atribuição"
                vazioDica={`${atrib.error.message}. A vw_marketing_atribuicao_campanha é pesada e estoura o tempo limite na primeira execução fria — recarregar a página costuma resolver.`} />
            </div>
          : atribuidas.length
            ? <>
                <VendasAtribuidas linhas={atribuidas} />
                <div style={{
                  display: "grid", gridTemplateColumns: "minmax(150px,1fr) 88px 62px 96px", gap: 10,
                  padding: "11px 20px", background: "rgba(255,255,255,.02)",
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: C.bright }}>Total atribuído</span>
                  <span />
                  <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, textAlign: "right", color: C.text }}>{numero(totalAtrib.vendas)}</span>
                  <span style={{ fontFamily: GROTESK, fontSize: 14, fontWeight: 700, textAlign: "right", color: C.gold }}>{moeda(totalAtrib.faturamento)}</span>
                </div>
              </>
            : <div style={{ padding: "16px 20px" }}>
                <Estado vazio vazioTitulo="Nenhuma venda atribuída neste recorte"
                  vazioDica={categoria ? `Nenhuma venda da categoria ${categoria} casou com lead de anúncio no período. A atribuição só cobre CIS e GGB até agora.` : "Nenhuma venda casou com lead de anúncio no período escolhido."} />
              </div>}
      </Bloco>

      <Bloco titulo="Origem das vendas por canal" canto="a partir de jun/2026" sem altura={ALTURA_PAINEL}>
        {canais.error
          ? <div style={{ padding: "16px 20px" }}><Estado erro={canais.error} /></div>
          : canaisPeriodo.length
            ? <>
                <CanaisVenda linhas={canaisPeriodo} />
                <div style={{ padding: "10px 20px", fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
                  Cobertura cresce a cada mês; a maioria ainda cai em <b style={{ color: C.muted }}>“Pedido”</b> quando
                  o vendedor não marca a origem. Não leia como participação de mercado dos canais.
                </div>
              </>
            : <div style={{ padding: "16px 20px" }}>
                <Estado vazio vazioTitulo="Sem venda com canal neste recorte"
                  vazioDica="A vw_marketing_origem_vendas só cobre de jun/2026 em diante, e a maioria das vendas ainda entra como “Pedido”, sem canal declarado." />
              </div>}
      </Bloco>

      <Bloco titulo="Funil de conversão" canto="em construção · aguardando integração do pedagógico">
        <FunilConversao leads={t.leads} />
      </Bloco>

      <RodapeIntegracoes fontes={["meta_ads", "clint"]} />
    </Estado>
  );
}

/* Taxa vinda da view pode chegar como fração (0.55) ou percentual (55). O
   anon não vê o valor real (RLS zera), então não dá pra fixar a escala —
   normalizo pros dois formatos: <= 1.5 é fração e vira 0–100. */
const pctTaxa = (v) => {
  const n = Number(v ?? 0);
  return n <= 1.5 ? n * 100 : n;
};
const fmtPct = (v, casas = 0) => (v == null ? "—"
  : `${pctTaxa(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`);

/* Rótulo de trimestre defensivo: datas do Postgres chegam como YYYY-MM-DD;
   também aceitamos "2024-Q3", "2024-T3", "2024-3" e "2024-07". */
const rotuloTri = (p) => {
  const s = String(p ?? "").trim();
  const mm = s.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (mm) return `T${Math.floor((Number(mm[2]) - 1) / 3) + 1}/${mm[1].slice(2)}`;
  const q = s.match(/(\d{4}).*?([1-4])\s*$/);
  if (q) return `T${q[2]}/${q[1].slice(2)}`;
  return s || "—";
};

/* Colunas da taxa de comparecimento por trimestre. Amostras pequenas ficam
   vazadas e cinza para preservar a leitura sem esconder o dado. */
function ColunasPresenca({ serie }) {
  const [detalhe, setDetalhe] = useState(null);
  if (serie.length < 2) return <Estado vazio vazioTitulo="Série insuficiente" vazioDica="Poucos trimestres com presença medida para desenhar o gráfico." />;
  const W = 720, H = 196, padL = 40, padR = 14, padT = 20, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB, plotBottom = padT + plotH;
  const n = serie.length;
  const base = (serie.some((p) => !p.pequena) ? serie.filter((p) => !p.pequena) : serie).map((p) => p.taxa);
  let vMax = Math.min(100, Math.ceil((Math.max(...base) + 6) / 5) * 5);
  if (vMax <= 0) vMax = 10;
  const passoX = plotW / n;
  const largura = Math.max(8, Math.min(30, passoX * 0.52));
  const x = (i) => padL + i * passoX + (passoX - largura) / 2;
  const y = (v) => Math.max(padT, Math.min(plotBottom, plotBottom - (v / vMax) * plotH));
  const yticks = [0, Math.round(vMax / 2), vMax];
  const passo = Math.max(1, Math.round((n - 1) / 5));
  const xi = [];
  for (let i = 0; i < n; i += passo) xi.push(i);
  if (xi.at(-1) !== n - 1) xi.push(n - 1);
  const mostrarDetalhe = (event, p) => setDetalhe({
    p,
    x: event.clientX,
    y: event.clientY,
    esquerda: event.clientX > window.innerWidth - 240,
  });
  return (
    <div onMouseLeave={() => setDetalhe(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Taxa de comparecimento por trimestre" style={{ width: "100%", height: "auto", display: "block" }}>
      {yticks.map((v, i) => {
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,.06)" />
            <text x={padL - 8} y={yy + 3.5} fontSize="10.5" textAnchor="end" fill={C.faint} fontFamily={SANS}>{v}%</text>
          </g>
        );
      })}
      {serie.map((p, i) => {
        const topo = y(p.taxa);
        return (
          <g key={p.rotulo + i}>
            <rect
              x={x(i)} y={topo} width={largura} height={Math.max(1, plotBottom - topo)} rx="1"
              fill={p.pequena ? "transparent" : (detalhe?.p === p ? C.bright : C.up)}
              fillOpacity={p.pequena ? 1 : (detalhe?.p === p ? 0.9 : 0.68)}
              stroke={p.pequena ? C.faint : "none"}
              strokeWidth={p.pequena ? 1 : 0}
              style={{ cursor: "crosshair", transition: "fill .12s ease, fill-opacity .12s ease" }}
              onMouseEnter={(e) => mostrarDetalhe(e, p)}
              onMouseMove={(e) => mostrarDetalhe(e, p)}
            />
          </g>
        );
      })}
      {xi.map((i) => (
        <text key={i} x={x(i) + largura / 2} y={H - 9} fontSize="10" textAnchor="middle" fill={C.faint} fontFamily={SANS}>{serie[i].rotulo}</text>
      ))}
    </svg>
    {detalhe && (
      <div style={{
        position: "fixed",
        left: detalhe.x + (detalhe.esquerda ? -14 : 14),
        top: detalhe.y + 14,
        transform: detalhe.esquerda ? "translateX(-100%)" : undefined,
        zIndex: 80,
        pointerEvents: "none",
        minWidth: 190,
        background: "#15151a",
        border: `1px solid ${C.cardLine}`,
        borderRadius: 8,
        padding: "10px 11px",
        boxShadow: "0 12px 32px rgba(0,0,0,.55)",
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".45px", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
          {detalhe.p.rotulo}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 18 }}>
          <span style={{ fontSize: 11, color: C.faint }}>Comparecimento</span>
          <span style={{ fontFamily: GROTESK, fontSize: 15, fontWeight: 700, color: C.up }}>
            {detalhe.p.taxa.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 18, marginTop: 5 }}>
          <span style={{ fontSize: 11, color: C.faint }}>Matrículas</span>
          <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: C.bright }}>{numero(detalhe.p.amostra)}</span>
        </div>
        {detalhe.p.pequena && (
          <div style={{ borderTop: `1px solid ${C.hair}`, marginTop: 8, paddingTop: 7, fontSize: 10, color: C.warn }}>
            Amostra pequena · menos de 30 matrículas
          </div>
        )}
      </div>
    )}
    </div>
  );
}

/* Ranking de cursos por uma taxa (0–100): fideliza (recompra, dourado) e
   falta (dourado→âmbar). Mostra a amostra pra ninguém ler um n=2 como
   tendência. Barra proporcional à própria taxa. */
function RankingCurso({ linhas, cor, sufixo, vazioTitulo, vazioDica }) {
  if (!linhas.length) return <Estado vazio vazioTitulo={vazioTitulo} vazioDica={vazioDica} />;
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  return (
    <div>
      {linhas.map((l, i) => (
        <div key={l.rotulo + i} style={{ padding: "7px 20px", borderBottom: `1px solid ${C.hair}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.rotulo}>{l.rotulo}</span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 10.5, color: C.faint }}>{numero(l.amostra)} {sufixo}</span>
              <span style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: cor }}>{l.valor.toFixed(0)}%</span>
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
            <div style={{ width: `${(l.valor / max) * 100}%`, height: "100%", borderRadius: 3, background: cor }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Estilos de formulário reaproveitados nos modais.
const inputAv = { width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${C.cardLine}`, borderRadius: 9, padding: "9px 11px", color: C.text, fontFamily: SANS, fontSize: 13 };
const labelAv = { fontSize: 10.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 4, display: "block" };

// Modal centralizado (backdrop fecha ao clicar fora).
function ModalCentro({ titulo, onFechar, children, largura = 560 }) {
  return (
    <>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.62)" }} />
      <div className="rolagem" style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 61,
        width: `min(${largura}px, 94vw)`, maxHeight: "88vh", overflowY: "auto",
        background: "#141418", border: `1px solid ${C.cardLine}`, borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,.6)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.hair}`, position: "sticky", top: 0, background: "#141418", zIndex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.bright }}>{titulo}</span>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </>
  );
}

// Botão primário/erro reutilizado nos modais.
function BotaoSalvar({ onClick, disabled, salvando, children }) {
  return (
    <button onClick={onClick} disabled={disabled || salvando} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "none",
      background: disabled || salvando ? "rgba(255,255,255,.08)" : `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})`,
      color: disabled || salvando ? C.faint : "#1A1305", fontWeight: 800, fontSize: 13, fontFamily: SANS,
      cursor: disabled || salvando ? "default" : "pointer",
    }}>
      {salvando ? <Loader2 size={14} className="girar" /> : <Check size={14} />} {children}
    </button>
  );
}

/* Painel de Maestros: os clientes VIP (compraram MAESTRIA). Lista por maestro
   ordenada por investido; inativo (>12 meses sem comprar) fica destacado em
   âmbar como alerta de acompanhamento. Expõe PII (nome/e-mail) — exceção
   justificada, restrita ao setor pedagógico pela RLS da view. */
const dataCurta = (d) => {
  if (!d) return "—";
  const [a, m] = String(d).slice(0, 10).split("-");
  return m ? `${MESES[Number(m) - 1].slice(0, 3).toLowerCase()}/${a.slice(2)}` : "—";
};
// Selo de validade da Maestria: verde (Válido), âmbar (Perto de vencer),
// vermelho (Vencido = benefício expirado, oportunidade de renovação).
const COR_STATUS_MAESTRIA = { "válido": C.up, "valido": C.up, "perto de vencer": C.warn, "vencido": C.down };
const corStatus = (s) => COR_STATUS_MAESTRIA[String(s ?? "").trim().toLowerCase()] ?? C.muted;

// Contador de validade com número colorido — mesma altura do ChipKpi compacto.
function TileValidade({ Icone, label, valor, cor, nota }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 56, background: "rgba(255,255,255,.03)", border: `1px solid ${cor}33`, borderRadius: 10, padding: "8px 11px" }}>
      <span style={{ width: 25, height: 25, borderRadius: 7, background: `${cor}1E`, color: cor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icone size={13} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontFamily: GROTESK, fontSize: 18, fontWeight: 700, color: cor }}>{valor}</span>
          {nota && <span style={{ fontSize: 9.5, color: C.faint }}>{nota}</span>}
        </div>
      </div>
    </div>
  );
}

function LinhaMaestro({ m, onEditar }) {
  const cor = corStatus(m.status_maestria);
  const s = String(m.status_maestria ?? "").trim().toLowerCase();
  const acao = s === "vencido" || s === "perto de vencer"; // realça quem pede ação
  const subInfo = [m.empresa, m.email].filter(Boolean).join(" · ") || "—";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "9px 20px", borderBottom: `1px solid ${C.hair}`,
      background: acao ? `${cor}12` : "transparent",
    }}>
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {m.status_maestria && (
          <span title={m.vence_em ? `Maestria vence em ${dataCurta(m.vence_em)}` : m.status_maestria}
            style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".2px", padding: "2px 8px", borderRadius: 999, color: cor, background: `${cor}1A`, border: `1px solid ${cor}44`, whiteSpace: "nowrap", flexShrink: 0 }}>
            {m.status_maestria}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.email || m.nome}>
            {m.nome}{m.como_gosta_ser_chamado ? <span style={{ color: C.faint, fontWeight: 600 }}> · {m.como_gosta_ser_chamado}</span> : null}
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subInfo}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <span style={{ textAlign: "right", width: 48 }}>
          <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600 }}>{numero(m.total_cursos)}</div>
          <div style={{ fontSize: 9, color: C.dim }}>cursos</div>
        </span>
        <span style={{ textAlign: "right", width: 46 }}>
          <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600 }}>{m.taxa_presenca != null ? fmtPct(m.taxa_presenca) : "—"}</div>
          <div style={{ fontSize: 9, color: C.dim }}>presença</div>
        </span>
        <span style={{ textAlign: "right", width: 54 }}>
          <div style={{ fontSize: 11.5, color: cor, fontWeight: 600 }}>{dataCurta(m.vence_em)}</div>
          <div style={{ fontSize: 9, color: C.dim }}>vence</div>
        </span>
        <span style={{ fontFamily: GROTESK, fontSize: 14, fontWeight: 700, color: C.gold, width: 72, textAlign: "right" }}>{moeda(m.total_investido)}</span>
        <button onClick={() => onEditar(m)} aria-label={`Editar ${m.nome}`} title="Editar anotações"
          style={{ background: "transparent", border: `1px solid ${C.cardLine}`, borderRadius: 8, padding: "5px 6px", cursor: "pointer", color: C.muted, display: "flex", flexShrink: 0 }}>
          <Pencil size={13} />
        </button>
      </div>
    </div>
  );
}

// Número BR tolerante: "5.000.000,50" | "5000000" | "R$ 5.000" -> número.
const parseBRNumero = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const limpo = s.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
};

/* GGB — colar o bloco de respostas. Parser mostra a prévia (8 médias + nota da
   treinadora + respondentes) antes de gravar; só insere no fato_avaliacao ao
   confirmar. Grava com fonte='ggb'. */
function FormMaestro({ maestro, cargoInicial, onSalvo }) {
  const [apelido, setApelido] = useState(maestro.como_gosta_ser_chamado ?? "");
  const [empresa, setEmpresa] = useState(maestro.empresa ?? "");
  const [faturamento, setFaturamento] = useState(maestro.faturamento != null ? String(maestro.faturamento) : "");
  const [cargo, setCargo] = useState(cargoInicial ?? "");
  const [observacoes, setObservacoes] = useState(maestro.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      await salvarMaestroAnotacao({
        aluno_id: maestro.cpf,
        como_gosta_ser_chamado: apelido.trim() || null,
        empresa: empresa.trim() || null,
        faturamento: parseBRNumero(faturamento),
        cargo: cargo.trim() || null,
        observacoes: observacoes.trim() || null,
      });
      onSalvo();
    } catch (e) { setErro(e.message || "Falha ao gravar."); setSalvando(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: C.muted }}>{maestro.nome} · <span style={{ color: C.faint }}>{maestro.email || "—"}</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={labelAv}>Como gosta de ser chamado?</label><input style={inputAv} value={apelido} onChange={(e) => setApelido(e.target.value)} /></div>
        <div><label style={labelAv}>Cargo</label><input style={inputAv} value={cargo} onChange={(e) => setCargo(e.target.value)} /></div>
        <div><label style={labelAv}>Empresa</label><input style={inputAv} value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></div>
        <div><label style={labelAv}>Faturamento (R$)</label><input style={inputAv} inputMode="numeric" value={faturamento} onChange={(e) => setFaturamento(e.target.value)} placeholder="Ex.: 5.000.000" /></div>
      </div>
      <div><label style={labelAv}>Observações</label><textarea rows={3} style={{ ...inputAv, resize: "vertical" }} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></div>
      {erro && <div style={{ fontSize: 12, color: C.down }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BotaoSalvar onClick={salvar} salvando={salvando}>Salvar anotações</BotaoSalvar>
      </div>
    </div>
  );
}

/* Lista de avaliações por curso/evento. `comTreinador`: no GGB mostra a nota
   do treinador ao lado da indicação (alunos); em eventos ela não existe. */
/* ============ RETENÇÃO (entrada manual) ============ */
// Desfecho da ligação de retenção: pendente (aguarda), retido (sucesso),
// cancelado. Os valores gravados são minúsculos — mesma string que as views
// vw_pedagogico_retencao(_motivos) contam.
const DESFECHOS = [{ key: "pendente", label: "Pendente", cor: C.warn }, { key: "retido", label: "Retido", cor: C.up }, { key: "cancelado", label: "Cancelado", cor: C.down }];
const desfechoInfo = (d) => DESFECHOS.find((x) => x.key === String(d ?? "").trim().toLowerCase()) ?? { key: "", label: d || "—", cor: C.muted };

/* Registrar/editar um caso de retenção. Sem `id` insere; com `id` atualiza
   (ex.: mudar o desfecho de pendente para retido/cancelado após a ligação). */
function FormRetencao({ caso, onSalvo }) {
  const editando = !!caso?.id;
  const [nome, setNome] = useState(caso?.nome_cliente ?? "");
  const [curso, setCurso] = useState(caso?.curso ?? "");
  const [motivo, setMotivo] = useState(caso?.motivo_cancelamento ?? "");
  const [data, setData] = useState(caso?.data_ligacao ? String(caso.data_ligacao).slice(0, 10) : "");
  const [desfecho, setDesfecho] = useState(caso?.desfecho ?? "pendente");
  const [obs, setObs] = useState(caso?.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const pronto = !!(nome.trim() && curso.trim());

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      await salvarRetencao({
        ...(editando ? { id: caso.id } : {}),
        nome_cliente: nome.trim(), curso: curso.trim(),
        motivo_cancelamento: motivo.trim() || null,
        data_ligacao: data || null, desfecho,
        observacoes: obs.trim() || null,
      });
      onSalvo();
    } catch (e) { setErro(e.message || "Falha ao gravar."); setSalvando(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div><label style={labelAv}>Nome do cliente</label><input style={inputAv} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <div><label style={labelAv}>Curso</label><input style={inputAv} value={curso} onChange={(e) => setCurso(e.target.value)} /></div>
        <div style={{ gridColumn: "1 / -1" }}><label style={labelAv}>Motivo do cancelamento</label><input style={inputAv} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Financeiro, Agenda, Expectativa…" /></div>
        <div><label style={labelAv}>Data da ligação</label><input type="date" style={inputAv} value={data} onChange={(e) => setData(e.target.value)} /></div>
        <div>
          <label style={labelAv}>Desfecho</label>
          <Segmentado valor={desfecho} onChange={setDesfecho} opcoes={DESFECHOS.map((d) => ({ key: d.key, label: d.label }))} />
        </div>
      </div>
      <div><label style={labelAv}>Observações</label><textarea rows={3} style={{ ...inputAv, resize: "vertical" }} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
      {erro && <div style={{ fontSize: 12, color: C.down }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BotaoSalvar onClick={salvar} disabled={!pronto} salvando={salvando}>{editando ? "Atualizar caso" : "Registrar caso"}</BotaoSalvar>
      </div>
    </div>
  );
}

function LinhaRetencao({ c, onEditar }) {
  const d = desfechoInfo(c.desfecho);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 20px", borderBottom: `1px solid ${C.hair}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome_cliente}</div>
        <div style={{ fontSize: 10.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.curso}{c.motivo_cancelamento ? ` · ${c.motivo_cancelamento}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, color: C.faint, width: 52, textAlign: "right" }}>{c.data_ligacao ? dataCurta(c.data_ligacao) : "—"}</span>
        <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, color: d.cor, background: `${d.cor}1A`, border: `1px solid ${d.cor}44`, whiteSpace: "nowrap", width: 78, textAlign: "center" }}>{d.label}</span>
        <button onClick={() => onEditar(c)} aria-label="Editar caso" title="Editar / registrar desfecho"
          style={{ background: "transparent", border: `1px solid ${C.cardLine}`, borderRadius: 8, padding: "5px 6px", cursor: "pointer", color: C.muted, display: "flex" }}>
          <Pencil size={13} />
        </button>
      </div>
    </div>
  );
}

// Motivos mais frequentes: barra 100% (retidos verde / cancelados vermelho).
function ListaMotivos({ linhas }) {
  return (
    <div>
      {linhas.map((m, i) => {
        const r = Number(m.retidos ?? 0), c = Number(m.cancelados ?? 0), t = r + c || 1;
        return (
          <div key={i} style={{ padding: "8px 20px", borderBottom: `1px solid ${C.hair}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.motivo}>{m.motivo || "—"}</span>
              <span style={{ fontSize: 10.5, color: C.faint, flexShrink: 0 }}><b style={{ color: C.up }}>{numero(r)}</b> retidos · <b style={{ color: C.down }}>{numero(c)}</b> cancel.</span>
            </div>
            <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,.06)" }}>
              <div style={{ width: `${(r / t) * 100}%`, background: C.up }} />
              <div style={{ width: `${(c / t) * 100}%`, background: C.down }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============ AUTOMAÇÃO DE CONFIRMAÇÕES ============
   Onde a operadora (Gisele) acompanha e destrava o fluxo de confirmação de
   presença (job Python externo dispara as mensagens). A tela diz o que fazer,
   não mostra dado cru. */
const dataDDMM = (d) => { if (!d) return "—"; const p = String(d).slice(0, 10).split("-"); return p[2] && p[1] ? `${p[2]}/${p[1]}` : "—"; };
const emNDias = (n) => { if (n == null) return "—"; const v = Number(n); return v === 0 ? "hoje" : v < 0 ? `há ${-v} dias` : `em ${v} dias`; };
// Pendência urgente (CRIAR GRUPO — URGENTE) em vermelho; as demais em dourado.
const corPendencia = (p) => (/URGENTE/i.test(String(p ?? "")) ? C.down : C.gold);

// Faixa de pendências no topo do hub — cards clicáveis. Só renderiza se houver.
function FaixaPendencias({ pendencias, onAbrir }) {
  if (!pendencias.length) return null;
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
      {pendencias.map((t) => {
        const cor = corPendencia(t.pendencia);
        return (
          <button key={t.turma_id} onClick={() => onAbrir(t)} style={{
            display: "flex", alignItems: "center", gap: 9, textAlign: "left", cursor: "pointer",
            background: `${cor}12`, border: `1px solid ${cor}44`, borderRadius: 12, padding: "10px 13px",
            color: C.text, fontFamily: SANS, minWidth: 220, flex: "1 1 220px", maxWidth: 340,
          }}>
            <AlertTriangle size={16} style={{ color: cor, flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 9.5, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", color: cor }}>{t.pendencia}</span>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.curso}>{t.curso}</span>
              <span style={{ display: "block", fontSize: 10.5, color: C.faint }}>{emNDias(t.dias_para_inicio)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---- Bloco 2 da automação: o DRAWER da turma ---- */


// dd/mm/aaaa. Vivia no meio do drawer antigo da automação e foi junto com ele
// na remoção; 12 chamadas ficaram órfãs sem o build reclamar.
const dataBR = (iso) => { const p = String(iso ?? "").slice(0, 10).split("-"); return p[2] ? `${p[2]}/${p[1]}/${p[0]}` : "—"; };

const LINK_GRUPO_PREFIXO = "https://chat.whatsapp.com/";
const linkGrupoValido = (v) => { const s = String(v ?? "").trim(); return s === "" || s.startsWith(LINK_GRUPO_PREFIXO); };
// 403 / RLS: NÃO contornar — mensagem clara e para por aqui.
const semPermissao = (e) => e?.code === "42501" || e?.status === 403 || e?.status === 401 || /permission denied|row-level security|not authorized|violates row-level/i.test(String(e?.message ?? ""));

// Toast de feedback de escrita (sucesso · info · erro). Auto-some; some no X.
function Toast({ toast, onFechar }) {
  if (!toast) return null;
  const cor = toast.tipo === "erro" ? C.down : toast.tipo === "info" ? C.gold : C.up;
  const Icone = toast.tipo === "erro" ? AlertTriangle : toast.tipo === "info" ? Bell : Check;
  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 80, maxWidth: 380, display: "flex", alignItems: "flex-start", gap: 9, background: "#1B1B20", border: `1px solid ${cor}66`, borderRadius: 12, padding: "12px 14px", boxShadow: "0 16px 40px rgba(0,0,0,.5)" }}>
      <Icone size={16} style={{ color: cor, flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>{toast.msg}</span>
      <button onClick={onFechar} aria-label="Fechar aviso" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", display: "flex", marginLeft: 4, flexShrink: 0 }}><X size={14} /></button>
    </div>
  );
}

// Painel lateral (drawer) — desliza da direita. Mesmos tokens do ModalCentro.
function DrawerLado({ titulo, sub, onFechar, children, largura = 500 }) {
  return (
    <>
      <div onClick={onFechar} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)" }} />
      <div className="rolagem" style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 61, width: `min(${largura}px, 96vw)`, overflowY: "auto", background: "#141418", borderLeft: `1px solid ${C.cardLine}`, boxShadow: "-24px 0 64px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${C.hair}`, position: "sticky", top: 0, background: "#141418", zIndex: 1 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={titulo}>{titulo}</div>
            {sub && <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{sub}</div>}
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", display: "flex", flexShrink: 0 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </>
  );
}

// Campo somente leitura (curso/datas/cidade no topo do drawer).
function CampoLeitura({ label, valor }) {
  return (
    <div>
      <div style={labelAv}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={valor || ""}>{valor || "—"}</div>
    </div>
  );
}

/* Formulário editável de dim_turmas (update por turma_id). Pré-preenche
   horários/local vazios com a última turma passada de mesma sigla — SUGESTÃO,
   só no input, não grava. Valida o link do grupo e avisa quando é o 1º link. */
function FormTurma({ dim, sug, aguardando, foco, onSalvo, notificar }) {
  const vazio = (v) => v == null || String(v).trim() === "";
  const doSug = (campo) => vazio(dim[campo]) && sug && !vazio(sug[campo]);
  const init = (campo) => doSug(campo) ? String(sug[campo]) : (dim[campo] != null ? String(dim[campo]) : "");
  const [hCred, setHCred] = useState(init("horario_credenciamento"));
  const [hIni, setHIni] = useState(init("horario_inicio"));
  const [hFim, setHFim] = useState(init("horario_fim"));
  const [local, setLocal] = useState(init("local"));
  const [endereco, setEndereco] = useState(dim.endereco ?? "");
  const [capacidade, setCapacidade] = useState(dim.capacidade != null ? String(dim.capacidade) : "");
  const [nomeComercial, setNomeComercial] = useState(dim.nome_comercial ?? "");
  const [link, setLink] = useState(dim.link_grupo ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const linkRef = useRef(null);
  const linkEraVazio = vazio(dim.link_grupo);
  const temSugestao = doSug("horario_credenciamento") || doSug("horario_inicio") || doSug("horario_fim") || doSug("local");

  // "colar link" abre o drawer já com o foco no campo do link.
  useEffect(() => {
    if (foco === "link" && linkRef.current) { linkRef.current.focus(); linkRef.current.scrollIntoView({ block: "center" }); }
  }, [foco]);

  const salvar = async () => {
    setErro(null);
    const linkTrim = link.trim();
    if (!linkGrupoValido(linkTrim)) {
      const m = `O link do grupo precisa começar com ${LINK_GRUPO_PREFIXO}`;
      setErro(m); notificar(m, "erro"); return;
    }
    setSalvando(true);
    try {
      const cap = parseBRNumero(capacidade);
      await salvarTurma(dim.turma_id, {
        horario_credenciamento: hCred.trim() || null,
        horario_inicio: hIni.trim() || null,
        horario_fim: hFim.trim() || null,
        local: local.trim() || null,
        endereco: endereco.trim() || null,
        capacidade: cap != null ? Math.round(cap) : null,
        nome_comercial: nomeComercial.trim() || null,
        link_grupo: linkTrim || null,
      });
      if (linkEraVazio && linkTrim) notificar(`O link será enviado automaticamente na próxima rodada para ${numero(aguardando ?? 0)} pessoas.`, "info");
      else notificar("Turma atualizada.", "ok");
      onSalvo();
    } catch (e) {
      const msg = semPermissao(e) ? "Você não tem permissão para editar." : (e.message || "Falha ao salvar.");
      setErro(msg); notificar(msg, "erro"); setSalvando(false);
    }
  };

  const campo = (label, valor, set, extra = {}) => (
    <div>
      <label style={labelAv}>{label}</label>
      <input style={inputAv} value={valor} onChange={(e) => set(e.target.value)} {...extra} />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim }}>Cadastro da turma</div>
      {temSugestao && <div style={{ fontSize: 11, color: C.gold, display: "flex", alignItems: "center", gap: 6, lineHeight: 1.4 }}><Bell size={12} style={{ flexShrink: 0 }} /> Campos vazios preenchidos com a última turma de mesma sigla — confira antes de salvar.</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {campo("Credenciamento", hCred, setHCred, { placeholder: "Ex.: 08:30" })}
        {campo("Início", hIni, setHIni, { placeholder: "Ex.: 09:00" })}
        {campo("Fim", hFim, setHFim, { placeholder: "Ex.: 18:00" })}
        {campo("Capacidade", capacidade, setCapacidade, { inputMode: "numeric", placeholder: "Ex.: 40" })}
        <div style={{ gridColumn: "1 / -1" }}>{campo("Local", local, setLocal, { placeholder: "Ex.: Hotel Fulano — Salão A" })}</div>
        <div style={{ gridColumn: "1 / -1" }}>{campo("Endereço", endereco, setEndereco)}</div>
        <div style={{ gridColumn: "1 / -1" }}>{campo("Nome comercial", nomeComercial, setNomeComercial)}</div>
      </div>
      <div>
        <label style={labelAv}>Link do grupo (WhatsApp)</label>
        <input ref={linkRef} style={{ ...inputAv, borderColor: link && !linkGrupoValido(link) ? C.down : C.cardLine }} value={link} onChange={(e) => setLink(e.target.value)} placeholder={LINK_GRUPO_PREFIXO + "…"} />
        {link && !linkGrupoValido(link)
          ? <div style={{ fontSize: 10.5, color: C.down, marginTop: 4 }}>Precisa começar com {LINK_GRUPO_PREFIXO}</div>
          : linkEraVazio && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 4 }}>Ao salvar, o link entra na próxima rodada para {numero(aguardando ?? 0)} pessoas que confirmaram.</div>}
      </div>
      {erro && <div style={{ fontSize: 12, color: C.down }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BotaoSalvar onClick={salvar} salvando={salvando}>Salvar turma</BotaoSalvar>
      </div>
    </div>
  );
}

/* ============ AVALIAÇÃO DE EVENTOS — cadastro + link (QR) ============
   Sistema por token: a Elis cadastra o evento e as PRÓPRIAS perguntas e recebe
   /e/<token> pra virar QR na palestra; a plateia responde no celular, anônimo.
   Escrita só pelas funções (criar_evento + salvar_perguntas). As 3 perguntas de
   núcleo o banco insere sozinho — aqui aparecem só pra leitura. Token nunca
   regenera: não existe ação de recriar o link (QR já impresso morreria). */
const TIPOS_EVENTO = [
  { k: "palestra", r: "Palestra" }, { k: "workshop", r: "Workshop" },
  { k: "mentoria", r: "Mentoria" }, { k: "curso", r: "Curso" },
];
const TIPOS_PERGUNTA = [
  { k: "escala_1_5", r: "Escala 1–5" }, { k: "escala_0_10", r: "Escala 0–10" },
  { k: "sim_nao", r: "Sim / Não" }, { k: "escolha_unica", r: "Escolha única" },
  { k: "texto_livre", r: "Texto livre" },
];
const PERGUNTAS_NUCLEO = [
  "De 0 a 10, quanto você recomendaria esta palestra a um colega?",
  "O que você mudaria nesta palestra?",
  "Qual tema você gostaria de ver numa próxima palestra?",
];
const LIMITE_PERGUNTAS = 7; // acima disso, avisa (não bloqueia)

function EditorPerguntas({ perguntas, setPerguntas, travado = false, motivoTravado = null, rotulo = "Perguntas" }) {
  const total = perguntas.length + PERGUNTAS_NUCLEO.length;
  const setP = (i, campo, val) => setPerguntas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: val } : p)));
  const addPergunta = () => setPerguntas((ps) => [...ps, { texto: "", tipo: "escala_1_5", obrigatoria: true, opcoes: ["", ""] }]);
  const removePergunta = (i) => setPerguntas((ps) => ps.filter((_, j) => j !== i));
  const mover = (i, dir) => setPerguntas((ps) => {
    const j = i + dir; if (j < 0 || j >= ps.length) return ps;
    const c = [...ps]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const setOpcao = (i, oi, val) => setPerguntas((ps) => ps.map((p, j) => (j === i ? { ...p, opcoes: p.opcoes.map((o, k) => (k === oi ? val : o)) } : p)));
  const addOpcao = (i) => setPerguntas((ps) => ps.map((p, j) => (j === i ? { ...p, opcoes: [...p.opcoes, ""] } : p)));
  const removeOpcao = (i, oi) => setPerguntas((ps) => ps.map((p, j) => (j === i ? { ...p, opcoes: p.opcoes.filter((_, k) => k !== oi) } : p)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.gold }}>{rotulo}</span>
        <span style={{ fontSize: 10.5, color: !travado && total > LIMITE_PERGUNTAS ? C.warn : C.faint }}>{total} no formulário (com o núcleo)</span>
      </div>
      {travado && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 12, color: C.warn, background: `${C.warn}12`, border: `1px solid ${C.warn}55`, borderRadius: 9, padding: "10px 12px", lineHeight: 1.45 }}>
          <Lock size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><b>Perguntas travadas.</b> {motivoTravado || "Este evento já recebeu respostas — mudar as perguntas agora quebraria a comparação com quem já respondeu."} Dá para editar os dados do evento, mas não as perguntas.</span>
        </div>
      )}
      {!travado && total > LIMITE_PERGUNTAS && (
        <div style={{ fontSize: 11.5, color: C.warn, background: `${C.warn}12`, border: `1px solid ${C.warn}44`, borderRadius: 9, padding: "8px 11px", lineHeight: 1.45 }}>
          Formulário longo derruba a taxa de resposta no celular — e o núcleo fica no fim. Considere enxugar.
        </div>
      )}

      {perguntas.map((p, i) => (
        <div key={i} style={{ border: `1px solid ${C.hair}`, borderRadius: 10, padding: 11, display: "flex", flexDirection: "column", gap: 9, background: "rgba(255,255,255,.02)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontFamily: GROTESK, fontSize: 12, color: C.faint, paddingTop: 9, minWidth: 16 }}>{i + 1}</span>
            <input value={p.texto} disabled={travado} onChange={(e) => setP(i, "texto", e.target.value)} placeholder="Enunciado da pergunta" style={{ ...inputAv, flex: 1, opacity: travado ? 0.7 : 1 }} />
            {!travado && (
              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                <BtnIcone titulo="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp size={14} /></BtnIcone>
                <BtnIcone titulo="Descer" disabled={i === perguntas.length - 1} onClick={() => mover(i, 1)}><ChevronDown size={14} /></BtnIcone>
                <BtnIcone titulo="Remover" onClick={() => removePergunta(i)}><X size={14} /></BtnIcone>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingLeft: 24 }}>
            <select value={p.tipo} disabled={travado} onChange={(e) => setP(i, "tipo", e.target.value)} style={{ ...inputAv, width: "auto", cursor: travado ? "default" : "pointer", padding: "6px 10px", fontSize: 12, opacity: travado ? 0.7 : 1 }}>
              {TIPOS_PERGUNTA.map((t) => (<option key={t.k} value={t.k}>{t.r}</option>))}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: travado ? "default" : "pointer" }}>
              <input type="checkbox" checked={p.obrigatoria} disabled={travado} onChange={(e) => setP(i, "obrigatoria", e.target.checked)} /> obrigatória
            </label>
          </div>
          {p.tipo === "escolha_unica" && (
            <div style={{ paddingLeft: 24, display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.faint }}>Opções</span>
              {(p.opcoes ?? []).map((o, oi) => (
                <div key={oi} style={{ display: "flex", gap: 6 }}>
                  <input value={o} disabled={travado} onChange={(e) => setOpcao(i, oi, e.target.value)} placeholder={`Opção ${oi + 1}`} style={{ ...inputAv, flex: 1, padding: "6px 10px", fontSize: 12, opacity: travado ? 0.7 : 1 }} />
                  {!travado && <BtnIcone titulo="Remover opção" disabled={(p.opcoes ?? []).length <= 2} onClick={() => removeOpcao(i, oi)}><X size={13} /></BtnIcone>}
                </div>
              ))}
              {!travado && <button onClick={() => addOpcao(i)} style={{ alignSelf: "flex-start", fontSize: 11.5, color: C.gold, background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}><Plus size={12} /> opção</button>}
            </div>
          )}
        </div>
      ))}

      {!travado && (
        <button onClick={addPergunta} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: C.gold, background: `${C.gold}12`, border: `1px solid ${C.gold}44`, borderRadius: 9, padding: "7px 12px", cursor: "pointer", fontFamily: SANS }}>
          <Plus size={14} /> Adicionar pergunta
        </button>
      )}
      {travado && !perguntas.length && (
        <div style={{ fontSize: 12, color: C.faint }}>Este evento não teve perguntas próprias — só o núcleo.</div>
      )}

      {/* Núcleo — leitura */}
      <div style={{ background: "rgba(255,255,255,.02)", border: `1px dashed ${C.cardLine}`, borderRadius: 10, padding: "11px 13px", marginTop: 2 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, marginBottom: 7 }}>Perguntas de núcleo — fecham todo formulário, iguais em todo evento</div>
        <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 5 }}>
          {PERGUNTAS_NUCLEO.map((t, i) => (<li key={i} style={{ fontSize: 12, color: C.faint, lineHeight: 1.4 }}>{t}</li>))}
        </ol>
      </div>
    </div>
  );
}

function FormEvento({ meuId, onFechar, onSalvo, notificar }) {
  const carteira = useCarteira();
  const perfis = usePerfisVisiveis();

  const [tipo, setTipo] = useState("palestra");
  const [palestraSel, setPalestraSel] = useState("");   // "" = escolher · "__nova__" = digitar novo
  const [tituloNovo, setTituloNovo] = useState("");
  const [data, setData] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [local, setLocal] = useState("");
  const [responsavelId, setResponsavelId] = useState(meuId ?? "");
  const [perguntas, setPerguntas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);

  const ehPalestra = tipo === "palestra";
  const tituloFinal = (ehPalestra && palestraSel && palestraSel !== "__nova__") ? palestraSel : tituloNovo.trim();
  const palestras = carteira.data ?? [];

  const resetar = () => {
    setResultado(null); setTipo("palestra"); setPalestraSel(""); setTituloNovo("");
    setData(""); setObjetivo(""); setLocal(""); setResponsavelId(meuId ?? "");
    setPerguntas([]); setErro(null);
  };

  const salvar = async () => {
    if (!tituloFinal) { const m = "Dê um título ao evento."; setErro(m); notificar(m, "erro"); return; }
    if (!data) { const m = "Informe a data do evento."; setErro(m); notificar(m, "erro"); return; }
    for (let i = 0; i < perguntas.length; i++) {
      const p = perguntas[i];
      if (!p.texto.trim()) { const m = `A pergunta ${i + 1} está sem enunciado.`; setErro(m); notificar(m, "erro"); return; }
      if (p.tipo === "escolha_unica" && p.opcoes.map((o) => o.trim()).filter(Boolean).length < 2) {
        const m = `A pergunta ${i + 1} (escolha única) precisa de ao menos duas opções.`; setErro(m); notificar(m, "erro"); return;
      }
    }
    setSalvando(true); setErro(null);
    try {
      const ev = await criarEvento({
        p_tipo: tipo, p_titulo: tituloFinal, p_data_evento: data,
        p_objetivo: objetivo.trim() || null, p_local: local.trim() || null,
        p_responsavel_id: responsavelId || null,
      });
      if (perguntas.length) {
        await salvarPerguntas(ev.id, perguntas.map((p) => ({
          texto: p.texto.trim(), tipo: p.tipo, obrigatoria: !!p.obrigatoria,
          opcoes: p.tipo === "escolha_unica" ? p.opcoes.map((o) => o.trim()).filter(Boolean) : null,
        })));
      }
      setResultado(ev);
      notificar("Evento salvo.", "ok");
      onSalvo?.();
    } catch (e) {
      // Mostra a mensagem do banco (inclusive a de permissão do responsável) —
      // não contornamos nem inventamos regra no front.
      const msg = e.message || "Não foi possível salvar o evento.";
      setErro(msg); notificar(msg, "erro");
    }
    setSalvando(false);
  };

  /* ---- sucesso: o link (token nunca regenera) ---- */
  if (resultado) {
    const link = `${window.location.origin}/e/${resultado.token}`;
    const copiar = async () => {
      try { await navigator.clipboard.writeText(link); notificar("Link copiado.", "ok"); }
      catch { notificar("Não consegui copiar — selecione e copie manual.", "erro"); }
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.up, fontSize: 14, fontWeight: 800 }}>
          <Check size={17} /> Evento salvo
        </div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
          {resultado.nova_na_carteira ? "Abriu uma nova palestra na carteira." : "Somou à palestra já existente na carteira."} Mostre este link como QR code na hora da avaliação.
        </div>
        <div>
          <label style={labelAv}>Link da avaliação</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ ...inputAv, fontFamily: GROTESK, fontSize: 12.5 }} />
            <button onClick={copiar} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.gold}66`, background: `${C.gold}14`, color: C.gold, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SANS }}>
              <Link2 size={13} /> Copiar
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>Código {resultado.codigo} · o link não muda — gere o QR com folga antes do evento.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
          <button onClick={resetar} style={{ fontSize: 12.5, fontWeight: 700, padding: "9px 14px", borderRadius: 10, background: "transparent", border: `1px solid ${C.cardLine}`, color: C.muted, cursor: "pointer", fontFamily: SANS }}>Cadastrar outro</button>
          <button onClick={onFechar} style={{ fontSize: 12.5, fontWeight: 800, padding: "9px 18px", borderRadius: 10, background: `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})`, border: "none", color: "#1A1305", cursor: "pointer", fontFamily: SANS }}>Concluir</button>
        </div>
      </div>
    );
  }

  /* ---- formulário ---- */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Parte 1 — o evento */}
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.gold }}>1 · O evento</div>
        <div>
          <label style={labelAv}>Tipo</label>
          <Segmentado valor={tipo} onChange={(v) => { setTipo(v); setPalestraSel(""); }} opcoes={TIPOS_EVENTO.map((t) => ({ key: t.k, label: t.r }))} />
        </div>

        {ehPalestra ? (
          <div>
            <label style={labelAv}>Palestra</label>
            <select value={palestraSel} onChange={(e) => setPalestraSel(e.target.value)} style={{ ...inputAv, cursor: "pointer" }}>
              <option value="">Selecione uma palestra da carteira…</option>
              {palestras.map((p) => (
                <option key={p.palestra_id} value={p.titulo}>
                  {p.titulo}{p.ultima_edicao ? ` · última edição ${dataBR(p.ultima_edicao)}` : ""}{p.status && p.status !== "ativa" ? ` · ${p.status.replace("_", " ")}` : ""}
                </option>
              ))}
              <option value="__nova__">＋ Nova palestra…</option>
            </select>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 5 }}>Reutilize um título existente para a palestra repetida cair na mesma linha da carteira — senão o NPS acumulado se parte.</div>
            {palestraSel === "__nova__" && (
              <input autoFocus value={tituloNovo} onChange={(e) => setTituloNovo(e.target.value)} placeholder="Título da nova palestra" style={{ ...inputAv, marginTop: 8 }} />
            )}
          </div>
        ) : (
          <div>
            <label style={labelAv}>Título</label>
            <input value={tituloNovo} onChange={(e) => setTituloNovo(e.target.value)} placeholder="Título do evento" style={inputAv} />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelAv}>Data</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inputAv} /></div>
          <div><label style={labelAv}>Local</label><input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Onde acontece" style={inputAv} /></div>
        </div>
        <div><label style={labelAv}>Objetivo</label><textarea rows={2} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="O que esta palestra se propõe a entregar" style={{ ...inputAv, resize: "vertical" }} /></div>
        <div>
          <label style={labelAv}>Responsável</label>
          <select value={responsavelId ?? ""} onChange={(e) => setResponsavelId(e.target.value)} style={{ ...inputAv, cursor: "pointer" }}>
            <option value="">— sem responsável definido —</option>
            {(perfis.data ?? []).map((p) => (<option key={p.id} value={p.id}>{p.nome}{p.id === meuId ? " (você)" : ""}</option>))}
          </select>
        </div>
      </div>

      {/* Parte 2 — as perguntas da Elis */}
      <div style={{ borderTop: `1px solid ${C.hair}`, paddingTop: 14 }}>
        <EditorPerguntas perguntas={perguntas} setPerguntas={setPerguntas} rotulo="2 · Suas perguntas" />
      </div>

      {erro && <div style={{ fontSize: 12, color: C.down }}>{erro}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", borderTop: `1px solid ${C.hair}`, paddingTop: 14 }}>
        <BotaoSalvar onClick={salvar} disabled={!tituloFinal || !data} salvando={salvando}>Salvar evento</BotaoSalvar>
      </div>
    </div>
  );
}

// Botãozinho de ícone (reordenar/remover) — cinza, borda fina.
function BtnIcone({ children, onClick, disabled, titulo }) {
  return (
    <button onClick={onClick} disabled={disabled} title={titulo} aria-label={titulo} style={{
      display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8,
      background: "transparent", border: `1px solid ${C.cardLine}`, color: disabled ? C.hair : C.muted,
      cursor: disabled ? "default" : "pointer",
    }}>{children}</button>
  );
}

// Estado do link a partir da janela do evento (não muda o token, só informa).
const estadoLink = (e) => {
  const agora = Date.now();
  const abre = e.abre_em ? new Date(e.abre_em).getTime() : null;
  const fecha = e.fecha_em ? new Date(e.fecha_em).getTime() : null;
  if (abre != null && agora < abre) return { k: "aguardando", label: "aguardando", cor: C.warn };
  if (fecha != null && agora > fecha) return { k: "encerrado", label: "encerrado", cor: C.faint };
  return { k: "aberto", label: "aberto", cor: C.up };
};
const rotuloTipoEvento = (k) => TIPOS_EVENTO.find((t) => t.k === k)?.r ?? k;
const corNps = (v) => (v == null ? C.faint : v >= 50 ? C.up : v >= 0 ? C.gold : C.down);
const STATUS_CARTEIRA = [{ k: "ativa", r: "Ativa" }, { k: "em_observacao", r: "Em observação" }, { k: "aposentada", r: "Aposentada" }];
const rotuloStatusCarteira = (s) => STATUS_CARTEIRA.find((x) => x.k === s)?.r ?? "—";
const corStatusCarteira = (s) => (s === "aposentada" ? C.down : s === "em_observacao" ? C.warn : C.up);

// Lista dos eventos do setor (RLS filtra). Estado do link + contagem de resposta.
function ListaEventos({ eventos, npsPorEvento, onAbrir }) {
  const th = (txt, alin) => <th style={{ textAlign: alin, padding: "8px 12px", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim, whiteSpace: "nowrap" }}>{txt}</th>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SANS }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.hair}` }}>{th("Evento", "left")}{th("Data", "left")}{th("Tipo", "left")}{th("Link", "left")}{th("Respostas", "right")}</tr>
        </thead>
        <tbody>
          {eventos.map((e) => {
            const est = estadoLink(e);
            const resp = npsPorEvento.get(e.id)?.respostas;
            return (
              <tr key={e.id} onClick={() => onAbrir(e)} style={{ borderBottom: `1px solid ${C.hair}`, cursor: "pointer" }}>
                <td style={{ padding: "9px 12px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }} title={e.titulo}>{e.titulo}</div>
                  <div style={{ fontSize: 10, color: C.faint }}>{e.codigo}</div>
                </td>
                <td style={{ padding: "9px 12px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{dataBR(e.data_evento)}</td>
                <td style={{ padding: "9px 12px", fontSize: 12, color: C.muted, whiteSpace: "nowrap" }}>{rotuloTipoEvento(e.tipo)}</td>
                <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, color: est.cor, background: `${est.cor}1A`, border: `1px solid ${est.cor}44` }}>{est.label}</span>
                </td>
                <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: GROTESK, fontSize: 12.5, color: resp ? C.text : C.faint }}>{numero(resp ?? 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Decisão de carteira: a palestra continua? Motivo obrigatório (o banco recusa
// sem). Só aparece para evento ligado a uma palestra.
function DecisaoCarteira({ palestraId, palestraRow, onMudou, notificar }) {
  const [status, setStatus] = useState(palestraRow?.status ?? "ativa");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setStatus(palestraRow?.status ?? "ativa"); }, [palestraRow?.status]);
  const salvar = async () => {
    if (!motivo.trim()) { notificar("Escreva o motivo da decisão.", "erro"); return; }
    setSalvando(true);
    try { await definirStatusCarteira(palestraId, status, motivo.trim()); notificar("Decisão de carteira registrada.", "ok"); setMotivo(""); onMudou?.(); }
    catch (e) { notificar(e.message || "Não foi possível salvar.", "erro"); }
    setSalvando(false);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
        Situação atual: <b style={{ color: corStatusCarteira(palestraRow?.status) }}>{rotuloStatusCarteira(palestraRow?.status)}</b>
        {palestraRow?.nps_acumulado != null
          ? <> · NPS acumulado <b style={{ color: corNps(Number(palestraRow.nps_acumulado)) }}>{palestraRow.nps_acumulado}</b> · {numero(palestraRow.respostas_total)} resp. em {numero(palestraRow.edicoes)} {Number(palestraRow.edicoes) === 1 ? "edição" : "edições"}</>
          : <> · NPS acumulado ainda sem base (mín. 5 respostas)</>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputAv, width: "auto", cursor: "pointer" }}>
          {STATUS_CARTEIRA.map((s) => (<option key={s.k} value={s.k}>{s.r}</option>))}
        </select>
      </div>
      <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da decisão (obrigatório)" style={{ ...inputAv, resize: "vertical" }} />
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <BotaoSalvar onClick={salvar} disabled={!motivo.trim()} salvando={salvando}>Salvar decisão</BotaoSalvar>
      </div>
    </div>
  );
}

// Cabeçalho de seção dentro do drawer de resultado.
function TituloResultado({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.gold, margin: "4px 0 2px" }}>{children}</div>;
}

/* Resultado de um evento. Lê das views (nunca das tabelas cruas de resposta).
   O NPS NUNCA aparece sozinho: vem com a distribuição e a contagem ao lado —
   com 12 respostas, um detrator move o índice 8 pontos. Sem gráfico: número e
   contagem bastam. Aqui também está o ponto de entrada que abre um evento já
   respondido — o editor de perguntas vem travado. */
function ResultadoEvento({ evento, nps, onFechar, onMudou, notificar }) {
  const notas = useEventoNotas();
  const textos = useEventoTextos();
  const perguntasHook = useEventoPerguntas(evento.id);
  const carteira = useCarteira();

  const est = estadoLink(evento);
  const link = `${window.location.origin}/e/${evento.token}`;
  const travado = !!evento.travado_em;
  const resp = nps ? Number(nps.respostas ?? 0) : 0;

  const minhasNotas = useMemo(() => (notas.data ?? []).filter((n) => Number(n.evento_id) === evento.id), [notas.data, evento.id]);
  const gruposTexto = useMemo(() => {
    const m = new Map();
    for (const t of (textos.data ?? []).filter((t) => Number(t.evento_id) === evento.id)) {
      if (!m.has(t.pergunta_id)) m.set(t.pergunta_id, { pergunta: t.pergunta, respostas: [] });
      m.get(t.pergunta_id).respostas.push(t.resposta);
    }
    return [...m.values()];
  }, [textos.data, evento.id]);
  const palestraRow = useMemo(() => (carteira.data ?? []).find((p) => p.palestra_id === evento.palestra_id) ?? null, [carteira.data, evento.palestra_id]);

  // perguntas da Elis (não-núcleo) para o editor
  const [perguntas, setPerguntas] = useState([]);
  useEffect(() => {
    setPerguntas((perguntasHook.data ?? []).filter((p) => !p.nucleo).map((p) => ({ texto: p.texto, tipo: p.tipo, obrigatoria: p.obrigatoria, opcoes: p.opcoes ?? [] })));
  }, [perguntasHook.data]);
  const [salvandoP, setSalvandoP] = useState(false);

  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); notificar("Link copiado.", "ok"); }
    catch { notificar("Não consegui copiar — selecione e copie manual.", "erro"); }
  };
  const salvarPergs = async () => {
    for (let i = 0; i < perguntas.length; i++) {
      const p = perguntas[i];
      if (!p.texto.trim()) { notificar(`A pergunta ${i + 1} está sem enunciado.`, "erro"); return; }
      if (p.tipo === "escolha_unica" && (p.opcoes ?? []).map((o) => o.trim()).filter(Boolean).length < 2) { notificar(`A pergunta ${i + 1} (escolha única) precisa de ao menos duas opções.`, "erro"); return; }
    }
    setSalvandoP(true);
    try {
      await salvarPerguntas(evento.id, perguntas.map((p) => ({ texto: p.texto.trim(), tipo: p.tipo, obrigatoria: !!p.obrigatoria, opcoes: p.tipo === "escolha_unica" ? p.opcoes.map((o) => o.trim()).filter(Boolean) : null })));
      notificar("Perguntas salvas.", "ok");
      onMudou?.();
    } catch (e) { notificar(e.message || "Não foi possível salvar as perguntas.", "erro"); }
    setSalvandoP(false);
  };

  return (
    <DrawerLado titulo={evento.titulo} sub={`${evento.codigo} · ${rotuloTipoEvento(evento.tipo)} · ${dataBR(evento.data_evento)}`} onFechar={onFechar} largura={600}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Link */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, color: est.cor, background: `${est.cor}1A`, border: `1px solid ${est.cor}44` }}>{est.label}</span>
            <span style={{ fontSize: 10.5, color: C.faint }}>responde de {dataBR(evento.abre_em)} até {dataBR(evento.fecha_em)}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ ...inputAv, fontFamily: GROTESK, fontSize: 12 }} />
            <button onClick={copiar} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 10, border: `1px solid ${C.gold}66`, background: `${C.gold}14`, color: C.gold, fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", fontFamily: SANS }}><Link2 size={13} /> Copiar</button>
          </div>
        </div>

        {/* NPS — nunca sozinho: com distribuição e contagem ao lado */}
        <div>
          <TituloResultado>Recomendação (NPS)</TituloResultado>
          <div style={{ background: "rgba(255,255,255,.02)", border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: "14px 16px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", minWidth: 80 }}>
              <div style={{ fontFamily: GROTESK, fontSize: 34, fontWeight: 700, lineHeight: 1, color: corNps(nps?.nps != null ? Number(nps.nps) : null) }}>{nps?.nps != null ? nps.nps : "—"}</div>
              <div style={{ fontSize: 9.5, color: C.faint, textTransform: "uppercase", letterSpacing: ".5px", marginTop: 4 }}>NPS</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, marginBottom: 6 }}>
                <span style={{ color: C.up }}><b>{numero(nps?.promotores ?? 0)}</b> promotores</span>
                <span style={{ color: C.warn }}><b>{numero(nps?.neutros ?? 0)}</b> neutros</span>
                <span style={{ color: C.down }}><b>{numero(nps?.detratores ?? 0)}</b> detratores</span>
              </div>
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,.06)" }}>
                <div style={{ width: `${(Number(nps?.promotores ?? 0) / (resp || 1)) * 100}%`, background: C.up }} />
                <div style={{ width: `${(Number(nps?.neutros ?? 0) / (resp || 1)) * 100}%`, background: C.warn }} />
                <div style={{ width: `${(Number(nps?.detratores ?? 0) / (resp || 1)) * 100}%`, background: C.down }} />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 7 }}><b style={{ color: C.text }}>{numero(resp)}</b> {resp === 1 ? "resposta" : "respostas"} no total</div>
            </div>
          </div>
          {nps?.nps == null && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>O NPS aparece a partir de 5 respostas — {numero(resp)} até agora. A distribuição já conta.</div>}
        </div>

        {/* Média por pergunta numérica */}
        <div>
          <TituloResultado>Média por pergunta</TituloResultado>
          {notas.isLoading ? <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div>
            : !minhasNotas.length ? <div style={{ fontSize: 12, color: C.faint }}>Nenhuma pergunta de escala neste evento.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {minhasNotas.map((n) => (
                    <div key={n.pergunta_id} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${C.hair}`, paddingBottom: 6 }}>
                      <span style={{ fontSize: 12, color: C.text, minWidth: 0 }}>{n.texto}{n.nucleo ? <span style={{ color: C.faint, fontSize: 10 }}> · núcleo</span> : null}</span>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontFamily: GROTESK, fontSize: 14, fontWeight: 700, color: n.media != null ? C.text : C.faint }}>{n.media != null ? n.media : "—"}</span>
                        <span style={{ fontSize: 10, color: C.faint }}>{numero(n.respostas ?? 0)} resp.</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
        </div>

        {/* Texto livre */}
        <div>
          <TituloResultado>Respostas em texto</TituloResultado>
          {textos.isLoading ? <div style={{ fontSize: 12, color: C.faint }}>Carregando…</div>
            : !gruposTexto.length ? <div style={{ fontSize: 12, color: C.faint }}>Ninguém escreveu ainda.</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {gruposTexto.map((g, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 6 }}>{g.pergunta} <span style={{ color: C.faint, fontWeight: 400 }}>· {g.respostas.length}</span></div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {g.respostas.map((r, j) => (<div key={j} style={{ fontSize: 12, color: C.text, background: "rgba(255,255,255,.02)", border: `1px solid ${C.hair}`, borderRadius: 8, padding: "8px 11px", lineHeight: 1.45 }}>{r}</div>))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>

        {/* Perguntas do formulário — editor (travado quando já houve resposta) */}
        <div style={{ borderTop: `1px solid ${C.hair}`, paddingTop: 14 }}>
          <EditorPerguntas perguntas={perguntas} setPerguntas={setPerguntas} travado={travado} rotulo="Perguntas do formulário" />
          {!travado && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <BotaoSalvar onClick={salvarPergs} salvando={salvandoP}>Salvar perguntas</BotaoSalvar>
            </div>
          )}
        </div>

        {/* Decisão de carteira (só palestra ligada à carteira) */}
        {evento.palestra_id != null && (
          <div style={{ borderTop: `1px solid ${C.hair}`, paddingTop: 14 }}>
            <TituloResultado>Carteira · esta palestra continua?</TituloResultado>
            <DecisaoCarteira palestraId={evento.palestra_id} palestraRow={palestraRow} onMudou={onMudou} notificar={notificar} />
          </div>
        )}
      </div>
    </DrawerLado>
  );
}

// Seção do Hub Pedagógico: cadastro + lista de eventos + resultado.
// O Toast e o `notificar` vêm do hub.
function SecaoAvaliacaoEventos({ notificar }) {
  const sessao = useSessao();
  const meuId = sessao?.user?.id ?? null;
  const qc = useQueryClient();
  const eventos = useEventos();
  const npsHook = useEventoNps();
  const [novo, setNovo] = useState(false);
  const [abertoId, setAbertoId] = useState(null);

  const npsPorEvento = useMemo(() => {
    const m = new Map();
    for (const r of npsHook.data ?? []) m.set(Number(r.evento_id), r);
    return m;
  }, [npsHook.data]);
  const lista = useMemo(() => [...(eventos.data ?? [])].sort((a, b) => String(b.data_evento).localeCompare(String(a.data_evento)) || Number(b.id) - Number(a.id)), [eventos.data]);
  const eventoAberto = useMemo(() => lista.find((e) => e.id === abertoId) ?? null, [lista, abertoId]);
  const recarregar = () => qc.invalidateQueries();

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 4 }}>
        <Star size={15} style={{ color: C.gold, flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.bright }}>Avaliação de eventos</span>
        <span style={{ fontSize: 11, color: C.faint }}>palestras, workshops e mentorias · link por QR</span>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, maxWidth: 460 }}>
          Cadastre o evento e suas perguntas e receba o link da avaliação para gerar o QR code. Quem assistiu responde no celular, sem login.
        </span>
        <button onClick={() => setNovo(true)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800, color: "#1A1305", background: `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})`, border: "none", borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontFamily: SANS, whiteSpace: "nowrap" }}>
          <Plus size={15} /> Novo evento
        </button>
      </div>
      <Bloco titulo="Eventos" canto="clique para ver o resultado" sem altura={320}>
        <Estado carregando={eventos.isLoading} erro={eventos.error} vazio={!lista.length}
          vazioTitulo="Nenhum evento ainda" vazioDica="Cadastre o primeiro evento para gerar o link de avaliação.">
          <ListaEventos eventos={lista} npsPorEvento={npsPorEvento} onAbrir={(e) => setAbertoId(e.id)} />
        </Estado>
      </Bloco>
      {novo && (
        <ModalCentro titulo="Novo evento" largura={680} onFechar={() => setNovo(false)}>
          <FormEvento meuId={meuId} onFechar={() => setNovo(false)} onSalvo={recarregar} notificar={notificar} />
        </ModalCentro>
      )}
      {eventoAberto && (
        <ResultadoEvento evento={eventoAberto} nps={npsPorEvento.get(eventoAberto.id)} onFechar={() => setAbertoId(null)} onMudou={recarregar} notificar={notificar} />
      )}
    </>
  );
}

/* Hub Pedagógico / Sucesso do Cliente. Foco em SAÚDE: acompanhamento, não
   fila de tarefas. Tudo vem do Salesforce; conclusão, notas e NPS não são
   medidos (não existem na fonte). Comparecimento usa apenas fato_presenca e
   turmas cuja cobertura torna a ausência mensurável. */
function HubPedagogico() {
  const kpis = usePedagogicoKpis();
  const presKpis = usePedagogicoPresencaKpis();
  const presTempo = usePedagogicoPresencaTempo();
  const recompraCurso = usePedagogicoRecompraCurso();
  const presCurso = usePedagogicoPresencaCurso();
  const retencaoCasos = usePedagogicoRetencaoCasos();
  const retencao = usePedagogicoRetencao();
  const retencaoMotivos = usePedagogicoRetencaoMotivos();
  const qc = useQueryClient();
  const [toast, setToast] = useState(null);       // feedback de escrita (some sozinho)
  const [retEdit, setRetEdit] = useState(null);         // caso de retenção ('novo' | caso | null)

  // Após gravar: recarrega as views afetadas e fecha o modal.
  const aposSalvar = () => { qc.invalidateQueries(); setRetEdit(null); };

  const k = kpis.data?.[0] ?? {};
  const pk = presKpis.data?.[0] ?? {};
  const cursosPorAluno = k.cursos_por_aluno != null
    ? Number(k.cursos_por_aluno).toLocaleString("pt-BR", { maximumFractionDigits: 1 })
    : "—";

  // Série trimestral: amostra pequena (<30 matrículas) fica de-enfatizada.
  const serieTri = useMemo(() =>
    (presTempo.data ?? [])
      .filter((r) => r.periodo != null)
      .map((r) => ({
        periodo: r.periodo,
        rotulo: rotuloTri(r.periodo),
        taxa: pctTaxa(r.taxa_comparecimento),
        amostra: Number(r.matriculas ?? 0),
        pequena: Number(r.matriculas ?? 0) < 30,
      }))
      .sort((a, b) => String(a.periodo).localeCompare(String(b.periodo))),
    [presTempo.data]);
  const temPequena = serieTri.some((p) => p.pequena);

  // Cursos que mais fidelizam (recompra desc).
  const fideliza = useMemo(() =>
    (recompraCurso.data ?? [])
      .map((r) => ({ rotulo: r.curso ?? "—", valor: pctTaxa(r.taxa_recompra), amostra: Number(r.alunos ?? 0) }))
      .filter((r) => r.amostra > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6),
    [recompraCurso.data]);

  // Cursos com mais falta: mostra a % que FALTOU (100 − comparecimento), piores no topo.
  const maisFalta = useMemo(() =>
    (presCurso.data ?? [])
      .map((r) => ({ rotulo: r.curso ?? "—", valor: 100 - pctTaxa(r.taxa_comparecimento), amostra: Number(r.matriculas ?? 0) }))
      .filter((r) => r.amostra > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6),
    [presCurso.data]);

  // Retenção: casos recentes primeiro; motivos por frequência (retidos+cancel).
  const casos = useMemo(() =>
    [...(retencaoCasos.data ?? [])].sort((a, b) => String(b.data_ligacao ?? "").localeCompare(String(a.data_ligacao ?? ""))),
    [retencaoCasos.data]);
  const pendentes = useMemo(() => casos.filter((c) => String(c.desfecho ?? "").trim().toLowerCase() === "pendente").length, [casos]);
  const motivos = useMemo(() =>
    [...(retencaoMotivos.data ?? [])].sort((a, b) => (Number(b.retidos ?? 0) + Number(b.cancelados ?? 0)) - (Number(a.retidos ?? 0) + Number(a.cancelados ?? 0))),
    [retencaoMotivos.data]);
  const ret = retencao.data?.[0] ?? {};

  const notificar = (msg, tipo = "ok") => setToast({ msg, tipo });
  // Toast some sozinho (erro fica um pouco mais).
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.tipo === "erro" ? 8000 : 6000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      <style>{`
        .pedKpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
        .pedConfKpis { display: grid; grid-template-columns: 1fr; gap: 9px; }
        .pedBot { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
        @media (min-width: 720px)  { .pedKpis { grid-template-columns: repeat(4, 1fr); } .pedConfKpis { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1000px) { .pedBot { grid-template-columns: 1fr 1fr; } }  /* fideliza · falta */
      `}</style>

      {/* ---- KPIs de saúde ---- */}
      <div className="pedKpis" style={{ marginBottom: 12 }}>
        <ChipKpi compacto hero Icone={Repeat} label="Recompra (grade)" valor={fmtPct(k.taxa_recompra, 1)} nota="cursos CIS + GGB" />
        <ChipKpi compacto Icone={UserCheck} label="Comparecimento" valor={fmtPct(pk.taxa_comparecimento_geral)}
          sub={pk.turmas_cobertas ? `${numero(pk.turmas_cobertas)} turmas mensuráveis` : "fonte de presença"} />
        <ChipKpi compacto Icone={Users} label="Alunos únicos" valor={k.alunos_unicos != null ? numero(k.alunos_unicos) : "—"} nota="na base" />
        <ChipKpi compacto Icone={BookOpen} label="Cursos por aluno" valor={cursosPorAluno} nota="média" />
      </div>

      {/* ---- Comparecimento no tempo (largura total) ---- */}
      <Bloco titulo="Comparecimento no tempo" canto="taxa por trimestre">
        <Estado carregando={presTempo.isLoading} erro={presTempo.error} vazio={serieTri.length < 2}
          vazioTitulo="Sem série de presença" vazioDica="Aparece com o setor pedagógico conectado.">
          <ColunasPresenca serie={serieTri} />
          {temPequena && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, color: C.faint, marginTop: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, border: `1.2px solid ${C.faint}`, flexShrink: 0 }} />
              colunas vazadas: trimestres com menos de 30 matrículas — amostra pequena
            </div>
          )}
        </Estado>
      </Bloco>

      {/* ---- Cursos: fidelizam · faltam ---- */}
      <div className="pedBot" style={{ marginBottom: 12 }}>
        <Bloco titulo="Cursos que mais fidelizam" canto="recompra do aluno" sem altura={250}>
          <Estado carregando={recompraCurso.isLoading} erro={recompraCurso.error} vazio={!fideliza.length}
            vazioTitulo="Sem recompra por curso" vazioDica="Aparece com o setor pedagógico conectado.">
            <RankingCurso linhas={fideliza} cor={C.gold} sufixo="alunos" />
          </Estado>
        </Bloco>
        <Bloco titulo="Cursos com mais falta" canto="% que faltou · piores no topo" sem altura={250}>
          <Estado carregando={presCurso.isLoading} erro={presCurso.error} vazio={!maisFalta.length}
            vazioTitulo="Sem falta por curso" vazioDica="Aparece com o setor pedagógico conectado.">
            <RankingCurso linhas={maisFalta} cor={C.warn} sufixo="matrículas" />
          </Estado>
        </Bloco>
      </div>

      {/* ---- Retenção (entrada manual: ligações de win-back) ---- */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <PhoneCall size={15} style={{ color: C.up, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: C.bright }}>Retenção</span>
          <span style={{ fontSize: 11, color: C.faint }}>ligações de win-back · sucesso da equipe</span>
        </div>
        <button onClick={() => setRetEdit("novo")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.cardLine}`, borderRadius: 9, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 12, fontWeight: 700, fontFamily: SANS }}>
          <Plus size={13} /> Registrar caso
        </button>
      </div>
      <div className="pedKpis" style={{ marginBottom: 12 }}>
        <ChipKpi compacto hero Icone={PhoneCall} label="Casos" valor={ret.total_casos != null ? numero(ret.total_casos) : "—"} nota={pendentes ? `${numero(pendentes)} pendentes` : "ligações"} />
        <ChipKpi compacto Icone={ShieldCheck} label="Retidos" valor={ret.retidos != null ? numero(ret.retidos) : "—"} nota="win-back" />
        <ChipKpi compacto Icone={AlertTriangle} label="Cancelados" valor={ret.cancelados != null ? numero(ret.cancelados) : "—"} nota="perdidos" />
        <ChipKpi compacto Icone={Target} label="Taxa de retenção" valor={fmtPct(ret.taxa_retencao)} nota="sucesso da equipe" />
      </div>
      <div className="pedBot" style={{ marginBottom: 12 }}>
        <Bloco titulo="Casos" canto={`recentes primeiro · ${numero(casos.length)}`} sem altura={250}>
          <Estado carregando={retencaoCasos.isLoading} erro={retencaoCasos.error} vazio={!casos.length}
            vazioTitulo="Sem casos registrados" vazioDica='Use "Registrar caso" para lançar a primeira ligação.'>
            {casos.map((c) => <LinhaRetencao key={c.id} c={c} onEditar={setRetEdit} />)}
          </Estado>
        </Bloco>
        <Bloco titulo="Motivos mais frequentes" canto="retidos × cancelados" sem altura={250}>
          <Estado carregando={retencaoMotivos.isLoading} erro={retencaoMotivos.error} vazio={!motivos.length}
            vazioTitulo="Sem motivos ainda" vazioDica="Aparecem conforme os casos são registrados.">
            <ListaMotivos linhas={motivos} />
          </Estado>
        </Bloco>
      </div>

      {/* ---- Transparência ---- */}
      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 22 }}>
        {/* O texto dizia que NPS não era medido. Passou a ser, pelo módulo de
            avaliação de eventos — mas só para EVENTO. Conclusão e nota de
            curso seguem sem medição, e juntar as três numa frase só faria o
            aviso mentir do outro lado. */}
        <b style={{ color: C.muted }}>Transparência.</b> A presença cobre {pk.turmas_cobertas ? numero(pk.turmas_cobertas) : "—"} turmas
        mensuráveis na fonte de presença; turmas sem cobertura suficiente ficam de fora do comparecimento. O NPS de <b style={{ color: C.muted }}>evento</b> é
        medido pela avaliação por QR code — o resultado fica na Central Pedagógica. Conclusão de curso e nota do aluno
        continuam sem medição: não estão no Salesforce.
      </div>

      <RodapeIntegracoes fontes={["salesforce"]} />

      {/* ---- Modais de entrada (gravam nas tabelas; RLS gate pedagógico) ---- */}
      {retEdit && (
        <ModalCentro titulo={retEdit === "novo" ? "Registrar caso de retenção" : "Editar caso de retenção"} onFechar={() => setRetEdit(null)}>
          <FormRetencao caso={retEdit === "novo" ? null : retEdit} onSalvo={aposSalvar} />
        </ModalCentro>
      )}

      <Toast toast={toast} onFechar={() => setToast(null)} />
    </>
  );
}

function HubEventos() {
  const ev = useEventosDesempenho();
  const t = useMemo(() => {
    const d = ev.data ?? [];
    return {
      ingressos: d.reduce((s, e) => s + Number(e.ingressos ?? 0), 0),
      check: d.reduce((s, e) => s + Number(e.compareceram ?? 0), 0),
      bruta: d.reduce((s, e) => s + Number(e.receita_bruta ?? 0), 0),
      liquida: d.reduce((s, e) => s + Number(e.receita_liquida ?? 0), 0),
    };
  }, [ev.data]);
  const top = useMemo(
    () => [...(ev.data ?? [])]
      .sort((a, b) => Number(b.receita_liquida ?? 0) - Number(a.receita_liquida ?? 0))
      .slice(0, 10)
      .map((e) => ({ rotulo: e.nome_evento, valor: Number(e.receita_liquida ?? 0) })),
    [ev.data]
  );
  const comp = t.ingressos ? ((t.check / t.ingressos) * 100).toFixed(1) : null;

  return (
    <>
      <Estado carregando={ev.isLoading} erro={ev.error} vazio={!ev.data?.length}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 26 }}>
          <Kpi label="Receita líquida" valor={moeda(t.liquida)} nota="já sem a taxa" />
          <Kpi label="Taxa Sympla" valor={moeda(t.bruta - t.liquida)} nota="retido na fonte" destaque={C.warn} />
          <Kpi label="Ingressos" valor={numero(t.ingressos)} nota="acumulado" />
          <Kpi label="Comparecimento" valor={comp ?? "—"} unidade="%" nota="check-in / ingresso" />
        </div>
        <Bloco titulo="Eventos por receita líquida" canto="acumulado" sem>
          <Lista linhas={top} total={t.liquida} />
        </Bloco>
      </Estado>
      <RodapeIntegracoes fontes={["sympla"]} />
    </>
  );
}

/* ============ LOJA · PRODUTOS E ESTOQUE (Omie PDV) ============
   Mesma fonte da parte financeira agora: tudo no Hub Loja vem do Omie
   (cupom fiscal do PDV). Estes helpers cuidam da visão de PRODUTO — ranking
   de vendidos e posição de estoque —, complementar à de receita/formas. */

// Uma linha por (produto, mês). Soma os meses do recorte e devolve o top-N
// por faturamento. Mês entra se seu ANO-MÊS cruza o período (dado mensal não
// tem dia; recortar por dia zeraria a loja em quase todo filtro).
const produtosNoPeriodo = (linhas, inicio, fim, topN = 10) => {
  const de = String(inicio).slice(0, 7), ate = String(fim).slice(0, 7);
  const m = new Map();
  for (const l of linhas ?? []) {
    const ym = String(l.mes ?? "").slice(0, 7);
    if (!ym || ym < de || ym > ate) continue;
    const k = l.produto_id ?? l.produto ?? "—";
    const a = m.get(k) ?? { produto: l.produto ?? "—", quantidade: 0, faturamento: 0 };
    a.quantidade += Number(l.quantidade ?? 0);
    a.faturamento += Number(l.faturamento ?? 0);
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.faturamento - a.faturamento).slice(0, topN);
};

/* Ranking de produtos: nome + quantidade + faturamento, barra pelo valor.
   Duas grandezas por linha, então não cabe no `Lista` genérico. */
function ProdutosVendidos({ linhas }) {
  const max = Math.max(...linhas.map((l) => l.faturamento), 1);
  return (
    <div>
      {linhas.map((l, i) => (
        <div key={l.produto} style={{ padding: "9px 20px", borderBottom: `1px solid ${C.hair}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <span style={{ fontFamily: GROTESK, fontSize: 11, fontWeight: 700, color: i === 0 ? C.gold : C.faint, flexShrink: 0, width: 16 }}>{i + 1}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.produto}>{l.produto}</span>
            </span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: C.faint }}>{numero(l.quantidade)} un</span>
              <span style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: i === 0 ? C.gold : C.text }}>{moeda(l.faturamento)}</span>
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
            <div style={{ width: `${(l.faturamento / max) * 100}%`, height: "100%", borderRadius: 3, background: i === 0 ? `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})` : `linear-gradient(90deg, ${C.goldBase}, ${C.gold})` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Número de estoque. `alerta` pinta em vermelho. `compacto` é a faixa
   horizontal do card de estoque: ícone + "Rótulo · Valor · detalhe" numa
   linha que QUEBRA (sem corte) — o valor destacado no meio. */
function EstoqueNum({ Icone, label, valor, sub, alerta, compacto }) {
  const cor = alerta ? C.down : C.gold;
  if (compacto) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 11,
        background: "rgba(255,255,255,.03)",
        border: `1px solid ${alerta ? `${C.down}44` : C.cardLine}`, borderRadius: 11, padding: "10px 13px",
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: alerta ? `${C.down}1e` : `${C.gold}18`, color: cor,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icone size={15} />
        </span>
        <div style={{ minWidth: 0, flex: 1, fontSize: 12, lineHeight: 1.4, color: C.faint }}>
          <b style={{ color: C.muted, fontWeight: 700 }}>{label}</b>
          <span style={{ color: C.dim }}> · </span>
          <b style={{ fontFamily: GROTESK, fontSize: 15.5, fontWeight: 700, letterSpacing: "-.3px", color: cor }}>{valor}</b>
          {sub && <><span style={{ color: C.dim }}> · </span>{sub}</>}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      flex: 1, minWidth: 150, background: "rgba(255,255,255,.03)",
      border: `1px solid ${alerta ? `${C.down}44` : C.cardLine}`, borderRadius: 13, padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: alerta ? `${C.down}1e` : `${C.gold}18`, color: cor,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icone size={15} />
        </span>
        <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontFamily: GROTESK, fontSize: 30, fontWeight: 700, letterSpacing: "-1px", color: cor, lineHeight: 1 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: alerta ? C.down : C.faint, marginTop: 6, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}


/* Nível da meta (planilha da gestora): Máster > Básica > Mínima > Abaixo >
   Sem meta. Máster é verde FORTE (distinto do verde da Básica). */
const VERDE_FORTE = "#3DBE6B";
const NIVEL_COR = {
  "máster": VERDE_FORTE, master: VERDE_FORTE,
  "básica": C.up, basica: C.up,
  "mínima": C.warn, minima: C.warn,
  abaixo: C.down, "sem meta": C.muted,
};
// Casa por nome (com ou sem acento), sem regex de combinantes.
const corNivel = (n) => NIVEL_COR[String(n ?? "").trim().toLowerCase()] ?? C.muted;

/* Frase da meta. A vw_loja_receita_total_mes traz o nível e os patamares
   (min/básica/máster) sobre o consolidado, mas não a frase pronta — então é
   montada aqui, nas mesmas quatro variações da planilha da gestora. */
function resumoMeta(m) {
  const r = Number(m.receita ?? 0);
  const min = Number(m.meta_minima ?? 0), bas = Number(m.meta_basica ?? 0), mas = Number(m.meta_master ?? 0);
  const nivel = String(m.nivel_atingido ?? "").trim().toLowerCase();
  if (nivel.startsWith("máster") || nivel.startsWith("master")) return `Meta máster batida · superou em ${moeda(r - mas)}`;
  if (nivel.startsWith("bás") || nivel.startsWith("bas")) return `Meta básica batida · faltam ${moeda(mas - r)} para a máster`;
  if (nivel.startsWith("mín") || nivel.startsWith("min")) return `Meta mínima batida · faltam ${moeda(bas - r)} para a básica`;
  if (nivel.startsWith("abaixo")) return `Abaixo da mínima · faltam ${moeda(min - r)}`;
  return "Sem meta cadastrada";
}

/* Selo de meta no card de receita. Lê a linha do mês da
   vw_loja_receita_total_mes (consolidado). Em vez de um "59%" solto (que não
   diz se é bom ou ruim), mostra a FRASE — ex.: "Meta básica batida · faltam
   R$ 5.000 para a máster" — colorida pelo nível. Mês EM CURSO não classifica
   (o mês não acabou): mostra só realizado x meta mínima com o rótulo "em
   curso". Metas são mensais — o selo some no "Geral". */
function MetaBadge({ meta }) {
  if (!meta) return null;
  const emCurso = !!meta.em_curso;
  const realizado = Number(meta.receita ?? 0);
  const minima = Number(meta.meta_minima ?? 0);
  const nivel = meta.nivel_atingido ?? "—";
  const mm = String(meta.mes ?? "").slice(5, 7);
  const mesNome = mm ? MESES[Number(mm) - 1] : null;
  const cor = emCurso ? C.muted : corNivel(nivel);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
      background: "rgba(255,255,255,.03)", border: `1px solid ${cor}44`,
      borderRadius: 11, padding: "9px 13px",
    }}>
      <Target size={15} style={{ color: cor, flexShrink: 0 }} />
      {mesNome && <span style={{ fontSize: 11.5, color: C.dim, fontWeight: 700 }}>{mesNome}</span>}
      {emCurso ? (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", fontSize: 12, color: C.faint }}>
          <b style={{ fontFamily: GROTESK, fontSize: 15, fontWeight: 700, color: C.bright }}>{moeda(realizado)}</b>
          <span>de {moeda(minima)} · meta mínima</span>
          <span style={{
            fontSize: 11, fontWeight: 800, color: C.muted, background: "rgba(255,255,255,.06)",
            border: `1px solid ${C.cardLine}`, padding: "1px 8px", borderRadius: 6,
          }}>em curso</span>
        </span>
      ) : (
        <span style={{ fontSize: 12.5, fontWeight: 700, color: cor }}>
          {resumoMeta(meta)}
        </span>
      )}
    </div>
  );
}

/* Quebra da receita por fonte — barra 100% empilhada + legenda com %. Detalhe
   do card de receita: Produtos domina (~91%); as outras são complementos
   (livrão, cursos premium, aluguel de sala, Sentido de Brincar). */
const CORES_FONTE = [C.gold, C.up, ARRED_META, C.warn, "#B98AD9", C.faint];
function FonteBreakdown({ fontes }) {
  const total = fontes.reduce((s, f) => s + f.valor, 0);
  if (!total) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", height: 9, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,.05)" }}>
        {fontes.map((f, i) => (
          <div key={f.fonte} title={`${f.fonte} · ${moeda(f.valor)} · ${f.pct.toFixed(0)}%`}
            style={{ width: `${f.pct}%`, background: CORES_FONTE[i % CORES_FONTE.length] }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px", fontSize: 10.5, color: C.faint }}>
        {fontes.map((f, i) => (
          <span key={f.fonte} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: CORES_FONTE[i % CORES_FONTE.length], flexShrink: 0 }} />
            <b style={{ color: C.muted, fontWeight: 700 }}>{f.fonte}</b>
            <span style={{ color: C.dim }}>{f.pct.toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* Performance por curso — quanto a loja vende DURANTE cada curso (planilha da
   gestora). Duas ordens bem diferentes e ambas importam: por faturamento
   total e por valor por aluno. Barra pela métrica escolhida; mostra alunos. */
function PerformanceCurso({ linhas, modo, formatarValor }) {
  const max = Math.max(...linhas.map((l) => l[modo]), 1);
  return (
    <div>
      {linhas.map((l, i) => (
        <div key={l.curso} style={{ padding: "8px 20px", borderBottom: `1px solid ${C.hair}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 5 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
              <span style={{ fontFamily: GROTESK, fontSize: 11, fontWeight: 700, color: i === 0 ? C.gold : C.faint, width: 15, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.curso}>{l.curso}</span>
            </span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 10.5, color: C.faint }}>{numero(l.alunos)} alunos</span>
              <span style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: i === 0 ? C.gold : C.text }}>{formatarValor(l[modo])}</span>
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
            <div style={{ width: `${(l[modo] / max) * 100}%`, height: "100%", borderRadius: 3, background: i === 0 ? `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})` : `linear-gradient(90deg, ${C.goldBase}, ${C.gold})` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Hub Loja. Receita da loja é da LOJA — nunca entra num total junto com
   curso (unidades diferentes). A série de receita é LONGA (2022-2026) e a
   fonte muda no meio: 2022-2024 = planilha de fechamento da gestora,
   2025+ = consolidado (Omie + livrão, cursos premium, aluguel, Sentido de
   Brincar). O gráfico marca a transição (tracejado→sólido) porque a queda
   entre os dois reflete a troca de fonte, não o negócio. As metas vêm todas
   da planilha (2022-2026). Vendas/ticket só existem no consolidado (2025+). */
function HubLoja() {
  const { inicio, fim, modo, ano, mesIdx, rotulo, geral } = usePeriodo();
  const serie = useLojaSerie();
  const kpisAno = useLojaKpisAno();
  const kpisPeriodo = useLojaKpisPeriodo();
  const totalMes = useLojaReceitaTotalMes();
  const consolidada = useLojaReceitaConsolidada();
  const prodVend = useLojaProdutosVendidosMes();
  const estoque = useLojaEstoque();
  const perfCurso = useLojaPerformanceCurso();
  const [cursoModo, setCursoModo] = useState("faturamento");

  const porMes = modo === "mes" && !geral;
  // Recorte curto (Hoje / 7 dias): a fonte mensal (serie/kpisAno/total_mes) só
  // agrega por mês/ano e mostraria o acumulado, não a janela. Nesses modos os
  // cards vêm da vw_loja_kpis_periodo — que cobre SÓ produtos (PDV/Omie), a
  // única fonte com data exata. O rótulo avisa ("produtos · ...").
  const curto = modo === "hoje" || modo === "7d";
  const linhaCurta = useMemo(() => {
    if (!curto) return null;
    const alvo = modo === "hoje" ? "hoje" : "7dias";
    return (kpisPeriodo.data ?? []).find((r) => r.periodo === alvo) ?? null;
  }, [kpisPeriodo.data, curto, modo]);

  // Recorte por ANO-MÊS (dado mensal). Em "Geral", inicio/fim já são a base
  // inteira, então o mesmo filtro cobre todo o histórico.
  const noRecorte = (linhas, campo) => {
    const de = String(inicio).slice(0, 7), ate = String(fim).slice(0, 7);
    return (linhas ?? []).filter((r) => {
      const ym = String(r[campo] ?? "").slice(0, 7);
      return ym && ym >= de && ym <= ate;
    });
  };

  /* RECEITA (2022-2026): por MÊS vem da série longa; por ANO/"Geral", da
     vw_loja_kpis_ano — linha por ano + a de `ano = null` (acumulado). Casa o
     ano; no Geral, a linha nula. */
  const receita = useMemo(() => {
    if (curto) return Number(linhaCurta?.receita ?? 0);
    if (porMes) {
      const alvo = chaveMes(ano, mesIdx);
      const r = (serie.data ?? []).find((x) => String(x.mes).slice(0, 7) === alvo);
      return Number(r?.receita ?? 0);
    }
    const linha = (kpisAno.data ?? []).find((r) => (geral ? r.ano == null : Number(r.ano) === Number(ano)));
    return Number(linha?.receita ?? 0);
  }, [serie.data, kpisAno.data, curto, linhaCurta, porMes, ano, mesIdx, geral]);

  /* VENDAS/TICKET. No recorte curto vêm prontos da vw_loja_kpis_periodo; nos
     demais modos, do consolidado mensal (2025+, vw_loja_receita_total_mes) —
     para 2022-2024 (sem cupom) ficam vazios, honesto. */
  const totRecorte = useMemo(() => noRecorte(totalMes.data, "mes"), [totalMes.data, inicio, fim]);
  const vendas = curto
    ? Number(linhaCurta?.vendas ?? 0)
    : totRecorte.reduce((s, r) => s + Number(r.vendas ?? 0), 0);
  const ticket = curto
    ? (linhaCurta?.ticket_medio != null ? Number(linhaCurta.ticket_medio) : (vendas ? Number(linhaCurta?.receita ?? 0) / vendas : null))
    : (() => {
        const base = totRecorte.reduce((s, r) => s + Number(r.receita ?? 0), 0);
        return vendas ? base / vendas : null;
      })();
  // Rótulo: no curto, avisa que é só produto (PDV/Omie), não a receita cheia.
  const notaKpi = curto ? `produtos · ${String(rotulo).toLowerCase()}`
    : geral ? "todo o histórico" : porMes ? rotulo : `ano ${ano}`;

  // Série do gráfico (2022-2026): valor + meta + `provisorio` (planilha, <2025,
  // sai tracejado) + `parcial` (mês em curso). Meses ausentes (abr/2023) não
  // vêm da view, então o gráfico pula — nunca desenha zero.
  const evol = useMemo(() => {
    const d = new Date();
    const cm = chaveMes(d.getFullYear(), d.getMonth());
    return (serie.data ?? [])
      .filter((r) => r.mes)
      .map((r) => ({
        mes: r.mes,
        valor: Number(r.receita ?? 0),
        meta: r.meta_minima != null ? Number(r.meta_minima) : null,
        provisorio: String(r.mes).slice(0, 7) < "2025-01",
        parcial: !!r.em_curso || String(r.mes).slice(0, 7) === cm,
      }))
      .sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  }, [serie.data]);
  const evolSemFonte = !!serie.error || evol.length < 2;
  const metaLinha = useMemo(() => {
    const arr = evol.map((p) => p.meta);
    return arr.some((v) => v != null) ? arr : null;
  }, [evol]);
  const temTransicao = evol.some((p) => p.provisorio) && evol.some((p) => !p.provisorio);

  /* ---- Meta x realizado ---- */
  // Selo: a linha do mês da série longa (traz meta, nível e em_curso). Em modo
  // mês, o mês escolhido; em ano, o mais recente do ano. Some no "Geral".
  const metaMes = useMemo(() => {
    if (geral) return null;
    const doAno = (serie.data ?? []).filter((r) => Number(r.ano) === Number(ano));
    if (!doAno.length) return null;
    const alvo = chaveMes(ano, mesIdx);
    return porMes
      ? doAno.find((r) => String(r.mes).slice(0, 7) === alvo) ?? null
      : [...doAno].sort((a, b) => String(a.mes).localeCompare(String(b.mes))).at(-1) ?? null;
  }, [serie.data, ano, mesIdx, porMes, geral]);

  /* ---- Quebra por fonte ---- */
  const fontes = useMemo(() => {
    const m = new Map();
    for (const r of noRecorte(consolidada.data, "mes")) {
      const k = r.fonte ?? "—";
      m.set(k, (m.get(k) ?? 0) + Number(r.valor ?? 0));
    }
    const arr = [...m.entries()].map(([fonte, valor]) => ({ fonte, valor })).sort((a, b) => b.valor - a.valor);
    const tot = arr.reduce((s, f) => s + f.valor, 0);
    return arr.filter((f) => f.valor > 0).map((f) => ({ ...f, pct: tot ? (f.valor / tot) * 100 : 0 }));
  }, [consolidada.data, inicio, fim]);

  /* ---- Performance por curso ---- */
  // Agrega por curso no recorte; por_aluno é recalculado (média de médias mente).
  const cursos = useMemo(() => {
    const m = new Map();
    for (const r of noRecorte(perfCurso.data, "mes_ref")) {
      const k = r.curso ?? "—";
      const a = m.get(k) ?? { curso: k, alunos: 0, faturamento: 0, turmas: 0 };
      a.alunos += Number(r.alunos ?? 0);
      a.faturamento += Number(r.faturamento ?? 0);
      a.turmas += Number(r.turmas ?? 0);
      m.set(k, a);
    }
    return [...m.values()]
      .map((c) => ({ ...c, por_aluno: c.alunos ? c.faturamento / c.alunos : 0 }))
      .filter((c) => c.faturamento > 0)
      .sort((a, b) => b[cursoModo] - a[cursoModo])
      .slice(0, 8);
  }, [perfCurso.data, inicio, fim, cursoModo]);

  /* ---- Operacional (Omie) ---- */
  // Mais vendidos: soma os meses do recorte e ranqueia (top 5 por faturamento).
  const maisVendidos = useMemo(
    () => produtosNoPeriodo(prodVend.data, inicio, fim, 5),
    [prodVend.data, inicio, fim]
  );

  // Estoque é POSIÇÃO (snapshot do dia) — ignora o período de propósito.
  // Imobilizado a CUSTO (o capital de fato parado); o preço de venda
  // superestima. `sem_movimento` = zerado e sem mínimo cadastrado: limpeza
  // de cadastro, não reposição — a view já não marca nada como abaixo do
  // mínimo (a comparação 0 < 0 era falso positivo).
  const est = useMemo(() => {
    const linhas = estoque.data ?? [];
    return {
      total: linhas.length,
      custo: linhas.reduce((s, x) => s + Number(x.valor_custo ?? 0), 0),
      venda: linhas.reduce((s, x) => s + Number(x.valor_venda ?? 0), 0),
      semMov: linhas.filter((x) => x.sem_movimento).length,
    };
  }, [estoque.data]);

  return (
    <>
      <style>{`
        /* Uma tela só, sem rolagem vertical (alvo 1080p). Três faixas. */
        .lojaKpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
        @media (min-width: 720px)  { .lojaKpis { grid-template-columns: repeat(4, 1fr); } }
        .lojaMid, .lojaBot { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
        @media (min-width: 1000px) {
          .lojaMid { grid-template-columns: 7fr 5fr; }       /* receita · estoque */
          .lojaBot { grid-template-columns: 3fr 4fr; }       /* mais vendidos · performance curso */
        }
      `}</style>

      {/* ---- Faixa 1: KPIs da loja (receita 2022-2026) ---- */}
      <div className="lojaKpis" style={{ marginBottom: 8 }}>
        <ChipKpi compacto hero Icone={Wallet} label="Receita da loja" valor={moeda(receita)} nota={notaKpi} />
        <ChipKpi compacto Icone={Receipt} label="Vendas" valor={vendas ? numero(vendas) : "—"} nota={vendas || curto ? notaKpi : "só no consolidado (2025+)"} />
        <ChipKpi compacto Icone={ShoppingBag} label="Ticket médio" valor={ticket != null ? moeda(ticket) : "—"} nota={ticket != null || curto ? notaKpi : "só no consolidado (2025+)"} />
        <ChipKpi compacto Icone={Package} label="Valor em estoque" valor={moeda(est.custo)} nota="a custo · posição atual" />
      </div>

      {/* Quebra da receita por fonte + selo de meta (some no "Geral"). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ flex: "1 1 340px", minWidth: 260 }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: C.dim, marginBottom: 6 }}>
            Receita por fonte{curto ? "" : ` · ${notaKpi}`}
          </div>
          {curto
            ? <span style={{ fontSize: 11, color: C.faint }}>A quebra por fonte é mensal (consolidado) — não se aplica a Hoje / 7 dias.</span>
            : consolidada.error
              ? <span style={{ fontSize: 11, color: C.faint }}>Sem a quebra por fonte neste recorte.</span>
              : fontes.length
                ? <FonteBreakdown fontes={fontes} />
                : <span style={{ fontSize: 11, color: C.faint }}>Quebra por fonte só a partir de 2025 (consolidado).</span>}
        </div>
        {!geral && !curto && <MetaBadge meta={metaMes} />}
      </div>

      {/* ---- Faixa 2: receita mensal (consolidada, com meta) · estoque ---- */}
      <div className="lojaMid" style={{ marginBottom: 12 }}>
        <Bloco titulo="Receita mensal da loja" canto="2022–2026 · R$/mês" altura={230}>
          {serie.isLoading
            ? <Estado carregando />
            : evolSemFonte
              ? <Estado vazio />
              : <>
                  <LinhaEvolucao serie={evol} idGrad="fillLoja" mostrarNota={false}
                    rotularParcial={false} rotularVar={false} soDestaques yRedondo
                    meta={metaLinha} metaLabel="meta mínima do mês" />
                  {temTransicao && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", alignItems: "center", fontSize: 10, color: C.faint, marginTop: 4 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 16, height: 0, borderTop: `2px dashed ${C.gold}`, opacity: 0.85, flexShrink: 0 }} /> planilha (2022–2024)
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 16, height: 0, borderTop: `2px solid ${C.gold}`, flexShrink: 0 }} /> consolidado (2025+)
                      </span>
                      <span style={{ color: C.dim }}>A queda em 2025 é a <b style={{ color: C.muted }}>troca de fonte</b>, não o desempenho.</span>
                    </div>
                  )}
                </>}
        </Bloco>
        <Bloco titulo="Estoque" canto="Omie · posição atual">
          <Estado carregando={estoque.isLoading} erro={estoque.error} vazio={!est.total}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <EstoqueNum compacto Icone={Boxes} label="Produtos" valor={numero(est.total)} sub="no catálogo" />
              <EstoqueNum compacto Icone={Package} label="Imobilizado" valor={moeda(est.custo)}
                sub={`a custo (${moeda(est.venda)} a preço de venda)`} />
              <EstoqueNum compacto Icone={PackageX} label="Sem movimento" valor={numero(est.semMov)}
                sub="saldo zero e sem estoque mínimo cadastrado" />
            </div>
          </Estado>
        </Bloco>
      </div>

      {/* ---- Faixa 3: mais vendidos · performance por curso ---- */}
      <div className="lojaBot" style={{ marginBottom: 10 }}>
        <Bloco titulo="Mais vendidos" canto="Omie · top 5" sem altura={252}>
          <Estado
            carregando={prodVend.isLoading}
            erro={prodVend.error}
            vazio={!maisVendidos.length}
            vazioTitulo={tituloVazioFluxo(modo)}
            vazioDica="O Omie entrega venda por mês. Período curto (Hoje, 7 dias) pode não cruzar mês fechado — use Mês ou Ano no topo."
          >
            <ProdutosVendidos linhas={maisVendidos} />
          </Estado>
        </Bloco>
        <Bloco titulo="Performance por curso"
          canto={cursoModo === "faturamento" ? "por faturamento" : "por valor/aluno"}
          sem altura={252}>
          <div style={{ padding: "12px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <Segmentado valor={cursoModo} onChange={setCursoModo}
              opcoes={[{ key: "faturamento", label: "Faturamento" }, { key: "por_aluno", label: "Por aluno" }]} />
          </div>
          <Estado
            carregando={perfCurso.isLoading}
            erro={perfCurso.error}
            vazio={!cursos.length}
            vazioTitulo={tituloVazioFluxo(modo)}
            vazioDica="Sem curso com faturamento neste recorte. Troque o período no topo."
          >
            <PerformanceCurso linhas={cursos} modo={cursoModo} formatarValor={moeda} />
            <div style={{ padding: "10px 20px 4px", fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
              Quanto a loja vende durante cada curso · planilha da gestora.
              <b style={{ color: C.muted }}> Não somar com a receita total</b> — é o mesmo dinheiro, visto por curso.
            </div>
          </Estado>
        </Bloco>
      </div>

      <RodapeIntegracoes fontes={["omie"]} />
    </>
  );
}

function SemFonte({ hub }) {
  return (
    <div style={{
      background: C.card, border: `1px dashed ${C.cardLine}`, borderRadius: 16,
      padding: "56px 24px", textAlign: "center",
    }}>
      <Database size={22} style={{ color: C.faint, margin: "0 auto 14px" }} />
      <div style={{ fontSize: 14, color: C.bright, fontWeight: 700, marginBottom: 6 }}>
        Sem fonte de dados conectada
      </div>
      <div style={{ fontSize: 12.5, color: C.faint, maxWidth: 360, margin: "0 auto", lineHeight: 1.6 }}>
        O hub {hub?.nome} existe na estrutura, mas nenhuma integração alimenta essas tabelas.
        Conecte a fonte e os indicadores aparecem aqui.
      </div>
    </div>
  );
}

/* ============ LOGIN ============ */

/* Fundo em vídeo (5,3s, loop): pontos de luz viram rede, a rede vira
   gráfico, e tudo se desfaz no lugar até voltar ao campo de pontos do
   primeiro frame — por isso o loop não tem emenda. Três regras que ele
   obedece:

   1. NUNCA atrapalha o login. Nasce invisível e só aparece quando o arquivo
      carrega. Sem arquivo, com erro de rede ou com autoplay barrado pelo
      navegador, a tela fica exatamente como era — o gradiente continua sendo
      o fundo de verdade, o vídeo é ganho por cima.
   2. Contraste antes de estética: o véu escuro segura a legibilidade do
      formulário em qualquer frame. Tela de entrada não pode piscar de
      claro-escuro enquanto alguém digita a senha.
   3. `prefers-reduced-motion` corta o vídeo inteiro. Não é capricho de
      configuração — é acessibilidade, e movimento em loop atrás de texto é
      exatamente o caso que a preferência existe para atender.

   O nome "FebraHub" NÃO está no vídeo, de propósito: modelo de vídeo escreve
   texto mal, e o nome da empresa deformado na tela de entrada seria o pior
   lugar possível para esse defeito. No vídeo não há letra nenhuma; o nome é
   o <div> de sempre, desenhado por cima com a fonte do produto. Trocar o
   vídeo não mexe no nome, e vice-versa.

   Cor: ouro sobre preto, os mesmos tokens do resto do produto. O master, os
   prompts de geração e o comando de ffmpeg que fecha o loop estão fora do
   repositório, em FebraHub-assets/login-bg/ — binário não versiona bem. */
const VIDEO_FUNDO = "/login-bg.mp4";

function FundoLogin() {
  const [visivel, setVisivel] = useState(false);
  const [falhou, setFalhou] = useState(false);

  const menosMovimento =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (menosMovimento || falhou) return null;

  return (
    <>
      <video
        src={VIDEO_FUNDO}
        autoPlay muted loop playsInline preload="auto"
        aria-hidden="true"
        onCanPlay={() => setVisivel(true)}
        onError={() => setFalhou(true)}
        style={{
          position: "fixed", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", zIndex: 0, pointerEvents: "none",
          opacity: visivel ? 1 : 0, transition: "opacity 1.2s ease",
        }}
      />
      {/* Véu: mais dela no centro, onde fica o formulário, e menos nas
          bordas, onde o vídeo pode aparecer. */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none",
        background:
          `radial-gradient(760px 520px at 50% 50%, ${C.void}E6, ${C.void}A6 55%, ${C.void}66 100%)`,
      }} />
    </>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [indo, setIndo] = useState(false);

  const submeter = async () => {
    setErro(null); setIndo(true);
    try { await entrar(email.trim(), senha); }
    catch (e) { setErro(e.message); }
    finally { setIndo(false); }
  };

  const campo = {
    width: "100%", padding: "11px 13px 11px 38px", fontSize: 13.5,
    borderRadius: 10, border: `1px solid ${C.cardLine}`,
    background: "rgba(255,255,255,.04)", color: C.text,
    outline: "none", fontFamily: SANS, fontWeight: 500,
  };

  return (
    <div style={{
      position: "relative", overflow: "hidden",
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      background: `radial-gradient(1200px 600px at 78% -10%, ${C.gold}12, transparent 60%), ${C.void}`,
      fontFamily: SANS, color: C.text,
    }}>
      <FundoLogin />
      {/* zIndex 2: acima do vídeo (0) e do véu (1). */}
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 380, animation: "subir .5s ease" }}>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 30 }}>
          <img
            src="/logo-febracis.webp"
            alt="Febracis"
            width={62}
            height={62}
            style={{ marginBottom: 16, filter: `drop-shadow(0 6px 22px ${C.gold}30)` }}
          />
          <div style={{ fontFamily: GROTESK, fontSize: 27, fontWeight: 700, letterSpacing: "-.4px" }}>
            FebraHub
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", marginTop: 5 }}>
            Central de Inteligência
          </div>
        </div>

        <div style={{
          background: "rgba(14,14,16,.72)", border: `1px solid ${C.cardLine}`,
          borderRadius: 18, padding: 26, backdropFilter: "blur(8px)",
        }}>
          <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 8 }}>
            E-mail corporativo
          </label>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Mail size={15} style={{ position: "absolute", left: 13, top: 13, color: C.faint }} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submeter()}
              placeholder="voce@febracis.com.br" style={campo} />
          </div>

          <label style={{ display: "block", fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 8 }}>
            Senha
          </label>
          <div style={{ position: "relative", marginBottom: 20 }}>
            <Lock size={15} style={{ position: "absolute", left: 13, top: 13, color: C.faint }} />
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submeter()}
              placeholder="••••••••" style={campo} />
          </div>

          {erro && (
            <div style={{ fontSize: 12.5, color: C.down, marginBottom: 16, display: "flex", gap: 7, fontWeight: 600 }}>
              <ShieldAlert size={14} style={{ marginTop: 1, flexShrink: 0 }} /> {erro}
            </div>
          )}

          <button onClick={submeter} disabled={indo || !email || !senha}
            style={{
              width: "100%", padding: "12px", fontSize: 13.5, fontWeight: 800, borderRadius: 10,
              background: `linear-gradient(150deg, ${C.goldTop}, ${C.goldBase})`, color: "#100c04",
              border: "none", cursor: indo ? "default" : "pointer",
              opacity: indo || !email || !senha ? 0.45 : 1, fontFamily: SANS,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            {indo ? <Loader2 size={15} className="girar" /> : <>Entrar <ArrowRight size={15} /></>}
          </button>
        </div>

        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 18, textAlign: "center" }}>
          Cada setor acessa apenas os próprios indicadores.
        </div>
      </div>
    </div>
  );
}

/* ============ SHELL ============ */

/* ============ CENTRAL PEDAGÓGICA ============
   O Hub Pedagógico é painel: gráfico, KPI, tendência — quem abre está
   avaliando. Aqui é onde se trabalha: lista, status, botão — quem abre está
   executando. Nada de gráfico nesta tela.

   Toda escrita passa por função do banco (disparar_turma, marcar_resposta).
   Nenhum insert ou update direto, nenhuma regra de negócio no front: a
   `situacao` de cada inscrito já vem pronta da view. */

const ABAS_CENTRAL = [
  { key: "turmas",     label: "Turmas" },
  { key: "represados", label: "Represados" },
  { key: "presenca",   label: "Presença" },
  { key: "avaliacoes", label: "Avaliações" },
  { key: "maestros",   label: "Maestros" },
];

/* A situação vem pronta da view (migration 113); aqui só o tom e o rótulo.
   Cada situação tem um tom próprio: duas situações com a mesma cor obrigam a
   ler o texto de cada linha, que é o oposto de uma lista escaneável.
   `ordem` é a prioridade de trabalho — quem precisa de ação sobe. */
const SITUACOES = {
  "erro no envio":       { rotulo: "erro no envio",    cor: C.down,  fundo: "1F", ordem: 0 },
  "nao enfileirado":     { rotulo: "não enfileirado",  cor: C.faint, fundo: null, ordem: 1 },
  "sem resposta":        { rotulo: "sem resposta",     cor: C.warn,  fundo: "1A", ordem: 2 },
  "aguardando envio":    { rotulo: "aguardando envio", cor: C.dim,   fundo: "12", ordem: 3 },
  "aguardando resposta": { rotulo: "aguardando",       cor: C.muted, fundo: "14", ordem: 4 },
  "confirmado":          { rotulo: "confirmado",       cor: C.up,    fundo: "1A", ordem: 5 },
  "nao vem":             { rotulo: "não vem",          cor: C.down,  fundo: "10", ordem: 6 },
};
const daSituacao = (s) =>
  SITUACOES[String(s ?? "").trim().toLowerCase()] ?? { rotulo: s || "—", cor: C.muted, fundo: "14", ordem: 9 };

/* CPF por extenso. Cinco de seis inscritos não estão em dim_alunos e chegam
   aqui como CPF no lugar do nome — onze dígitos corridos fazem a tela parecer
   quebrada, e a Elis precisa conseguir ler para achar a pessoa. Diferente de
   o CPF por extenso porque a Elis precisa identificar a pessoa. */
const formataCpf = (v) => {
  const d = String(v ?? "").replace(/\D/g, "");
  if (d.length !== 11) return String(v ?? "").trim() || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};
// A view faz coalesce(nome, aluno_id): sem cadastro, o "nome" é o próprio CPF.
const semCadastro = (r) => !r.nome || String(r.nome).replace(/\D/g, "") === String(r.aluno_id ?? "").replace(/\D/g, "");

/* Link do WhatsApp. Só formatação — o número vem do banco. Sem DDI, assume
   Brasil; com 55 na frente, respeita o que veio. Fora desses tamanhos não
   inventa link: telefone torto vira texto simples. */
const linkWhatsapp = (tel) => {
  const d = String(tel ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `https://wa.me/55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `https://wa.me/${d}`;
  return null;
};
const formataTelefone = (tel) => {
  const d = String(tel ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(tel ?? "").trim();
};

/* Contador com denominador. Número solto ("12 confirmados") não diz se é
   muito ou pouco — 12 de 14 e 12 de 400 pedem decisões opostas. */
function ContaTurma({ rotulo, valor, total, cor }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, fontSize: 11, color: C.faint }}>
      <b style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: valor > 0 ? cor : C.dim }}>{numero(valor)}</b>
      <span>de {numero(total)} {rotulo}</span>
    </span>
  );
}

function CentralPedagogica() {
  const [aba, setAba] = useState("turmas");
  const [toast, setToast] = useState(null);
  const notificar = (msg, tipo = "ok") => setToast({ msg, tipo });

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: C.bright }}>Central Pedagógica</h2>
        <span style={{ fontSize: 11.5, color: C.faint }}>o dia a dia · o painel com os gráficos fica no Hub Pedagógico</span>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Segmentado opcoes={ABAS_CENTRAL} valor={aba} onChange={setAba} />
      </div>

      {aba === "turmas" && <CentralTurmas notificar={notificar} />}
      {aba === "represados" && <CentralRepresados notificar={notificar} />}
      {aba === "presenca" && <CentralPresenca />}
      {aba === "avaliacoes" && <SecaoAvaliacaoEventos notificar={notificar} />}
      {aba === "maestros" && <CentralMaestros notificar={notificar} />}
      {!["turmas", "represados", "presenca", "avaliacoes", "maestros"].includes(aba) && (
        <div style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 14, padding: "26px 22px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.bright, marginBottom: 5 }}>
            {ABAS_CENTRAL.find((a) => a.key === aba)?.label} chega na próxima etapa
          </div>
          <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.55, maxWidth: 520 }}>
            Esta parte da Central ainda não foi construída. Nada aqui está quebrado — só não existe ainda.
            Enquanto isso, use a aba Turmas.
          </div>
        </div>
      )}

      <Toast toast={toast} onFechar={() => setToast(null)} />
    </>
  );
}

/* ---- Turmas: a lista ----
   Substitui a planilha onde a Elis anotava à mão quem confirmou. */
function CentralTurmas({ notificar }) {
  const turmas = useTurmasCentral();
  const painel = usePedagogicoPainel();
  const [sel, setSel] = useState(null);
  const [quando, setQuando] = useState("futuras");
  const [verVazias, setVerVazias] = useState(false);

  /* Os contadores vêm na própria linha da turma: a vw_turmas_central agrega
     vw_turma_inscritos num LATERAL. Antes a lista pedia também a
     vw_turma_inscritos_resumo — ida ao servidor para buscar o que já vinha
     junto. O drawer segue usando a _resumo, que é por (turma, tipo) e sabe
     separar confirmação de link do grupo. */

  /* Padrão: só o que ainda vai acontecer — é onde há o que fazer. As
     passadas ficam atrás do alternador, para consulta de histórico.
     `futura` vem da view (migration 115), não de comparar data aqui: o
     relógio da máquina de quem abriu não decide o que é futuro.

     Turma sem ninguém inscrito desce para um grupo recolhido no fim. Ela
     existe no cadastro, mas ocupar a mesma altura de uma turma com 421
     pessoas empurra o trabalho real para fora da tela. */
  const { comInscritos, vazias, passadas } = useMemo(() => {
    const rows = turmas.data ?? [];
    const alvo = quando === "futuras" ? rows.filter((t) => t.futura) : rows;
    const ordenar = (ls) => [...ls].sort((a, b) =>
      a.futura !== b.futura ? (a.futura ? -1 : 1)
        : a.futura ? String(a.data_inicio).localeCompare(String(b.data_inicio))
          : String(b.data_inicio).localeCompare(String(a.data_inicio)));
    const temGente = (t) => Number(t.matriculados ?? 0) > 0;
    return {
      comInscritos: ordenar(alvo.filter(temGente)),
      vazias: ordenar(alvo.filter((t) => !temGente(t))),
      passadas: rows.length - rows.filter((t) => t.futura).length,
    };
  }, [turmas.data, quando]);
  const lista = comInscritos;

  /* A faixa de pendências veio do Hub. Lá ela era um aviso sem destino: o
     clique abria um drawer que aquela tela não tem mais. É lista de trabalho —
     "estas turmas têm campo faltando" — e lista de trabalho mora aqui, onde o
     clique abre a turma certa. `foco: "link"` leva direto ao campo do link. */
  const pendencias = useMemo(
    () => (painel.data ?? []).filter((t) => t.pendencia != null),
    [painel.data]
  );

  return (
    <>
      <FaixaPendencias pendencias={pendencias} onAbrir={(t, foco = null) => setSel({ ...t, foco })} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: C.faint }}>
          Clique numa turma para abrir o cadastro, disparar as mensagens e ver quem respondeu.
        </span>
        <Segmentado label="Turmas"
          opcoes={[{ key: "futuras", label: "Só as futuras" }, { key: "todas", label: `Com as passadas (${numero(passadas)})` }]}
          valor={quando} onChange={setQuando} />
      </div>

      <Estado
        carregando={turmas.isLoading}
        erro={turmas.error}
        vazio={!lista.length && !vazias.length}
        vazioTitulo={quando === "futuras" ? "Nenhuma turma marcada daqui pra frente" : "Nenhuma turma no cadastro"}
        vazioDica={quando === "futuras" ? "Assim que uma turma da grade entrar no cadastro com data de início, ela aparece aqui. Troque o filtro para ver as que já aconteceram." : undefined}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lista.map((t) => (
            <LinhaTurmaCentral key={t.turma_id} turma={t} onAbrir={() => setSel(t)} />
          ))}
        </div>

        {vazias.length > 0 && (
          <div style={{ marginTop: lista.length ? 12 : 0 }}>
            <button onClick={() => setVerVazias(!verVazias)} style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%",
              background: "none", border: "none", padding: "6px 2px", cursor: "pointer",
              fontFamily: SANS, fontSize: 11.5, fontWeight: 700, color: C.faint, textAlign: "left",
            }}>
              {verVazias ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {numero(vazias.length)} {vazias.length === 1 ? "turma sem inscritos" : "turmas sem inscritos"}
              <span style={{ fontWeight: 600, color: C.dim }}>· nada a disparar por enquanto</span>
            </button>
            {verVazias && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {vazias.map((t) => (
                  <LinhaTurmaCentral key={t.turma_id} turma={t} onAbrir={() => setSel(t)} />
                ))}
              </div>
            )}
          </div>
        )}
      </Estado>

      {sel && (
        <DrawerTurmaCentral
          turma={sel}
          onFechar={() => setSel(null)}
          notificar={notificar}
        />
      )}
    </>
  );
}

function LinhaTurmaCentral({ turma, onAbrir }) {
  // Os contadores já vêm na linha da turma (vw_turmas_central agrega
  // vw_turma_inscritos num LATERAL) — sem segunda consulta.
  const conf = turma;
  const total = Number(turma.matriculados ?? 0);
  const dias = turma.futura
    ? Math.round((new Date(turma.data_inicio) - new Date(isoDia(new Date()))) / 86400000)
    : null;

  return (
    <button onClick={onAbrir} style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
      background: C.card, border: `1px solid ${turma.futura ? C.cardLine : C.hair}`,
      borderRadius: 12, padding: total ? "12px 14px" : "9px 14px", fontFamily: SANS,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {turma.nome_comercial || turma.curso || turma.turma_id}
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
            {turma.turma_id} · {dataBR(turma.data_inicio)}
            {dias != null && <> · {dias === 0 ? "começa hoje" : dias === 1 ? "em 1 dia" : `em ${numero(dias)} dias`}</>}
            {turma.cidade ? ` · ${turma.cidade}` : ""}
          </div>
        </div>
        <ArrowUpRight size={15} style={{ color: C.faint, flexShrink: 0 }} />
      </div>

      {!total ? (
        // Sem ninguém inscrito não há contador a mostrar — e a linha fica
        // baixa de propósito: ela só precisa saber que a turma existe.
        <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6 }}>Nenhuma matrícula aprovada até agora.</div>
      ) : (
        <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
          <ContaTurma rotulo="confirmaram" valor={Number(conf.confirmados ?? 0)} total={total} cor={C.up} />
          <ContaTurma rotulo="não vêm" valor={Number(conf.nao_vem ?? 0)} total={total} cor={C.down} />
          <ContaTurma rotulo="sem resposta" valor={Number(conf.sem_resposta ?? 0)} total={total} cor={C.warn} />
          <ContaTurma rotulo="aguardando" valor={Number(conf.aguardando_resposta ?? 0)} total={total} cor={C.gold} />
          {Number(conf.nao_enfileirados ?? 0) > 0 && (
            <ContaTurma rotulo="ainda não receberam" valor={Number(conf.nao_enfileirados ?? 0)} total={total} cor={C.dim} />
          )}
        </div>
      )}
    </button>
  );
}

/* ---- Turmas: o detalhe ----
   Cadastro (reaproveita o FormTurma da automação), os dois disparos e a lista
   de inscritos com a situação de cada um. */
function DrawerTurmaCentral({ turma, onFechar, notificar }) {
  const qc = useQueryClient();
  const dim = useTurmaDim(turma.turma_id);
  /* Aqui a _resumo faz falta: ela é por (turma, TIPO), e o drawer separa
     confirmação de link do grupo. A linha da lista só mostra confirmação,
     e para isso os contadores da própria turma bastam. */
  const resumoTurma = useTurmaInscritosResumo();
  const resumo = useMemo(() => {
    const m = {};
    for (const r of resumoTurma.data ?? []) if (r.turma_id === turma.turma_id) m[r.tipo] = r;
    return m;
  }, [resumoTurma.data, turma.turma_id]);
  const sug = useTurmaSugestao(dim.data?.sigla, dim.data?.data_inicio, turma.turma_id);
  const inscritos = useTurmaInscritos(turma.turma_id);
  const [tipo, setTipo] = useState("confirmacao");
  const [disparando, setDisparando] = useState(null);
  const [retorno, setRetorno] = useState(null); // o que a função devolveu
  const [filtro, setFiltro] = useState("todos"); // contador clicado no topo
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(null);    // linha com as opções abertas

  const resumoTipo = resumo?.[tipo];

  /* Ordem padrão é a de TRABALHO: quem precisa de ação sobe. Erro no envio
     primeiro (alguém tem que consertar), depois quem nunca foi enfileirado,
     sem resposta, aguardando — e por último quem já está resolvido. Dentro da
     mesma situação, por nome, pra a lista não dançar entre recargas.
     O cabeçalho troca para ordem por nome. */
  const [ordem, setOrdem] = useState({ campo: "situacao", dir: 1 });
  const ordenarPor = (campo) =>
    setOrdem((o) => ({ campo, dir: o.campo === campo ? -o.dir : 1 }));

  const doTipo = useMemo(() => {
    const rows = (inscritos.data ?? []).filter((r) => r.tipo === tipo);
    const porNome = (a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR");
    return [...rows].sort((a, b) => ordem.campo === "nome"
      ? ordem.dir * porNome(a, b)
      : ordem.dir * (daSituacao(a.situacao).ordem - daSituacao(b.situacao).ordem) || porNome(a, b));
  }, [inscritos.data, tipo, ordem]);

  /* Filtro do contador + busca. A busca casa nome, CPF (com ou sem
     pontuação — ela digita dos dois jeitos) e telefone. */
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qNum = q.replace(/\D/g, "");
    return doTipo.filter((r) => {
      if (filtro === "sem_contato" ? !r.sem_contato : filtro !== "todos" && r.situacao !== filtro) return false;
      if (!q) return true;
      const doc = String(r.aluno_id ?? "").replace(/\D/g, "");
      const tel = String(r.telefone ?? "").replace(/\D/g, "");
      return String(r.nome ?? "").toLowerCase().includes(q)
        || (qNum.length >= 3 && (doc.includes(qNum) || tel.includes(qNum)));
    });
  }, [doTipo, filtro, busca]);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["turma_inscritos", turma.turma_id] });
    qc.invalidateQueries({ queryKey: ["vw_turma_inscritos_resumo"] });
    qc.invalidateQueries({ queryKey: ["turma_dim", turma.turma_id] });
  };

  /* A função valida o cadastro e devolve ok:false com o que falta. A tela
     mostra `mensagem` como veio — reescrever aqui é como mensagem truncada
     chega no cliente. */
  const disparar = async (qual) => {
    setDisparando(qual); setRetorno(null);
    try {
      const r = await dispararTurma(turma.turma_id, qual);
      setRetorno({ ...r, tipo: qual });
      notificar(r?.mensagem ?? "Pronto.", r?.ok === false ? "erro" : "ok");
      if (r?.ok !== false) recarregar();
    } catch (e) {
      const msg = semPermissao(e) ? "Você não tem permissão para disparar mensagens." : (e.message || "Não foi possível enfileirar.");
      setRetorno({ ok: false, mensagem: msg, tipo: qual });
      notificar(msg, "erro");
    } finally {
      setDisparando(null);
    }
  };

  const marcar = async (alunoId, resposta) => {
    try {
      await marcarResposta(alunoId, turma.turma_id, tipo, resposta);
      notificar("Resposta registrada.", "ok");
      recarregar();
    } catch (e) {
      const msg = semPermissao(e) ? "Você não tem permissão para registrar respostas."
        : /não encontrado/i.test(String(e.message)) ? "Esta pessoa ainda não entrou em nenhuma rodada de envio. Dispare a mensagem antes de registrar a resposta."
          : (e.message || "Não foi possível registrar.");
      notificar(msg, "erro");
    }
  };

  return (
    <DrawerLado
      titulo={turma.nome_comercial || turma.curso || turma.turma_id}
      sub={`${turma.turma_id} · início ${dataBR(turma.data_inicio)}`}
      onFechar={onFechar}
      largura={820}
    >
      {/* ---- Disparo ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim }}>Mensagens</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <BotaoSalvar onClick={() => disparar("confirmacao")} salvando={disparando === "confirmacao"} disabled={!!disparando}>
            Enviar confirmação
          </BotaoSalvar>
          <BotaoSalvar onClick={() => disparar("grupo")} salvando={disparando === "grupo"} disabled={!!disparando}>
            Enviar link do grupo
          </BotaoSalvar>
        </div>
        <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
          O botão coloca as pessoas na fila. Quem envia é o script, na rodada seguinte — em até 5 horas.
        </div>
        {retorno && (
          <div style={{
            fontSize: 11.5, lineHeight: 1.5, borderRadius: 10, padding: "9px 11px",
            color: retorno.ok === false ? C.warn : C.up,
            background: `${retorno.ok === false ? C.warn : C.up}12`,
            border: `1px solid ${retorno.ok === false ? C.warn : C.up}3A`,
          }}>
            {retorno.mensagem}
            {retorno.ok !== false && Number(retorno.sem_contato ?? 0) > 0 && (
              <div style={{ color: C.faint, marginTop: 3 }}>
                {numero(retorno.sem_contato)} sem telefone nem e-mail — essas não têm como receber.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Cadastro (é o que a validação do disparo exige) ---- */}
      {dim.isLoading ? (
        <div style={{ fontSize: 12, color: C.faint, marginTop: 16 }}>Carregando o cadastro…</div>
      ) : dim.error ? (
        <div style={{ fontSize: 12, color: C.down, marginTop: 16 }}>
          {semPermissao(dim.error) ? "Você não tem permissão para ver o cadastro desta turma." : "Não foi possível carregar o cadastro."}
        </div>
      ) : dim.data ? (
        <FormTurma
          dim={dim.data}
          sug={sug.data}
          aguardando={Number(resumo?.grupo?.nao_enfileirados ?? 0)}
          foco={turma.foco ?? null}
          onSalvo={recarregar}
          notificar={notificar}
        />
      ) : null}

      {/* ---- Inscritos ---- */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim }}>Inscritos</span>
          {/* Confirmação e grupo são estados independentes: dá pra ter
              confirmado e ainda não ter recebido o link. Cada aba tem os
              próprios contadores. */}
          <Segmentado
            opcoes={[{ key: "confirmacao", label: "Confirmação" }, { key: "grupo", label: "Link do grupo" }]}
            valor={tipo} onChange={(v) => { setTipo(v); setFiltro("todos"); }}
          />
        </div>

        <Estado
          carregando={inscritos.isLoading}
          erro={inscritos.error}
          vazio={!doTipo.length}
          vazioTitulo="Nenhuma matrícula aprovada nesta turma"
          vazioDica="A lista sai das matrículas aprovadas. Compradores de vaga ficam de fora — eles não são alunos."
        >
          <FaixaContadores resumo={resumoTipo} total={doTipo.length} filtro={filtro} onFiltrar={setFiltro} />

          <div style={{ position: "relative", margin: "10px 0 8px" }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF ou telefone"
              style={{ ...inputAv, paddingLeft: 30 }}
            />
          </div>

          {!visiveis.length ? (
            <div style={{ fontSize: 12, color: C.faint, padding: "14px 2px", lineHeight: 1.5 }}>
              Ninguém nesse recorte.{" "}
              <button onClick={() => { setFiltro("todos"); setBusca(""); }} style={{
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: C.gold, fontFamily: SANS, fontSize: 12, fontWeight: 700, textDecoration: "underline",
              }}>Ver todos os {numero(doTipo.length)}</button>
            </div>
          ) : (
            <TabelaInscritos
              linhas={visiveis}
              ordem={ordem}
              onOrdenar={ordenarPor}
              aberta={aberta}
              onAbrir={(id) => setAberta(aberta === id ? null : id)}
              onMarcar={marcar}
            />
          )}
        </Estado>
      </div>
    </DrawerLado>
  );
}

/* ---- Maestros ----
   Veio do Hub Pedagógico sem mudança de lógica: mesmas views, mesmos
   cálculos, mesmo filtro de validade, mesmo modal de edição. Mudou só o
   endereço — tem botão de ação (editar anotação), então é operação, e
   operação vive aqui. */
function CentralMaestros({ notificar }) {
  const maestros = usePedagogicoMaestrosCompleto();
  const maestrosKpis = usePedagogicoMaestrosKpis();
  const anotacoes = usePedagogicoMaestroAnotacoes();
  const qc = useQueryClient();
  const [statusMaestro, setStatusMaestro] = useState("todos");
  const [maestroEdit, setMaestroEdit] = useState(null);

  const aposSalvar = () => {
    qc.invalidateQueries();
    setMaestroEdit(null);
    notificar?.("Anotação salva.", "ok");
  };

  // cargo não vem na view _completo — pré-preenche do maestro_anotacao cru.
  const cargoPorCpf = useMemo(() => {
    const m = new Map();
    for (const a of anotacoes.data ?? []) if (a.aluno_id != null) m.set(String(a.aluno_id), a.cargo ?? "");
    return m;
  }, [anotacoes.data]);

  // Lista por investido (desc), com filtro por status de validade.
  // Ativos/inativos/média saem da agregação do detalhe (a view de kpis não os
  // traz); os contadores de VALIDADE vêm da vw_pedagogico_maestros_kpis,
  // mesma fonte do selo por linha.
  const listaMaestros = useMemo(() => {
    const arr = [...(maestros.data ?? [])].sort((a, b) => Number(b.total_investido ?? 0) - Number(a.total_investido ?? 0));
    if (statusMaestro === "todos") return arr;
    return arr.filter((m) => String(m.status_maestria ?? "").trim().toLowerCase() === statusMaestro);
  }, [maestros.data, statusMaestro]);
  const maestrosKpi = useMemo(() => {
    const arr = maestros.data ?? [];
    const ativos = arr.filter((m) => m.ativo).length;
    const invest = arr.reduce((s, m) => s + Number(m.total_investido ?? 0), 0);
    const fatGrupo = arr.reduce((s, m) => s + Number(m.faturamento ?? 0), 0);
    return { total: arr.length, ativos, inativos: arr.length - ativos, media: arr.length ? invest / arr.length : 0, fatGrupo };
  }, [maestros.data]);
  const mk = maestrosKpis.data?.[0] ?? {};
  const temMaestros = (maestros.data?.length ?? 0) > 0;

  return (
    <>
      <style>{`
        .cenMaestrosKpi { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
        @media (min-width: 520px) { .cenMaestrosKpi { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 980px) { .cenMaestrosKpi { grid-template-columns: repeat(8, 1fr); } }
      `}</style>

      <div className="cenMaestrosKpi" style={{ marginBottom: 12 }}>
        <ChipKpi compacto hero Icone={Crown} label="Maestros" valor={temMaestros ? numero(maestrosKpi.total) : "—"} nota="clientes VIP" />
        <ChipKpi compacto Icone={UserCheck} label="Ativos" valor={temMaestros ? numero(maestrosKpi.ativos) : "—"} nota="compra < 12 meses" />
        <ChipKpi compacto Icone={AlertTriangle} label="Inativos" valor={temMaestros ? numero(maestrosKpi.inativos) : "—"} nota="+ de 12 meses parado" />
        <ChipKpi compacto Icone={Wallet} label="Média investida" valor={temMaestros ? moeda(maestrosKpi.media) : "—"} nota="por maestro" />
        <ChipKpi compacto Icone={TrendingUp} label="Faturamento do grupo" valor={maestrosKpi.fatGrupo ? moeda(maestrosKpi.fatGrupo) : "—"} nota="anotado · empresas" />
        {/* Validade da Maestria (12 meses desde a compra) — números coloridos. */}
        <TileValidade Icone={ShieldCheck} label="Válidos" valor={temMaestros ? numero(mk.validos) : "—"} cor={C.up} nota="vigente" />
        <TileValidade Icone={Clock} label="Perto de vencer" valor={temMaestros ? numero(mk.perto_vencer) : "—"} cor={C.warn} nota="agir" />
        <TileValidade Icone={ShieldAlert} label="Vencidos" valor={temMaestros ? numero(mk.vencidos) : "—"} cor={C.down} nota="renovar" />
      </div>

      {/* Filtro por status de validade — ajuda a gestora a agir nos que vão vencer. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <Segmentado label="Validade" valor={statusMaestro} onChange={setStatusMaestro}
          opcoes={[{ key: "todos", label: "Todos" }, { key: "perto de vencer", label: "Perto de vencer" }, { key: "vencido", label: "Vencidos" }, { key: "válido", label: "Válidos" }]} />
        <span style={{ fontSize: 10.5, color: C.faint }}>{numero(listaMaestros.length)} {listaMaestros.length === 1 ? "maestro" : "maestros"}</span>
      </div>

      <div className="rolagem" style={{ maxHeight: 460, overflowY: "auto", border: `1px solid ${C.hair}`, borderRadius: 10 }}>
        <Estado carregando={maestros.isLoading} erro={maestros.error} vazio={!listaMaestros.length}
          vazioTitulo={temMaestros ? "Nenhum maestro nesse status" : "Sem maestros no acesso"}
          vazioDica={temMaestros ? "Troque o filtro de validade acima." : "Painel restrito ao setor pedagógico — aparece com o setor conectado."}>
          {listaMaestros.map((m, i) => <LinhaMaestro key={i} m={m} onEditar={setMaestroEdit} />)}
        </Estado>
      </div>

      <div style={{ padding: "8px 2px", fontSize: 10, color: C.dim }}>
        Contém dados pessoais (nome, e-mail, telefone) — exceção justificada, restrita ao setor pedagógico.
      </div>

      {maestroEdit && (
        <ModalCentro titulo="Editar maestro" onFechar={() => setMaestroEdit(null)}>
          <FormMaestro maestro={maestroEdit} cargoInicial={cargoPorCpf.get(String(maestroEdit.cpf)) ?? ""} onSalvo={aposSalvar} />
        </ModalCentro>
      )}
    </>
  );
}

/* ---- Presença ----
   Regra da tela inteira: ausência nunca aparece sozinha. 51% de ausência numa
   turma com 49% de cobertura pode ser evasão real ou pode ser metade da turma
   que ninguém bipou — e as duas leituras pedem ações opostas. */
function CentralPresenca() {
  const saude = usePresencaSaude();
  const mensuraveis = useTurmasMensuraveis();
  const cobertura = usePresencaCobertura();
  const [visao, setVisao] = useState("mensuraveis");
  const [busca, setBusca] = useState("");

  const todas = cobertura.data ?? [];
  const semRegistro = useMemo(() => todas.filter((r) => !Number(r.compareceram ?? 0)), [todas]);
  const comRegistro = useMemo(() => todas.filter((r) => Number(r.compareceram ?? 0) > 0), [todas]);

  const fonte = visao === "mensuraveis" ? (mensuraveis.data ?? [])
    : visao === "registro" ? comRegistro : semRegistro;

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = visao === "mensuraveis"
      ? [...fonte].sort((a, b) => String(b.data_inicio ?? "").localeCompare(String(a.data_inicio ?? "")))
      : [...fonte].sort((a, b) => Number(a.cobertura_pct ?? 0) - Number(b.cobertura_pct ?? 0));
    if (!q) return base;
    return base.filter((r) => `${r.turma ?? ""} ${r.curso ?? ""}`.toLowerCase().includes(q));
  }, [fonte, busca, visao]);

  return (
    <>
      <SaudeDaCarga estado={saude} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", margin: "12px 0 8px" }}>
        <Segmentado label="Turmas"
          opcoes={[
            { key: "mensuraveis", label: `Mensuráveis (${numero((mensuraveis.data ?? []).length)})` },
            { key: "registro", label: `Com registro (${numero(comRegistro.length)})` },
            { key: "sem", label: `Sem registro (${numero(semRegistro.length)})` },
          ]}
          valor={visao} onChange={setVisao} />
        <div style={{ position: "relative", minWidth: 240, flex: "0 1 300px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar turma ou curso" style={{ ...inputAv, paddingLeft: 30 }} />
        </div>
      </div>

      {/* Cada visão responde a uma pergunta diferente. Dizer qual evita ler
          "58% de ausência" como evasão quando é buraco de registro. */}
      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5, marginBottom: 8 }}>
        {visao === "mensuraveis"
          ? "Turmas onde a ausência significa alguma coisa: já aconteceram, têm registro de verdade (cobertura de 40% pra cima) e pelo menos 10 matriculados. É aqui que faz sentido ligar para quem faltou."
          : visao === "registro"
            ? "Todas as turmas com algum registro de presença, das piores coberturas para as melhores. Cobertura baixa aqui é problema de registro, não de aluno — a ausência não é confiável."
            : "Turmas sem nenhum registro de presença. Não dá para dizer quem faltou: ninguém foi bipado. Aparecem para que o buraco não passe por 100% de ausência."}
      </div>

      <Estado
        carregando={visao === "mensuraveis" ? mensuraveis.isLoading : cobertura.isLoading}
        erro={visao === "mensuraveis" ? mensuraveis.error : cobertura.error}
        vazio={!linhas.length}
        vazioTitulo="Nenhuma turma neste recorte"
      >
        <TabelaPresenca linhas={linhas} comCurso={visao === "mensuraveis"} />
      </Estado>
    </>
  );
}

/* A carga é manual e a fonte anterior morreu ao longo de um ano sem ninguém
   perceber. Este bloco fica sempre visível, e vira vermelho passando de 30
   dias — detectar não resolve, mas pelo menos ninguém decide com dado velho
   achando que é de hoje. */
function SaudeDaCarga({ estado }) {
  const s = estado.data?.[0];
  if (estado.isLoading) return <div style={{ fontSize: 12, color: C.faint }}>Carregando a saúde da carga…</div>;
  if (estado.error || !s) {
    return (
      <div style={{ display: "flex", gap: 9, alignItems: "center", background: `${C.warn}12`, border: `1px solid ${C.warn}3A`, borderRadius: 12, padding: "11px 14px" }}>
        <AlertTriangle size={15} style={{ color: C.warn, flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: C.muted }}>Não foi possível ler quando a presença foi carregada. Os números abaixo podem estar velhos — confira a carga antes de decidir.</span>
      </div>
    );
  }
  const dias = Number(s.dias_desde_a_carga ?? 0);
  const velha = dias > 30;
  const cor = velha ? C.down : C.up;
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: `${cor}10`, border: `1px solid ${cor}3A`, borderRadius: 12, padding: "11px 14px" }}>
      {velha ? <AlertTriangle size={15} style={{ color: cor, flexShrink: 0, marginTop: 1 }} />
        : <ShieldCheck size={15} style={{ color: cor, flexShrink: 0, marginTop: 1 }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: velha ? cor : C.bright }}>
          {velha
            ? `A presença não é carregada há ${numero(dias)} dias`
            : `Presença carregada ${dias === 0 ? "hoje" : dias === 1 ? "ontem" : `há ${numero(dias)} dias`}`}
        </div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
          {dataBR(s.ultima_carga)} · {numero(s.linhas)} registros em {numero(s.turmas)} turmas · presença mais recente em {dataBR(s.registro_mais_recente)}
        </div>
        {velha && (
          <div style={{ fontSize: 11, color: cor, marginTop: 3 }}>
            A carga é manual. Enquanto ela não roda, turma nova aparece como se ninguém tivesse ido.
          </div>
        )}
      </div>
    </div>
  );
}

function TabelaPresenca({ linhas, comCurso }) {
  const cab = (rotulo, extra = {}) => (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim, ...extra }}>{rotulo}</span>
  );
  return (
    <>
      <style>{`
        .tpGrade { display: grid; grid-template-columns: minmax(0,1.6fr) 92px 84px 86px 116px 128px; align-items: center; gap: 10px; }
        @media (max-width: 1000px) { .tpGrade { grid-template-columns: minmax(0,1.6fr) 84px 86px 116px 128px; } .tpData { display: none; } }
        .tpLinha:hover { background: rgba(255,255,255,.02); }
      `}</style>
      <div className="rolagem" style={{ maxHeight: 460, overflowY: "auto", border: `1px solid ${C.hair}`, borderRadius: 10 }}>
        <div className="tpGrade" style={{ position: "sticky", top: 0, zIndex: 2, background: "#17171c", padding: "8px 12px", borderBottom: `1px solid ${C.cardLine}` }}>
          {cab("Turma")}
          <span className="tpData">{cab("Início")}</span>
          {cab("Matric.", { textAlign: "right" })}
          {cab("Presentes", { textAlign: "right" })}
          {cab("Ausentes", { textAlign: "right" })}
          {cab("Cobertura", { textAlign: "right" })}
        </div>
        {linhas.map((r, i) => <LinhaTurmaPresenca key={`${r.turma}-${i}`} r={r} ultima={i === linhas.length - 1} comCurso={comCurso} />)}
      </div>
    </>
  );
}

function LinhaTurmaPresenca({ r, ultima, comCurso }) {
  const matric = Number(r.matriculados ?? 0);
  const presentes = Number(r.compareceram ?? 0);
  const ausentes = Math.max(0, matric - presentes);
  const cob = Number(r.cobertura_pct ?? 0);
  const pctAus = matric ? Math.round((ausentes / matric) * 100) : null;

  /* O número de ausentes só vale o que a cobertura permite. Abaixo de 60% a
     tela diz isso na própria linha, em vez de deixar o número grande falar
     sozinho. Sem registro nenhum, não existe ausência a mostrar. */
  const semRegistro = presentes === 0 && cob === 0;
  const corCob = semRegistro ? C.dim : cob >= 70 ? C.up : cob >= 40 ? C.warn : C.down;

  return (
    <div className="tpGrade tpLinha" style={{ minHeight: 44, padding: "0 12px", borderBottom: ultima ? "none" : `1px solid ${C.hair}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.turma}</div>
        {comCurso && r.curso && (
          <div style={{ fontSize: 10, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.curso}{r.cidade ? ` · ${r.cidade}` : ""}
          </div>
        )}
        {!comCurso && r.fonte && (
          <div style={{ fontSize: 10, color: C.dim }}>
            fonte: {r.fonte}{r.fonte === "credenciamento" ? " · parou em 2025" : ""}
          </div>
        )}
      </div>

      <span className="tpData" style={{ fontSize: 11, color: C.faint }}>{r.data_inicio ? dataBR(r.data_inicio) : "—"}</span>
      <span style={{ textAlign: "right", fontSize: 12.5, color: C.muted, fontFamily: GROTESK }}>{numero(matric)}</span>
      <span style={{ textAlign: "right", fontSize: 12.5, color: C.muted, fontFamily: GROTESK }}>{numero(presentes)}</span>

      {/* Ausentes e cobertura vivem lado a lado, sempre. */}
      <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {semRegistro ? (
          <span style={{ fontSize: 11, color: C.dim }} title="ninguém foi bipado nesta turma">não medível</span>
        ) : (
          <>
            <b style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: C.text }}>{numero(ausentes)}</b>
            <span style={{ fontSize: 10.5, color: C.faint }}> · {pctAus}%</span>
          </>
        )}
      </span>

      <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <b style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: corCob }}>{semRegistro ? "0" : Math.round(cob)}%</b>
        {!semRegistro && cob < 60 && (
          <div style={{ fontSize: 9.5, color: C.warn, lineHeight: 1.2 }}>parte pode ser falta de registro</div>
        )}
      </span>
    </div>
  );
}

/* ---- Represados ----
   Comprou, o prazo está correndo, e existe turma antes do vencimento. Dá pra
   resolver: é só chamar. */
function CentralRepresados({ notificar }) {
  const lista = useRepresadoLista();
  const saude = usePresencaSaude();
  const [filtro, setFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const [disparando, setDisparando] = useState(false);
  const [retorno, setRetorno] = useState(null);
  const qc = useQueryClient();

  const linhas = lista.data ?? [];
  const contas = useMemo(() => ({
    todos: linhas.length,
    elegivel: linhas.filter((r) => r.pode_disparar).length,
    nunca: linhas.filter((r) => r.dias_desde_o_convite == null).length,
    recente: linhas.filter((r) => r.dias_desde_o_convite != null && r.dias_desde_o_convite <= 30).length,
    sem_telefone: linhas.filter((r) => !r.telefone).length,
    urgente: linhas.filter((r) => Number(r.dias_restantes ?? 999) <= 30).length,
  }), [linhas]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qNum = q.replace(/\D/g, "");
    const passa = (r) =>
      filtro === "todos" ? true
        : filtro === "elegivel" ? !!r.pode_disparar
          : filtro === "nunca" ? r.dias_desde_o_convite == null
            : filtro === "recente" ? (r.dias_desde_o_convite != null && r.dias_desde_o_convite <= 30)
              : filtro === "sem_telefone" ? !r.telefone
                : filtro === "urgente" ? Number(r.dias_restantes ?? 999) <= 30
                  : true;
    return linhas.filter((r) => {
      if (!passa(r)) return false;
      if (!q) return true;
      const doc = String(r.aluno_id ?? "").replace(/\D/g, "");
      const tel = String(r.telefone ?? "").replace(/\D/g, "");
      return String(r.nome ?? "").toLowerCase().includes(q)
        || String(r.curso ?? "").toLowerCase().includes(q)
        || (qNum.length >= 3 && (doc.includes(qNum) || tel.includes(qNum)));
    });
  }, [linhas, filtro, busca]);

  const disparar = async () => {
    setDisparando(true); setRetorno(null);
    try {
      const r = await dispararRepresados();
      setRetorno(r);
      notificar(r?.mensagem ?? "Pronto.", Number(r?.enfileirados ?? 0) > 0 ? "ok" : "info");
      qc.invalidateQueries({ queryKey: ["vw_represado_lista"] });
    } catch (e) {
      const msg = semPermissao(e) ? "Você não tem permissão para disparar convites." : (e.message || "Não foi possível enfileirar.");
      setRetorno({ enfileirados: 0, mensagem: msg, erro: true });
      notificar(msg, "erro");
    } finally { setDisparando(false); }
  };

  const s = saude.data?.[0];
  const cargaVelha = Number(s?.dias_desde_a_carga ?? 0) > 30;

  return (
    <>
      {/* Por que o disparo é manual. Uma linha, e ela explica a tela toda. */}
      <div style={{
        display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12,
        background: `${C.gold}0D`, border: `1px solid ${C.gold}2E`, borderRadius: 10, padding: "9px 12px",
      }}>
        <PhoneCall size={13} style={{ color: C.gold, marginTop: 2, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
          O disparo é manual porque o sistema não sabe quem a consultora já chamou pelo WhatsApp dela.
          Confira <b style={{ color: C.muted }}>há quanto tempo cada um foi convidado</b> antes de mandar de novo.
        </span>
      </div>

      <Estado
        carregando={lista.isLoading}
        erro={lista.error}
        vazio={!linhas.length}
        vazioTitulo="Ninguém represado agora"
        vazioDica="Represado é quem comprou, está com o prazo correndo e tem turma disponível antes de vencer. Lista vazia quer dizer que todo mundo nessa situação já foi alocado."
      >
        {/* A data da carga fica junto do número: represado sem ela convida à
            decisão errada — dado velho passa por atual. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 10.5, color: cargaVelha ? C.down : C.dim }}>
            {s
              ? <>presença carregada em {dataBR(s.ultima_carga)} · {Number(s.dias_desde_a_carga) === 0 ? "hoje" : `há ${numero(s.dias_desde_a_carga)} dias`}{cargaVelha && " — o dado está envelhecendo"}</>
              : "sem informação da última carga de presença"}
          </span>
          <BotaoSalvar onClick={disparar} salvando={disparando} disabled={disparando}>
            Disparar para os elegíveis{contas.elegivel > 0 ? ` (${numero(contas.elegivel)})` : ""}
          </BotaoSalvar>
        </div>

        {retorno && (
          <div style={{
            fontSize: 11.5, lineHeight: 1.5, borderRadius: 10, padding: "9px 11px", marginBottom: 8,
            color: retorno.erro ? C.warn : Number(retorno.enfileirados ?? 0) > 0 ? C.up : C.muted,
            background: `${retorno.erro ? C.warn : Number(retorno.enfileirados ?? 0) > 0 ? C.up : C.muted}12`,
            border: `1px solid ${retorno.erro ? C.warn : Number(retorno.enfileirados ?? 0) > 0 ? C.up : C.muted}3A`,
          }}>
            {retorno.mensagem}
            {!retorno.erro && Number(retorno.enfileirados ?? 0) > 0 && (
              <div style={{ color: C.faint, marginTop: 3 }}>Quem envia é o script, na rodada seguinte — em até 5 horas.</div>
            )}
          </div>
        )}

        <FaixaRepresados contas={contas} filtro={filtro} onFiltrar={setFiltro} />

        <div style={{ position: "relative", margin: "10px 0 8px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, curso, CPF ou telefone" style={{ ...inputAv, paddingLeft: 30 }} />
        </div>

        {!visiveis.length ? (
          <div style={{ fontSize: 12, color: C.faint, padding: "14px 2px" }}>
            Ninguém nesse recorte.{" "}
            <button onClick={() => { setFiltro("todos"); setBusca(""); }} style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: C.gold, fontFamily: SANS, fontSize: 12, fontWeight: 700, textDecoration: "underline",
            }}>Ver todos os {numero(linhas.length)}</button>
          </div>
        ) : (
          <TabelaRepresados linhas={visiveis} />
        )}
      </Estado>
    </>
  );
}

function FaixaRepresados({ contas, filtro, onFiltrar }) {
  const itens = [
    { key: "todos", rotulo: "represados", valor: contas.todos, cor: C.bright },
    { key: "elegivel", rotulo: "elegíveis agora", valor: contas.elegivel, cor: C.up },
    { key: "nunca", rotulo: "nunca convidados", valor: contas.nunca, cor: C.gold },
    { key: "recente", rotulo: "convidados há ≤30 dias", valor: contas.recente, cor: C.muted },
    { key: "urgente", rotulo: "vencem em ≤30 dias", valor: contas.urgente, cor: C.warn },
    { key: "sem_telefone", rotulo: "sem telefone", valor: contas.sem_telefone, cor: C.down },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {itens.map((it) => {
        const ativo = filtro === it.key;
        const vazio = it.valor === 0 && it.key !== "todos";
        return (
          <button key={it.key} onClick={() => onFiltrar(ativo ? "todos" : it.key)} disabled={vazio} aria-pressed={ativo}
            title={vazio ? "ninguém nesta situação" : ativo ? "Clique para ver todos" : `Filtrar: ${it.rotulo}`}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
              padding: "6px 10px", borderRadius: 10, fontFamily: SANS, textAlign: "left",
              cursor: vazio ? "default" : "pointer",
              background: ativo ? `${it.cor}1C` : "rgba(255,255,255,.03)",
              border: `1px solid ${ativo ? `${it.cor}66` : C.cardLine}`,
              opacity: vazio ? 0.45 : 1,
            }}>
            <span style={{ fontFamily: GROTESK, fontSize: 15, fontWeight: 700, lineHeight: 1, color: vazio ? C.dim : it.cor }}>{numero(it.valor)}</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: ativo ? it.cor : C.faint, whiteSpace: "nowrap" }}>{it.rotulo}</span>
          </button>
        );
      })}
      {filtro !== "todos" && (
        <button onClick={() => onFiltrar("todos")} style={{
          alignSelf: "center", marginLeft: 2, background: "none", border: "none", padding: "4px 2px",
          cursor: "pointer", color: C.gold, fontFamily: SANS, fontSize: 11, fontWeight: 700,
        }}>× limpar filtro</button>
      )}
    </div>
  );
}

/* Mesma tabela da lista de inscritos: linha de 44px, cabeçalho grudado,
   sem zebrado. A coluna que decide é a do último convite. */
function TabelaRepresados({ linhas }) {
  const cab = (rotulo, extra = {}) => (
    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim, ...extra }}>{rotulo}</span>
  );
  return (
    <>
      <style>{`
        .trGrade { display: grid; grid-template-columns: minmax(0,1.5fr) 128px minmax(0,1.3fr) 74px minmax(0,1fr) 132px; align-items: center; gap: 10px; }
        @media (max-width: 1100px) { .trGrade { grid-template-columns: minmax(0,1.5fr) 128px 74px minmax(0,1fr) 132px; } .trCurso { display: none; } }
        @media (max-width: 860px)  { .trGrade { grid-template-columns: minmax(0,1.5fr) 128px 74px 132px; } .trTurma { display: none; } }
        .trLinha:hover { background: rgba(255,255,255,.02); }
      `}</style>
      <div className="rolagem" style={{ maxHeight: 460, overflowY: "auto", border: `1px solid ${C.hair}`, borderRadius: 10 }}>
        <div className="trGrade" style={{
          position: "sticky", top: 0, zIndex: 2, background: "#17171c",
          padding: "8px 12px", borderBottom: `1px solid ${C.cardLine}`,
        }}>
          {cab("Nome")}
          {cab("Telefone")}
          <span className="trCurso">{cab("Curso")}</span>
          {cab("Prazo", { textAlign: "right" })}
          <span className="trTurma">{cab("Próxima turma")}</span>
          {cab("Último convite", { textAlign: "right" })}
        </div>
        {linhas.map((r, i) => <LinhaRepresado key={`${r.aluno_id}-${i}`} r={r} ultima={i === linhas.length - 1} />)}
      </div>
    </>
  );
}

function LinhaRepresado({ r, ultima }) {
  const anonimo = semCadastro(r);
  const zap = linkWhatsapp(r.telefone);
  const dias = Number(r.dias_restantes ?? 0);
  const corPrazo = dias <= 30 ? C.down : dias <= 60 ? C.warn : C.muted;
  const desde = r.dias_desde_o_convite;
  const apagado = { fontSize: 11.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  /* A coluna que decide se faz sentido cobrar de novo. Nunca convidado é
     ação clara; convidado esta semana é o contrário — e a cor diz qual é
     qual sem obrigar a ler o número. */
  const convite = desde == null
    ? { texto: "nunca", cor: C.gold, peso: 800 }
    : desde <= 7 ? { texto: desde === 0 ? "hoje" : `há ${desde}d`, cor: C.dim, peso: 600 }
      : desde <= 90 ? { texto: `há ${desde}d`, cor: C.muted, peso: 600 }
        : { texto: `há ${Math.round(desde / 30)} meses`, cor: C.up, peso: 800 };

  return (
    <div className="trGrade trLinha" style={{
      minHeight: 44, padding: "0 12px", borderBottom: ultima ? "none" : `1px solid ${C.hair}`,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 700, color: C.text,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }} title={anonimo ? "sem cadastro" : r.nome}>
          {anonimo ? formataCpf(r.aluno_id) : r.nome}
        </span>
        {r.ja_transferiu && <span title="já transferiu de turma antes" style={{ fontSize: 9.5, color: C.dim, flexShrink: 0 }}>já transferiu</span>}
      </div>

      <div style={apagado}>
        {zap ? <a href={zap} target="_blank" rel="noreferrer" style={{ color: C.faint, textDecoration: "none" }} title="Abrir conversa no WhatsApp">{formataTelefone(r.telefone)}</a>
          : <span style={{ color: C.warn }} title="sem telefone — não tem como convidar">sem telefone</span>}
      </div>

      <div className="trCurso" style={apagado} title={r.curso || ""}>{r.curso || "—"}</div>

      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: corPrazo, whiteSpace: "nowrap" }}
           title={`vence em ${dataBR(r.vence_em)}`}>
        {numero(dias)}d
      </div>

      <div className="trTurma" style={apagado} title={r.turma_id || ""}>
        {r.turma_id || "—"}
        {r.proxima_turma_em && <span style={{ color: C.dim }}> · {dataBR(r.proxima_turma_em)}</span>}
      </div>

      <div style={{ textAlign: "right", fontSize: 11.5, fontWeight: convite.peso, color: convite.cor, whiteSpace: "nowrap" }}
           title={r.ultimo_convite_em ? `último convite em ${dataBR(r.ultimo_convite_em)}` : "nunca recebeu convite do sistema"}>
        {convite.texto}
      </div>
    </div>
  );
}

/* Os números do topo são o filtro. É como a Elis passa de "conferir quantos
   confirmaram" para "trabalhar a lista de quem falta" sem trocar de tela.
   Os valores vêm da view; só "inscritos" usa o tamanho da lista carregada,
   que é a mesma fonte, já em mãos. */
function FaixaContadores({ resumo, total, filtro, onFiltrar }) {
  const n = (c) => Number(resumo?.[c] ?? 0);
  const itens = [
    { key: "todos", rotulo: "inscritos", valor: Number(resumo?.matriculados ?? total), cor: C.bright },
    { key: "confirmado", rotulo: "confirmados", valor: n("confirmados"), cor: C.up },
    { key: "nao vem", rotulo: "não vêm", valor: n("nao_vem"), cor: C.down },
    { key: "sem resposta", rotulo: "sem resposta", valor: n("sem_resposta"), cor: C.warn },
    { key: "aguardando resposta", rotulo: "aguardando", valor: n("aguardando_resposta"), cor: C.muted },
    { key: "nao enfileirado", rotulo: "não enfileirados", valor: n("nao_enfileirados"), cor: C.faint },
    // Estados transitórios/excepcionais: só ocupam espaço quando existem.
    ...(n("aguardando_envio") > 0 ? [{ key: "aguardando envio", rotulo: "aguardando envio", valor: n("aguardando_envio"), cor: C.dim }] : []),
    // "Sem contato" não é o mesmo que "não mandei": é "não tenho como mandar".
    ...(n("sem_contato") > 0 ? [{ key: "sem_contato", rotulo: "sem contato", valor: n("sem_contato"), cor: C.warn }] : []),
  ];

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "stretch" }}>
      {itens.map((it) => {
        const ativo = filtro === it.key;
        const vazio = it.valor === 0 && it.key !== "todos";
        return (
          <button
            key={it.key}
            onClick={() => onFiltrar(ativo ? "todos" : it.key)}
            disabled={vazio}
            aria-pressed={ativo}
            title={vazio ? "ninguém nesta situação" : ativo ? "Clique para ver todos" : `Filtrar: ${it.rotulo}`}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
              padding: "6px 10px", borderRadius: 10, fontFamily: SANS, textAlign: "left",
              cursor: vazio ? "default" : "pointer",
              background: ativo ? `${it.cor}1C` : "rgba(255,255,255,.03)",
              border: `1px solid ${ativo ? `${it.cor}66` : C.cardLine}`,
              opacity: vazio ? 0.45 : 1,
            }}
          >
            <span style={{ fontFamily: GROTESK, fontSize: 15, fontWeight: 700, lineHeight: 1, color: vazio ? C.dim : it.cor }}>
              {numero(it.valor)}
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: ativo ? it.cor : C.faint, whiteSpace: "nowrap" }}>
              {it.rotulo}
            </span>
          </button>
        );
      })}
      {filtro !== "todos" && (
        <button onClick={() => onFiltrar("todos")} style={{
          alignSelf: "center", marginLeft: 2, background: "none", border: "none", padding: "4px 2px",
          cursor: "pointer", color: C.gold, fontFamily: SANS, fontSize: 11, fontWeight: 700,
        }}>× limpar filtro</button>
      )}
    </div>
  );
}

/* A tabela. A referência é a planilha do pedagógico: colunas alinhadas, uma
   linha por pessoa, status colorido numa coluna só — o olho corre a coluna e
   compara. Cartão empilhado ocupa três vezes a altura e caberia um terço das
   pessoas; numa turma de 421 (o TOUR PV tem exatamente isso) essa diferença
   decide se a tela serve.

   Rolagem dentro da tabela com o cabeçalho grudado no topo, e os contadores
   sempre visíveis acima dela. Sem paginação: ela rola procurando um nome, não
   clica em "página 3". Sem zebrado: listra disputa atenção com a cor do
   status, que é a única informação colorida da linha. */
function TabelaInscritos({ linhas, ordem, onOrdenar, aberta, onAbrir, onMarcar }) {
  const seta = (campo) => ordem.campo !== campo ? null : (ordem.dir > 0 ? " ↑" : " ↓");
  const cabecalho = (campo, rotulo, extra = {}) => (
    <button onClick={() => onOrdenar(campo)} style={{
      background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
      fontFamily: SANS, fontSize: 10, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase",
      color: ordem.campo === campo ? C.gold : C.dim, ...extra,
    }}>{rotulo}{seta(campo)}</button>
  );

  return (
    <>
      <style>{`
        .tiGrade { display: grid; grid-template-columns: minmax(0,1.7fr) 128px minmax(0,1.4fr) 122px 30px; align-items: center; gap: 10px; }
        @media (max-width: 900px) { .tiGrade { grid-template-columns: minmax(0,1.7fr) 128px 122px 30px; } .tiEmail { display: none; } }
        .tiLinha:hover { background: rgba(255,255,255,.02); }
      `}</style>
      <div className="rolagem" style={{
        maxHeight: 420, overflowY: "auto", border: `1px solid ${C.hair}`, borderRadius: 10,
      }}>
        <div className="tiGrade" style={{
          position: "sticky", top: 0, zIndex: 2, background: "#17171c",
          padding: "8px 12px", borderBottom: `1px solid ${C.cardLine}`,
        }}>
          {cabecalho("nome", "Nome")}
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim }}>Telefone</span>
          <span className="tiEmail" style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim }}>E-mail</span>
          {cabecalho("situacao", "Status", { textAlign: "right" })}
          <span />
        </div>
        {linhas.map((r, i) => (
          <LinhaInscrito
            key={`${r.aluno_id}-${i}`}
            r={r}
            ultima={i === linhas.length - 1}
            aberta={aberta === r.aluno_id}
            onAbrir={() => onAbrir(r.aluno_id)}
            onMarcar={onMarcar}
          />
        ))}
      </div>
    </>
  );
}

/* Uma linha de ~44px. Nome domina; telefone e e-mail apagados; o chip de
   status é o único ponto de cor forte, e é ele que abre as três opções —
   marcar na mão é exceção, não regra, então os botões não ficam à mostra em
   toda linha. Nada de modal: ela marca várias em sequência. */
function LinhaInscrito({ r, ultima, aberta, onAbrir, onMarcar }) {
  const s = daSituacao(r.situacao);
  const naFila = String(r.situacao ?? "") !== "nao enfileirado";
  const anonimo = semCadastro(r);
  const zap = r.sem_contato ? null : linkWhatsapp(r.telefone);
  const naMao = r.resposta_origem === "hub";

  const [menu, setMenu] = useState(false);
  const copiar = (v) => { navigator.clipboard?.writeText(String(v)); setMenu(false); };

  const opcao = (valor, rotulo, cor) => (
    <button
      key={valor}
      onClick={() => { onMarcar(r.aluno_id, valor); onAbrir(); }}
      style={{
        fontFamily: SANS, fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 7,
        border: `1px solid ${cor}55`, background: `${cor}12`, color: cor, cursor: "pointer",
      }}
    >{rotulo}</button>
  );
  const itemMenu = (rotulo, acao) => (
    <button onClick={acao} style={{
      display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
      padding: "6px 10px", cursor: "pointer", fontFamily: SANS, fontSize: 11.5, color: C.muted, whiteSpace: "nowrap",
    }}>{rotulo}</button>
  );

  const apagado = { fontSize: 11.5, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  return (
    <div style={{ borderBottom: ultima ? "none" : `1px solid ${C.hair}`, position: "relative" }}>
      <div className="tiGrade tiLinha" style={{ minHeight: 44, padding: "0 12px" }}>
        {/* Nome */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontVariantNumeric: anonimo ? "tabular-nums" : "normal",
          }} title={anonimo ? "sem cadastro em dim_alunos" : r.nome}>
            {anonimo ? formataCpf(r.aluno_id) : r.nome}
          </span>
          {anonimo && <span style={{ fontSize: 10, color: C.dim, flexShrink: 0 }}>sem cadastro</span>}
        </div>

        {/* Telefone — o link é o que transforma a lista em ferramenta de ligação */}
        <div style={apagado}>
          {r.sem_contato ? <span style={{ color: C.warn }} title="sem telefone nem e-mail">sem contato</span>
            : zap ? <a href={zap} target="_blank" rel="noreferrer" style={{ color: C.faint, textDecoration: "none" }}
                       title="Abrir conversa no WhatsApp">{formataTelefone(r.telefone)}</a>
              : <span>{formataTelefone(r.telefone) || "—"}</span>}
        </div>

        {/* E-mail — some abaixo de 900px */}
        <div className="tiEmail" style={apagado} title={r.email || ""}>{r.email || "—"}</div>

        {/* Status: o chip é o botão */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
          {naMao && <span title="resposta registrada na mão" style={{
            width: 5, height: 5, borderRadius: 999, background: C.gold, flexShrink: 0,
          }} />}
          <button
            onClick={onAbrir}
            disabled={!naFila}
            aria-expanded={aberta}
            title={naFila ? "Registrar a resposta que chegou por fora" : "Dispare a mensagem antes de registrar a resposta"}
            style={{
              fontFamily: SANS, fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
              whiteSpace: "nowrap", color: s.cor,
              background: s.fundo ? `${s.cor}${s.fundo}` : "transparent",
              border: `1px solid ${s.cor}${s.fundo ? "44" : "55"}`,
              cursor: naFila ? "pointer" : "default",
            }}
          >{s.rotulo}</button>
        </div>

        {/* Ações locais: nada que escreva no banco, só o que ela copiaria à mão */}
        <button onClick={() => setMenu(!menu)} aria-label="Ações" style={{
          background: "none", border: "none", cursor: "pointer", color: menu ? C.gold : C.dim,
          padding: 2, lineHeight: 0, justifySelf: "end",
        }}><MoreHorizontal size={15} /></button>
      </div>

      {menu && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 3 }} />
          <div style={{
            position: "absolute", right: 10, top: 36, zIndex: 4, minWidth: 150, padding: "4px 0",
            background: "#1c1c22", border: `1px solid ${C.cardLine}`, borderRadius: 9,
            boxShadow: "0 10px 28px rgba(0,0,0,.5)",
          }}>
            {zap && itemMenu("Abrir no WhatsApp", () => { window.open(zap, "_blank", "noreferrer"); setMenu(false); })}
            {r.telefone && itemMenu("Copiar telefone", () => copiar(r.telefone))}
            {r.email && itemMenu("Copiar e-mail", () => copiar(r.email))}
            {itemMenu("Copiar CPF", () => copiar(formataCpf(r.aluno_id)))}
          </div>
        </>
      )}

      {aberta && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 12px 9px 12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, color: C.dim }}>Ela respondeu:</span>
          {opcao("sim", "Sim, vem", C.up)}
          {opcao("nao", "Não vem", C.down)}
          {opcao("sem_resposta", "Sem resposta", C.warn)}
        </div>
      )}
    </div>
  );
}

/* ============ HUB DE AUDITORIA COMERCIAL (setor 'auditoria') ============
   Conformidade ao roteiro de vendas da Carmen. É PLACAR FECHADO: quem entra
   é gestão (marketing, comercial, CEO, gerência), não consultora.

   ATENÇÃO — o fechamento de verdade NÃO está aqui. As quatro views não têm
   `pode_ver(...)` e `fato_auditoria` está com RLS sem policy, então hoje
   qualquer autenticado lê o placar direto pela chave anon. Esta tela só
   esconde o caminho; db/119_auditoria_gate.sql é que fecha a porta, e ainda
   não foi aplicada. Ver o comentário no topo do bloco em lib/dados.js.

   Três medidas separadas, que a tela nunca funde num número só:
   score (0-100, ponderado pelos pesos), etapas cumpridas (contagem, 0-N) e
   sondagem completa (objetivos E desafios na mesma conversa). */

// Rótulo humano de cada etapa do roteiro. A chave é o valor cru de
// dim_peso_etapa.etapa — o banco fala snake_case, a tela fala português.
const ETAPAS_ROTULO = {
  apresentacao: "Apresentação",
  quebra_gelo: "Quebra-gelo",
  conhecimento_previo: "Conhecimento prévio",
  motivo_contato: "Motivo do contato",
  perfil_profissional: "Perfil profissional",
  objetivos_futuro: "Objetivos de futuro",
  desafios_dores: "Desafios e dores",
  apresentacao_treinamento: "Apresentação do treinamento",
  validacao_interesse: "Validação de interesse",
  tratamento_objecoes: "Tratamento de objeções",
  fechamento: "Fechamento",
  proximos_passos: "Próximos passos",
};
const rotuloEtapa = (e) => ETAPAS_ROTULO[e] ?? String(e ?? "—").replace(/_/g, " ");

/* Critério de cada etapa, exibido no painel lateral. Texto da fonte:
   docs/criterios_etapas_roteiro_carmen.md, extraído do "Roteiro de Ligação e
   Critérios de Auditoria" (Carmen · Liderança Comercial · ago/2026).

   É descrição do que a auditoria mede (nota 1 x nota 0), não regra de
   cálculo — quem pontua é o ETL, e o front nunca reproduz essa conta.

   As perguntas do roteiro ficam preservadas de propósito: é o que
   transforma o critério em coisa acionável. Sem elas, a gestão vê que a
   etapa falhou e não sabe o que cobrar.

   Campos, todos opcionais menos `acerto`:
     sequencia  — passo a passo obrigatório, vai acima de tudo
     acerto     — o que caracteriza nota 1
     lista      — áreas a investigar / objeções a observar
     perguntas  — falas literais do roteiro
     destaque   — Regra de Ouro, Atenção do roteiro
     falha      — o que caracteriza nota 0
     nota       — ressalva curta (condicional, ordem)
     soLigacao  — etapa que o roteiro de WhatsApp não tem */
const CRITERIO_ETAPA = {
  apresentacao: {
    acerto: "Apresenta-se de forma clara, informa a empresa/Febracis, confirma com quem está falando, demonstra segurança e cordialidade, cria abertura para a conversa.",
    falha: "Inicia falando diretamente de preço ou produto; não identifica o cliente corretamente; não informa de onde está falando.",
  },
  quebra_gelo: {
    soLigacao: true,
    acerto: "Estabelece conversa natural, demonstra interesse genuíno pelo cliente, usa informações disponíveis no contexto da ligação.",
    falha: "Abordagem robotizada ou excessivamente mecânica; pula direto para a oferta.",
    nota: "O quebra-gelo deve acontecer antes da sondagem.",
  },
  conhecimento_previo: {
    soLigacao: true,
    acerto: "Verifica se o cliente já conhece a Febracis, se já participou de algum treinamento, se conhece o treinamento específico.",
    perguntas: {
      titulo: "Perguntas do roteiro",
      itens: [
        "Você já conhece a Febracis?",
        "Já participou de algum treinamento nosso?",
        "O que você já conhece sobre o treinamento?",
      ],
    },
  },
  motivo_contato: {
    acerto: "Descobre o que fez o cliente entrar em contato, o que chamou sua atenção, o motivo inicial do interesse e o que ele espera encontrar no treinamento.",
    perguntas: {
      titulo: "Perguntas do roteiro",
      itens: [
        "O que chamou sua atenção para esse treinamento?",
        "O que fez você buscar esse tipo de desenvolvimento agora?",
        "O que você espera encontrar nessa experiência?",
      ],
    },
  },
  perfil_profissional: {
    acerto: "Identifica profissão, cargo, ramo de atuação, empresa ou negócio, tempo de atuação e momento profissional.",
    perguntas: {
      titulo: "Perguntas do roteiro",
      itens: [
        "Hoje você trabalha com o quê?",
        "Qual é o seu ramo de atuação?",
        "Você atua como profissional ou possui um negócio próprio?",
      ],
    },
  },
  objetivos_futuro: {
    acerto: "Compreende onde o cliente quer chegar — objetivos profissionais e empresariais, crescimento desejado, planos para o futuro, resultados que quer alcançar.",
    perguntas: {
      titulo: "Perguntas do roteiro",
      itens: [
        "Pensando nos próximos anos, onde você gostaria de estar?",
        "O que você gostaria de mudar ou conquistar profissionalmente?",
        "Se sua empresa estivesse no cenário ideal, como ela estaria?",
      ],
    },
  },
  desafios_dores: {
    acerto: "Identifica pelo menos um desafio real, aprofunda a resposta do cliente, faz perguntas complementares, entende a consequência daquele problema e relaciona o desafio com a necessidade de desenvolvimento.",
    lista: {
      titulo: "Áreas a investigar",
      texto: "Gestão, liderança, pessoas, vendas, resultados, organização, disciplina, comunicação, desenvolvimento pessoal, crescimento empresarial.",
    },
    destaque: {
      titulo: "Atenção do roteiro",
      texto: "Não considerar sondagem suficiente quando o consultor apenas pergunta “qual seu objetivo?” e segue imediatamente para a apresentação.",
    },
  },
  apresentacao_treinamento: {
    acerto: "Somente após compreender o cliente, explica o que é o treinamento, a proposta, como funciona, o que será trabalhado, os principais benefícios e por que aquela experiência contribui para o objetivo apresentado pelo cliente.",
    destaque: {
      titulo: "Regra de Ouro da auditoria",
      texto: "O consultor deve conectar a solução à necessidade identificada na sondagem. O auditor deve avaliar se existe essa conexão.",
      exemplo: "Você me contou que hoje seu principal desafio é liderança e que pretende ampliar sua equipe. Por isso, esse treinamento faz sentido para você, porque…",
    },
    falha: "Apresentação genérica de catálogo ou descrição de carga horária sem conexão com o problema do cliente.",
  },
  validacao_interesse: {
    acerto: "Valida a percepção do cliente, dá espaço para ele falar, identifica possíveis dúvidas e percebe sinais de compra ou resistência.",
    perguntas: {
      titulo: "Exemplos do roteiro",
      itens: [
        "Faz sentido para o momento que você está vivendo?",
        "Isso conversa com o que você está buscando?",
        "Diante do que você me contou, você acredita que essa experiência poderia contribuir para o seu objetivo?",
      ],
    },
  },
  tratamento_objecoes: {
    sequencia: ["OUVIR", "ENTENDER", "INVESTIGAR", "RESPONDER", "VALIDAR"],
    acerto: "Ouve a objeção sem interromper, investiga o verdadeiro motivo, evita entrar imediatamente em desconto, responde de forma personalizada, reforça valor antes de falar novamente sobre preço, valida se a objeção foi resolvida.",
    lista: {
      titulo: "Objeções a observar",
      texto: "Preço, falta de tempo, precisa falar com alguém, não conhece o treinamento, precisa pensar, momento financeiro, não vê necessidade, insegurança sobre o investimento.",
    },
    nota: "Condicional: só é avaliada quando houve objeção.",
  },
  fechamento: {
    acerto: "Retoma a necessidade identificada, reforça o valor da solução, apresenta as condições de contratação, pergunta pela decisão e orienta os próximos passos.",
    perguntas: {
      titulo: "Exemplos do roteiro",
      itens: [
        "Diante de tudo que conversamos, faz sentido para você avançarmos?",
        "Vamos garantir sua participação?",
        "Posso realizar sua inscrição agora?",
      ],
    },
    falha: "Não houve tentativa de fechamento; não pediu a decisão de forma clara.",
  },
  proximos_passos: {
    acerto: "Finaliza direcionando o passo seguinte, com data ou ação definida, confirma os dados necessários e encerra com segurança.",
    falha: "Finaliza a ligação sem direcionar o próximo passo.",
  },
};

const CANAIS_AUDITORIA = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "ligacao", label: "Ligação" },
];

/* Recortes de período. "Últimos 30 dias" foi pedido no desenho e NÃO entrou:
   vw_auditoria_kpi e vw_conformidade_venda agregam por date_trunc('month'),
   então o menor grão que existe é o mês. Uma janela de 30 dias corridos
   exigiria outra view — e um botão que recorta por mês com rótulo de 30 dias
   mentiria. "Trimestre" = o mês corrente e os dois anteriores. */
const PERIODOS_AUDITORIA = [
  { key: "mes", label: "Mês corrente", meses: 1 },
  { key: "tri", label: "Trimestre", meses: 3 },
  { key: "tudo", label: "Tudo", meses: null },
];

/* Corte de amostra para classificar alguém. ESPELHA a trava que já está em
   vw_auditoria_consultora (`count(*) >= 20`) — a regra é do banco, não daqui.
   Existe porque a view devolve o flag por MÊS, e uma janela de trimestre
   soma meses: 15 conversas em julho e 15 em agosto são 30, e o flag mensal
   diria "não" nas duas linhas. Se o 20 mudar na view, muda aqui junto — o
   jeito de não ter as duas pontas é uma view que receba a janela. */
const MIN_AUDITORIAS = 20;

// Semáforo de falha: verde < 35%, âmbar 35–60%, vermelho > 60%.
const corFalha = (pct) => (pct > 60 ? C.down : pct >= 35 ? C.warn : C.up);

/* "2026-08-01" -> "ago/2026". Diferente do `mesCurto` lá de cima, que
   recebe "YYYY-MM" e devolve só "Ago": aqui o ano precisa aparecer, porque
   a janela pode atravessar a virada e "Ago" sozinho ficaria ambíguo. */
const mesAnoCurto = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  // toLocaleDateString com month+year devolve "ago. de 2026" em pt-BR; a
  // barra cabe melhor no canto do card, então monto os dois pedaços.
  return `${d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}/${d.getFullYear()}`;
};
// Score é o inverso: quanto maior, melhor. Espelha os mesmos cortes.
const corScore = (s) => (s == null ? C.faint : s >= 65 ? C.up : s >= 40 ? C.warn : C.down);

// Primeiro dia do mês, N meses atrás, no formato da coluna `mes` (date).
const mesDesde = (n) => {
  const d = new Date();
  return `${new Date(d.getFullYear(), d.getMonth() - (n - 1), 1).getFullYear()}-${
    String(new Date(d.getFullYear(), d.getMonth() - (n - 1), 1).getMonth() + 1).padStart(2, "0")}-01`;
};

function BadgeRestrito() {
  return (
    <span title="Placar fechado: gestão de marketing, gestão comercial, CEO e gerência." style={{
      display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
      padding: "5px 10px", borderRadius: 999,
      background: "rgba(255,255,255,.03)", border: `1px solid ${C.cardLine}`,
      fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: ".2px",
    }}>
      <Lock size={11} style={{ color: C.gold }} /> Visível apenas para gestão
    </span>
  );
}

/* Aviso de recorte que a view não sabe fazer. Aparece onde o filtro do topo
   não alcança — em vez de o bloco fingir que obedeceu ao chip. */
function ForaDoRecorte({ texto }) {
  return (
    <div style={{ display: "flex", gap: 7, alignItems: "flex-start", marginTop: 10 }}>
      <AlertTriangle size={11} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
      <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>{texto}</span>
    </div>
  );
}

function HubAuditoria() {
  const kpi = useAuditoriaKpi();
  const gaps = useAuditoriaGaps();
  const placar = useAuditoriaConsultora();
  const conf = useConformidadeVenda();

  const [canal, setCanal] = useState("whatsapp");
  const [periodo, setPeriodo] = useState("mes");
  const [quem, setQuem] = useState(null); // null = todas
  const [etapaAberta, setEtapaAberta] = useState(null);

  const janela = PERIODOS_AUDITORIA.find((p) => p.key === periodo) ?? PERIODOS_AUDITORIA[0];
  const desde = janela.meses ? mesDesde(janela.meses) : null;
  const noPeriodo = (l) => desde == null || String(l.mes ?? "") >= desde;

  // Consultoras do canal — a lista do chip e do placar saem da mesma fonte.
  const consultoras = useMemo(() => {
    const s = new Set();
    for (const l of placar.data ?? []) if (l.canal === canal && l.consultora) s.add(l.consultora);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [placar.data, canal]);

  // Consultora que sumiu ao trocar de canal não deixa a tela vazia: o valor
  // ATIVO é derivado, como no Marketing.
  const quemAtiva = quem != null && consultoras.includes(quem) ? quem : null;

  /* KPIs: a view já traz uma linha por (canal, mês). Somar os contadores e
     REPONDERAR as médias pelo número de auditadas — média de médias mensais
     daria peso igual a um mês de 1 conversa e a um de 27. */
  const k = useMemo(() => {
    const linhas = (kpi.data ?? []).filter((l) => l.canal === canal && noPeriodo(l));
    if (!linhas.length) return null;
    const soma = (c) => linhas.reduce((s, l) => s + Number(l[c] ?? 0), 0);
    const auditadas = soma("auditadas");
    const pond = (c) => (auditadas
      ? linhas.reduce((s, l) => s + Number(l[c] ?? 0) * Number(l.auditadas ?? 0), 0) / auditadas
      : null);
    return {
      auditadas,
      score: pond("score_medio"),
      etapas: pond("etapas_medias"),
      possiveis: Math.max(...linhas.map((l) => Number(l.etapas_possiveis ?? 0))),
      sondagem: soma("sondagem_completa"),
      quentes: soma("leads_quentes"),
      audios: soma("audios"),
    };
  }, [kpi.data, canal, periodo]);

  /* Falha por etapa. Sem consultora escolhida, a linha da EQUIPE é
     sum(falhas)/sum(avaliadas) — nunca a média das porcentagens por
     consultora, que daria o mesmo peso a quem tem 15 conversas e a quem tem
     1. `avaliadas` varia por etapa (nota nula = não se aplica), então cada
     etapa tem o próprio denominador. */
  const etapas = useMemo(() => {
    const m = new Map();
    for (const l of gaps.data ?? []) {
      if (l.canal !== canal) continue;
      if (!noPeriodo(l)) continue;
      if (quemAtiva != null && l.consultora !== quemAtiva) continue;
      const e = m.get(l.etapa) ?? {
        etapa: l.etapa, peso: Number(l.peso ?? 0), ordem: Number(l.ordem ?? 0),
        avaliadas: 0, falhas: 0, porConsultora: new Map(),
      };
      e.avaliadas += Number(l.avaliadas ?? 0);
      e.falhas += Number(l.falhas ?? 0);
      /* A view emite uma linha por DIA desde a 120, então a mesma consultora
         volta várias vezes na mesma etapa. Somar num Map, não empilhar numa
         lista — senão o painel lateral repete o nome dela uma vez por dia. */
      if (l.consultora) {
        const c = e.porConsultora.get(l.consultora) ?? { consultora: l.consultora, avaliadas: 0, falhas: 0 };
        c.avaliadas += Number(l.avaliadas ?? 0);
        c.falhas += Number(l.falhas ?? 0);
        e.porConsultora.set(l.consultora, c);
      }
      m.set(l.etapa, e);
    }
    return [...m.values()]
      .filter((e) => e.avaliadas > 0)
      .map((e) => ({ ...e, porConsultora: [...e.porConsultora.values()], pct: (e.falhas / e.avaliadas) * 100 }))
      .sort((a, b) => b.pct - a.pct || b.peso - a.peso);
  }, [gaps.data, canal, quemAtiva, periodo]);

  /* Pesos do canal. Deveriam vir de dim_peso_etapa, mas a RLS daquela tabela
     devolve 0 linhas para `authenticated` (ver lib/dados.js). A gaps carrega
     peso e ordem vindos do mesmo dim_peso_etapa pelo join, então é o mesmo
     dado por um caminho que hoje funciona. */
  const pesos = useMemo(() => {
    const m = new Map();
    for (const l of gaps.data ?? []) {
      if (l.canal !== canal) continue;
      m.set(l.etapa, { etapa: l.etapa, peso: Number(l.peso ?? 0), ordem: Number(l.ordem ?? 0) });
    }
    return [...m.values()].sort((a, b) => a.ordem - b.ordem);
  }, [gaps.data, canal]);

  /* Placar. A view emite uma linha por MÊS desde a 120: sem juntar, a mesma
     consultora aparecia uma vez por mês na tabela. Contadores somam; médias
     são reponderadas por auditadas (média de médias mensais daria o mesmo
     peso a um mês de 1 conversa e a um de 27); pior/melhor são min/max. */
  const linhasPlacar = useMemo(() => {
    const m = new Map();
    for (const l of placar.data ?? []) {
      if (l.canal !== canal) continue;
      if (!noPeriodo(l)) continue;
      if (quemAtiva != null && l.consultora !== quemAtiva) continue;
      const a = m.get(l.consultora) ?? {
        canal: l.canal, consultora: l.consultora, auditadas: 0,
        somaScore: 0, somaEtapas: 0, sondagem_completa: 0, pior: null, melhor: null,
      };
      const n = Number(l.auditadas ?? 0);
      a.auditadas += n;
      a.somaScore += Number(l.score_medio ?? 0) * n;
      a.somaEtapas += Number(l.etapas_medias ?? 0) * n;
      a.sondagem_completa += Number(l.sondagem_completa ?? 0);
      if (l.pior != null) a.pior = a.pior == null ? Number(l.pior) : Math.min(a.pior, Number(l.pior));
      if (l.melhor != null) a.melhor = a.melhor == null ? Number(l.melhor) : Math.max(a.melhor, Number(l.melhor));
      m.set(l.consultora, a);
    }
    return [...m.values()]
      .map((a) => ({
        ...a,
        score_medio: a.auditadas ? a.somaScore / a.auditadas : null,
        etapas_medias: a.auditadas ? a.somaEtapas / a.auditadas : null,
        amostra_suficiente: a.auditadas >= MIN_AUDITORIAS,
      }))
      .sort((x, y) => Number(y.score_medio ?? 0) - Number(x.score_medio ?? 0));
  }, [placar.data, canal, quemAtiva, periodo]);

  /* Dispersão: SÓ o mês mais recente dentro da janela. As medianas da view
     são calculadas por mês (`c.mes = j.mes`), então misturar meses colocaria
     pontos de agosto contra o corte de julho. E uma consultora viraria um
     ponto por mês, com os rótulos empilhados em cima uns dos outros. */
  const mesDispersao = useMemo(() => {
    const meses = (conf.data ?? []).filter(noPeriodo).map((l) => String(l.mes)).filter(Boolean);
    return meses.length ? meses.reduce((a, b) => (a > b ? a : b)) : null;
  }, [conf.data, periodo]);

  const pontos = useMemo(() => (conf.data ?? [])
    .filter((l) => String(l.mes) === mesDispersao)
    .filter((l) => quemAtiva == null || l.consultora === quemAtiva),
    [conf.data, mesDispersao, quemAtiva]);

  const rotuloCanal = CANAIS_AUDITORIA.find((c) => c.key === canal)?.label ?? canal;
  const etapaSel = etapaAberta ? etapas.find((e) => e.etapa === etapaAberta) : null;

  return (
    <Estado
      carregando={kpi.isLoading || gaps.isLoading || placar.isLoading}
      erro={kpi.error ?? gaps.error ?? placar.error}
      vazio={!kpi.data?.length && !gaps.data?.length}
      vazioTitulo="Sem auditorias registradas"
      vazioDica="A vw_auditoria_kpi não retornou linhas — ou a carga do run_auditoria ainda não rodou, ou seu perfil não tem acesso a este painel."
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "10px 14px", marginBottom: 16, borderRadius: 12,
        background: "rgba(255,255,255,.022)", border: `1px solid ${C.cardLine}`,
      }}>
        <Filter size={13} style={{ color: C.faint, flexShrink: 0 }} />
        <Segmentado label="Período" valor={periodo} onChange={setPeriodo}
          opcoes={PERIODOS_AUDITORIA.map((p) => ({ key: p.key, label: p.label }))} />
        <Segmentado label="Canal" valor={canal} onChange={setCanal} opcoes={CANAIS_AUDITORIA} />
        {consultoras.length > 0 && (
          <Segmentado label="Consultora" valor={quemAtiva} onChange={setQuem}
            opcoes={[{ key: null, label: "Todas" }, ...consultoras.map((c) => ({ key: c, label: c }))]} />
        )}
        <span style={{ marginLeft: "auto" }}><BadgeRestrito /></span>
      </div>

      {k == null ? (
        <CanalSemDado canal={canal} rotulo={rotuloCanal} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 18 }}>
            <ChipKpi Icone={ClipboardCheck} label="Conversas auditadas" hero
              valor={numero(k.auditadas)}
              sub={`${rotuloCanal} · ${janela.label.toLowerCase()}`} />
            <ChipKpi Icone={Target} label="Score médio"
              valor={<span style={{ color: corScore(k.score) }}>{k.score == null ? "—" : k.score.toFixed(0)}</span>}
              unidade="/100"
              sub="ponderado pelo peso das etapas" />
            <ChipKpi Icone={ShieldCheck} label="Etapas cumpridas"
              valor={k.etapas == null ? "—" : k.etapas.toFixed(1).replace(".", ",")}
              unidade={`de ${k.possiveis || "—"}`}
              sub="média por conversa" />
            <ChipKpi Icone={Search} label="Sondagem completa"
              valor={<span style={{ color: k.sondagem ? C.up : C.down }}>{numero(k.sondagem)}</span>}
              unidade={`de ${numero(k.auditadas)}`}
              sub="objetivos E desafios na mesma conversa" />
            <ChipKpi Icone={Smile} label="Leads quentes"
              valor={numero(k.quentes)} unidade={`de ${numero(k.auditadas)}`}
              sub={`${k.audios ? numero(k.audios) : "nenhum"} áudio${k.audios === 1 ? "" : "s"} no período`} />
          </div>

          {/* Duas COLUNAS que empilham sozinhas, não duas faixas. Em faixa, a
              altura da linha é ditada pelo bloco mais alto (o gráfico de
              falhas, que tem 10-12 etapas), e a coluna da direita ficava com
              um buraco entre a dispersão e a tabela de pesos. Empilhando por
              coluna, cada bloco sobe até encostar no de cima. */}
          <div className="gridAud">
            <div>
              <FalhaPorEtapa
                linhas={etapas}
                recorte={quemAtiva ?? "equipe"}
                onEtapa={setEtapaAberta}
              />
              <PlacarConsultoras linhas={linhasPlacar} />
            </div>
            <div>
              <ConformidadeVenda pontos={pontos} mes={mesDispersao} canalIgnorado={canal} />
              <TabelaPesos linhas={pesos} rotuloCanal={rotuloCanal} />
            </div>
          </div>
        </>
      )}

      {etapaSel && (
        <DrawerEtapa etapa={etapaSel} canal={canal} onFechar={() => setEtapaAberta(null)} />
      )}
    </Estado>
  );
}

/* Canal sem uma auditoria sequer. Não é gráfico vazio nem zero — é a
   explicação de por que não há dado, que é a informação que a gestão
   precisa. Hoje cai aqui a Ligação. */
function CanalSemDado({ canal, rotulo }) {
  return (
    <div style={{
      display: "flex", gap: 13, alignItems: "flex-start",
      background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16,
      padding: "26px 24px",
    }}>
      <PhoneCall size={17} style={{ color: C.faint, marginTop: 2, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.bright }}>
          Sem {canal === "ligacao" ? "ligações" : `conversas de ${rotulo}`} no período
        </div>
        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6, lineHeight: 1.6, maxWidth: 520 }}>
          {canal === "ligacao"
            ? "As consultoras ainda não usam o discador do CRM, então não há gravação para auditar. O roteiro de ligação tem 12 etapas e já está pesado no banco — o painel liga sozinho quando a primeira ligação entrar."
            : "Nenhuma auditoria neste canal dentro do recorte escolhido. Amplie o período ou confira se a carga rodou."}
        </div>
      </div>
    </div>
  );
}

/* Gráfico principal: barras horizontais, maior falha no topo. O peso vai ao
   lado do nome porque falhar 100% numa etapa de peso 5 e numa de peso 15
   custa coisas diferentes — sem o peso à vista, a ordem parece arbitrária. */
function FalhaPorEtapa({ linhas, recorte, onEtapa }) {
  return (
    <Bloco titulo="Falha por etapa do roteiro"
      canto={recorte === "equipe" ? "equipe" : recorte}>
      {!linhas.length ? (
        <div style={{ fontSize: 12.5, color: C.faint, padding: "18px 0" }}>
          Nenhuma etapa avaliada neste recorte.
        </div>
      ) : (
        <>
          {linhas.map((l) => (
            <LinhaEtapaFalha key={l.etapa} l={l} onClick={() => onEtapa(l.etapa)} />
          ))}
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 12, lineHeight: 1.5 }}>
            Clique numa etapa para ver o critério de acerto e falha. O denominador é
            só o que foi avaliado: etapa que não se aplica à conversa fica de fora.
          </div>
        </>
      )}
    </Bloco>
  );
}

function LinhaEtapaFalha({ l, onClick }) {
  const cor = corFalha(l.pct);
  return (
    <button onClick={onClick} style={{
      display: "block", width: "100%", textAlign: "left", background: "none",
      border: "none", borderBottom: `1px solid ${C.hair}`, cursor: "pointer",
      padding: "8px 0", fontFamily: SANS,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bright }}>{rotuloEtapa(l.etapa)}</span>
          <span style={{ fontSize: 10.5, color: C.dim, marginLeft: 7 }}>peso {l.peso}</span>
        </span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 7, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: C.dim }}>{l.falhas}/{l.avaliadas}</span>
          <span style={{ fontFamily: GROTESK, fontSize: 13.5, fontWeight: 700, color: cor }}>
            {l.pct.toFixed(0)}%
          </span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.05)", overflow: "hidden" }}>
        <div style={{ width: `${l.pct}%`, height: "100%", borderRadius: 3, background: cor }} />
      </div>
    </button>
  );
}

function DrawerEtapa({ etapa, canal, onFechar }) {
  const bruto = CRITERIO_ETAPA[etapa.etapa];
  /* Quebra-gelo e conhecimento prévio só existem no roteiro de ligação. O
     WhatsApp nem chega aqui hoje (dim_peso_etapa não tem as duas para esse
     canal, então elas não aparecem no gráfico e não há o que clicar) — mas
     a guarda fica explícita: se um dia entrarem por outro caminho, o painel
     não vai exibir critério de um roteiro que não é o daquele canal. */
  const crit = bruto && bruto.soLigacao && canal !== "ligacao" ? null : bruto;
  const cor = corFalha(etapa.pct);

  const caixa = (titulo, texto, corTitulo) => (
    <div style={{
      background: "rgba(255,255,255,.03)", border: `1px solid ${C.cardLine}`,
      borderRadius: 11, padding: "12px 14px", marginBottom: 10,
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: corTitulo, marginBottom: 6 }}>
        {titulo}
      </div>
      <div style={{ fontSize: 12.5, color: C.bright, lineHeight: 1.6 }}>{texto}</div>
    </div>
  );

  return (
    <DrawerLado titulo={rotuloEtapa(etapa.etapa)}
      sub={`peso ${etapa.peso} · ${etapa.falhas} falhas em ${etapa.avaliadas} conversas avaliadas`}
      onFechar={onFechar} largura={460}>

      <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 16 }}>
        <span style={{ fontFamily: GROTESK, fontSize: 34, fontWeight: 700, color: cor, letterSpacing: "-1px" }}>
          {etapa.pct.toFixed(0)}%
        </span>
        <span style={{ fontSize: 12, color: C.faint }}>das conversas falharam nesta etapa</span>
      </div>

      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: C.dim, marginBottom: 9 }}>
        Roteiro da Carmen
      </div>

      {!crit ? (
        <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.6, marginBottom: 10 }}>
          Sem critério cadastrado para esta etapa neste canal.
        </div>
      ) : (<>
        {/* Sequência obrigatória (objeções): vem antes de tudo porque é a
            ordem que o auditor confere, não um detalhe do acerto. */}
        {crit.sequencia && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
            marginBottom: 12, padding: "10px 12px", borderRadius: 11,
            background: `${C.gold}0F`, border: `1px solid ${C.gold}33`,
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: C.gold, width: "100%", marginBottom: 2 }}>
              Sequência obrigatória
            </span>
            {crit.sequencia.map((passo, i) => (
              <span key={passo} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <ArrowRight size={11} style={{ color: C.dim }} />}
                <span style={{ fontFamily: GROTESK, fontSize: 11, fontWeight: 700, color: C.bright, letterSpacing: ".3px" }}>{passo}</span>
              </span>
            ))}
          </div>
        )}

        {caixa("Acerto · nota 1", crit.acerto, C.up)}

        {crit.lista && (
          <div style={{ marginBottom: 10, padding: "0 2px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: C.dim, marginBottom: 5 }}>
              {crit.lista.titulo}
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{crit.lista.texto}</div>
          </div>
        )}

        {/* As falas literais do roteiro. É o que a gestão repete na
            devolutiva — sem elas o critério vira adjetivo. */}
        {crit.perguntas && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: C.dim, marginBottom: 6 }}>
              {crit.perguntas.titulo}
            </div>
            {crit.perguntas.itens.map((p) => (
              <div key={p} style={{
                display: "flex", gap: 8, alignItems: "flex-start",
                padding: "7px 11px", marginBottom: 5, borderRadius: 9,
                background: "rgba(255,255,255,.025)", borderLeft: `2px solid ${C.gold}55`,
              }}>
                <span style={{ fontSize: 12.5, color: C.bright, lineHeight: 1.55, fontStyle: "italic" }}>“{p}”</span>
              </div>
            ))}
          </div>
        )}

        {crit.destaque && (
          <div style={{
            marginBottom: 10, padding: "12px 14px", borderRadius: 11,
            background: `${C.gold}0F`, border: `1px solid ${C.gold}33`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Star size={11} style={{ color: C.gold }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: C.gold }}>
                {crit.destaque.titulo}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.bright, lineHeight: 1.6 }}>{crit.destaque.texto}</div>
            {crit.destaque.exemplo && (
              <div style={{
                fontSize: 12, color: C.muted, lineHeight: 1.6, fontStyle: "italic",
                marginTop: 8, paddingLeft: 10, borderLeft: `2px solid ${C.gold}44`,
              }}>
                “{crit.destaque.exemplo}”
              </div>
            )}
          </div>
        )}

        {crit.falha && caixa("Falha · nota 0", crit.falha, C.down)}

        {crit.nota && (
          <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.6, fontStyle: "italic", marginBottom: 10 }}>
            {crit.nota}
          </div>
        )}
      </>)}

      {etapa.porConsultora.length > 1 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: C.dim, margin: "18px 0 9px" }}>
            Por consultora
          </div>
          {[...etapa.porConsultora]
            .sort((a, b) => (b.falhas / (b.avaliadas || 1)) - (a.falhas / (a.avaliadas || 1)))
            .map((c) => {
              const pct = c.avaliadas ? (c.falhas / c.avaliadas) * 100 : null;
              return (
                <div key={c.consultora} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.hair}`,
                }}>
                  <span style={{ fontSize: 12.5, color: C.bright, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.consultora}
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: C.dim }}>{c.falhas}/{c.avaliadas}</span>
                    <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: pct == null ? C.faint : corFalha(pct) }}>
                      {pct == null ? "—" : `${pct.toFixed(0)}%`}
                    </span>
                  </span>
                </div>
              );
            })}
        </>
      )}
    </DrawerLado>
  );
}

/* Dispersão conformidade × venda. As medianas vêm da view (score_mediano,
   receita_mediana) e são calculadas SÓ entre quem tem amostra suficiente —
   quando ninguém tem, elas voltam nulas e não há quadrante nenhum. Nesse
   caso o gráfico não desenha linha de corte: inventar uma mediana com 3
   pessoas de 1 a 15 conversas classificaria gente que a view se recusou a
   classificar. */
function ConformidadeVenda({ pontos, mes, canalIgnorado }) {
  const L = 44, B = 30, W = 480, H = 250;

  const medX = pontos.find((p) => p.score_mediano != null)?.score_mediano ?? null;
  const medY = pontos.find((p) => p.receita_mediana != null)?.receita_mediana ?? null;

  const comReceita = pontos.filter((p) => p.receita != null);
  const maxY = Math.max(...comReceita.map((p) => Number(p.receita)), Number(medY ?? 0), 1);
  const px = (s) => L + (Math.min(Math.max(Number(s ?? 0), 0), 100) / 100) * (W - L - 14);
  const py = (r) => H - B - (Number(r ?? 0) / maxY) * (H - B - 16);

  const semVenda = pontos.filter((p) => p.receita == null);

  return (
    // O canto nomeia o MÊS, não a janela: este bloco é sempre de um mês só,
    // e rotulá-lo "trimestre" prometeria um recorte que ele não faz.
    <Bloco titulo="Conformidade × venda real" canto={mes ? mesAnoCurto(mes) : null}>
      {!pontos.length ? (
        <div style={{ fontSize: 12.5, color: C.faint, padding: "18px 0" }}>
          Sem consultora com auditoria e venda no período.
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
            <line x1={L} y1={H - B} x2={W - 6} y2={H - B} stroke="rgba(255,255,255,.12)" />
            <line x1={L} y1={12} x2={L} y2={H - B} stroke="rgba(255,255,255,.12)" />

            {medX != null && medY != null && (
              <>
                <line x1={px(medX)} y1={12} x2={px(medX)} y2={H - B} stroke={C.gold} strokeOpacity=".45" strokeDasharray="4 4" />
                <line x1={L} y1={py(medY)} x2={W - 6} y2={py(medY)} stroke={C.gold} strokeOpacity=".45" strokeDasharray="4 4" />
                <text x={px(medX) + 4} y={20} fill={C.dim} fontSize="9">mediana</text>
              </>
            )}

            {[0, 25, 50, 75, 100].map((s) => (
              <text key={s} x={px(s)} y={H - B + 13} fill={C.dim} fontSize="9" textAnchor="middle">{s}</text>
            ))}
            <text x={L} y={H - 4} fill={C.faint} fontSize="9.5">score médio →</text>
            <text x={6} y={20} fill={C.faint} fontSize="9.5">receita ↑</text>

            {comReceita.map((p) => {
              const ok = p.amostra_suficiente;
              return (
                <g key={`${p.mes}-${p.consultora}`}>
                  <circle cx={px(p.score_medio)} cy={py(p.receita)} r={6}
                    fill={ok ? C.gold : "rgba(255,255,255,.16)"}
                    stroke={ok ? C.goldTop : C.faint} strokeWidth="1" />
                  <text x={px(p.score_medio) + 10} y={py(p.receita) + 3.5}
                    fill={ok ? C.bright : C.faint} fontSize="10">
                    {p.consultora}
                  </text>
                  {!ok && (
                    <text x={px(p.score_medio) + 10} y={py(p.receita) + 14}
                      fill={C.dim} fontSize="8.5">amostra insuficiente</text>
                  )}
                </g>
              );
            })}
          </svg>

          {medX == null && (
            <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 4 }}>
              Sem linhas de mediana e sem quadrantes: nenhuma consultora chegou às
              20 auditorias que a view exige para classificar. Os pontos aparecem em
              cinza porque estão medidos, não julgados —{" "}
              <span style={{ color: C.muted }}>modelo, treinar, revisar roteiro e acompanhar</span>{" "}
              voltam sozinhos quando a amostra crescer.
            </div>
          )}
          {semVenda.length > 0 && (
            <div style={{ fontSize: 10.5, color: C.dim, marginTop: 8 }}>
              Fora do gráfico, sem venda atribuída no período: {semVenda.map((p) => p.consultora).join(", ")}.
            </div>
          )}
          {canalIgnorado === "ligacao" && (
            <ForaDoRecorte texto="A vw_conformidade_venda não separa por canal — este bloco soma WhatsApp e ligação." />
          )}
        </>
      )}
    </Bloco>
  );
}

/* Placar por consultora. Quem não tem 20 auditorias NÃO recebe posição: a
   coluna de posição fica com um traço. A linha continua visível — esconder
   quem tem pouca amostra deixaria a gestão achando que a pessoa não foi
   auditada. */
function PlacarConsultoras({ linhas }) {
  const th = {
    fontSize: 10, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase",
    color: C.dim, padding: "0 0 8px", textAlign: "right", whiteSpace: "nowrap",
  };
  const td = { fontFamily: GROTESK, fontSize: 13, fontWeight: 700, padding: "9px 0", textAlign: "right", whiteSpace: "nowrap" };
  let posicao = 0;
  return (
    <Bloco titulo="Placar por consultora" canto={`${linhas.length} ${linhas.length === 1 ? "consultora" : "consultoras"}`}>
      {!linhas.length ? (
        <div style={{ fontSize: 12.5, color: C.faint, padding: "18px 0" }}>Sem consultora neste recorte.</div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.hair}` }}>
                <th style={{ ...th, textAlign: "left", width: 28 }}>#</th>
                <th style={{ ...th, textAlign: "left", width: "40%" }}>Consultora</th>
                <th style={th}>Auditadas</th>
                <th style={th}>Score</th>
                <th style={th}>Etapas</th>
                <th style={th}>Pior–melhor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const ok = l.amostra_suficiente;
                if (ok) posicao += 1;
                return (
                  <tr key={`${l.canal}-${l.consultora}`} style={{ borderBottom: `1px solid ${C.hair}` }}>
                    <td style={{ ...td, textAlign: "left", color: ok ? C.gold : C.dim }}>
                      {ok ? posicao : "—"}
                    </td>
                    <td style={{
                      fontSize: 12.5, fontWeight: 600, padding: "9px 0", textAlign: "left",
                      color: ok ? C.bright : C.muted, maxWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }} title={ok ? l.consultora : `${l.consultora} — amostra insuficiente para classificar`}>
                      {l.consultora}
                      {!ok && <span style={{ fontSize: 10, color: C.dim, marginLeft: 7 }}>amostra insuficiente</span>}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{numero(l.auditadas)}</td>
                    <td style={{ ...td, color: corScore(Number(l.score_medio)) }}>
                      {l.score_medio == null ? "—" : Number(l.score_medio).toFixed(0)}
                    </td>
                    <td style={{ ...td, color: C.text }}>
                      {l.etapas_medias == null ? "—" : String(l.etapas_medias).replace(".", ",")}
                    </td>
                    <td style={{ ...td, color: C.muted }}>{l.pior ?? "—"}–{l.melhor ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
            Posição só para quem tem 20 auditorias ou mais. Score e etapas cumpridas
            são medidas distintas e ficam em colunas separadas de propósito.
          </div>
        </>
      )}
    </Bloco>
  );
}

/* Tabela de pesos. Fica à vista por transparência: o score é ponderado, e
   sem ver quanto cada etapa vale o número parece arbitrário. */
function TabelaPesos({ linhas, rotuloCanal }) {
  const total = linhas.reduce((s, l) => s + l.peso, 0);
  return (
    <Bloco titulo="Peso de cada etapa" canto={rotuloCanal}>
      {!linhas.length ? (
        <div style={{ fontSize: 12.5, color: C.faint, padding: "18px 0" }}>
          Sem pesos cadastrados para este canal.
        </div>
      ) : (
        <>
          {linhas.map((l) => (
            <div key={l.etapa} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "6px 0", borderBottom: `1px solid ${C.hair}`,
            }}>
              <span style={{ fontSize: 10, color: C.dim, width: 16, flexShrink: 0, fontFamily: GROTESK }}>{l.ordem}</span>
              <span style={{ fontSize: 12.5, color: C.bright, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {rotuloEtapa(l.etapa)}
              </span>
              <span style={{ width: 84, height: 5, borderRadius: 3, background: "rgba(255,255,255,.05)", overflow: "hidden", flexShrink: 0 }}>
                <span style={{
                  display: "block", width: `${(l.peso / Math.max(...linhas.map((x) => x.peso), 1)) * 100}%`,
                  height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C.goldBase}, ${C.gold})`,
                }} />
              </span>
              <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, color: C.text, width: 30, textAlign: "right", flexShrink: 0 }}>
                {l.peso}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
            Soma {total} pontos em {linhas.length} etapas. É quanto cada etapa desconta
            do score quando a consultora não a cumpre.
          </div>
        </>
      )}
    </Bloco>
  );
}

function Shell({ perfil }) {
  // União de setores: o setor do perfil + os de perfil_setores (já vêm em
  // perfil.setores). Admin/geral seguem vendo tudo, agora também se "geral"
  // estiver entre os múltiplos setores.
  const setores = perfil.setores?.length ? perfil.setores : [perfil.setor].filter(Boolean);
  const admin = perfil.papel === "admin" || setores.includes("geral");
  const [tela, setTela] = useState(admin ? "executivo" : (perfil.setor || setores[0]));
  const [modo, setModo] = useState("ano");
  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [mesIdx, setMesIdx] = useState(() => new Date().getMonth());
  const [transicaoPeriodo, setTransicaoPeriodo] = useState(0);
  const [geral, setGeral] = useState(false); // "Geral": todo o histórico, sem recorte de ano
  const { minMes, maxMes, anos } = useRangeDatas();

  // Categoria: só recorta o Hub Comercial. A lista vem do dado; sem opção
  // "todas" de propósito (categorias são unidades de negócio separadas).
  const categorias = useCategoriasDisponiveis();
  const [catEscolhida, setCategoria] = useState(null);
  const categoria = catEscolhida && categorias.includes(catEscolhida) ? catEscolhida : categorias[0];
  const ctxCategoria = useMemo(() => ({ categoria, setCategoria, categorias }), [categoria, categorias]);

  useEffect(() => {
    setTransicaoPeriodo((v) => v + 1);
  }, [modo, ano, mesIdx]);

  const ctxPeriodo = useMemo(() => {
    const dentro = (k) => k >= minMes && k <= maxMes;
    // Qualquer navegação por ano/mês desliga o "Geral" (são exclusivos).
    const aplicar = (a, m) => { setAno(a); setMesIdx(m); setGeral(false); };
    const h = new Date();
    const hoje = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate()));
    // "Geral" = todo o histórico: do primeiro mês com dado até hoje.
    const base = geral
      ? { inicio: `${minMes}-01`, fim: hoje, rotulo: "Geral" }
      : intervaloDe({ modo, ano, mesIdx });
    return {
      modo, ano, mesIdx, anos, minMes, maxMes, geral, setGeral,
      setAno: (a) => { setAno(a); setGeral(false); },
      setMesAno: aplicar,
      // Navega mês a mês virando o ano (Jan ‹ vira Dez do ano anterior).
      irMes: (delta) => {
        let m = mesIdx + delta, a = ano;
        if (m < 0) { m = 11; a -= 1; }
        if (m > 11) { m = 0; a += 1; }
        if (dentro(chaveMes(a, m))) aplicar(a, m);
      },
      // Ao entrar no modo Mês, puxa a âncora pra dentro dos limites do dado.
      // Trocar de modo desliga o "Geral" (que é um conceito do modo Ano).
      escolherModo: (k) => {
        if (k !== "ano") setGeral(false);
        if (k === "mes") {
          const atual = chaveMes(ano, mesIdx);
          const alvo = atual > maxMes ? maxMes : atual < minMes ? minMes : null;
          if (alvo) aplicar(Number(alvo.slice(0, 4)), Number(alvo.slice(5, 7)) - 1);
        }
        setModo(k);
      },
      ...base,
    };
  }, [modo, ano, mesIdx, anos, minMes, maxMes, geral]);

  const visiveis = admin ? HUBS : HUBS.filter((h) => setores.includes(h.setor ?? h.key));
  const hub = HUBS.find((h) => h.key === tela);

  const conteudo = () => {
    switch (tela) {
      case "executivo":  return <HubExecutivo onIr={setTela} />;
      case "comercial":  return <HubComercial />;
      case "financeiro": return <HubFinanceiro />;
      case "marketing":  return <HubMarketing />;
      case "pedagogico": return <HubPedagogico />;
      case "central":    return <CentralPedagogica />;
      case "auditoria":  return <HubAuditoria />;
      case "central-eventos": return <CentralEventos />;
      case "eventos":    return <HubEventos />;
      case "loja":       return <HubLoja />;
      case "estoque":    return <SemFonte hub={hub} />;
      default:           return null;
    }
  };

  const Item = ({ chave, label, Icone }) => {
    const ativo = tela === chave;
    return (
      <button onClick={() => setTela(chave)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 11,
        padding: "9px 12px", borderRadius: 9, fontSize: 13.5, fontWeight: 600,
        background: ativo ? `${C.gold}1F` : "transparent",
        color: ativo ? C.gold : C.muted,
        border: "none", cursor: "pointer", fontFamily: SANS, textAlign: "left",
      }}>
        <Icone size={16} /> {label}
      </button>
    );
  };

  const iniciais = (perfil.nome ?? "")
    .split(/[\s.]+/).filter(Boolean).slice(0, 2)
    .map((p) => p[0]?.toUpperCase()).join("") || "??";

  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "short", year: "numeric",
  });

  const primeiroNome = (perfil.nome ?? "").split(/[\s.]+/)[0];
  const saudacao = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <PeriodoCtx.Provider value={ctxPeriodo}>
    <CategoriaCtx.Provider value={ctxCategoria}>
    <div style={{
      minHeight: "100vh", display: "flex", color: C.text, fontFamily: SANS,
      background: `radial-gradient(1200px 600px at 78% -10%, ${C.gold}12, transparent 60%), ${C.void}`,
    }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.void}; -webkit-font-smoothing: antialiased; }
        ::selection { background: ${C.gold}47; }
        input::placeholder { color: ${C.dim}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
        .rolagem::-webkit-scrollbar { width: 9px; }
        .rolagem::-webkit-scrollbar-thumb { background: rgba(255,255,255,.09); border-radius: 20px; }
        .receitaDetalheScroll { scrollbar-width: thin; scrollbar-color: ${C.gold}99 transparent; }
        .receitaDetalheScroll::-webkit-scrollbar { width: 5px; }
        .receitaDetalheScroll::-webkit-scrollbar-track { background: transparent; margin: 9px 0; }
        .receitaDetalheScroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, ${C.gold}b8, ${C.gold}70);
          border-radius: 999px;
          border: 1px solid transparent;
          background-clip: padding-box;
        }
        .receitaDetalheScroll::-webkit-scrollbar-thumb:hover { background: ${C.gold}d6; }
        .receitaDetalheScroll::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
        @keyframes girar { to { transform: rotate(360deg); } }
        @keyframes subir { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes metaPonteiro {
          from { transform: rotate(-180deg); }
          to { transform: rotate(var(--angulo-meta)); }
        }
        @keyframes metaBrilho {
          0%, 100% {
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--cor-meta) 30%, transparent),
                        0 0 15px color-mix(in srgb, var(--cor-meta) 28%, transparent);
          }
          50% {
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--cor-meta) 52%, transparent),
                        0 0 21px color-mix(in srgb, var(--cor-meta) 46%, transparent);
          }
        }
        @keyframes periodoEntrarA {
          from { opacity: .82; transform: translateY(2px); filter: blur(.35px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes periodoEntrarB {
          from { opacity: .82; transform: translateY(2px); filter: blur(.35px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .trocaPeriodoA { animation: periodoEntrarA .3s ease-out; }
        .trocaPeriodoB { animation: periodoEntrarB .3s ease-out; }
        @keyframes deltaBrilhoUp {
          0%, 100% { text-shadow: 0 0 3px color-mix(in srgb, ${C.up} 35%, transparent); }
          50% { text-shadow: 0 0 9px ${C.up}, 0 0 15px color-mix(in srgb, ${C.up} 55%, transparent); }
        }
        @keyframes deltaBrilhoDown {
          0%, 100% { text-shadow: 0 0 3px color-mix(in srgb, ${C.down} 35%, transparent); }
          50% { text-shadow: 0 0 9px ${C.down}, 0 0 15px color-mix(in srgb, ${C.down} 55%, transparent); }
        }
        .deltaBrilhaUp { animation: deltaBrilhoUp 2.1s ease-in-out infinite; }
        .deltaBrilhaDown { animation: deltaBrilhoDown 2.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          [style*="metaPonteiro"], [style*="metaBrilho"], .trocaPeriodoA, .trocaPeriodoB,
          .deltaBrilhaUp, .deltaBrilhaDown { animation-duration: .01ms !important; }
        }
        .girar { animation: girar 1s linear infinite; }
        .subir { animation: subir .4s ease; }
        .kpiTopoComercial, .kpiTopoFinanceiro { position: relative; isolation: isolate; overflow: hidden; transition: border-color .22s ease; }
        .kpiTopoComercial::after, .kpiTopoFinanceiro::after {
          content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none; border-radius: inherit;
          opacity: 0; transition: opacity .22s ease;
          background: transparent;
          box-shadow: inset 0 0 0 1px ${C.gold}52, inset 0 0 11px ${C.gold}20;
        }
        .kpiTopoComercial:hover, .kpiTopoFinanceiro:hover { border-color: ${C.gold}55 !important; }
        .kpiTopoComercial:hover::after, .kpiTopoFinanceiro:hover::after { opacity: 1; }
        /* Painéis do Hub Financeiro (design portado): 1 coluna no mobile,
           proporções do design (5:4:3 e 7:5) em telas largas. */
        .finRow1 { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
        .finRow2 { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
        @media (min-width: 1000px) {
          .finRow1 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .finRow2 { grid-template-columns: 7fr 5fr; }
        }
        /* Hub Comercial: evolução à esquerda, consultoras à direita. Denso
           pra caber numa TV 16:9 sem rolagem. */
        .gridCom { display: grid; grid-template-columns: 1fr; column-gap: 14px; align-items: start; }
        @media (min-width: 1100px) { .gridCom { grid-template-columns: 7fr 5fr; } }
        /* Auditoria: gráfico à esquerda, contexto à direita, nas duas faixas.
           Denso o bastante pra caber em 1080 sem rolagem. */
        .gridAud { display: grid; grid-template-columns: 1fr; column-gap: 16px; align-items: start; }
        @media (min-width: 1100px) { .gridAud { grid-template-columns: 6fr 5fr; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
      `}</style>

      <aside className="rolagem" style={{
        width: 250, flex: "none", borderRight: `1px solid rgba(255,255,255,.07)`,
        background: C.panel, backdropFilter: "blur(8px)",
        display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh",
      }}>
        <div style={{ padding: "22px 20px 18px", display: "flex", alignItems: "center", gap: 11 }}>
          <img src="/logo-febracis.webp" alt="" width={32} height={32} />
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontWeight: 800, fontSize: 14.5, letterSpacing: ".2px" }}>FebraHub</div>
            <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase" }}>
              Central de Inteligência
            </div>
          </div>
        </div>

        <div style={{ padding: "6px 12px", flex: 1, overflowY: "auto" }}>
          {admin && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: C.dim, textTransform: "uppercase", padding: "12px 12px 8px" }}>
                Painéis
              </div>
              <Item chave="executivo" label="Hub Executivo" Icone={LayoutDashboard} />
            </>
          )}

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", color: C.dim, textTransform: "uppercase", padding: "20px 12px 8px" }}>
            {admin ? "Setores" : "Seu hub"}
          </div>
          {visiveis.map((h) => <Item key={h.key} chave={h.key} label={h.nome} Icone={h.Icone} />)}
        </div>

        <div style={{ padding: 12, borderTop: `1px solid rgba(255,255,255,.07)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: 8, borderRadius: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(150deg,#3a3a40,#1c1c20)",
              border: `1px solid ${C.gold}66`, color: C.gold,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 12.5,
            }}>
              {iniciais}
            </div>
            <div style={{ lineHeight: 1.25, flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {perfil.nome}
              </div>
              <div style={{ fontSize: 11, color: C.faint, textTransform: "capitalize" }}>
                {admin ? "Diretora Executiva" : perfil.setor}
              </div>
            </div>
            <button onClick={sair} title="Sair" aria-label="Sair" style={{
              background: "none", border: "none", cursor: "pointer", color: C.faint, display: "flex", padding: 2,
            }}>
              <Power size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="rolagem" style={{ flex: 1, minWidth: 0, height: "100vh", overflowY: "auto" }}>
        <div className="subir" style={{ padding: "26px 34px 60px", maxWidth: 1320, margin: "0 auto" }}>

          {/* A Central de Eventos traz o próprio cabeçalho — com o seletor de
              mês e o botão de atualizar dentro dele. Renderizar o do Shell
              junto duplicaria o título na tela. */}
          {tela !== "central-eventos" && (
          <div style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            gap: 20, flexWrap: "wrap", marginBottom: 24,
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".6px", color: C.gold, textTransform: "uppercase", marginBottom: 6 }}>
                {hoje}
              </div>
              <h1 style={{ fontSize: 29, fontWeight: 800, letterSpacing: "-.6px", fontFamily: SANS }}>
                {tela === "executivo"
                  ? `${saudacao}, ${primeiroNome}.`
                  /* `titulo` existe pra quando o nome do menu precisa ser curto
                     e o do cabeçalho, completo. Sem ele, é o mesmo texto. */
                  : (hub?.titulo ?? hub?.nome)}
              </h1>
              {tela !== "executivo" && (
                <div style={{ fontSize: 13, color: C.faint, marginTop: 5 }}>{hub?.desc}</div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {/* Executivo é sempre mês corrente — sem filtro de período. Os hubs
                  setoriais mantêm o seletor (é lá que a Dulce fatia por período). */}
              {/* Auditoria traz o próprio recorte de período nos chips: as views
                  dela agregam por mês, e o seletor global (que fatia por dia)
                  prometeria um corte que elas não sabem fazer. */}
              {tela !== "executivo" && tela !== "auditoria" && <SeletorPeriodo />}
              {tela === "comercial" && <SeletorCategoria />}
              <div style={{
                width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.cardLine}`,
                background: "rgba(255,255,255,.04)", display: "flex", alignItems: "center",
                justifyContent: "center", color: "#C9C9CE", flexShrink: 0,
              }}>
                <Bell size={16} />
              </div>
            </div>
          </div>
          )}

          <div className={transicaoPeriodo % 2 ? "trocaPeriodoA" : "trocaPeriodoB"}>
            {conteudo()}
          </div>
        </div>
      </main>
    </div>
    </CategoriaCtx.Provider>
    </PeriodoCtx.Provider>
  );
}

/* ============ APP ============ */

function App() {
  const sessao = useSessao();
  const perfil = usePerfil(sessao);

  if (sessao === undefined || (sessao && perfil.isLoading))
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.void }}>
        <Loader2 size={18} className="girar" style={{ color: C.goldBase }} />
        <style>{`@keyframes girar { to { transform: rotate(360deg); } } .girar { animation: girar 1s linear infinite; }`}</style>
      </div>
    );

  if (!sessao) return <Login />;

  if (perfil.error || !perfil.data)
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 13, background: C.void, color: C.text,
        fontFamily: SANS, padding: 24, textAlign: "center",
      }}>
        <ShieldAlert size={22} style={{ color: C.down }} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>Seu usuário existe, mas não tem perfil configurado.</div>
        <div style={{ fontSize: 12.5, color: C.faint, maxWidth: 340 }}>
          Peça a um administrador para definir seu setor e papel.
        </div>
        <button onClick={sair} style={{
          fontSize: 12.5, fontWeight: 700, padding: "9px 18px", borderRadius: 9,
          background: "rgba(255,255,255,.05)", border: `1px solid ${C.cardLine}`,
          color: C.muted, cursor: "pointer", fontFamily: SANS,
        }}>
          Sair
        </button>
      </div>
    );

  return <Shell perfil={perfil.data} />;
}

// A rota pública /e/:token vira QR code impresso, então precisa de URL de
// verdade. É a ÚNICA tela usada por gente de fora da Febracis: fica FORA do
// portal — sem auth, sem QueryClient, sem Shell (sidebar/topbar). Todo o
// resto cai no catch-all e é o portal de sempre, que navega por estado.
function RotaAvaliacao() {
  const { token } = useParams();
  return <Avaliacao token={token} />;
}

export default function Root() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/e/:token" element={<RotaAvaliacao />} />
        <Route path="*" element={
          <QueryClientProvider client={qc}>
            <App />
          </QueryClientProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}
