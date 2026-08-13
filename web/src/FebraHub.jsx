import { useState, useMemo, useRef, useEffect, createContext, useContext } from "react";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import Avaliacao from "./Rotas/Avaliacao.jsx";
import {
  TrendingUp, Wallet, Megaphone, GraduationCap, ShoppingBag, CalendarDays,
  LayoutDashboard, Lock, Mail, AlertTriangle, Package, LogOut, Power,
  Database, ShieldAlert, Loader2, ArrowRight, Bell,
  Clock, Receipt, Hourglass, ChevronLeft, ChevronRight, ChevronDown,
  Smile, Frown, Meh, Crown, Gift, X, ArrowUpRight,
  Users, Target, Construction, Percent, Filter, ChevronUp,
  Boxes, PackageX, Repeat, UserCheck, BookOpen, ShieldCheck,
  Check, Pencil, Star, Plus, PhoneCall, Send, Link2, ClipboardList,
} from "lucide-react";
import {
  useSessao, usePerfil, entrar, sair,
  useComercialRankingHistorico, useComercialSymplaJennifer, useComercialCarinhas,
  useComercialVerdesDetalhe,
  useComercialMatriculasFaturamento, useComercialCursosPorConsultora,
  useComercialRankingGeralConsolidado, useComercialGeralMensal, useFaturamentoMensal,
  useFinanceiroPagamentos, useFinanceiroQualidadePeriodo,
  useFinanceiroCaixaHorizonte, useFinanceiroFormasPagamento,
  useFinanceiroReceitaMensal, useFinanceiroCaixaMensal,
  useFinanceiroInadimp, useFinanceiroInadimpOrigem, useFinanceiroAReceberHorizonte,
  useFinanceiroAPagarHorizonte, useFinanceiroPagoMensal,
  useFinanceiroReceitaCategoriaPeriodo, useFinanceiroDespesaCategoriaPeriodo,
  useLojaReceitaPeriodo, useLojaReceitaTotalMes, useLojaReceitaConsolidada,
  useLojaSerie, useLojaKpisAno, useLojaKpisPeriodo,
  useLojaProdutosVendidosMes, useLojaEstoque, useLojaPerformanceCurso,
  useMarketingResumoMensal, useMarketingDesempenho, useMarketingOrigemVendas,
  useMarketingAtribuicao,
  usePedagogicoKpis, usePedagogicoPresencaKpis, usePedagogicoPresencaTempo,
  usePedagogicoRecompraCurso, usePedagogicoPresencaCurso,
  usePedagogicoMaestrosCompleto, usePedagogicoMaestrosKpis, usePedagogicoMaestroAnotacoes,
  usePedagogicoRetencaoCasos, usePedagogicoRetencao, usePedagogicoRetencaoMotivos,
  usePedagogicoPainel,
  useVendaFaturamentoDesde, useFinanceiroRecebidoMensal,
  useMarketingInvestimento, useLojaMetaRealizado,
  useExecutivoReativacao, useExecutivoComercial30d,
  useTurmaDim, useTurmaSugestao, useFilaTurma, useEnviosTurma,
  useTurmasCadastro, useTurmaInscritosResumo, useTurmaInscritos, dispararTurma, marcarResposta,
  useCarteira, usePerfisVisiveis, criarEvento, salvarPerguntas,
  useEventos, useEventoNps, useEventoNotas, useEventoTextos, useEventoPerguntas, definirStatusCarteira,
  salvarMaestroAnotacao, salvarRetencao, salvarTurma,
  useEventosDesempenho,
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
  { key: "pedagogico", nome: "Pedagógico", Icone: GraduationCap, desc: "Turmas, matrículas e conclusão" },
  /* A Central é operação, não setor: quem enxerga é quem tem o setor
     'pedagogico'. `setor` existe só por isso — nos outros, a chave já é o
     próprio setor. */
  { key: "central", setor: "pedagogico", nome: "Central Pedagógica", Icone: ClipboardList, desc: "Operação: turmas, represados e presença" },
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
        {c.consultora}
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
function ChipKpi({ Icone, label, valor, unidade, delta, up, nota, hero, compacto, sub }) {
  return (
    <div style={{
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
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: compacto ? 10 : 11, color: C.muted, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: compacto ? 5 : 7, flexWrap: "wrap" }}>
          <span style={{ fontFamily: GROTESK, fontSize: compacto ? 18 : 22, fontWeight: 700, letterSpacing: "-.5px", color: hero ? C.gold : C.text }}>
            {valor}
            {unidade && <span style={{ fontSize: compacto ? 11 : 12, color: C.muted, fontWeight: 600 }}> {unidade}</span>}
          </span>
          {delta != null
            ? <span style={{ fontSize: compacto ? 10 : 11, fontWeight: 800, color: up ? C.up : C.down }}>{up ? "▲" : "▼"} {String(delta).replace(/[+-]/, "")}</span>
            : nota && <span style={{ fontSize: compacto ? 9.5 : 11, fontWeight: 800, color: C.muted }}>{nota}</span>}
        </div>
        {/* Linha secundária opcional (ex.: líquido abaixo do bruto). Sem
            `sub`, o chip renderiza igual a antes. */}
        {sub && <div style={{ fontSize: compacto ? 9.5 : 10.5, color: C.faint, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
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
function BarrasCategoria({ reais, orfas, semVinc, cobertura }) {
  const max = Math.max(...reais.map((r) => r.unidade), 1);
  const barra = (r, i) => (
    <div key={r.categoria}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: r.orfa ? C.faint : C.bright, fontStyle: r.orfa ? "italic" : "normal", display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.categoria}>{r.categoria}</span>
          {r.repasse > 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", color: C.warn, background: `${C.warn}24`, border: `1px solid ${C.warn}4d`, padding: "1px 6px", borderRadius: 5, flexShrink: 0 }}>50/50</span>
          )}
        </span>
        <span style={{ fontFamily: GROTESK, fontSize: 13, fontWeight: 700, flexShrink: 0, color: r.orfa ? C.faint : (i === 0 ? C.gold : C.text) }}>{moeda(r.unidade)}</span>
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
function LinhaEvolucao({ serie, cor = C.gold, idGrad = "fillEvol", inverso = false, formatar = moeda, mostrarNota = true, rotularParcial = true, meta = null, metaLabel = "meta", rotularVar = true, soDestaques = false, yRedondo = false }) {
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
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
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
const mesCurto = (ym) => {
  const d = new Date(ym + "-01T00:00:00");
  const s = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const AZUL_ANTERIOR = "#6BA8E5";

/* Evolução do faturamento: barras do período + linha do MESMO PERÍODO do
   ano anterior. A linha é comparação histórica, não meta — não existe meta
   no banco, e pintar uma referência como meta seria inventar cobrança. */
function BarrasEvolucao({ serie, anoAnterior }) {
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
            <text x={cx(i)} y={y(s.valor) - 6} fontSize="10" fontWeight="700" textAnchor="middle"
              fill={s.parcial ? C.faint : C.bright} fontFamily={GROTESK}>
              {compacto(s.valor)}
            </text>
          </g>
        ))}

        {temAnterior && (
          <>
            <polyline points={ptsAnt.map((p) => p.join(",")).join(" ")} fill="none"
              stroke={AZUL_ANTERIOR} strokeWidth="1.6" strokeDasharray="5 4" strokeLinecap="round" />
            {ptsAnt.map(([x0, y0], i) => <circle key={i} cx={x0} cy={y0} r="2" fill={AZUL_ANTERIOR} />)}
          </>
        )}

        {serie.map((s, i) => (
          <text key={s.mes} x={cx(i)} y={H - 9} fontSize="10.5" textAnchor="middle" fill={C.faint} fontFamily={SANS}>
            {mesCurto(s.mes)}
          </text>
        ))}
      </svg>

      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>
        Último mês tracejado = <b style={{ color: C.muted }}>parcial</b> (em andamento).
        {temAnterior
          ? <> Linha azul = mesmo período de {anoAnterior} — <b style={{ color: C.muted }}>não é meta</b>.</>
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
            {mesCurto(s.mes)}
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
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, lineHeight: 1.5 }}>Só CisPay — a Stone ainda não está integrada. Não é o caixa total.</div>
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

/* Receita comercial dos últimos 30 dias por consultora — a MESMA base sustenta o
   alerta de concentração e o card Top 3 (o % tem que bater). Regras do dado
   (task da diretoria): só tipo_matricula de venda real; receita = MAX(valor) por
   original_id_venda (somar cru infla ~77% por causa das parcelas); agrupa por
   consultor_id, que já traz o NOME. Concentração = líder ÷ total. */
const TIPOS_MATRICULA_VENDA = ["Matrícula", "COMPRADOR DE VAGAS", "MAT. RETROATIVA"];
const rankConsultoras30d = (rows) => {
  const arr = (rows ?? []).filter((r) => TIPOS_MATRICULA_VENDA.includes(String(r.tipo_matricula)));
  const maxVenda = new Map(), consVenda = new Map();
  for (const r of arr) {
    const k = String(r.original_id_venda), v = Number(r.valor ?? 0);
    maxVenda.set(k, Math.max(maxVenda.get(k) ?? -Infinity, v));
    if (!consVenda.has(k)) consVenda.set(k, r.consultor_id);
  }
  const porCons = new Map();
  for (const [venda, v] of maxVenda) {
    const c = consVenda.get(venda) ?? "—";
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
  const cons30 = useExecutivoComercial30d(desde30);
  const comMensal = useComercialGeralMensal();
  const recMensal = useFinanceiroRecebidoMensal();
  const mktInv = useMarketingInvestimento();
  const mktAtr = useMarketingAtribuicao();
  const pedK = usePedagogicoKpis();
  const pedP = usePedagogicoPresencaKpis();

  const inad = useMemo(() => inadimplenciaResumo(inadimp.data, recMensal.data), [inadimp.data, recMensal.data]);
  const lojaRow = useMemo(() => (lojaMeta.data ?? []).find((r) => noMesYM(r.mes_ref, ym)), [lojaMeta.data, ym]);
  const lojaAbaixo = lojaRow && String(lojaRow.nivel_atingido ?? "").trim().toLowerCase() === "abaixo";
  const reativacao = useMemo(() => resumoReativacao(reativ.data), [reativ.data]);
  const consultoras = useMemo(() => rankConsultoras30d(cons30.data), [cons30.data]);

  /* Bloco 2 — radar. Status de integração saiu daqui: saúde de API é assunto da
     Central de APIs, não decisão de diretoria. No lugar, dois alertas de
     NEGÓCIO: reativação pedagógica (dinheiro parado, sempre visível) e
     concentração comercial (risco — só aparece se a líder passar de 40%). */
  const alertas = [
    ...(reativacao.temDados && reativacao.alunos > 0 ? [{ cor: C.warn, Icone: PhoneCall, titulo: "Reativação pedagógica", valor: moeda(reativacao.valor), sub: `${numero(reativacao.alunos)} compraram e não compareceram` }] : []),
    ...(inad.valor > 0 ? [{ cor: C.warn, Icone: AlertTriangle, titulo: "Inadimplência acumulada", valor: moeda(inad.valor), sub: `${numero(inad.parcelas)} parcelas vencidas` }] : []),
    ...(lojaAbaixo ? [{ cor: C.down, Icone: ShoppingBag, titulo: "Loja abaixo da meta", valor: fmtPct(lojaRow.pct_minima), sub: "da meta mínima" }] : []),
    ...(consultoras.concentracao != null && consultoras.concentracao > 40 ? [{ cor: C.down, Icone: AlertTriangle, titulo: "Concentração comercial", valor: `${Math.round(consultoras.concentracao)}%`, sub: `da receita de 30 dias em ${consultoras.lider ? primeiroNome(consultoras.lider) : "1 consultora"}` }] : []),
  ];

  /* Bloco 3 — cards por setor (mês corrente). O faturamento do card Comercial
     sai da MESMA fonte canônica do topo (não da soma por mês de pagamento, que
     é caixa e mostrava outro número na mesma tela). As matrículas a view
     canônica não tem — vêm do consolidado, recortadas pelo mesmo critério
     (aprovação), porque comprador de vaga é receita mas não é aluno. */
  const com = useMemo(() => {
    const linhaMes = (fatMensal.data ?? []).find((r) => noMesYM(r.mes, ym));
    const mat = (comMensal.data ?? [])
      .filter((r) => noMesYM(r.data_aprovacao ?? r.data, ym))
      .reduce((s, r) => s + Number(r.conta_matricula ?? 0), 0);
    return { fat: Number(linhaMes?.faturamento_bruto ?? 0), mat };
  }, [fatMensal.data, comMensal.data, ym]);
  const recebido = useMemo(() => recebidoMaisRecente(recMensal.data, ym), [recMensal.data, ym]);
  const investMes = useMemo(() => (mktInv.data ?? []).filter((r) => noMesYM(r.mes, ym)).reduce((s, r) => s + Number(r.gasto ?? 0), 0), [mktInv.data, ym]);
  const retornoMes = useMemo(() => (mktAtr.data ?? []).filter((r) => noMesYM(r.mes, ym)).reduce((s, r) => s + Number(r.faturamento_atribuido ?? 0), 0), [mktAtr.data, ym]);
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
          estado={{ carregando: fatMensal.isLoading, erro: fatMensal.error }}
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
          linhas={[{ label: "investimento", valor: moeda(investMes) }, { label: "retorno atribuído", valor: moeda(retornoMes), cor: C.up }]}
          nota="atribuição parcial — só vendas com origem confirmada" />
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
  const { inicio, fim, rotulo, modo } = usePeriodo();
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
    const somaM = (ls) => ls.reduce((s, r) => s + Number(r.conta_matricula ?? 0), 0);
    const dentro = recorte(linhasFluxo, { inicio, fim }, "data");
    const menosUmAno = (d) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    const faixaAnt = { inicio: menosUmAno(inicio), fim: menosUmAno(fim) };
    const antes = recorte(linhasFluxo, faixaAnt, "data");
    // No Geral, o valor sai da fonte canônica (mesmo número do Hub Executivo);
    // nas categorias e nos recortes curtos, do somatório por aprovação.
    const bruto = somaCanonica({ inicio, fim }) ?? somaB(dentro);
    const brutoAnt = somaCanonica(faixaAnt) ?? somaB(antes);
    const matriculas = somaM(dentro);
    return {
      receita: bruto,
      matriculas,
      ticket: matriculas ? bruto / matriculas : null,
      yoy: brutoAnt > 0 ? ((bruto - brutoAnt) / brutoAnt) * 100 : null,
    };
  }, [linhasFluxo, inicio, fim, canonPorMes, ehGeral, curto]);

  /* Evolução: últimos 12 meses da categoria + o mesmo mês do ano anterior.
     Não responde ao filtro de período — é série histórica, como nos outros
     hubs. O mês corrente é parcial. */
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
    return Array.from({ length: 12 }, (_, k) => {
      const d = new Date(h.getFullYear(), h.getMonth() - (11 - k), 1);
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
    const origem = ehGeral
      ? (geralMensal.data ?? [])
      : (matfat.data ?? []).filter((r) => String(r.categoria) === categoria);
    const dentro = recorte(origem, { inicio, fim }, "data");
    const m = new Map();
    for (const r of dentro) {
      const k = String(r.data_aprovacao ?? r.data ?? r.mes ?? "").slice(0, 7);
      if (!k) continue;
      const a = m.get(k) ?? { mes: k, matriculas: 0, faturamento: 0 };
      a.matriculas += Number(r.conta_matricula ?? 0); // soma conta_matricula, não conta linha
      a.faturamento += Number(r.valor_bruto ?? 0);     // Comercial = bruto
      m.set(k, a);
    }
    const h = new Date();
    const atual = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes))
      .map((x) => ({
        ...x,
        faturamento: (ehGeral && canonPorMes.has(x.mes)) ? canonPorMes.get(x.mes) : x.faturamento,
        parcial: x.mes === atual,
      }));
  }, [matfat.data, geralMensal.data, categoria, inicio, fim, ehSympla, ehGeral, canonPorMes]);

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
        <ChipKpi compacto hero Icone={Wallet}
          label={ehSympla ? "Receita · Sympla" : "Faturamento bruto · valor vendido"}
          valor={ehSympla ? moeda(podio[0]?.receita ?? 0) : moeda(kpi.receita)}
          nota={ehSympla ? "líquida · todos os tempos" : `${rotulo} · por aprovação`} />
        <ChipKpi compacto Icone={Receipt} label={ehSympla ? "Ingressos" : "Total de matrículas"}
          valor={ehSympla ? numero(sympla.data?.[0]?.ingressos ?? 0) : numero(kpi.matriculas)}
          nota={ehSympla ? `${numero(sympla.data?.[0]?.eventos ?? 0)} eventos` : rotulo} />
        <ChipKpi compacto Icone={TrendingUp} label="Ticket médio"
          valor={ehSympla ? "—" : (kpi.ticket != null ? moeda(kpi.ticket) : "—")}
          nota={ehSympla ? "não medível no Sympla" : "receita ÷ matrículas"} />
        <ChipKpi compacto Icone={TrendingUp} label="vs. ano anterior"
          valor={kpi.yoy != null ? `${kpi.yoy >= 0 ? "+" : ""}${kpi.yoy.toFixed(0)}%` : "—"}
          delta={kpi.yoy != null ? `${Math.abs(kpi.yoy).toFixed(0)}%` : null}
          up={kpi.yoy >= 0}
          nota={kpi.yoy == null ? `sem base de ${anoAnterior}` : `vs. ${anoAnterior}`} />
        {/* Não existe meta no banco — chip fica honesto em vez de inventar. */}
        <ChipKpi compacto Icone={Clock} label="% da meta" valor="—" nota="EM BREVE · sem metas" />
        {/* A ponte lead→venda não é confiável — não dá pra medir conversão. */}
        <ChipKpi compacto Icone={Clock} label="Taxa de conversão" valor="—" nota="EM BREVE · não medível" />
      </div>

      {/* Evolução à esquerda, consultoras à direita — cabe numa tela de TV. */}
      <div className="gridCom">
        <div>
        <Bloco titulo="Evolução do faturamento" canto={`${rotuloCat(categoria)} · 12 meses`}>
          <Estado
            carregando={carregFluxo}
            erro={erroFluxo}
            vazio={ehSympla || !linhasFluxo.length}
            vazioTitulo={ehSympla ? "Sympla não tem série mensal" : undefined}
            vazioDica={ehSympla ? "A view do Sympla é agregada e não traz data — sem dimensão temporal, não há evolução mensal honesta a mostrar." : undefined}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4, fontSize: 10.5, color: C.muted, fontWeight: 600 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: `linear-gradient(150deg, ${C.goldTop}, ${C.goldBase})` }} /> Período
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 13, height: 0, borderTop: `2px dashed ${AZUL_ANTERIOR}` }} /> Mesmo período {anoAnterior}
              </span>
            </div>
            <BarrasEvolucao serie={evolucao} anoAnterior={anoAnterior} />
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
                  <Lista
                    linhas={podio.slice(3).map((c) => ({ rotulo: c.consultora, valor: c.receita, orfa: c.atual === false }))}
                    top={4}
                  />
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
  const pag = useFinanceiroPagamentos();
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
    const rows = recorte.map((r) => ({
      categoria: ehSemVinculo(r.categoria) ? "Sem vínculo" : (r.categoria ?? "—"),
      vendas: Number(r.vendas ?? 0),
      bruto: Number(r.receita_bruta ?? 0),
      unidade: Number(r.receita_unidade ?? 0),
      repasse: Number(r.repasse ?? 0),
      orfa: ehSemVinculo(r.categoria),
    }));
    const reais = rows.filter((r) => !r.orfa).sort((a, b) => b.unidade - a.unidade);
    const orfas = rows.filter((r) => r.orfa);
    const total = rows.reduce((s, r) => s + r.unidade, 0);
    const vendasTot = rows.reduce((s, r) => s + r.vendas, 0);
    const semVinc = orfas.reduce((s, r) => s + r.unidade, 0);
    return { reais, orfas, total, vendasTot, semVinc, cobertura: total ? ((total - semVinc) / total) * 100 : null };
  }, [recCat.data, inicio, fim]);

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
    const linhas = (pag.data ?? []).filter((r) => r.ano != null && Number(r.matriculas ?? 0) > 0);
    const anos = [...new Set(linhas.map((r) => Number(r.ano)))].sort((a, b) => b - a);
    const selecionado = Number(String(inicio).slice(0, 4));
    const ano = anos.includes(selecionado) ? selecionado : (anos[0] ?? null);
    return {
      ano,
      recente: somar(ano != null ? linhas.filter((r) => Number(r.ano) === ano) : []),
      // `foraDoFiltro` avisa quando caiu no fallback: o painel não pode dizer
      // "2024" mostrando 2026 sem que ninguém perceba.
      foraDoFiltro: ano != null && ano !== selecionado,
    };
  }, [pag.data, inicio]);
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

  // Formas de pagamento. Contrato confirmado da view: { forma, receita }.
  const formas = useMemo(() => {
    return (fpag.data ?? [])
      .map((r) => ({ rotulo: r.forma ?? "—", valor: Number(r.receita ?? 0) }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .map((f, i) => ({ ...f, cor: PALETA_FORMAS[i % PALETA_FORMAS.length] }));
  }, [fpag.data]);

  // Evolução mensal da receita (Salesforce). Mês corrente sai parcial.
  const evolucao = useMemo(() => serieMensal(recMensal.data, "receita"), [recMensal.data]);

  // Caixa CisPay. Contrato: { mes, caixa }. View pode não existir ainda.
  const caixaSerie = useMemo(() => serieMensal(caixaMensal.data, "caixa"), [caixaMensal.data]);

  /* ---- Inadimplência (Conta Azul) ---- */
  const vencidos = useMemo(
    () => (inadOrig.data ?? [])
      .map((r) => ({ rotulo: String(r.origem ?? "—"), valor: Number(r.valor_vencido ?? 0) }))
      .filter((r) => r.valor > 0)
      .sort((a, b) => b.valor - a.valor),
    [inadOrig.data]
  );
  const vencidoTot = vencidos.reduce((s, r) => s + r.valor, 0);
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

  return (
    <>
      {/* Faixa de KPIs compactos — âncora dourada + 4 métricas do mês */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <ChipKpi hero Icone={Wallet} label="Receita reconhecida" valor={moeda(categorias.total)} nota={rotulo} />
        {/* Qualidade do dado do PERÍODO selecionado — trocar o ano troca o
            número (2026: 0% · 2024: 8,8% · 2023: 13,3%). Sem média histórica:
            somar tudo escondia que o buraco é passivo antigo, já corrigido.
            "Vendas", não "pagamentos": a view deduplica por original_id_venda
            antes de contar, então a unidade é a venda, não a linha de
            pagamento (uma venda parcelada é uma só aqui). */}
        <ChipKpi Icone={Clock} label="Vendas sem status" valor={semStatus.pct != null ? semStatus.pct.toFixed(1) : "—"} unidade="%"
          nota={rotulo}
          sub={semStatus.sub} />
        <ChipKpi Icone={AlertTriangle} label="Em aberto" valor={pagTot.pctEmAberto != null ? pagTot.pctEmAberto.toFixed(1) : "—"} unidade="%"
          nota={pagPorAno.ano ? String(pagPorAno.ano) : "—"} />
        <ChipKpi Icone={Receipt} label="Ticket médio" valor={ticket != null ? moeda(ticket) : "—"} nota={rotulo} />
        <ChipKpi Icone={Hourglass} label="A receber" valor={moeda(aReceber)} nota="CisPay · posição atual" />
        <ChipKpi Icone={Receipt} label={recebido ? `Recebido em ${dataCurta(recebido.mes)}` : "Recebido"}
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
            <BarrasCategoria reais={categorias.reais} orfas={categorias.orfas} semVinc={categorias.semVinc} cobertura={categorias.cobertura} />
          </Estado>
        </Bloco>

        <Bloco titulo="Status de pagamento"
          canto={pagTot.tot ? `${pagPorAno.ano ?? ""} · ${pctPagoCentro}% pago` : null} altura={ALTURA_PAINEL}>
          <Estado carregando={pag.isLoading} erro={pag.error} vazio={!pagTot.tot}>
            <Donut segmentos={statusSeg} centroValor={`${pctPagoCentro}%`} centroLabel="pago" centroCor={C.up} />
            {/* O rodapé só alarma se ainda houver buraco NO ANO exibido.
                Resolvido, vira o contrário: registra que o dado do ano está
                íntegro, pra ninguém desconfiar da inadimplência. Nada de
                percentual histórico aqui — quem responde por período é o chip
                "Sem status" acima, e dois números diferentes na mesma tela é
                exatamente o que confunde. */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.hair}` }}>
              {pagTot.sem > 0 ? (
                <>
                  <AlertTriangle size={12} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
                    {pagTot.pctSem != null ? `${pagTot.pctSem.toFixed(1)}% sem status` : "Parte sem status"} em {pagPorAno.ano} — Stone/legado batido a mão. <b style={{ color: C.muted }}>Não é inadimplência.</b>
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck size={12} style={{ color: C.up, marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
                    Todas as matrículas de {pagPorAno.ano} vêm com status (sync CisPay).
                  </span>
                </>
              )}
              {/* Ano só por ano: se o filtro é um mês/ano que a fonte do donut
                  não tem, o painel diz de onde veio em vez de fingir. */}
            </div>
            {pagPorAno.foraDoFiltro && (
              <div style={{ fontSize: 10, color: C.dim, marginTop: 6 }}>
                sem base em {String(inicio).slice(0, 4)} — mostrando {pagPorAno.ano}
              </div>
            )}
          </Estado>
        </Bloco>

        <Bloco titulo="Caixa recebido" canto="mês · CisPay" altura={ALTURA_PAINEL}>
          <CaixaCard serie={caixaSerie} semFonte={caixaSemFonte} />
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
            <LinhaEvolucao serie={evolucao} />
          )}
        </Bloco>

        <Bloco titulo="Formas de pagamento" canto="acumulado" altura={ALTURA_PAINEL}>
          <Estado carregando={fpag.isLoading} erro={fpag.error} vazio={!formas.length}>
            <Donut segmentos={formas} size={118} centroSize={17} centroValor={formas[0] ? abreviaForma(formas[0].rotulo) : "—"} centroLabel={`${leaderPct}% líder`} centroCor={C.gold} />
          </Estado>
        </Bloco>
      </div>

      {/* ============ INADIMPLÊNCIA ============ */}
      <SecaoTitulo titulo="Inadimplência acumulada"
        canto={`${inad.parcelas ? `${numero(inad.parcelas)} parcelas · ${moeda(inad.valor)}${inad.pct != null ? ` · ${inad.pct.toFixed(1).replace(".", ",")}% da carteira` : ""} · ` : ""}posição atual · não muda com o período · nunca somado à receita`} />
      <div className="finRow2">
        <Bloco titulo="Vencidos por origem" canto={vencidoTot ? moeda(vencidoTot) + " vencido" : null} sem altura={ALTURA_PAINEL}>
          <Estado carregando={inadOrig.isLoading} erro={inadOrig.error} vazio={!vencidos.length}>
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
          <LinhaEvolucao serie={evolDespesa} cor={C.down} idGrad="fillDesp" inverso />
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

function HubMarketing() {
  const per = usePeriodo();
  const resumo = useMarketingResumoMensal();
  const desemp = useMarketingDesempenho();
  const canais = useMarketingOrigemVendas();
  const atrib = useMarketingAtribuicao();
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

/* Rótulo de trimestre defensivo: `periodo` pode vir "2024-Q3", "2024-T3",
   "2024-3" ou "2024-07" (mês). YYYY-MM vira o trimestre do mês; o resto usa o
   dígito 1–4 do fim. Sem casar, mostra o texto cru — nunca inventa. */
const rotuloTri = (p) => {
  const s = String(p ?? "").trim();
  const mm = s.match(/^(\d{4})-(\d{2})$/);
  if (mm) return `T${Math.floor((Number(mm[2]) - 1) / 3) + 1}/${mm[1].slice(2)}`;
  const q = s.match(/(\d{4}).*?([1-4])\s*$/);
  if (q) return `T${q[2]}/${q[1].slice(2)}`;
  return s || "—";
};

/* Linha da taxa de comparecimento por trimestre. Pontos com amostra pequena
   (poucas matrículas) saem VAZADOS e cinza e NÃO entram na linha nem no
   domínio Y — o início de 2022 e trimestres esparsos não distorcem a leitura.
   Não reusa LinhaEvolucao: ali a série é mensal e a área liga buracos; aqui a
   amostra pequena é espalhada. */
function LinhaPresenca({ serie }) {
  if (serie.length < 2) return <Estado vazio vazioTitulo="Série insuficiente" vazioDica="Poucos trimestres com presença medida para desenhar a linha." />;
  const W = 720, H = 196, padL = 40, padR = 14, padT = 20, padB = 30;
  const plotW = W - padL - padR, plotH = H - padT - padB, plotBottom = padT + plotH;
  const n = serie.length;
  const base = (serie.some((p) => !p.pequena) ? serie.filter((p) => !p.pequena) : serie).map((p) => p.taxa);
  let vMax = Math.min(100, Math.ceil((Math.max(...base) + 6) / 5) * 5);
  let vMin = Math.max(0, Math.floor((Math.min(...base) - 6) / 5) * 5);
  if (vMax <= vMin) vMax = Math.min(100, vMin + 10);
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const y = (v) => Math.max(padT, Math.min(plotBottom, plotBottom - ((v - vMin) / (vMax - vMin || 1)) * plotH));
  const confIdx = serie.map((_, i) => i).filter((i) => !serie[i].pequena);
  const linha = confIdx.map((i) => `${x(i)},${y(serie[i].taxa)}`).join(" ");
  const yticks = [vMin, Math.round((vMin + vMax) / 2), vMax];
  const passo = Math.max(1, Math.round((n - 1) / 5));
  const xi = [];
  for (let i = 0; i < n; i += passo) xi.push(i);
  if (xi.at(-1) !== n - 1) xi.push(n - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {yticks.map((v, i) => {
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="rgba(255,255,255,.06)" />
            <text x={padL - 8} y={yy + 3.5} fontSize="10.5" textAnchor="end" fill={C.faint} fontFamily={SANS}>{v}%</text>
          </g>
        );
      })}
      {confIdx.length > 1 && <polyline points={linha} fill="none" stroke={C.up} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {serie.map((p, i) => (p.pequena
        ? <circle key={i} cx={x(i)} cy={y(p.taxa)} r="2.6" fill="none" stroke={C.faint} strokeWidth="1.2" />
        : <circle key={i} cx={x(i)} cy={y(p.taxa)} r="2.8" fill={C.up} />))}
      {xi.map((i) => (
        <text key={i} x={x(i)} y={H - 9} fontSize="10" textAnchor="middle" fill={C.faint} fontFamily={SANS}>{serie[i].rotulo}</text>
      ))}
    </svg>
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
const corDias = (n) => { if (n == null) return C.faint; const v = Number(n); return v <= 10 ? C.down : v <= 20 ? C.gold : C.faint; };
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

// Tabela das turmas do painel. Clique na linha (ou em "colar link") abre o
// drawer da turma (bloco 2).
function TabelaConfirmacoes({ turmas, onAbrir }) {
  const th = (txt, alin) => <th style={{ textAlign: alin, padding: "8px 12px", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim, whiteSpace: "nowrap" }}>{txt}</th>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SANS }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.hair}` }}>
            {th("Turma", "left")}{th("Início", "left")}{th("Matr.", "right")}{th("Enviadas", "right")}{th("Confirmaram", "right")}{th("Grupo", "left")}{th("Pendência", "left")}
          </tr>
        </thead>
        <tbody>
          {turmas.map((t) => {
            const cd = corDias(t.dias_para_inicio);
            return (
              <tr key={t.turma_id} onClick={() => onAbrir(t)} style={{ borderBottom: `1px solid ${C.hair}`, cursor: "pointer" }}>
                <td style={{ padding: "9px 12px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.bright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }} title={t.curso}>{t.curso}</div>
                </td>
                <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{dataDDMM(t.data_inicio)}</span>
                  <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 800, padding: "1px 7px", borderRadius: 999, color: cd, background: `${cd}1A`, border: `1px solid ${cd}44` }}>{emNDias(t.dias_para_inicio)}</span>
                </td>
                <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: GROTESK, fontSize: 12.5, color: C.text }}>{numero(t.matriculados)}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: GROTESK, fontSize: 12.5, color: C.text }}>{numero(t.confirmacao_enviada)}</td>
                <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: GROTESK, fontSize: 12.5, color: C.up }}>{numero(t.confirmaram)}</td>
                <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                  {t.grupo_criado
                    ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.up, fontWeight: 700 }}><Check size={13} /> criado</span>
                    : <span onClick={(e) => { e.stopPropagation(); onAbrir(t, "link"); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: C.gold, cursor: "pointer", padding: "3px 9px", borderRadius: 8, border: `1px solid ${C.gold}55`, background: `${C.gold}14` }}><Link2 size={12} /> colar link</span>}
                </td>
                <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                  {t.pendencia ? <span style={{ fontSize: 11, fontWeight: 700, color: corPendencia(t.pendencia) }}>{t.pendencia}</span> : <span style={{ color: C.faint }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---- Bloco 2 da automação: o DRAWER da turma ---- */

// CPF mascarado ***.456.789-** — esconde os 3 primeiros e os 2 últimos dígitos.
const mascaraCpf = (cpf) => {
  const d = String(cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return String(cpf ?? "").trim() || "—";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
};

// Une a fila (pendentes, com nome) e os envios (só CPF, com status real) de uma
// turma numa lista por aluno. O envio manda no status; a fila completa o nome e
// os dados de contato, e marca quem ainda está "pendente".
const montaAlunos = (fila, envios) => {
  const porAluno = new Map();
  for (const e of envios ?? []) {
    porAluno.set(String(e.aluno_id), { aluno_id: e.aluno_id, nome: null, canal: e.canal, status: e.status, erro_msg: e.erro_msg, telefone_invalido: false, telefone_bruto: null });
  }
  for (const f of fila ?? []) {
    const k = String(f.aluno_id);
    const ja = porAluno.get(k);
    if (ja) { if (!ja.nome) ja.nome = f.nome; if (ja.canal == null) ja.canal = f.canal; ja.telefone_invalido = f.telefone_invalido === true; ja.telefone_bruto = f.telefone_bruto; }
    else porAluno.set(k, { aluno_id: f.aluno_id, nome: f.nome ?? null, canal: f.canal, status: "pendente", erro_msg: null, telefone_invalido: f.telefone_invalido === true, telefone_bruto: f.telefone_bruto });
  }
  return [...porAluno.values()];
};

// Exceções que travam o envio (sub-bloco com contagem): sem canal de contato,
// telefone inválido, erro no disparo.
const exceptionsAlunos = (alunos) => {
  const semContato = (alunos ?? []).filter((a) => String(a.canal ?? "").trim().toLowerCase() === "sem_contato");
  const telInvalido = (alunos ?? []).filter((a) => a.telefone_invalido === true);
  const erros = (alunos ?? []).filter((a) => String(a.status ?? "").trim().toLowerCase() === "erro");
  return { semContato, telInvalido, erros, total: semContato.length + telInvalido.length + erros.length };
};

const LINK_GRUPO_PREFIXO = "https://chat.whatsapp.com/";
const linkGrupoValido = (v) => { const s = String(v ?? "").trim(); return s === "" || s.startsWith(LINK_GRUPO_PREFIXO); };
// 403 / RLS: NÃO contornar — mensagem clara e para por aqui.
const semPermissao = (e) => e?.code === "42501" || e?.status === 403 || e?.status === 401 || /permission denied|row-level security|not authorized|violates row-level/i.test(String(e?.message ?? ""));

const CHIP_STATUS = { pendente: C.warn, erro: C.down, enviado: C.up, confirmado: C.up, ok: C.up, sucesso: C.up, sem_contato: C.faint };
const corChipStatus = (s) => CHIP_STATUS[String(s ?? "").trim().toLowerCase()] ?? C.muted;

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

// Lista de alunos da turma (fila + envios) + sub-bloco de exceções.
function ListaAlunosTurma({ alunos, exc, estado }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim }}>Alunos</span>
        {!estado.carregando && !estado.erro && <span style={{ fontSize: 11, color: C.faint }}>{numero(alunos.length)} no total</span>}
      </div>
      {estado.carregando ? <div style={{ fontSize: 12, color: C.faint, padding: "8px 0" }}>Carregando…</div>
        : estado.erro ? <div style={{ fontSize: 12, color: C.down, padding: "8px 0" }}>{semPermissao(estado.erro) ? "Sem permissão para ver a lista de alunos." : "Não foi possível carregar a lista."}</div>
          : !alunos.length ? <div style={{ fontSize: 12, color: C.faint, padding: "8px 0" }}>Nenhum aluno na fila ou enviado ainda.</div>
            : (
              <>
                {exc.total > 0 && (
                  <div style={{ background: `${C.warn}0E`, border: `1px solid ${C.warn}3A`, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                      <AlertTriangle size={13} style={{ color: C.warn }} />
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.warn }}>Exceções · {numero(exc.total)}</span>
                    </div>
                    {exc.semContato.length > 0 && <div style={{ fontSize: 11, color: C.muted }}><b style={{ color: C.text }}>{numero(exc.semContato.length)}</b> sem canal de contato</div>}
                    {exc.telInvalido.length > 0 && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                        <b style={{ color: C.text }}>{numero(exc.telInvalido.length)}</b> com telefone inválido
                        {exc.telInvalido.some((a) => a.telefone_bruto) ? <span style={{ color: C.faint }}>: {exc.telInvalido.map((a) => a.telefone_bruto).filter(Boolean).slice(0, 6).join(", ")}</span> : null}
                      </div>
                    )}
                    {exc.erros.length > 0 && (
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                        <b style={{ color: C.down }}>{numero(exc.erros.length)}</b> com erro no envio
                        {exc.erros.slice(0, 5).map((a, i) => (
                          <div key={i} style={{ fontSize: 10.5, color: C.faint, marginLeft: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {a.nome || mascaraCpf(a.aluno_id)}: {a.erro_msg || "erro"}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="rolagem" style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${C.hair}`, borderRadius: 10 }}>
                  {alunos.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 11px", borderBottom: i < alunos.length - 1 ? `1px solid ${C.hair}` : "none" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome || mascaraCpf(a.aluno_id)}</div>
                        <div style={{ fontSize: 10, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.canal || "—"}{a.erro_msg ? ` · ${a.erro_msg}` : ""}</div>
                      </div>
                      <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, color: corChipStatus(a.status), background: `${corChipStatus(a.status)}1A`, border: `1px solid ${corChipStatus(a.status)}44`, whiteSpace: "nowrap", flexShrink: 0 }}>{a.status || "—"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
    </div>
  );
}

/* Orquestra o drawer: carrega a dim_turmas da turma, a sugestão (última de
   mesma sigla) e as listas (fila + envios). O form só monta quando a sugestão
   resolve, pra pré-preencher os campos vazios de uma vez. */
function DrawerTurma({ turma, aguardando, onFechar, onSalvo, notificar }) {
  const dim = useTurmaDim(turma.turma_id);
  const sug = useTurmaSugestao(dim.data?.sigla, dim.data?.data_inicio, turma.turma_id);
  const fila = useFilaTurma(turma.turma_id);
  const envios = useEnviosTurma(turma.turma_id);
  const alunos = useMemo(() => montaAlunos(fila.data, envios.data), [fila.data, envios.data]);
  const exc = useMemo(() => exceptionsAlunos(alunos), [alunos]);
  const d = dim.data;
  const prontoForm = !!d && !sug.isLoading;
  const sub = d ? [d.data_inicio ? `início ${dataDDMM(d.data_inicio)}` : null, d.cidade].filter(Boolean).join(" · ") : "carregando…";
  return (
    <DrawerLado titulo={turma.curso || d?.curso || "Turma"} sub={sub} onFechar={onFechar}>
      {dim.isLoading ? <div style={{ fontSize: 12, color: C.faint, display: "flex", alignItems: "center", gap: 7 }}><Loader2 size={14} className="girar" /> Carregando turma…</div>
        : dim.error ? <div style={{ fontSize: 12.5, color: C.down }}>{semPermissao(dim.error) ? "Você não tem permissão para ver esta turma." : "Não foi possível carregar a turma."}</div>
          : !d ? <div style={{ fontSize: 12.5, color: C.faint }}>Turma não encontrada em dim_turmas.</div>
            : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <CampoLeitura label="Curso" valor={d.curso} />
                  <CampoLeitura label="Cidade" valor={d.cidade} />
                  <CampoLeitura label="Início" valor={dataDDMM(d.data_inicio)} />
                  <CampoLeitura label="Fim" valor={dataDDMM(d.data_fim)} />
                </div>
                {prontoForm
                  ? <FormTurma dim={d} sug={sug.data} aguardando={aguardando} foco={turma.foco} onSalvo={onSalvo} notificar={notificar} />
                  : <div style={{ fontSize: 12, color: C.faint, marginTop: 16, display: "flex", alignItems: "center", gap: 7 }}><Loader2 size={13} className="girar" /> Buscando sugestões…</div>}
                <ListaAlunosTurma alunos={alunos} exc={exc} estado={{ carregando: fila.isLoading || envios.isLoading, erro: fila.error || envios.error }} />
              </>
            )}
    </DrawerLado>
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
const dataBR = (iso) => { const p = String(iso ?? "").slice(0, 10).split("-"); return p[2] ? `${p[2]}/${p[1]}/${p[0]}` : "—"; };

/* Editor das perguntas da Elis — compartilhado pelo cadastro (novo evento) e
   pelo resultado (editar evento existente). `travado` (evento já respondeu):
   fica desabilitado com o motivo na tela — a pessoa vê o porquê, não digita pra
   descobrir o erro só ao salvar. O núcleo aparece só pra leitura. */
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
   medidos (não existem na fonte). Presença cobre só as turmas com
   credenciamento confiável. */
function HubPedagogico() {
  const kpis = usePedagogicoKpis();
  const presKpis = usePedagogicoPresencaKpis();
  const presTempo = usePedagogicoPresencaTempo();
  const recompraCurso = usePedagogicoRecompraCurso();
  const presCurso = usePedagogicoPresencaCurso();
  const maestros = usePedagogicoMaestrosCompleto();
  const maestrosKpis = usePedagogicoMaestrosKpis();
  const anotacoes = usePedagogicoMaestroAnotacoes();
  const retencaoCasos = usePedagogicoRetencaoCasos();
  const retencao = usePedagogicoRetencao();
  const retencaoMotivos = usePedagogicoRetencaoMotivos();
  const painel = usePedagogicoPainel();
  const qc = useQueryClient();
  const [turmaSel, setTurmaSel] = useState(null); // turma aberta no drawer (bloco 2)
  const [toast, setToast] = useState(null);       // feedback de escrita (some sozinho)
  const [statusMaestro, setStatusMaestro] = useState("todos");
  const [maestroEdit, setMaestroEdit] = useState(null); // maestro sendo editado
  const [retEdit, setRetEdit] = useState(null);         // caso de retenção ('novo' | caso | null)

  // Após gravar: recarrega as views afetadas e fecha o modal.
  const aposSalvar = () => { qc.invalidateQueries(); setMaestroEdit(null); setRetEdit(null); };
  // cargo não vem na view _completo — pré-preenche do maestro_anotacao cru.
  const cargoPorCpf = useMemo(() => {
    const m = new Map();
    for (const a of anotacoes.data ?? []) if (a.aluno_id != null) m.set(String(a.aluno_id), a.cargo ?? "");
    return m;
  }, [anotacoes.data]);

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
        rotulo: rotuloTri(r.periodo),
        taxa: pctTaxa(r.taxa_comparecimento),
        amostra: Number(r.matriculas ?? 0),
        pequena: Number(r.matriculas ?? 0) < 30,
      }))
      .sort((a, b) => String(a.rotulo).localeCompare(String(b.rotulo))),
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

  // Maestros (VIP): lista por investido (desc), com filtro por status de
  // validade. Ativos/inativos/média saem da agregação do detalhe (a view de
  // kpis não os traz); os contadores de VALIDADE (válidos/perto/vencidos) vêm
  // da vw_pedagogico_maestros_kpis, mesma fonte do selo por linha.
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

  // Retenção: casos recentes primeiro; motivos por frequência (retidos+cancel).
  const casos = useMemo(() =>
    [...(retencaoCasos.data ?? [])].sort((a, b) => String(b.data_ligacao ?? "").localeCompare(String(a.data_ligacao ?? ""))),
    [retencaoCasos.data]);
  const pendentes = useMemo(() => casos.filter((c) => String(c.desfecho ?? "").trim().toLowerCase() === "pendente").length, [casos]);
  const motivos = useMemo(() =>
    [...(retencaoMotivos.data ?? [])].sort((a, b) => (Number(b.retidos ?? 0) + Number(b.cancelados ?? 0)) - (Number(a.retidos ?? 0) + Number(a.cancelados ?? 0))),
    [retencaoMotivos.data]);
  const ret = retencao.data?.[0] ?? {};

  // Automação de confirmações: derivações do painel (1 linha por turma).
  const turmasPainel = painel.data ?? [];
  const pendencias = useMemo(() => turmasPainel.filter((t) => t.pendencia != null), [turmasPainel]);
  const confKpi = useMemo(() => {
    const fila = turmasPainel.reduce((s, t) => s + Math.max(0, Number(t.matriculados ?? 0) - Number(t.confirmacao_enviada ?? 0)), 0);
    const aguardando = turmasPainel.reduce((s, t) => s + Number(t.aguardando_link_grupo ?? 0), 0);
    const conf = turmasPainel.reduce((s, t) => s + Number(t.confirmaram ?? 0), 0);
    const env = turmasPainel.reduce((s, t) => s + Number(t.confirmacao_enviada ?? 0), 0);
    return { fila, aguardando, taxa: env > 0 ? (conf / env) * 100 : null };
  }, [turmasPainel]);
  // Clique na linha abre o drawer; "colar link" abre com foco no link.
  const abrirTurma = (t, foco = null) => setTurmaSel({ ...t, foco });
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
        .pedKpis, .pedMaestrosKpi { display: grid; grid-template-columns: repeat(2, 1fr); gap: 9px; }
        .pedConfKpis { display: grid; grid-template-columns: 1fr; gap: 9px; }
        .pedBot { display: grid; grid-template-columns: 1fr; gap: 12px; align-items: start; }
        @media (min-width: 720px)  { .pedKpis, .pedMaestrosKpi { grid-template-columns: repeat(4, 1fr); } .pedConfKpis { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1000px) { .pedBot { grid-template-columns: 1fr 1fr; } }  /* fideliza · falta */
      `}</style>

      {/* ---- Faixa de pendências da automação (topo; só se houver) ---- */}
      <FaixaPendencias pendencias={pendencias} onAbrir={abrirTurma} />

      {/* ---- KPIs de saúde ---- */}
      <div className="pedKpis" style={{ marginBottom: 12 }}>
        <ChipKpi compacto hero Icone={Repeat} label="Recompra (grade)" valor={fmtPct(k.taxa_recompra, 1)} nota="cursos CIS + GGB" />
        <ChipKpi compacto Icone={UserCheck} label="Comparecimento" valor={fmtPct(pk.taxa_comparecimento_geral)}
          sub={pk.turmas_cobertas ? `${numero(pk.turmas_cobertas)} turmas credenciadas` : "turmas credenciadas"} />
        <ChipKpi compacto Icone={Users} label="Alunos únicos" valor={k.alunos_unicos != null ? numero(k.alunos_unicos) : "—"} nota="na base" />
        <ChipKpi compacto Icone={BookOpen} label="Cursos por aluno" valor={cursosPorAluno} nota="média" />
      </div>

      {/* ---- Comparecimento no tempo (largura total) ---- */}
      <Bloco titulo="Comparecimento no tempo" canto="taxa por trimestre">
        <Estado carregando={presTempo.isLoading} erro={presTempo.error} vazio={serieTri.length < 2}
          vazioTitulo="Sem série de presença" vazioDica="Aparece com o setor pedagógico conectado.">
          <LinhaPresenca serie={serieTri} />
          {temPequena && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, color: C.faint, marginTop: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", border: `1.2px solid ${C.faint}`, flexShrink: 0 }} />
              trimestres com menos de 30 matrículas — amostra pequena, fora da linha
            </div>
          )}
        </Estado>
      </Bloco>

      {/* ---- Maestros (clientes VIP · compraram MAESTRIA) ---- */}
      <Bloco titulo="Maestros" canto="clientes VIP · MAESTRIA" sem>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.hair}` }}>
          <div className="pedMaestrosKpi">
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
        </div>
        {/* Filtro por status de validade — ajuda a gestora a agir nos que vão vencer. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "10px 20px", borderBottom: `1px solid ${C.hair}` }}>
          <Segmentado label="Validade" valor={statusMaestro} onChange={setStatusMaestro}
            opcoes={[{ key: "todos", label: "Todos" }, { key: "perto de vencer", label: "Perto de vencer" }, { key: "vencido", label: "Vencidos" }, { key: "válido", label: "Válidos" }]} />
          <span style={{ fontSize: 10.5, color: C.faint }}>{numero(listaMaestros.length)} {listaMaestros.length === 1 ? "maestro" : "maestros"}</span>
        </div>
        <div className="rolagem" style={{ maxHeight: 250, overflowY: "auto" }}>
          <Estado carregando={maestros.isLoading} erro={maestros.error} vazio={!listaMaestros.length}
            vazioTitulo={temMaestros ? "Nenhum maestro nesse status" : "Sem maestros no acesso"}
            vazioDica={temMaestros ? "Troque o filtro de validade acima." : "Painel restrito ao setor pedagógico — aparece com o setor conectado."}>
            {listaMaestros.map((m, i) => <LinhaMaestro key={i} m={m} onEditar={setMaestroEdit} />)}
          </Estado>
        </div>
        <div style={{ padding: "8px 20px", fontSize: 10, color: C.dim, borderTop: `1px solid ${C.hair}` }}>
          Contém dados pessoais (nome, e-mail, telefone) — exceção justificada, restrita ao setor pedagógico.
        </div>
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

      {/* ---- Automação de confirmações (KPIs + tabela; drawer no bloco 2) ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, marginTop: 4 }}>
        <Send size={15} style={{ color: C.gold, flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.bright }}>Automação de confirmações</span>
        <span style={{ fontSize: 11, color: C.faint }}>fila de presença · grupos de WhatsApp</span>
      </div>
      <div className="pedConfKpis" style={{ marginBottom: 12 }}>
        <ChipKpi compacto hero Icone={Send} label="Fila de confirmação" valor={numero(confKpi.fila)} nota="aguardando 1ª mensagem" />
        <ChipKpi compacto Icone={Link2} label="Aguardando link do grupo" valor={numero(confKpi.aguardando)} nota="confirmaram, sem grupo" />
        <ChipKpi compacto Icone={UserCheck} label="Taxa de confirmação" valor={fmtPct(confKpi.taxa)} nota="responderam SIM" />
      </div>
      <Bloco titulo="Turmas" canto="clique para abrir · cadastro e links" sem altura={320}>
        <Estado carregando={painel.isLoading} erro={painel.error} vazio={!turmasPainel.length}
          vazioTitulo="Nenhuma turma futura" vazioDica="As turmas aparecem aqui conforme entram no Salesforce.">
          <TabelaConfirmacoes turmas={turmasPainel} onAbrir={abrirTurma} />
        </Estado>
      </Bloco>

      {/* ---- Avaliação de eventos (cadastro + link/QR) ---- */}
      <div style={{ marginTop: 22 }}>
        <SecaoAvaliacaoEventos notificar={notificar} />
      </div>

      {/* ---- Transparência ---- */}
      <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 22 }}>
        <b style={{ color: C.muted }}>Transparência.</b> A presença cobre {pk.turmas_cobertas ? numero(pk.turmas_cobertas) : "—"} turmas
        com credenciamento confiável; as demais ficam de fora do comparecimento. Conclusão, notas e NPS
        não são medidos — não estão no Salesforce.
      </div>

      <RodapeIntegracoes fontes={["salesforce"]} />

      {/* ---- Modais de entrada (gravam nas tabelas; RLS gate pedagógico) ---- */}
      {maestroEdit && (
        <ModalCentro titulo="Editar maestro" onFechar={() => setMaestroEdit(null)}>
          <FormMaestro maestro={maestroEdit} cargoInicial={cargoPorCpf.get(String(maestroEdit.cpf)) ?? ""} onSalvo={aposSalvar} />
        </ModalCentro>
      )}
      {retEdit && (
        <ModalCentro titulo={retEdit === "novo" ? "Registrar caso de retenção" : "Editar caso de retenção"} onFechar={() => setRetEdit(null)}>
          <FormRetencao caso={retEdit === "novo" ? null : retEdit} onSalvo={aposSalvar} />
        </ModalCentro>
      )}

      {/* ---- Bloco 2: drawer da turma (cadastro + link + alunos) ---- */}
      {turmaSel && (
        <DrawerTurma
          turma={turmaSel}
          aguardando={turmaSel.aguardando_link_grupo}
          onFechar={() => setTurmaSel(null)}
          onSalvo={() => { qc.invalidateQueries(); setTurmaSel(null); }}
          notificar={notificar} />
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
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      background: `radial-gradient(1200px 600px at 78% -10%, ${C.gold}12, transparent 60%), ${C.void}`,
      fontFamily: SANS, color: C.text,
    }}>
      <div style={{ width: "100%", maxWidth: 380, animation: "subir .5s ease" }}>

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
  { key: "maestros",   label: "Maestros" },
];

/* Cores da situação. Vêm da view (migration 113), não do front. */
const COR_SITUACAO = {
  "confirmado": C.up,
  "nao vem": C.down,
  "erro no envio": C.down,
  "sem resposta": C.warn,
  "aguardando resposta": C.gold,
  "aguardando envio": C.gold,
  "nao enfileirado": C.dim,
};
const corSituacao = (s) => COR_SITUACAO[String(s ?? "").trim().toLowerCase()] ?? C.muted;

const ROTULO_SITUACAO = {
  "nao vem": "não vem",
  "nao enfileirado": "não enfileirado",
};
const rotuloSituacao = (s) => ROTULO_SITUACAO[String(s ?? "").trim().toLowerCase()] ?? (s ?? "—");

function ChipSituacao({ situacao }) {
  const cor = corSituacao(situacao);
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap",
      color: cor, background: `${cor}1A`, border: `1px solid ${cor}44`,
    }}>{rotuloSituacao(situacao)}</span>
  );
}

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
      {aba !== "turmas" && (
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
  const turmas = useTurmasCadastro();
  const resumo = useTurmaInscritosResumo();
  const [sel, setSel] = useState(null);
  const [quando, setQuando] = useState("futuras");
  const hoje = isoDia(new Date());

  // Resumo indexado por turma e tipo de mensagem. A view entrega uma linha
  // por (turma, tipo); a lista mostra o fluxo de confirmação, que é o que
  // acontece primeiro. O link do grupo aparece no detalhe.
  const porTurma = useMemo(() => {
    const m = new Map();
    for (const r of resumo.data ?? []) {
      const a = m.get(r.turma_id) ?? {};
      a[r.tipo] = r;
      m.set(r.turma_id, a);
    }
    return m;
  }, [resumo.data]);

  const lista = useMemo(() => {
    const rows = (turmas.data ?? []).map((t) => ({ ...t, futura: String(t.data_inicio ?? "") >= hoje }));
    const alvo = quando === "futuras" ? rows.filter((t) => t.futura) : rows;
    // Futuras primeiro, da mais próxima à mais distante; passadas depois, da
    // mais recente à mais antiga — em ambos os casos o que interessa vem no topo.
    return [...alvo].sort((a, b) =>
      a.futura !== b.futura ? (a.futura ? -1 : 1)
        : a.futura ? String(a.data_inicio).localeCompare(String(b.data_inicio))
          : String(b.data_inicio).localeCompare(String(a.data_inicio)));
  }, [turmas.data, quando, hoje]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: C.faint }}>
          Clique numa turma para abrir o cadastro, disparar as mensagens e ver quem respondeu.
        </span>
        <Segmentado opcoes={[{ key: "futuras", label: "Futuras" }, { key: "todas", label: "Todas" }]}
          valor={quando} onChange={setQuando} />
      </div>

      <Estado
        carregando={turmas.isLoading || resumo.isLoading}
        erro={turmas.error ?? resumo.error}
        vazio={!lista.length}
        vazioTitulo={quando === "futuras" ? "Nenhuma turma marcada daqui pra frente" : "Nenhuma turma no cadastro"}
        vazioDica={quando === "futuras" ? "Assim que uma turma entrar no cadastro com data de início, ela aparece aqui. Troque para Todas para ver as que já aconteceram." : undefined}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lista.map((t) => (
            <LinhaTurmaCentral key={t.turma_id} turma={t} resumo={porTurma.get(t.turma_id)} onAbrir={() => setSel(t)} />
          ))}
        </div>
      </Estado>

      {sel && (
        <DrawerTurmaCentral
          turma={sel}
          resumo={porTurma.get(sel.turma_id)}
          onFechar={() => setSel(null)}
          notificar={notificar}
        />
      )}
    </>
  );
}

function LinhaTurmaCentral({ turma, resumo, onAbrir }) {
  const conf = resumo?.confirmacao;
  const total = Number(conf?.matriculados ?? 0);
  const dias = turma.futura
    ? Math.round((new Date(turma.data_inicio) - new Date(isoDia(new Date()))) / 86400000)
    : null;

  return (
    <button onClick={onAbrir} style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
      background: C.card, border: `1px solid ${turma.futura ? C.cardLine : C.hair}`,
      borderRadius: 12, padding: "12px 14px", fontFamily: SANS,
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

      {!conf ? (
        <div style={{ fontSize: 11, color: C.dim, marginTop: 9 }}>Nenhuma matrícula aprovada nesta turma ainda.</div>
      ) : (
        <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
          <ContaTurma rotulo="confirmaram" valor={Number(conf.confirmados ?? 0)} total={total} cor={C.up} />
          <ContaTurma rotulo="não vêm" valor={Number(conf.nao_vem ?? 0)} total={total} cor={C.down} />
          <ContaTurma rotulo="sem resposta" valor={Number(conf.sem_resposta ?? 0)} total={total} cor={C.warn} />
          <ContaTurma rotulo="aguardando" valor={Number(conf.aguardando_resposta ?? 0) + Number(conf.aguardando_envio ?? 0)} total={total} cor={C.gold} />
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
function DrawerTurmaCentral({ turma, resumo, onFechar, notificar }) {
  const qc = useQueryClient();
  const dim = useTurmaDim(turma.turma_id);
  const sug = useTurmaSugestao(dim.data?.sigla, dim.data?.data_inicio, turma.turma_id);
  const inscritos = useTurmaInscritos(turma.turma_id);
  const [tipo, setTipo] = useState("confirmacao");
  const [disparando, setDisparando] = useState(null);
  const [retorno, setRetorno] = useState(null); // o que a função devolveu

  const doTipo = useMemo(
    () => (inscritos.data ?? []).filter((r) => r.tipo === tipo),
    [inscritos.data, tipo]
  );
  const semContato = useMemo(() => doTipo.filter((r) => r.sem_contato).length, [doTipo]);

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
      largura={620}
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
          foco={null}
          onSalvo={recarregar}
          notificar={notificar}
        />
      ) : null}

      {/* ---- Inscritos ---- */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.dim }}>Inscritos</span>
          <Segmentado
            opcoes={[{ key: "confirmacao", label: "Confirmação" }, { key: "grupo", label: "Link do grupo" }]}
            valor={tipo} onChange={setTipo}
          />
        </div>

        <Estado
          carregando={inscritos.isLoading}
          erro={inscritos.error}
          vazio={!doTipo.length}
          vazioTitulo="Nenhuma matrícula aprovada nesta turma"
          vazioDica="A lista sai das matrículas aprovadas. Compradores de vaga ficam de fora — eles não são alunos."
        >
          <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 7 }}>
            {numero(doTipo.length)} pessoas
            {semContato > 0 && <> · <b style={{ color: C.warn }}>{numero(semContato)}</b> sem telefone nem e-mail</>}
          </div>
          <div className="rolagem" style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${C.hair}`, borderRadius: 10 }}>
            {doTipo.map((r, i) => (
              <LinhaInscrito key={`${r.aluno_id}-${i}`} r={r} ultima={i === doTipo.length - 1} onMarcar={marcar} />
            ))}
          </div>
        </Estado>
      </div>
    </DrawerLado>
  );
}

/* Uma pessoa. Os três botões registram a resposta que chegou por fora do
   WhatsApp — por telefone, no corredor, pela consultora. Sem isso a planilha
   volta pela porta dos fundos. */
function LinhaInscrito({ r, ultima, onMarcar }) {
  const naFila = String(r.situacao ?? "") !== "nao enfileirado";
  const botao = (valor, rotulo, cor) => (
    <button
      key={valor}
      onClick={(e) => { e.stopPropagation(); onMarcar(r.aluno_id, valor); }}
      disabled={!naFila}
      title={naFila ? `Registrar: ${rotulo}` : "Dispare a mensagem antes de registrar a resposta"}
      style={{
        fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 7,
        border: `1px solid ${naFila ? `${cor}44` : C.hair}`, background: "transparent",
        color: naFila ? cor : C.dim, cursor: naFila ? "pointer" : "not-allowed",
      }}
    >{rotulo}</button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      padding: "8px 11px", borderBottom: ultima ? "none" : `1px solid ${C.hair}`,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.nome || mascaraCpf(r.aluno_id)}
        </div>
        <div style={{ fontSize: 10, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.sem_contato ? "sem telefone nem e-mail" : (r.telefone || r.email || "—")}
          {r.resposta_origem === "hub" && " · registrado na mão"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {botao("sim", "Sim", C.up)}
          {botao("nao", "Não", C.down)}
          {botao("sem_resposta", "Sem resposta", C.warn)}
        </div>
        <ChipSituacao situacao={r.situacao} />
      </div>
    </div>
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
  const [geral, setGeral] = useState(false); // "Geral": todo o histórico, sem recorte de ano
  const { minMes, maxMes, anos } = useRangeDatas();

  // Categoria: só recorta o Hub Comercial. A lista vem do dado; sem opção
  // "todas" de propósito (categorias são unidades de negócio separadas).
  const categorias = useCategoriasDisponiveis();
  const [catEscolhida, setCategoria] = useState(null);
  const categoria = catEscolhida && categorias.includes(catEscolhida) ? catEscolhida : categorias[0];
  const ctxCategoria = useMemo(() => ({ categoria, setCategoria, categorias }), [categoria, categorias]);

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
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.void}; -webkit-font-smoothing: antialiased; }
        ::selection { background: ${C.gold}47; }
        input::placeholder { color: ${C.dim}; }
        button:focus-visible, input:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 2px; }
        .rolagem::-webkit-scrollbar { width: 9px; }
        .rolagem::-webkit-scrollbar-thumb { background: rgba(255,255,255,.09); border-radius: 20px; }
        @keyframes girar { to { transform: rotate(360deg); } }
        @keyframes subir { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .girar { animation: girar 1s linear infinite; }
        .subir { animation: subir .4s ease; }
        /* Painéis do Hub Financeiro (design portado): 1 coluna no mobile,
           proporções do design (5:4:3 e 7:5) em telas largas. */
        .finRow1 { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
        .finRow2 { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: start; }
        @media (min-width: 1000px) {
          .finRow1 { grid-template-columns: 5fr 4fr 3fr; }
          .finRow2 { grid-template-columns: 7fr 5fr; }
        }
        /* Hub Comercial: evolução à esquerda, consultoras à direita. Denso
           pra caber numa TV 16:9 sem rolagem. */
        .gridCom { display: grid; grid-template-columns: 1fr; column-gap: 14px; align-items: start; }
        @media (min-width: 1100px) { .gridCom { grid-template-columns: 7fr 5fr; } }
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
                  : hub?.nome}
              </h1>
              {tela !== "executivo" && (
                <div style={{ fontSize: 13, color: C.faint, marginTop: 5 }}>{hub?.desc}</div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {/* Executivo é sempre mês corrente — sem filtro de período. Os hubs
                  setoriais mantêm o seletor (é lá que a Dulce fatia por período). */}
              {tela !== "executivo" && <SeletorPeriodo />}
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

          {conteudo()}
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
