/* ============================================================
   CENTRAL DE EVENTOS · Hub de Operação do Marketing
   FebraHub — módulo do setor Marketing.

   O que está na agenda, o que cada evento precisa e o que atrasou. Roda
   dentro do Shell, como os outros hubs; a navegação é por estado
   (`tela === "central-eventos"`), não por rota.

   ESCRITA SÓ POR RPC — `mkt_marcar_acao` e `mkt_classificar_evento`, ambas
   em lib/dados.js. Nenhum update direto: as tabelas têm RLS e as regras
   (ação automática não se marca à mão, classificar exige gestor_marketing)
   vivem no banco. Quando o banco recusa, o texto dele aparece no aviso de
   erro da própria página — nunca em alert() nem só no console.

   PALETA: este arquivo declara o `C` local com os mesmos valores de
   Rotas/Avaliacao.jsx, que é a convenção dos componentes extraídos. Note
   que NÃO é a paleta do FebraHub.jsx (void #08080A, gold #E4C06A): as duas
   convivem no repositório desde antes deste módulo. Trocar é mudar um
   objeto só, se um dia forem unificadas.
   ============================================================ */

import { useState, useEffect, useCallback } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Circle,
  AlertTriangle, Copy, Check, Users, UserCheck, Zap, HelpCircle,
  RefreshCw, X, ListChecks,
} from "lucide-react";
import {
  mktUnidadesAtivas, mktTiposComChecklist, mktEventosDoMes,
  mktPendentes, mktMarcarAcao, mktClassificarEvento, mktProximoEventoAtivo,
  mktAcoesDoPeriodo, mktAcoesAtrasadas,
} from "../lib/dados";

/* ============ DESIGN TOKENS ============ */
const C = {
  void: "#121217",
  surface: "#1C1C24",
  bronzeLine: "#413a30",
  gold: "#C3A34B",
  goldDim: "#8A7239",
  text: "#F2EDE1",
  textMuted: "#9C968A",
  textFaint: "#6b665c",
  alert: "#C2665A",
  positive: "#8FAE7C",
};
const FONT_DISPLAY = "'Space Grotesk', sans-serif";

/* ============ UTIL ============ */
const HOJE = new Date().toISOString().slice(0, 10);
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const fmtDia = (iso) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const fmtDataHora = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} às ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const diasAte = (iso) => Math.ceil((new Date(iso) - new Date(HOJE)) / 86400000);

/* Cabeçalho de cada grupo da pauta. "Hoje" e "Amanhã" por nome porque é
   assim que a operação fala; o resto ganha dia da semana, que é o que
   deixa "sexta" visível sem contar no calendário. */
