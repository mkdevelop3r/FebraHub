import { useState, useMemo, createContext, useContext } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TrendingUp, Wallet, Megaphone, GraduationCap, ShoppingBag, CalendarDays,
  LayoutDashboard, Lock, Mail, AlertTriangle, Package, LogOut, Power,
  Database, ShieldAlert, Loader2, ArrowRight, Sparkles, Bell,
  Clock, Receipt, Hourglass, ChevronLeft, ChevronRight, ChevronDown,
  Smile, Frown, Meh, Crown, Gift,
} from "lucide-react";
import {
  useSessao, usePerfil, entrar, sair,
  useComercialRankingHistorico, useComercialSymplaJennifer, useComercialCarinhas,
  useFinanceiroReceita, useFinanceiroQualid,
  useFinanceiroPagamentos,
  useFinanceiroCaixaHorizonte, useFinanceiroFormasPagamento,
  useFinanceiroReceitaMensal, useFinanceiroCaixaMensal,
  useFinanceiroInadimpOrigem, useFinanceiroAReceberHorizonte,
  useFinanceiroAPagarHorizonte, useFinanceiroPagoMensal,
  useFinanceiroReceitaCategoriaPeriodo, useFinanceiroDespesaCategoriaPeriodo,
  useLojaKpis, useLojaReceitaMensal, useLojaReceitaPeriodo,
  useMarketingOrigem, usePedagogicoTurmas, useEventosDesempenho,
  useDiretoriaConsol,
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
    for (const x of r.data ?? []) if (x.categoria) set.add(String(x.categoria));
    const ord = (c) => { const i = ORDEM_CAT.indexOf(c); return i < 0 ? 99 : i; };
    return [...[...set].sort((a, b) => ord(a) - ord(b) || a.localeCompare(b)), CAT_SYMPLA];
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
const ROTULO_CAT = { CI: "Coach Individual", "Coaching Individual": "Coach Individual" };
const rotuloCat = (c) => ROTULO_CAT[c] ?? c;
const ORDEM_CAT = ["GGB", "CIS", "CI", "Coaching Individual"];

const CategoriaCtx = createContext(null);
const useCategoria = () => useContext(CategoriaCtx);

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

/* Linha do placar. As verdes rendem brinde a cada 10; a barra mede só o
   progresso pro próximo. Vermelha é contador puro — sem punição visível. */
function LinhaPlacar({ p }) {
  const MAX_CHIPS = 5;
  const contagem = (Icone, cor, n, titulo) => (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }} title={titulo}>
      <Icone size={13} style={{ color: cor }} />
      <b style={{ fontFamily: GROTESK, fontSize: 13, color: n > 0 ? C.text : C.dim }}>{n}</b>
    </span>
  );

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
        {contagem(Smile, C.up, p.verdes, "Verde — venda 100% Pix, transferência ou dinheiro")}
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
function ChipKpi({ Icone, label, valor, unidade, delta, up, nota, hero, compacto }) {
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
function LinhaEvolucao({ serie, cor = C.gold, idGrad = "fillEvol", inverso = false }) {
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
              <text x={padL - 9} y={yy + 3.5} fontSize="11" textAnchor="end" fill={C.faint} fontFamily={SANS}>{moeda(v)}</text>
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
              <text x={lx} y={baseY} fontSize="11.5" fontWeight="700" textAnchor={anchor} fill={parc ? C.faint : C.bright} fontFamily={GROTESK}>{moeda(val)}</text>
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
  const { inicio, fim, rotulo } = usePeriodo();
  const { categoria } = useCategoria();
  const [visao, setVisao] = useState("periodo");
  const rankCat = useComercialRankingHistorico();
  const sympla = useComercialSymplaJennifer();
  const carinhas = useComercialCarinhas();

  const ehSympla = categoria === CAT_SYMPLA;
  // Carinhas são exclusivas do time GGB — não existem nas outras categorias.
  const ehGGB = String(categoria ?? "").toUpperCase() === "GGB";
  const anoAnterior = new Date().getFullYear() - 1;

  // Todas as vendas da categoria (uma linha por venda), incluindo as de quem
  // já saiu: é isso que faz 2022 mostrar faturamento real em vez de zero.
  const vendasCat = useMemo(
    () => (rankCat.data ?? []).filter((r) => String(r.categoria) === categoria),
    [rankCat.data, categoria]
  );

  /* KPIs do período. YoY compara o MESMO recorte um ano atrás — desloco as
     bordas do intervalo, não o ano inteiro. */
  const kpi = useMemo(() => {
    const soma = (ls) => ls.reduce((s, r) => s + Number(r.valor ?? 0), 0);
    const dentro = noPeriodo(vendasCat, { inicio, fim }, "data");
    const menosUmAno = (d) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    const antes = noPeriodo(vendasCat, { inicio: menosUmAno(inicio), fim: menosUmAno(fim) }, "data");
    const receita = soma(dentro), receitaAnt = soma(antes);
    return {
      receita,
      matriculas: dentro.length,
      ticket: dentro.length ? receita / dentro.length : null,
      yoy: receitaAnt > 0 ? ((receita - receitaAnt) / receitaAnt) * 100 : null,
    };
  }, [vendasCat, inicio, fim]);

  /* Evolução: últimos 12 meses da categoria + o mesmo mês do ano anterior.
     Não responde ao filtro de período — é série histórica, como nos outros
     hubs. O mês corrente é parcial. */
  const evolucao = useMemo(() => {
    const porMes = new Map();
    for (const r of vendasCat) {
      const m = String(r.data ?? "").slice(0, 7);
      if (m) porMes.set(m, (porMes.get(m) ?? 0) + Number(r.valor ?? 0));
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
  }, [vendasCat]);

  const geral = visao === "geral";

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
    const base = geral ? vendasCat : noPeriodo(vendasCat, { inicio, fim }, "data");
    const m = new Map();
    for (const r of base) {
      const k = r.consultor_id_exibicao ?? r.consultora ?? "—";
      const a = m.get(k) ?? {
        consultor_id: k, consultora: r.consultora, foto_url: r.foto_url,
        atual: r.atual !== false, receita: 0, vendas: 0,
      };
      a.receita += Number(r.valor ?? 0);
      a.vendas += 1;
      m.set(k, a);
    }
    return [...m.values()]
      .map((a) => ({ ...a, ticket_medio: a.vendas ? a.receita / a.vendas : 0 }))
      .sort((x, y) => y.receita - x.receita);
  }, [ehSympla, sympla.data, vendasCat, geral, inicio, fim]);

  const fonte = ehSympla ? sympla : rankCat;

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

  return (
    <>
      {/* Faixa compacta: cada categoria é uma unidade de negócio, nunca somada. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 8, marginBottom: 10 }}>
        <ChipKpi compacto hero Icone={Wallet} label={`Faturamento · ${rotuloCat(categoria)}`}
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
        <Bloco titulo="Evolução do faturamento" canto={`${rotuloCat(categoria)} · 12 meses`}>
          <Estado
            carregando={rankCat.isLoading}
            erro={rankCat.error}
            vazio={ehSympla || !vendasCat.length}
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
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(Math.max(podio.length, 1), 3)}, 1fr)`, gap: 8 }}>
                {podio.slice(0, 3).map((c, i) => (
                  <CardPodio key={c.consultor_id ?? c.consultora} c={c} pos={i + 1} />
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

      {/* Carinhas são exclusivas do time GGB — nas outras categorias não
          existem, então o bloco nem aparece (em vez de vir vazio). */}
      {ehGGB && (
      <Bloco titulo="Placar · carinhas" canto={`${rotulo} · público`} sem altura={210}>
        <Estado
          carregando={carinhas.isLoading}
          erro={carinhas.error}
          vazio={!totalPeriodo}
          vazioTitulo="Nenhuma movimentação no período"
          vazioDica={`Nenhuma venda classificada entre ${inicio} e ${fim}. É normal: o negócio vende em lote — troque o período no topo.`}
        >
          {linhas.map((p) => <LinhaPlacar key={p.consultor_id ?? p.consultora} p={p} />)}
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
  const { inicio, fim, rotulo } = usePeriodo();
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
    const recorte = somarPor(noPeriodo(recCat.data, { inicio, fim }), "categoria",
      ["receita_bruta", "receita_unidade", "repasse_coach", "vendas"]);
    const rows = recorte.map((r) => ({
      categoria: ehSemVinculo(r.categoria) ? "Sem vínculo" : (r.categoria ?? "—"),
      vendas: Number(r.vendas ?? 0),
      bruto: Number(r.receita_bruta ?? 0),
      unidade: Number(r.receita_unidade ?? 0),
      repasse: Number(r.repasse_coach ?? 0),
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
        <ChipKpi Icone={Clock} label="Sem status" valor={pagTot.pctSem != null ? pagTot.pctSem.toFixed(1) : "—"} unidade="%" nota="snapshot" />
        <ChipKpi Icone={AlertTriangle} label="Em aberto" valor={pagTot.pctEmAberto != null ? pagTot.pctEmAberto.toFixed(1) : "—"} unidade="%" nota="snapshot" />
        <ChipKpi Icone={Receipt} label="Ticket médio" valor={ticket != null ? moeda(ticket) : "—"} nota={rotulo} />
        <ChipKpi Icone={Hourglass} label="A receber" valor={moeda(aReceber)} nota="CisPay · snapshot" />
      </div>

      {/* Linha 1: categoria (larga) · status donut · caixa destaque */}
      <div className="finRow1" style={{ marginBottom: 16 }}>
        <Bloco titulo="Receita por categoria" canto={rotulo} altura={ALTURA_PAINEL}>
          <Estado
            carregando={recCat.isLoading}
            erro={recCat.error}
            vazio={!categorias.reais.length && !categorias.orfas.length}
            vazioTitulo="Nenhuma movimentação no período"
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
      <SecaoTitulo titulo="Inadimplência" canto="snapshot do agora · não muda com o período · nunca somado à receita" />
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
            vazioTitulo="Nenhuma movimentação no período"
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
        <Bloco titulo="A pagar por vencimento" canto={aPagarTot ? `${moeda(aPagarTot)} · snapshot` : "snapshot"} sem altura={ALTURA_PAINEL}>
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
    </>
  );
}

function HubMarketing() {
  const org = useMarketingOrigem();
  const leads = useMemo(() => porMes(org.data ?? [], "mes", "leads"), [org.data]);
  const ganhos = useMemo(() => porMes(org.data ?? [], "mes", "ganhos"), [org.data]);
  const v = variacao(leads);
  const origens = useMemo(() => agrupar(org.data ?? [], "origem", "leads").slice(0, 8), [org.data]);
  const conv = v.atual ? ((ganhos.at(-1)?.valor / v.atual) * 100).toFixed(1) : null;

  return (
    <Estado carregando={org.isLoading} erro={org.error} vazio={!org.data?.length}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 26 }}>
        <Kpi label="Leads" valor={numero(v.atual)} delta={v.delta} up={v.up} serie={v.serie} parcial={v.parcial != null ? numero(v.parcial) : null} />
        <Kpi label="Convertidos" valor={numero(ganhos.at(-1)?.valor)} delta={variacao(ganhos).delta} up={variacao(ganhos).up} serie={ganhos} />
        <Kpi label="Origens ativas" valor={numero(origens.length)} nota="no recorte" />
        <Kpi label="Conversão" valor={conv ?? "—"} unidade="%" nota="lead → ganho" />
      </div>
      <Bloco titulo="Leads por origem" canto="acumulado" sem>
        <Lista linhas={origens} formatar={numero} />
      </Bloco>
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
  );
}

/* Hub Loja. Receita da loja é da LOJA — nunca entra num total junto com
   curso (unidades diferentes). Produto e estoque só existem no Omie, que
   ainda não está integrado: vazio honesto em vez de número inventado. */
function HubLoja() {
  const { inicio, fim, rotulo } = usePeriodo();
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
        <ChipKpi Icone={AlertTriangle} label="A receber vencido" valor={mv(k?.a_receber_vencido)} nota="snapshot" />
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
            vazioTitulo="Nenhuma movimentação no período"
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
  const admin = perfil.papel === "admin" || perfil.setor === "geral";
  const [tela, setTela] = useState(admin ? "executivo" : perfil.setor);
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

  const visiveis = admin ? HUBS : HUBS.filter((h) => h.key === perfil.setor);
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
        /* Cards do Hub: 1 coluna no mobile, 2 em telas médias/grandes.
           O marginBottom do Bloco faz o ritmo vertical; a grade só cuida
           das colunas (row-gap 0 pra não somar espaço). */
        .gridFin { display: grid; grid-template-columns: 1fr; column-gap: 20px; align-items: start; }
        @media (min-width: 1000px) { .gridFin { grid-template-columns: 1fr 1fr; } }
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
