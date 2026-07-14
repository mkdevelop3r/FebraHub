import { useState, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TrendingUp, Wallet, Megaphone, GraduationCap, ShoppingBag, CalendarDays,
  LayoutDashboard, Lock, Mail, AlertTriangle, Package, LogOut, Power,
  Database, ShieldAlert, Loader2, ArrowRight, Sparkles, Bell,
} from "lucide-react";
import {
  useSessao, usePerfil, entrar, sair,
  useComercialFunil, useComercialRanking,
  useFinanceiroReceita, useFinanceiroInadimp, useFinanceiroQualid,
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

const HUBS = [
  { key: "comercial",  nome: "Comercial",  Icone: TrendingUp,    desc: "Funil, conversão e consultores" },
  { key: "financeiro", nome: "Financeiro", Icone: Wallet,        desc: "Receita por curso e cobertura" },
  { key: "marketing",  nome: "Marketing",  Icone: Megaphone,     desc: "Origem de leads e campanhas" },
  { key: "pedagogico", nome: "Pedagógico", Icone: GraduationCap, desc: "Turmas, matrículas e conclusão" },
  { key: "eventos",    nome: "Eventos",    Icone: CalendarDays,  desc: "Ingressos e receita líquida" },
  { key: "loja",       nome: "Loja",       Icone: ShoppingBag,   desc: "Sem fonte conectada" },
  { key: "estoque",    nome: "Estoque",    Icone: Package,       desc: "Sem fonte conectada" },
];

const agrupar = (linhas, chave, valor) => {
  const m = new Map();
  for (const l of linhas) m.set(l[chave] ?? "—", (m.get(l[chave] ?? "—") ?? 0) + Number(l[valor] ?? 0));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([rotulo, v]) => ({ rotulo, valor: v }));
};

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

function Bloco({ titulo, canto, children, sem }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.cardLine}`, borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: `1px solid ${C.hair}` }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.bright }}>{titulo}</span>
        {canto && <span style={{ fontSize: 11, color: C.faint }}>{canto}</span>}
      </div>
      <div style={{ padding: sem ? 0 : "16px 20px" }}>{children}</div>
    </div>
  );
}

/* Lista densa: rótulo, valor, variação. É o formato que a Dulce
   consegue ler de relance sem interpretar gráfico. */
function Lista({ linhas, formatar = moeda, total }) {
  const max = Math.max(...linhas.map((l) => Math.abs(l.valor)), 1);
  return (
    <div>
      {linhas.map((l) => (
        <div key={l.rotulo} style={{
          display: "grid", gridTemplateColumns: "1fr 120px", gap: 14, alignItems: "center",
          padding: "13px 20px", borderBottom: `1px solid ${C.hair}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13.5, fontWeight: 600, marginBottom: 7,
              color: l.orfa ? C.faint : C.bright,
              fontStyle: l.orfa ? "italic" : "normal",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={l.rotulo}>
              {l.rotulo}
            </div>
            <div style={{ height: 4, borderRadius: 3, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div style={{
                width: `${(Math.abs(l.valor) / max) * 100}%`, height: "100%", borderRadius: 3,
                background: l.orfa ? C.faint : `linear-gradient(90deg, ${C.goldBase}, ${C.gold})`,
              }} />
            </div>
          </div>
          <span style={{
            fontFamily: GROTESK, fontSize: 15, fontWeight: 700, textAlign: "right",
            color: l.orfa ? C.faint : C.text,
          }}>
            {formatar(l.valor)}
          </span>
        </div>
      ))}
      {total != null && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 120px", gap: 14,
          padding: "14px 20px", background: "rgba(255,255,255,.02)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.bright }}>Total</span>
          <span style={{ fontFamily: GROTESK, fontSize: 16, fontWeight: 700, textAlign: "right", color: C.gold }}>
            {formatar(total)}
          </span>
        </div>
      )}
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