const rotuloDia = (iso) => {
  const d = diasAte(iso);
  if (d === 0) return "Hoje";
  if (d === 1) return "Amanhã";
  const dt = new Date(iso + "T00:00:00");
  const semana = dt.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${dt.getDate()} de ${MESES[dt.getMonth()].toLowerCase()}`;
};

/* ============ PRIMITIVES ============ */
function Chip({ children, tone = "muted" }) {
  const tones = {
    muted: { bg: "rgba(156,150,138,0.12)", fg: C.textMuted },
    gold: { bg: "rgba(195,163,75,0.14)", fg: C.gold },
    alert: { bg: "rgba(194,102,90,0.14)", fg: C.alert },
    positive: { bg: "rgba(143,174,124,0.14)", fg: C.positive },
  };
  const t = tones[tone];
  return (
    <span className="text-[11px] tracking-wide uppercase font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}>
      {children}
    </span>
  );
}

function BarraProntidao({ feitas, total }) {
  const pct = total ? Math.round((feitas / total) * 100) : 0;
  const cor = pct === 100 ? C.positive : pct >= 50 ? C.gold : C.alert;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="h-1.5 rounded-full flex-1 min-w-[70px] overflow-hidden" style={{ background: C.void }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <span className="text-xs tabular-nums shrink-0" style={{ color: C.textMuted }}>
        {feitas}/{total}
      </span>
    </div>
  );
}

/* O código fica à vista no checklist porque é o que o time de tráfego cola
   no nome da campanha. Sem ele visível, alguém digita errado e a campanha
   deixa de casar com o evento. */
function CodigoEvento({ codigo }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard?.writeText(codigo);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
  };
  return (
    <button onClick={copiar} title="Copiar código — vai no nome da campanha de tráfego"
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md font-mono transition-colors"
      style={{ background: C.void, color: copiado ? C.positive : C.goldDim, border: `1px solid ${C.bronzeLine}` }}>
      {copiado ? <Check size={11} /> : <Copy size={11} />}
      {codigo}
    </button>
  );
}

/* ============ CHECKLIST ============ */
function LinhaAcao({ acao, aoMarcar, salvando }) {
  const atrasada = !acao.concluida && acao.prazo < HOJE;
  // Ação automática não é clicável: quem marca é o sistema, quando a
  // campanha entra no ar. A RPC recusaria de qualquer jeito.
  const automatica = acao.conclusao === "automatica";
  const cor = acao.concluida ? C.positive : atrasada ? C.alert : C.textMuted;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
      style={{ background: atrasada ? "rgba(194,102,90,0.06)" : "transparent" }}>
      <button
        onClick={() => !automatica && aoMarcar(acao.id, !acao.concluida)}
        disabled={automatica || salvando}
        aria-label={acao.concluida ? "Desmarcar" : "Concluir"}
        className="shrink-0 transition-transform hover:scale-110"
        style={{ color: cor, cursor: automatica ? "not-allowed" : "pointer", opacity: salvando ? 0.5 : 1 }}
        title={automatica ? "Ação automática: o sistema marca quando a campanha estiver rodando" : ""}
      >
        {acao.concluida ? <CircleCheck size={18} />
          : automatica ? <Zap size={16} />
            : <Circle size={18} />}
      </button>

      <div className="flex-1 min-w-0">
        {/* `textDecorationLine`, não `textDecoration`: misturar a abreviada
            com a específica (`textDecorationColor`) faz o React avisar a cada
            render e pode dar bug de estilo — ele não sabe qual vence. */}
        <p className="text-sm truncate" style={{
          color: acao.concluida ? C.textMuted : C.text,
          textDecorationLine: acao.concluida ? "line-through" : "none",
          textDecorationColor: C.textFaint,
        }}>
          {acao.nome}
          {automatica && <span className="text-[10px] ml-1.5 uppercase tracking-wide" style={{ color: C.goldDim }}>auto</span>}
        </p>
        <p className="text-[11px]" style={{ color: C.textFaint }}>
          {acao.responsavel || "Sem responsável"}
          {acao.concluida && acao.concluida_em && ` · feito em ${fmtDataHora(acao.concluida_em)}`}
        </p>
      </div>

      <span className="text-xs tabular-nums shrink-0" style={{ color: cor }}>
        {acao.concluida ? "✓" : atrasada ? `${-diasAte(acao.prazo)}d atrasada` : `até ${fmtDia(acao.prazo)}`}
      </span>
    </div>
  );
}

/* ============ CARD DE EVENTO ============ */
function EventoCard({ evento, aberto, aoAbrir, aoMarcar, salvandoId }) {
  const total = evento.acoes.length;
  const feitas = evento.acoes.filter((a) => a.concluida).length;
  const atrasadas = evento.acoes.filter((a) => !a.concluida && a.prazo < HOJE).length;
  const dias = diasAte(evento.data_evento);
  const r = evento.resultados;

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ background: C.surface, border: `1px solid ${aberto ? C.goldDim : C.bronzeLine}` }}>

      <button onClick={aoAbrir} className="w-full flex items-center gap-4 p-4 text-left">
        <div className="w-12 shrink-0 text-center rounded-lg py-1.5"
          style={{ background: C.void, border: `1px solid ${C.bronzeLine}` }}>
          <p className="text-lg leading-none font-light" style={{ color: C.text, fontFamily: FONT_DISPLAY }}>
            {evento.data_evento.slice(8, 10)}
          </p>
          <p className="text-[10px] uppercase" style={{ color: C.textFaint }}>
            {MESES_CURTO[parseInt(evento.data_evento.slice(5, 7), 10) - 1]}
          </p>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Chip tone="gold">{evento.tipo}</Chip>
            {atrasadas > 0 && <Chip tone="alert">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</Chip>}
            {dias >= 0 && dias <= 7 && <Chip tone={dias <= 2 ? "alert" : "muted"}>em {dias}d</Chip>}
          </div>
          <p className="text-sm font-medium truncate mb-1.5" style={{ color: C.text }}>{evento.nome}</p>
          <BarraProntidao feitas={feitas} total={total} />
        </div>

        {r && (
          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-xs" style={{ color: C.textMuted }}>
            <span className="inline-flex items-center gap-1"><Users size={12} style={{ color: C.gold }} /> {r.inscritos ?? 0} inscritos</span>
            <span className="inline-flex items-center gap-1"><UserCheck size={12} style={{ color: C.textFaint }} /> {r.presentes ?? 0} presentes</span>
          </div>
        )}
        <ChevronRight size={16} className="shrink-0 transition-transform" style={{ color: C.textFaint, transform: aberto ? "rotate(90deg)" : "none" }} />
      </button>

      {aberto && (
        <div className="px-4 pb-4 subir">
          <div className="flex items-center justify-between gap-2 mb-2 pt-2 flex-wrap"
            style={{ borderTop: `1px solid ${C.bronzeLine}` }}>
            <p className="text-[11px] uppercase tracking-widest pt-2" style={{ color: C.textFaint }}>
              Checklist de divulgação
            </p>
            <div className="pt-2"><CodigoEvento codigo={evento.codigo} /></div>
          </div>
          <div className="flex flex-col">
            {evento.acoes.map((a) => (
              <LinhaAcao key={a.id} acao={a} aoMarcar={aoMarcar} salvando={salvandoId === a.id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ FILA: PRECISA DE ALGUMA COISA? ============ */
function FilaPendentes({ pendentes, tipos, aoClassificar }) {
  const [aberto, setAberto] = useState(null);
  if (!pendentes.length) return null;

  return (
    <div className="rounded-xl p-4 mb-6"
      style={{ background: "rgba(195,163,75,0.06)", border: `1px solid ${C.goldDim}` }}>
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle size={15} style={{ color: C.gold }} />
        <p className="text-sm font-medium" style={{ color: C.gold }}>
          Precisa de alguma coisa? · {pendentes.length} evento{pendentes.length > 1 ? "s" : ""} sem classificação
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {pendentes.map((p) => (
          <div key={p.id} className="rounded-lg p-3" style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm truncate" style={{ color: C.text }}>{p.nome}</p>
                <p className="text-[11px]" style={{ color: C.textFaint }}>{fmtDia(p.data_evento)}</p>
              </div>
              <button onClick={() => setAberto(aberto === p.id ? null : p.id)}
                className="text-xs px-3 py-1.5 rounded-lg shrink-0"
                style={{ background: C.void, color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
                {aberto === p.id ? "Fechar" : "Classificar"}
              </button>
            </div>
            {aberto === p.id && (
              <div className="flex flex-wrap gap-2 mt-3 subir">
                {tipos.map((t) => (
                  <button key={t.id} onClick={() => aoClassificar(p.id, t.id)}
                    className="text-xs px-3 py-1.5 rounded-full transition-colors"
                    style={{ background: "rgba(195,163,75,0.14)", color: C.gold }}>
                    {t.nome}
                  </button>
                ))}
                {/* Sem tipos legíveis não há o que oferecer além do "nada
                    necessário" — dizer isso é melhor que uma fileira vazia
                    que parece bug. */}
                {!tipos.length && (
                  <span className="text-[11px] self-center" style={{ color: C.textFaint }}>
                    Nenhum tipo de evento disponível para o seu perfil.
                  </span>
                )}
                <button onClick={() => aoClassificar(p.id, null)}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ background: "rgba(156,150,138,0.12)", color: C.textMuted }}>
                  Nada necessário
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ PAUTA (por prazo) ============
   A visão de trabalho. Uma linha por AÇÃO, agrupada pelo dia em que vence,
   com o evento como contexto à direita — o inverso do card, que agrupa por
   evento e esconde o prazo lá dentro.

   Existe porque prazo e data do evento divergem: 45 das 98 ações vencem em
   mês diferente do evento. Indexar a tela pela data do evento fazia agosto
   aparecer vazio tendo 27 ações a vencer. */
function LinhaPauta({ acao, aoMarcar, salvando }) {
  const atrasada = !acao.concluida && acao.prazo < HOJE;
  const automatica = acao.conclusao === "automatica";
  const cor = acao.concluida ? C.positive : atrasada ? C.alert : C.textMuted;
  const ev = acao.evento;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5"
      style={{ borderTop: `1px solid ${C.bronzeLine}` }}>
      <button
        onClick={() => !automatica && aoMarcar(acao.id, !acao.concluida)}
        disabled={automatica || salvando}
        aria-label={acao.concluida ? "Desmarcar" : "Concluir"}
        className="shrink-0 transition-transform hover:scale-110"
        style={{ color: cor, cursor: automatica ? "not-allowed" : "pointer", opacity: salvando ? 0.5 : 1 }}
        title={automatica ? "Ação automática: o sistema marca quando a campanha estiver rodando" : ""}
      >
        {acao.concluida ? <CircleCheck size={18} />
          : automatica ? <Zap size={16} />
            : <Circle size={18} />}
      </button>

      <div className="flex-1 min-w-0">
        <p className="text-sm truncate" style={{
          color: acao.concluida ? C.textMuted : C.text,
          textDecorationLine: acao.concluida ? "line-through" : "none",
          textDecorationColor: C.textFaint,
        }}>
          {acao.nome}
          {automatica && <span className="text-[10px] ml-1.5 uppercase tracking-wide" style={{ color: C.goldDim }}>auto</span>}
        </p>
        <p className="text-[11px] truncate" style={{ color: C.textFaint }}>
          {acao.responsavel || "Sem responsável"}
          {ev ? ` · ${ev.nome}` : ""}
        </p>
      </div>

      {/* A data do EVENTO fica à direita: na pauta o prazo já é o
          agrupamento, então o que falta saber é para quando é a entrega. */}
      {ev && (
        <span className="text-xs tabular-nums shrink-0 hidden sm:inline" style={{ color: C.textFaint }}>
          {fmtDia(ev.data_evento)}
        </span>
      )}
      {atrasada && (
        <span className="text-xs tabular-nums shrink-0" style={{ color: C.alert }}>
          {-diasAte(acao.prazo)}d
        </span>
      )}
    </div>
  );
}

function GrupoPauta({ titulo, acoes, tom, aoMarcar, salvandoId }) {
  if (!acoes.length) return null;
  const alerta = tom === "alerta";
  return (
    <div>
      <div className="px-4 py-2"
        style={{
          background: alerta ? "rgba(194,102,90,0.10)" : "rgba(255,255,255,0.02)",
          borderTop: `1px solid ${C.bronzeLine}`,
        }}>
        <span className="text-[12px] font-medium" style={{ color: alerta ? C.alert : C.text }}>
          {titulo}
        </span>
        <span className="text-[11px] ml-2" style={{ color: C.textFaint }}>
          {acoes.length} {acoes.length === 1 ? "ação" : "ações"}
        </span>
      </div>
      {acoes.map((a) => (
        <LinhaPauta key={a.id} acao={a} aoMarcar={aoMarcar} salvando={salvandoId === a.id} />
      ))}
    </div>
  );
}

function Pauta({ atrasadas, acoes, mes, aoMarcar, salvandoId }) {
  /* Uma ação vencida DENTRO do mês na tela vem nas duas listas: em
     `atrasadas` (que varre a base toda) e em `acoes` (a janela do mês). Sem
     tirar a repetição, ela aparecia duas vezes — no topo e de novo no dia
     dela. O grupo "Atrasado" ganha. */
  const jaNoTopo = new Set(atrasadas.map((a) => a.id));

  // Um grupo por dia, na ordem do prazo. Map preserva ordem de inserção e a
  // lista já vem ordenada do banco.
  const porDia = new Map();
  for (const a of acoes) {
    if (jaNoTopo.has(a.id)) continue;
    if (!porDia.has(a.prazo)) porDia.set(a.prazo, []);
    porDia.get(a.prazo).push(a);
  }

  if (!atrasadas.length && !acoes.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <CalendarDays size={28} style={{ color: C.textFaint }} />
        <p className="text-sm max-w-md" style={{ color: C.textMuted }}>
          Nada a fazer com prazo em {MESES[mes]}. As ações nascem junto com o
          evento, a partir do modelo do tipo dele.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
      {/* Atrasado vem sempre no topo e ignora o mês escolhido: dívida vencida
          não some da vista porque a pessoa navegou para outro mês. */}
      <GrupoPauta titulo="Atrasado" acoes={atrasadas} tom="alerta"
        aoMarcar={aoMarcar} salvandoId={salvandoId} />
      {[...porDia.entries()].map(([dia, lista]) => (
        <GrupoPauta key={dia} titulo={rotuloDia(dia)} acoes={lista}
          aoMarcar={aoMarcar} salvandoId={salvandoId} />
      ))}
    </div>
  );
}

/* ============ SELETOR DE MÊS ============ */
function SeletorMes({ ano, mes, aoMudar }) {
  const voltar = () => (mes === 0 ? aoMudar(ano - 1, 11) : aoMudar(ano, mes - 1));
  const avancar = () => (mes === 11 ? aoMudar(ano + 1, 0) : aoMudar(ano, mes + 1));
  return (
    <div className="flex items-center gap-1">
      <button onClick={voltar} aria-label="Mês anterior" className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: C.surface, color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
        <ChevronLeft size={15} />
      </button>
      <div className="px-4 py-1.5 rounded-lg text-sm min-w-[150px] text-center"
        style={{ background: C.surface, color: C.text, border: `1px solid ${C.bronzeLine}`, fontFamily: FONT_DISPLAY }}>
        {MESES[mes]} {ano}
      </div>
      <button onClick={avancar} aria-label="Próximo mês" className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ background: C.surface, color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

/* ============ ABAS DE UNIDADE ============
   Só aparecem com mais de uma unidade. E são recorte de EXIBIÇÃO, não de
   permissão: a lista já vem filtrada pela policy (`gestor_marketing` ou
   `unidade_id` do perfil), e a aba apenas escolhe qual das unidades que o
   perfil JÁ pode ver fica na tela. O front não decide quem enxerga o quê.
   Hoje só existe Salvador cadastrada, então isto não renderiza nada. */
function AbasUnidade({ unidades, ativa, aoMudar }) {
  if (unidades.length < 2) return null;
  return (
    <div className="flex items-center gap-1 mb-5">
      {unidades.map((u) => {
        const on = u.id === ativa;
        return (
          <button key={u.id} onClick={() => aoMudar(u.id)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: on ? "rgba(195,163,75,0.14)" : C.surface,
              color: on ? C.gold : C.textMuted,
              border: `1px solid ${on ? C.goldDim : C.bronzeLine}`,
            }}>
            {u.nome}
          </button>
        );
      })}
    </div>
  );
}

/* ============ PÁGINA ============ */
export default function CentralEventos() {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());
  const [aba, setAba] = useState("pauta"); // pauta = onde se trabalha
  const [eventos, setEventos] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [atrasadas, setAtrasadas] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [unidadeAtiva, setUnidadeAtiva] = useState(null);
  const [proximo, setProximo] = useState(null); // 1º ativo depois deste mês
  const [aberto, setAberto] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const ini = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
      const fim = mes === 11 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 2).padStart(2, "0")}-01`;
      const [evs, acs, atr, pends, tps, unis, prox] = await Promise.all([
        mktEventosDoMes(ini, fim), mktAcoesDoPeriodo(ini, fim), mktAcoesAtrasadas(HOJE),
        mktPendentes(), mktTiposComChecklist(), mktUnidadesAtivas(), mktProximoEventoAtivo(fim),
      ]);
      setEventos(evs);
      setAcoes(acs);
      setAtrasadas(atr);
      setPendentes(pends);
      setTipos(tps);
      setUnidades(unis);
      setProximo(prox);
    } catch (e) {
      setErro(String(e.message || e));
    } finally {
      setCarregando(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  /* A unidade escolhida é DERIVADA: se sumiu da lista (ou nunca houve
     escolha), vale a primeira. Evita o efeito que zera estado e a tela em
     branco quando a lista muda. */
  const unidadeAlvo = unidades.some((u) => u.id === unidadeAtiva)
    ? unidadeAtiva
    : (unidades[0]?.id ?? null);

  // Com uma unidade só (ou nenhuma escolhida) não há o que recortar.
  const recortando = unidades.length >= 2 && unidadeAlvo != null;
  const soDaUnidade = (lista, unidadeDe) =>
    (recortando ? lista.filter((x) => unidadeDe(x) === unidadeAlvo) : lista);

  const eventosVisiveis = soDaUnidade(eventos, (e) => e.unidade_id);
  const pendentesVisiveis = soDaUnidade(pendentes, (p) => p.unidade_id);
  // Na pauta a unidade vem do evento embutido, não da própria ação.
  const acoesVisiveis = soDaUnidade(acoes, (a) => a.evento?.unidade_id);
  const atrasadasVisiveis = soDaUnidade(atrasadas, (a) => a.evento?.unidade_id);

  const marcar = async (acaoId, concluida) => {
    setSalvandoId(acaoId);
    /* Otimista: o check aparece na hora. Nas TRÊS listas — a mesma ação
       aparece no card do evento e na pauta, e atualizar só uma deixaria as
       abas discordando entre si. */
    const aplicar = (a) => (a.id === acaoId
      ? { ...a, concluida, concluida_em: concluida ? new Date().toISOString() : null }
      : a);
    setEventos((prev) => prev.map((e) => ({ ...e, acoes: e.acoes.map(aplicar) })));
    setAcoes((prev) => prev.map(aplicar));
    setAtrasadas((prev) => (concluida ? prev.filter((a) => a.id !== acaoId) : prev));
    try {
      await mktMarcarAcao(acaoId, concluida);
    } catch (e) {
      /* Ordem importa: `carregar()` começa zerando o erro, então setar antes
         dele faria a mensagem do banco piscar e sumir — o check voltaria
         atrás sem explicação nenhuma na tela. Recarrega primeiro (desfaz o
         otimismo com a verdade do banco), avisa depois. */
      await carregar();
      setErro(`Não foi possível salvar: ${e.message}`);
    } finally {
      setSalvandoId(null);
    }
  };

  const classificar = async (eventoId, tipoId) => {
    try {
      await mktClassificarEvento(eventoId, tipoId);
      carregar();
    } catch (e) {
      setErro(`Não foi possível classificar: ${e.message}`);
    }
  };

  /* Conta a base inteira de atrasadas, não só as do mês na tela: é aviso de
     dívida, e escondê-la ao navegar de mês seria o mesmo erro que a tela
     indexada por data de evento cometia. */
  const totalAtrasadas = atrasadasVisiveis.length;

  const nomeUnidade = unidades.find((u) => u.id === unidadeAlvo)?.nome;

  return (
    <div className="subir">
      <div className="flex items-end justify-between gap-4 mb-2 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest mb-2" style={{ color: C.gold }}>
            Marketing{nomeUnidade ? ` · ${nomeUnidade}` : ""}
          </p>
          <h2 className="text-2xl md:text-3xl" style={{ color: C.text, fontFamily: FONT_DISPLAY }}>
            Central de Eventos
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <SeletorMes ano={ano} mes={mes} aoMudar={(a, m) => { setAno(a); setMes(m); setAberto(null); }} />
          <button onClick={carregar} aria-label="Atualizar" className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: C.surface, color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
            <RefreshCw size={14} className={carregando ? "girar" : ""} />
          </button>
        </div>
      </div>

      <p className="text-sm mb-5" style={{ color: C.textMuted }}>
        {aba === "pauta"
          ? `O que vence em ${MESES[mes]}, na ordem do prazo`
          : `Os eventos de ${MESES[mes]} e o quanto cada um já está pronto`}
        {/* "ação" vira "ações", não "açãoões": o plural troca a palavra
            inteira. Vinha assim do protótipo e só apareceu quando houve
            mais de uma atrasada na tela. */}
        {totalAtrasadas > 0 && (
          <span style={{ color: C.alert }}>
            {" "}— {totalAtrasadas} {totalAtrasadas > 1 ? "ações vencidas" : "ação vencida"} agora
          </span>
        )}.
      </p>

      {/* Duas leituras do MESMO dado. A pauta responde "o que eu faço hoje";
          o card, "está tudo pronto para a palestra do Valter?". A primeira é
          o padrão porque é a pergunta diária. */}
      <div className="flex items-center gap-1 mb-5">
        {[["pauta", "Pauta", ListChecks], ["eventos", "Por evento", CalendarDays]].map(([k, rot, Icone]) => {
          const on = aba === k;
          return (
            <button key={k} onClick={() => setAba(k)}
              className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors"
              style={{
                background: on ? "rgba(195,163,75,0.14)" : C.surface,
                color: on ? C.gold : C.textMuted,
                border: `1px solid ${on ? C.goldDim : C.bronzeLine}`,
              }}>
              <Icone size={13} /> {rot}
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="flex items-start gap-2.5 rounded-xl p-3.5 mb-5 text-sm"
          style={{ background: "rgba(194,102,90,0.1)", border: `1px solid ${C.alert}`, color: C.text }}>
          <AlertTriangle size={15} style={{ color: C.alert, marginTop: 1 }} className="shrink-0" />
          <span className="min-w-0 break-words">{erro}</span>
          <button onClick={() => setErro(null)} className="ml-auto shrink-0" style={{ color: C.textMuted }} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      )}

      <AbasUnidade unidades={unidades} ativa={unidadeAlvo} aoMudar={setUnidadeAtiva} />

      <FilaPendentes pendentes={pendentesVisiveis} tipos={tipos} aoClassificar={classificar} />

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm" style={{ color: C.textFaint }}>
          <RefreshCw size={14} className="girar" /> Carregando…
        </div>
      ) : aba === "pauta" ? (
        <Pauta atrasadas={atrasadasVisiveis} acoes={acoesVisiveis} mes={mes}
          aoMarcar={marcar} salvandoId={salvandoId} />
      ) : eventosVisiveis.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CalendarDays size={28} style={{ color: C.textFaint }} />
          <p className="text-sm max-w-md" style={{ color: C.textMuted }}>
            Nenhum evento ativo em {MESES[mes]}. Eventos entram aqui sozinhos quando
            aparecem na agenda do Google — e a lista respeita o seu perfil: sem
            acesso ao Marketing, ela vem vazia.
          </p>
          {/* Mês vazio não quer dizer agenda vazia. Sem este atalho, quem abre
              em agosto (hoje, zero ativos) conclui que o módulo não funciona,
              quando os 16 eventos estão logo adiante. */}
          {proximo && (
            <button
              onClick={() => {
                setAno(Number(proximo.slice(0, 4)));
                setMes(Number(proximo.slice(5, 7)) - 1);
                setAberto(null);
              }}
              className="text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5"
              style={{ background: "rgba(195,163,75,0.14)", color: C.gold, border: `1px solid ${C.goldDim}` }}
            >
              Ir para {MESES[Number(proximo.slice(5, 7)) - 1]} {proximo.slice(0, 4)}
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {eventosVisiveis.map((e) => (
            <EventoCard key={e.id} evento={e}
              aberto={aberto === e.id}
              aoAbrir={() => setAberto(aberto === e.id ? null : e.id)}
              aoMarcar={marcar}
              salvandoId={salvandoId} />
          ))}
        </div>
      )}
    </div>
  );
}
