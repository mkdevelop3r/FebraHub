import { useState, useMemo, useRef, createContext, useContext } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TrendingUp, Wallet, Megaphone, GraduationCap, ShoppingBag, CalendarDays,
  LayoutDashboard, Lock, Mail, AlertTriangle, Package, LogOut, Power,
  Database, ShieldAlert, Loader2, ArrowRight, Sparkles, Bell,
  Clock, Receipt, Hourglass, ChevronLeft, ChevronRight, ChevronDown,
  Smile, Frown, Meh, Crown, Gift, X, ArrowUpRight,
  Users, Target, Construction, Percent, Filter, ChevronUp,
} from "lucide-react";
import {
  useSessao, usePerfil, entrar, sair,
  useComercialRankingHistorico, useComercialSymplaJennifer, useComercialCarinhas,
  useComercialVerdesDetalhe,
  useComercialMatriculasFaturamento, useComercialCursosPorConsultora,
  useComercialRankingGeralConsolidado, useComercialGeralMensal,
  useFinanceiroReceita, useFinanceiroQualid,
  useFinanceiroPagamentos,
  useFinanceiroCaixaHorizonte, useFinanceiroFormasPagamento,
  useFinanceiroReceitaMensal, useFinanceiroCaixaMensal,
  useFinanceiroInadimpOrigem, useFinanceiroAReceberHorizonte,
  useFinanceiroAPagarHorizonte, useFinanceiroPagoMensal,
  useFinanceiroReceitaCategoriaPeriodo, useFinanceiroDespesaCategoriaPeriodo,
  useLojaKpis, useLojaReceitaMensal, useLojaReceitaPeriodo,
  useMarketingResumoMensal, useMarketingDesempenho, useMarketingOrigemVendas,
  useMarketingAtribuicao,
  usePedagogicoTurmas, useEventosDesempenho,
  useDiretoriaConsol, useIntegracaoStatus,
  porMes, variacao, moeda, numero,
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
  return useMemo(() => {
    const h = new Date();
    const maxMes = chaveMes(h.getFullYear(), h.getMonth());
    let min = null;
    const anos = new Set();
    for (const src of [a.data, b.data, c.data]) {
      for (const r of src ?? []) {
        const d = String(r.data ?? "").slice(0, 10);
        if (!d) continue;
        if (!min || d < min) min = d;
        anos.add(Number(d.slice(0, 4)));
      }
    }
    const minMes = min ? min.slice(0, 7) : maxMes;
    const lista = anos.size ? [...anos].sort((x, y) => y - x) : [h.getFullYear()];
    return { minMes, maxMes: maxMes < minMes ? minMes : maxMes, anos: lista };
  }, [a.data, b.data, c.data]);
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

/* Ano: dropdown com os anos que têm dado. */
function SeletorAno() {
  const { ano, setAno, anos } = usePeriodo();
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setAberto((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12,
        fontWeight: 700, color: C.gold, background: "rgba(255,255,255,.04)",
        border: `1px solid ${C.cardLine}`, borderRadius: 9, padding: "6px 10px", cursor: "pointer",
      }}>
        {ano} <ChevronDown size={13} />
      </button>
      <Popover aberto={aberto} onFechar={() => setAberto(false)} largura={110}>
        {anos.map((a) => (
          <button key={a} style={itemPop(a === ano)} onClick={() => { setAno(a); setAberto(false); }}>{a}</button>
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
function LinhaEvolucao({ serie, cor = C.gold, idGrad = "fillEvol", inverso = false, formatar = moeda }) {
  if (serie.length < 2) return null;
  const W = 720, H = 228, padL = 54, padR = 14, padT = 44, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB, plotBottom = padT + plotH;

  // Domínio só com meses FECHADOS.
  const fechados = serie.filter((s) => !s.parcial).map((s) => s.valor);
  const base = fechados.length ? fechados : serie.map((s) => s.valor);
  let vMax = Math.max(...base), vMin = Math.min(...base);
  if (vMax === vMin) { vMax = vMax || 1; vMin = 0; }
  const folga = (vMax - vMin) * 0.08;
  vMax += folga; vMin = Math.max(0, vMin - folga);

  const n = serie.length;
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const y = (v) => Math.max(padT, Math.min(plotBottom, plotBottom - ((v - vMin) / (vMax - vMin || 1)) * plotH));
  const pts = serie.map((s, i) => [x(i), y(s.valor)]);

  const parcialIdx = serie.findIndex((s) => s.parcial);
  const temParcial = parcialIdx > 0;
  const ultSolido = temParcial ? parcialIdx - 1 : n - 1;
  const solidPts = pts.slice(0, ultSolido + 1);
  const solido = solidPts.map((p) => p.join(",")).join(" ");
  const tracejado = temParcial ? [pts[parcialIdx - 1], pts[parcialIdx]].map((p) => p.join(",")).join(" ") : null;
  const area = `M ${solidPts.map((p) => p.join(",")).join(" L ")} L ${solidPts.at(-1)[0]},${plotBottom} L ${solidPts[0][0]},${plotBottom} Z`;

  const yticks = [vMin, (vMin + vMax) / 2, vMax];
  const alvo = 7, passo = Math.max(1, Math.round((n - 1) / (alvo - 1)));
  const xticks = [];
  for (let i = 0; i < n; i += passo) xticks.push(i);
  if (xticks.at(-1) !== n - 1) xticks.push(n - 1);
  const mesAno = (iso) => {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    return d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") + "/" + String(d.getFullYear()).slice(2);
  };

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
        <path d={area} fill={`url(#${idGrad})`} />
        <polyline points={solido} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {tracejado && <polyline points={tracejado} fill="none" stroke={cor} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" opacity="0.6" />}
        {/* pontinho nos meses rotulados + o ponto parcial destacado */}
        {xticks.map((i) => serie[i].parcial ? null : (
          <circle key={"d" + i} cx={pts[i][0]} cy={pts[i][1]} r="2.4" fill={cor} />
        ))}
        {temParcial && <circle cx={pts[parcialIdx][0]} cy={pts[parcialIdx][1]} r="3.5" fill={C.void} stroke={cor} strokeWidth="1.6" />}
        {/* rótulos de dados (valor + variação mês a mês) nos meses rotulados */}
        {xticks.map((i) => {
          const [lx, ly] = pts[i];
          const val = serie[i].valor;
          const prev = serie[i - 1]?.valor;
          const d = prev ? ((val - prev) / prev) * 100 : null;
          const parc = serie[i].parcial;
          const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          const baseY = Math.max(26, ly - 12);
          return (
            <g key={"lbl" + i}>
              {parc
                ? <text x={lx} y={baseY - 13} fontSize="10" fontWeight="700" textAnchor={anchor} fill={C.faint} fontFamily={SANS}>parcial</text>
                : d != null && (
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
      <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6 }}>
        Último ponto = mês em curso (parcial), não comparável a mês fechado. Escala do eixo Y calculada só sobre meses fechados.
      </div>
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

/* Faixa narrativa. No mockup ela diz "gerado pela IA" — não existe
   IA aqui ainda, e prometer isso queima a confiança no painel.
   O texto abaixo é CALCULADO a partir dos números reais. Quando o
   motor de atribuição existir, troca-se a fonte, não o layout. */
function Historia({ frases, cobertura }) {
  return (
    <div style={{
      position: "relative", border: `1px solid ${C.gold}38`, borderRadius: 18,
      padding: "26px 28px", marginBottom: 26, overflow: "hidden",
      background: `linear-gradient(120deg, ${C.gold}17, ${C.gold}05 42%, rgba(255,255,255,.015))`,
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: `linear-gradient(${C.goldTop}, ${C.goldBase})` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 6, background: C.gold, color: "#100c04",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Sparkles size={12} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: C.gold }}>
          O mês em uma frase
        </span>
        <span style={{ fontSize: 11, color: C.faint, marginLeft: 4 }}>calculado sobre os dados do banco</span>
      </div>
      <p style={{ fontSize: 18.5, lineHeight: 1.62, fontWeight: 500, color: C.bright, maxWidth: 960 }}>
        {frases}
      </p>
      {cobertura && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.gold}22` }}>
          <AlertTriangle size={13} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>{cobertura}</span>
        </div>
      )}
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

/* ============ HUB EXECUTIVO ============ */

function HubExecutivo() {
  const cons = useDiretoriaConsol();
  const rec = useFinanceiroReceita();
  const qual = useFinanceiroQualid();
  const ev = useEventosDesempenho();

  const cursos = useMemo(
    () => porMes((cons.data ?? []).filter((r) => r.unidade_negocio === "cursos"), "mes", "receita_liquida"),
    [cons.data]
  );
  const eventos = useMemo(
    () => porMes((cons.data ?? []).filter((r) => r.unidade_negocio === "eventos"), "mes", "receita_liquida"),
    [cons.data]
  );
  const vc = variacao(cursos), ve = variacao(eventos);

  const vendas = useMemo(() => (rec.data ?? []).filter((r) => r.natureza === "venda"), [rec.data]);

  const porCurso = useMemo(() => {
    const g = agrupar(vendas, "curso", "valor").slice(0, 6);
    return g.map((l) => l.rotulo === "nao_determinado"
      ? { ...l, rotulo: "Sem curso vinculado", orfa: true } : l);
  }, [vendas]);

  const taxaSympla = useMemo(() => {
    const d = ev.data ?? [];
    const b = d.reduce((s, e) => s + Number(e.receita_bruta ?? 0), 0);
    const l = d.reduce((s, e) => s + Number(e.receita_liquida ?? 0), 0);
    return { retido: b - l, pct: b ? ((b - l) / b) * 100 : 0 };
  }, [ev.data]);

  const q = qual.data?.[0];

  const historia = useMemo(() => {
    if (!vc.atual) return "Aguardando dados.";
    const lider = porCurso.find((c) => !c.orfa);
    const ref = vc.mes
      ? new Date(vc.mes + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : "";
    return (
      <>
        Em <b style={{ color: C.text }}>{ref}</b>, o último mês fechado, a receita de cursos foi de{" "}
        <b style={{ color: C.text }}>{moeda(vc.atual)}</b>
        {vc.delta && (
          <>, {vc.up ? "acima" : "abaixo"} do mês anterior em{" "}
            <b style={{ color: vc.up ? C.up : C.down }}>{String(vc.delta).replace(/[+-]/, "")}</b></>
        )}.
        {lider && <> O produto que mais pesou foi <b style={{ color: C.text }}>{lider.rotulo}</b>, com {moeda(lider.valor)}.</>}
        {" "}Os eventos entraram com <b style={{ color: C.text }}>{moeda(ve.atual)}</b> líquidos —{" "}
        <b style={{ color: C.warn }}>{moeda(taxaSympla.retido)}</b> ficaram retidos como taxa da plataforma
        ({taxaSympla.pct.toFixed(1)}%).
      </>
    );
  }, [vc, ve, porCurso, taxaSympla]);

  const cobertura = q
    ? `84% da receita tem curso vinculado · ${q.pct_sem_status}% dos pagamentos sem status, então inadimplência ainda não é confiável · Loja e Estoque sem fonte conectada.`
    : null;

  return (
    <Estado carregando={cons.isLoading} erro={cons.error} vazio={!cons.data?.length}>
      <Historia frases={historia} cobertura={cobertura} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: C.bright }}>Indicadores-chave</h2>
        <span style={{ fontSize: 11.5, color: C.faint }}>último mês fechado · cursos e eventos nunca somados</span>
      </div>

      {/* R$ 6.138 e R$ 46 não são a mesma unidade de negócio.
          Um total conjunto não significaria nada. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 30 }}>
        <Kpi label="Receita · cursos" valor={moeda(vc.atual)} delta={vc.delta} up={vc.up}
             serie={vc.serie} parcial={vc.parcial != null ? moeda(vc.parcial) : null} />
        <Kpi label="Receita · eventos" valor={moeda(ve.atual)} delta={ve.delta} up={ve.up}
             serie={ve.serie} parcial={ve.parcial != null ? moeda(ve.parcial) : null} />
        <Kpi label="Taxa retida (Sympla)" valor={moeda(taxaSympla.retido)} nota={`${taxaSympla.pct.toFixed(1)}% do bruto`} destaque={C.warn} />
        <Kpi label="Pagamentos sem status" valor={q ? q.pct_sem_status : "—"} unidade="%" nota="risco de KPI" destaque={C.warn} />
      </div>

      <Bloco titulo="Receita por curso" canto="venda · acumulado" sem>
        <Estado carregando={rec.isLoading} erro={rec.error} vazio={!porCurso.length}>
          <Lista linhas={porCurso} total={porCurso.reduce((s, l) => s + l.valor, 0)} />
        </Estado>
      </Bloco>
    </Estado>
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

  /* KPIs do período. O Comercial mostra só o BRUTO (valor_bruto = valor
     vendido): a consultora vendeu o valor cheio, o repasse não é decisão
     dela — e o líquido, após repasses, é assunto do Financeiro. As
     matrículas somam conta_matricula — comprador de vaga é receita, mas não
     é aluno, e vem com 0. YoY compara o MESMO recorte um ano atrás. */
  const kpi = useMemo(() => {
    const somaB = (ls) => ls.reduce((s, r) => s + Number(r.valor_bruto ?? 0), 0);
    const somaM = (ls) => ls.reduce((s, r) => s + Number(r.conta_matricula ?? 0), 0);
    const dentro = noPeriodo(linhasFluxo, { inicio, fim }, "data");
    const menosUmAno = (d) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    const antes = noPeriodo(linhasFluxo, { inicio: menosUmAno(inicio), fim: menosUmAno(fim) }, "data");
    const bruto = somaB(dentro), brutoAnt = somaB(antes), matriculas = somaM(dentro);
    return {
      receita: bruto,
      matriculas,
      ticket: matriculas ? bruto / matriculas : null,
      yoy: brutoAnt > 0 ? ((bruto - brutoAnt) / brutoAnt) * 100 : null,
    };
  }, [linhasFluxo, inicio, fim]);

  /* Evolução: últimos 12 meses da categoria + o mesmo mês do ano anterior.
     Não responde ao filtro de período — é série histórica, como nos outros
     hubs. O mês corrente é parcial. */
  const evolucao = useMemo(() => {
    const porMes = new Map();
    for (const r of linhasFluxo) {
      const m = String(r.data ?? "").slice(0, 7);
      if (m) porMes.set(m, (porMes.get(m) ?? 0) + Number(r.valor_bruto ?? 0)); // Comercial = bruto
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
  }, [linhasFluxo]);

  const geral = visao === "geral";

  /* Matrículas x faturamento por mês, dentro do recorte. Conta as linhas
     (volume) e soma o valor (R$) — duas grandezas, dois eixos. */
  const matFat = useMemo(() => {
    if (ehSympla) return [];
    const origem = ehGeral
      ? (geralMensal.data ?? [])
      : (matfat.data ?? []).filter((r) => String(r.categoria) === categoria);
    const dentro = noPeriodo(origem, { inicio, fim }, "data");
    const m = new Map();
    for (const r of dentro) {
      const k = String(r.mes ?? "").slice(0, 7);
      if (!k) continue;
      const a = m.get(k) ?? { mes: k, matriculas: 0, faturamento: 0 };
      a.matriculas += Number(r.conta_matricula ?? 0); // soma conta_matricula, não conta linha
      a.faturamento += Number(r.valor_bruto ?? 0);     // Comercial = bruto
      m.set(k, a);
    }
    const h = new Date();
    const atual = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes))
      .map((x) => ({ ...x, parcial: x.mes === atual }));
  }, [matfat.data, geralMensal.data, categoria, inicio, fim, ehSympla, ehGeral]);

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
    const base = geral ? doFiltro : noPeriodo(doFiltro, { inicio, fim }, "data");
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
    const base = geral ? origem : noPeriodo(origem, { inicio, fim }, "data");
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
    for (const r of noPeriodo(carinhas.data, { inicio, fim }, "data_pagamento")) {
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
    return noPeriodo(
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
            consolidado do Comercial (GGB, CI, CIS, Mentoria, eventos, sem categoria) · bruto vendido; o líquido, após repasses, na linha de baixo.
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
          nota={ehSympla ? "líquida · todos os tempos" : rotulo} />
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
  const caixaHor = useFinanceiroCaixaHorizonte();
  const fpag = useFinanceiroFormasPagamento();
  const recMensal = useFinanceiroReceitaMensal();
  const caixaMensal = useFinanceiroCaixaMensal();
  const inadOrig = useFinanceiroInadimpOrigem();
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

  // Agrego pagos/pendentes/perdidos/sem_status somando todas as origens.
  // O donut usa o total INCLUINDO sem_status — assim "Sem status" aparece
  // como fatia honesta, não sumido do denominador.
  const pagTot = useMemo(() => {
    let pagos = 0, pend = 0, perd = 0, sem = 0, matr = 0;
    for (const r of pag.data ?? []) {
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
  }, [pag.data]);

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

  return (
    <>
      {/* Faixa de KPIs compactos — âncora dourada + 4 métricas do mês */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <ChipKpi hero Icone={Wallet} label="Receita reconhecida" valor={moeda(categorias.total)} nota={rotulo} />
        <ChipKpi Icone={Clock} label="Sem status" valor={pagTot.pctSem != null ? pagTot.pctSem.toFixed(1) : "—"} unidade="%" nota="posição atual" />
        <ChipKpi Icone={AlertTriangle} label="Em aberto" valor={pagTot.pctEmAberto != null ? pagTot.pctEmAberto.toFixed(1) : "—"} unidade="%" nota="posição atual" />
        <ChipKpi Icone={Receipt} label="Ticket médio" valor={ticket != null ? moeda(ticket) : "—"} nota={rotulo} />
        <ChipKpi Icone={Hourglass} label="A receber" valor={moeda(aReceber)} nota="CisPay · posição atual" />
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

        <Bloco titulo="Status de pagamento" canto={pagTot.tot ? `${pctPagoCentro}% pago` : null} altura={ALTURA_PAINEL}>
          <Estado carregando={pag.isLoading} erro={pag.error} vazio={!pagTot.tot}>
            <Donut segmentos={statusSeg} centroValor={`${pctPagoCentro}%`} centroLabel="pago" centroCor={C.up} />
            <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.hair}` }}>
              <AlertTriangle size={12} style={{ color: C.warn, marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
                {pagTot.pctSem != null ? `${pagTot.pctSem.toFixed(1)}% sem status` : "Parte sem status"} — migração CisPay em andamento (Stone/legado batido a mão). <b style={{ color: C.muted }}>Não é inadimplência.</b>
              </span>
            </div>
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
      <SecaoTitulo titulo="Inadimplência" canto="posição atual · não muda com o período · nunca somado à receita" />
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

function HubPedagogico() {
  const t = usePedagogicoTurmas();
  const mat = useMemo(() => porMes(t.data ?? [], "mes", "matriculas"), [t.data]);
  const conc = useMemo(() => porMes(t.data ?? [], "mes", "concluintes"), [t.data]);
  const v = variacao(mat);
  const cursos = useMemo(() => agrupar(t.data ?? [], "nome_curso", "matriculas").slice(0, 8), [t.data]);
  const taxa = v.atual ? ((conc.at(-1)?.valor / v.atual) * 100).toFixed(1) : null;

  return (
    <Estado carregando={t.isLoading} erro={t.error} vazio={!t.data?.length}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 26 }}>
        <Kpi label="Matrículas" valor={numero(v.atual)} delta={v.delta} up={v.up} serie={v.serie} parcial={v.parcial != null ? numero(v.parcial) : null} />
        <Kpi label="Concluintes" valor={numero(conc.at(-1)?.valor)} delta={variacao(conc).delta} up={variacao(conc).up} serie={conc} />
        <Kpi label="Conclusão" valor={taxa ?? "—"} unidade="%" nota="mês corrente" />
        <Kpi label="Cursos ativos" valor={numero(cursos.length)} nota="no recorte" />
      </div>
      <Bloco titulo="Matrículas por curso" canto="acumulado" sem>
        <Lista linhas={cursos} formatar={numero} />
      </Bloco>
    </Estado>
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

/* Hub Loja. Receita da loja é da LOJA — nunca entra num total junto com
   curso (unidades diferentes). Produto e estoque só existem no Omie, que
   ainda não está integrado: vazio honesto em vez de número inventado. */
function HubLoja() {
  const { inicio, fim, rotulo, modo } = usePeriodo();
  const kpis = useLojaKpis();
  const rec = useLojaReceitaPeriodo();
  const recMensal = useLojaReceitaMensal();

  const k = kpis.data?.[0];
  const mv = (x) => (x == null ? "—" : moeda(Number(x)));
  const nv = (x) => (x == null ? "—" : numero(Number(x)));

  // Fluxo da loja recortado pelo período e reagregado por forma.
  const recorte = useMemo(() => noPeriodo(rec.data, { inicio, fim }), [rec.data, inicio, fim]);
  const somaPeriodo = useMemo(() => recorte.reduce(
    (a, r) => ({
      receita: a.receita + Number(r.receita ?? 0),
      recebido: a.recebido + Number(r.recebido ?? 0),
      vendas: a.vendas + Number(r.vendas ?? 0),
    }),
    { receita: 0, recebido: 0, vendas: 0 }
  ), [recorte]);
  const ticket = somaPeriodo.vendas ? somaPeriodo.receita / somaPeriodo.vendas : null;

  const formas = useMemo(
    () => somarPor(recorte, "forma", ["receita"])
      .map((r) => ({ rotulo: String(r.forma ?? "—"), valor: Number(r.receita ?? 0) }))
      .filter((f) => f.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .map((f, i) => ({ ...f, cor: PALETA_FORMAS[i % PALETA_FORMAS.length] })),
    [recorte]
  );
  const formasTot = formas.reduce((s, f) => s + f.valor, 0);
  const leaderPct = formasTot ? Math.round((formas[0].valor / formasTot) * 100) : 0;

  const evol = useMemo(() => serieMensal(recMensal.data, "receita"), [recMensal.data]);
  const evolSemFonte = !!recMensal.error || evol.length < 2;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
        <ChipKpi hero Icone={Wallet} label="Receita da loja" valor={moeda(somaPeriodo.receita)} nota={rotulo} />
        <ChipKpi Icone={ShoppingBag} label="Vendas" valor={numero(somaPeriodo.vendas)} nota={rotulo} />
        <ChipKpi Icone={Receipt} label="Ticket médio" valor={ticket != null ? moeda(ticket) : "—"} nota={rotulo} />
        <ChipKpi Icone={TrendingUp} label="Recebido" valor={moeda(somaPeriodo.recebido)} nota={rotulo} />
        <ChipKpi Icone={AlertTriangle} label="A receber vencido" valor={mv(k?.a_receber_vencido)} nota="posição atual" />
      </div>

      <div className="finRow2" style={{ marginBottom: 16 }}>
        <Bloco titulo="Receita mensal da loja" canto="R$ · mês" altura={ALTURA_PAINEL}>
          {recMensal.isLoading
            ? <Estado carregando />
            : evolSemFonte
              ? <Estado vazio />
              : <LinhaEvolucao serie={evol} idGrad="fillLoja" />}
        </Bloco>
        <Bloco titulo="Formas de pagamento" canto={rotulo} altura={ALTURA_PAINEL}>
          <Estado
            carregando={rec.isLoading}
            erro={rec.error}
            vazio={!formas.length}
            vazioTitulo={tituloVazioFluxo(modo)}
            vazioDica={`Nenhuma venda com data entre ${inicio} e ${fim}. É normal: a loja vende em lote — troque o período no topo.`}
          >
            <Donut segmentos={formas} size={118} centroSize={17} centroValor={formas[0] ? abreviaForma(formas[0].rotulo) : "—"} centroLabel={`${leaderPct}% líder`} centroCor={C.gold} />
          </Estado>
        </Bloco>
      </div>

      <Bloco titulo="Produtos e estoque" canto="aguardando integração">
        <div style={{ display: "flex", gap: 10, padding: "6px 0" }}>
          <Package size={16} style={{ color: C.faint, marginTop: 2, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>Aguardando integração Omie</div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4, lineHeight: 1.55, maxWidth: 620 }}>
              A loja já entrega venda, receita e recebimento. <b style={{ color: C.muted }}>Produto vendido e saldo de estoque só existem no Omie</b> — enquanto a integração não vier, esses números não aparecem aqui em vez de serem estimados.
            </div>
          </div>
        </div>
      </Bloco>
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
  const { minMes, maxMes, anos } = useRangeDatas();

  // Categoria: só recorta o Hub Comercial. A lista vem do dado; sem opção
  // "todas" de propósito (categorias são unidades de negócio separadas).
  const categorias = useCategoriasDisponiveis();
  const [catEscolhida, setCategoria] = useState(null);
  const categoria = catEscolhida && categorias.includes(catEscolhida) ? catEscolhida : categorias[0];
  const ctxCategoria = useMemo(() => ({ categoria, setCategoria, categorias }), [categoria, categorias]);

  const ctxPeriodo = useMemo(() => {
    const dentro = (k) => k >= minMes && k <= maxMes;
    const aplicar = (a, m) => { setAno(a); setMesIdx(m); };
    return {
      modo, ano, mesIdx, anos, minMes, maxMes,
      setAno,
      setMesAno: aplicar,
      // Navega mês a mês virando o ano (Jan ‹ vira Dez do ano anterior).
      irMes: (delta) => {
        let m = mesIdx + delta, a = ano;
        if (m < 0) { m = 11; a -= 1; }
        if (m > 11) { m = 0; a += 1; }
        if (dentro(chaveMes(a, m))) aplicar(a, m);
      },
      // Ao entrar no modo Mês, puxa a âncora pra dentro dos limites do dado.
      escolherModo: (k) => {
        if (k === "mes") {
          const atual = chaveMes(ano, mesIdx);
          const alvo = atual > maxMes ? maxMes : atual < minMes ? minMes : null;
          if (alvo) aplicar(Number(alvo.slice(0, 4)), Number(alvo.slice(5, 7)) - 1);
        }
        setModo(k);
      },
      ...intervaloDe({ modo, ano, mesIdx }),
    };
  }, [modo, ano, mesIdx, anos, minMes, maxMes]);

  const visiveis = admin ? HUBS : HUBS.filter((h) => setores.includes(h.key));
  const hub = HUBS.find((h) => h.key === tela);

  const conteudo = () => {
    switch (tela) {
      case "executivo":  return <HubExecutivo />;
      case "comercial":  return <HubComercial />;
      case "financeiro": return <HubFinanceiro />;
      case "marketing":  return <HubMarketing />;
      case "pedagogico": return <HubPedagogico />;
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
              <SeletorPeriodo />
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

export default function Root() {
  return (
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  );
}