function Estado({ carregando, erro, vazio, children }) {
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
          <div style={{ fontSize: 13.5, color: C.muted, fontWeight: 600 }}>Sem dados neste recorte</div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 4 }}>
            Ou a fonte não foi conectada, ou seu perfil não tem acesso a este setor.
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
  const funil = useComercialFunil();
  const rank = useComercialRanking();
  const valor = useMemo(() => porMes(funil.data ?? [], "mes", "valor_total"), [funil.data]);
  const negs = useMemo(() => porMes(funil.data ?? [], "mes", "negocios"), [funil.data]);
  const ganhos = useMemo(() => porMes(funil.data ?? [], "mes", "ganhos"), [funil.data]);
  const v = variacao(valor);
  const consultores = useMemo(() => agrupar(rank.data ?? [], "consultor", "ganhos").slice(0, 8), [rank.data]);
  const taxa = negs.at(-1)?.valor ? ((ganhos.at(-1)?.valor / negs.at(-1).valor) * 100).toFixed(1) : null;

  return (
    <Estado carregando={funil.isLoading} erro={funil.error} vazio={!funil.data?.length}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 26 }}>
        <Kpi label="Em negócios" valor={moeda(v.atual)} delta={v.delta} up={v.up} serie={v.serie} parcial={v.parcial != null ? moeda(v.parcial) : null} />
        <Kpi label="Negócios" valor={numero(negs.at(-1)?.valor)} delta={variacao(negs).delta} up={variacao(negs).up} serie={negs} />
        <Kpi label="Ganhos" valor={numero(ganhos.at(-1)?.valor)} delta={variacao(ganhos).delta} up={variacao(ganhos).up} serie={ganhos} />
        <Kpi label="Conversão" valor={taxa ?? "—"} unidade="%" nota="mês corrente" />
      </div>
      <Bloco titulo="Consultores por negócios ganhos" canto="acumulado" sem>
        <Estado carregando={rank.isLoading} erro={rank.error} vazio={!consultores.length}>
          <Lista linhas={consultores} formatar={numero} />
        </Estado>
      </Bloco>
    </Estado>
  );
}

function HubFinanceiro() {
  const rec = useFinanceiroReceita();
  const inad = useFinanceiroInadimp();
  const qual = useFinanceiroQualid();

  const vendas = useMemo(() => (rec.data ?? []).filter((r) => r.natureza === "venda"), [rec.data]);
  const serie = useMemo(() => porMes(vendas, "mes", "valor"), [vendas]);
  const v = variacao(serie);
  const cursos = useMemo(() => {
    const g = agrupar(vendas, "curso", "valor").slice(0, 8);
    return g.map((l) => l.rotulo === "nao_determinado" ? { ...l, rotulo: "Sem curso vinculado", orfa: true } : l);
  }, [vendas]);
  const ajustes = useMemo(
    () => (rec.data ?? []).filter((r) => r.natureza === "ajuste").reduce((s, r) => s + Number(r.valor ?? 0), 0),
    [rec.data]
  );
  const status = useMemo(() => agrupar(inad.data ?? [], "status_pagamento", "valor"), [inad.data]);
  const q = qual.data?.[0];

  return (
    <Estado carregando={rec.isLoading} erro={rec.error} vazio={!rec.data?.length}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 26 }}>
        <Kpi label="Receita · venda" valor={moeda(v.atual)} delta={v.delta} up={v.up} serie={v.serie} parcial={v.parcial != null ? moeda(v.parcial) : null} />
        <Kpi label="Ajustes e cortesias" valor={moeda(ajustes)} nota="não é venda" />
        <Kpi label="Sem data" valor={q ? numero(q.sem_data) : "—"} nota={q ? moeda(q.valor_sem_data) : ""} destaque={C.warn} />
        <Kpi label="Sem status" valor={q ? q.pct_sem_status : "—"} unidade="%" nota="dos pagamentos" destaque={C.warn} />
      </div>
      <Bloco titulo="Receita por curso" canto="venda · acumulado" sem>
        <Lista linhas={cursos} total={cursos.reduce((s, l) => s + l.valor, 0)} />
      </Bloco>
      <Bloco titulo="Status de pagamento" canto="acumulado" sem>
        <Estado carregando={inad.isLoading} erro={inad.error} vazio={!status.length}>
          <Lista linhas={status} />
        </Estado>
      </Bloco>
    </Estado>
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
      case "loja":
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

            <div style={{
              width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.cardLine}`,
              background: "rgba(255,255,255,.04)", display: "flex", alignItems: "center",
              justifyContent: "center", color: "#C9C9CE",
            }}>
              <Bell size={16} />
            </div>
          </div>

          {conteudo()}
        </div>
      </main>
    </div>
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
