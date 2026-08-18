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

   DESENHO: "ordem do dia". O time é designer, audiovisual, social media e
   tráfego — gente de produção —, e a rotina espelha uma call sheet: régua de
   dias na margem, área responsável em etiqueta, entrega ao lado. Densa e
   utilitária, sem decoração. A régua é a assinatura da tela: faz "hoje" ser
   achado sem leitura.
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

/* ============ DESIGN TOKENS ============
   Mesma paleta do FebraHub.jsx. Antes este arquivo tinha a sua (#121217 /
   #C3A34B), herdada do protótipo, e a tela ficava com dois dourados brigando
   ao lado dos outros hubs. A identidade do módulo vem da ESTRUTURA — a régua
   de dias, as etiquetas de área — e não de uma cor só dele.

   O dourado é escasso de propósito: marca decisão (hoje, e a fila que espera
   alguém). Contorno dourado em caixa grande vira papel de parede e some. */
const C = {
  void: "#08080A",
  surface: "rgba(255,255,255,.028)",
  bronzeLine: "rgba(255,255,255,.07)",
  hair: "rgba(255,255,255,.045)",
  gold: "#E4C06A",
  goldDim: "#B8934A",
  text: "#F5F3EE",
  textMuted: "#8B8B90",
  textFaint: "#5B5B62",
  alert: "#E06C75",
  positive: "#6FCF97",
};
const FONT_DISPLAY = "'Space Grotesk', system-ui, sans-serif";

/* Etiqueta de área (Designer, Audiovisual, Tráfego…). Caixa alta pequena e
   espaçada, como a coluna de departamento de uma ordem do dia: identifica
   sem competir com o nome da entrega. */
const etiqueta = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: ".11em",
  textTransform: "uppercase", fontFamily: FONT_DISPLAY,
  whiteSpace: "nowrap",
};

/* ============ UTIL ============ */
const HOJE = new Date().toISOString().slice(0, 10);
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const fmtDia = (iso) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
/* "2026-09-02" -> "2 set". Na pauta há duas datas por linha (o prazo, que é o
   grupo, e a do evento); escrevendo o mês por extenso a do evento deixa de
   parecer mais um "02/09" solto e vira texto. */
const fmtDiaMes = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${MESES_CURTO[d.getMonth()]}`;
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

/* ============ CHECKLIST ============
   O CÍRCULO É A LINGUAGEM DE ESTADO da tela inteira: vazio = falta fazer,
   verde = feito. Ação automática usa os MESMOS dois ícones — quem diz que
   ela é automática é o selo AUTO, não o ícone de estado.

   Isto já custou caro: o raio ⚡ ocupava o lugar do círculo nas automáticas
   pendentes, e as 11 que ainda esperam campanha ficavam com a mesma cara das
   5 que já estão no ar. O time lia "já está rodando". O raio sobrevive só
   colado ao selo, onde é adjetivo e não veredito. */
const TituloAuto = "Marcada pelo sistema quando a campanha entra no ar — não dá para marcar à mão";

function SeloAuto() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1.5 align-middle"
      style={{ ...etiqueta, color: C.goldDim }} title={TituloAuto}>
      <Zap size={9} /> auto
    </span>
  );
}

/* Estado da automática por extenso. "aguardando campanha" some da leitura de
   pendência; "tráfego ativo" diz o que de fato aconteceu, melhor que um ✓. */
const textoAuto = (concluida) => (concluida ? "tráfego ativo" : "aguardando campanha");

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
        title={automatica ? TituloAuto : ""}
      >
        {acao.concluida ? <CircleCheck size={18} /> : <Circle size={18} />}
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
          {automatica && <SeloAuto />}
        </p>
        <p className="text-[11px]" style={{ color: C.textFaint }}>
          {acao.responsavel || "Sem responsável"}
          {acao.concluida && acao.concluida_em && ` · feito em ${fmtDataHora(acao.concluida_em)}`}
        </p>
      </div>

      <span className="text-xs tabular-nums shrink-0"
        style={{ color: automatica && !acao.concluida ? C.textFaint : cor }}>
        {automatica
          ? textoAuto(acao.concluida)
          : acao.concluida ? "✓"
            : atrasada ? `${-diasAte(acao.prazo)}d atrasada`
              : `até ${fmtDia(acao.prazo)}`}
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
/* Triagem, não trabalho — por isso vem fechada. Aberta, dez linhas iguais com
   "Classificar" repetido dez vezes empurravam a pauta para baixo da dobra e
   davam à decisão menos frequente o maior peso da tela. */
function FilaPendentes({ pendentes, tipos, aoClassificar }) {
  const [aberto, setAberto] = useState(null);
  const [expandida, setExpandida] = useState(false);
  if (!pendentes.length) return null;

  if (!expandida) {
    return (
      <button onClick={() => setExpandida(true)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 mb-5 rounded-xl text-left"
        style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
        <HelpCircle size={14} style={{ color: C.gold }} className="shrink-0" />
        <span className="text-[13px]" style={{ color: C.text }}>
          {pendentes.length} evento{pendentes.length > 1 ? "s" : ""} esperando classificação
        </span>
        <span className="text-[11.5px] hidden sm:inline" style={{ color: C.textFaint }}>
          — sem tipo, não geram checklist
        </span>
        <span className="ml-auto shrink-0" style={{ ...etiqueta, color: C.gold }}>Ver fila</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl p-4 mb-5"
      style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
      <div className="flex items-center gap-2 mb-3">
        <HelpCircle size={14} style={{ color: C.gold }} />
        <p className="text-[13px]" style={{ color: C.text }}>
          {pendentes.length} evento{pendentes.length > 1 ? "s" : ""} esperando classificação
        </p>
        <button onClick={() => { setExpandida(false); setAberto(null); }}
          className="ml-auto" style={{ ...etiqueta, color: C.textMuted }}>
          Fechar
        </button>
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
                className="shrink-0 px-2.5 py-1 rounded-md"
                style={{ ...etiqueta, color: aberto === p.id ? C.textMuted : C.gold,
                  background: aberto === p.id ? "transparent" : `${C.gold}14`,
                  border: `1px solid ${aberto === p.id ? C.bronzeLine : `${C.gold}33`}` }}>
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
function LinhaPauta({ acao, aoMarcar, salvando, mostraPrazo, primeira }) {
  const atrasada = !acao.concluida && acao.prazo < HOJE;
  const automatica = acao.conclusao === "automatica";
  const ev = acao.evento;
  const corMarca = acao.concluida ? C.positive : atrasada ? C.alert : C.textFaint;

  return (
    /* A primeira linha do dia não desenha o próprio filete: a borda do grupo
       já está ali, e as duas juntas faziam a divisão entre dias parecer igual
       à divisão entre linhas. */
    <div className="flex items-baseline gap-3 py-2.5 pr-1"
      style={primeira ? undefined : { borderTop: `1px solid ${C.hair}` }}>
      <button
        onClick={() => !automatica && aoMarcar(acao.id, !acao.concluida)}
        disabled={automatica || salvando}
        aria-label={acao.concluida ? "Desmarcar" : "Concluir"}
        className="shrink-0 transition-transform hover:scale-110"
        style={{
          color: corMarca, cursor: automatica ? "not-allowed" : "pointer",
          opacity: salvando ? 0.4 : 1, transform: "translateY(3px)",
        }}
        title={automatica ? TituloAuto : ""}
      >
        {/* Mesmos dois ícones das manuais — ver o comentário em LinhaAcao. */}
        {acao.concluida ? <CircleCheck size={17} /> : <Circle size={17} />}
      </button>

      {/* QUEM VARIA É QUEM MANDA. Existem 8 nomes de ação no sistema todo, e
          os quatro principais aparecem uma vez por evento — "Card de
          divulgação" é o nome do template, idêntico nos 16. Dar a manchete a
          ele fazia vinte linhas dizerem a mesma coisa; o nome do EVENTO é o
          que distingue uma da outra, então é ele que vem primeiro. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[14.5px] truncate flex-1 min-w-0" title={ev?.nome}
            style={{
              color: acao.concluida ? C.textFaint : C.text,
              textDecorationLine: acao.concluida ? "line-through" : "none",
              textDecorationColor: C.textFaint,
            }}>
            {ev?.nome ?? "Evento sem nome"}
          </span>
          {/* A data do evento fica colada nele, na mesma linha: solta numa
              coluna à direita virava um segundo número sem legenda, brigando
              com o prazo que já é o grupo. */}
          {ev && (
            <span className="shrink-0 tabular-nums" title="Data do evento"
              style={{ fontFamily: FONT_DISPLAY, fontSize: 11, color: C.textFaint }}>
              {fmtDiaMes(ev.data_evento)}
            </span>
          )}
        </div>

        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-[12.5px] truncate" style={{ color: acao.concluida ? C.textFaint : C.textMuted }}>
            {acao.nome}
          </span>
          {acao.responsavel && (
            <span style={{ ...etiqueta, color: C.textFaint }}>{acao.responsavel}</span>
          )}
          {automatica && <SeloAuto />}

          {/* À direita: o estado da automática por extenso, ou — no bloco de
              atrasadas, onde as datas se misturam — de quando é o prazo. */}
          {automatica ? (
            <span className="ml-auto shrink-0" title={TituloAuto}
              style={{ fontFamily: FONT_DISPLAY, fontSize: 11, color: acao.concluida ? C.positive : C.textFaint }}>
              {textoAuto(acao.concluida)}
            </span>
          ) : mostraPrazo && (
            <span className="ml-auto shrink-0 tabular-nums" title="Prazo vencido"
              style={{ fontFamily: FONT_DISPLAY, fontSize: 11, color: C.alert }}>
              venceu {fmtDiaMes(acao.prazo)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* Régua de dias: a margem esquerda carrega o dia em número grande e o dia da
   semana embaixo. É a espinha da página — faz "hoje" ser achado sem leitura,
   e é o que separa esta tela de uma pilha de divs. */
function GrupoPauta({ dia, titulo, acoes, tom, aoMarcar, salvandoId }) {
  if (!acoes.length) return null;
  const alerta = tom === "alerta";
  const hoje = tom === "hoje";
  const corRegua = alerta ? C.alert : hoje ? C.gold : C.text;
  const d = dia ? new Date(dia + "T00:00:00") : null;

  return (
    <div className="flex gap-4 sm:gap-5" style={{ borderTop: `1px solid ${C.bronzeLine}` }}>
      <div className="shrink-0 pt-3.5 text-right" style={{ width: 52 }}>
        {d ? (
          <>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, lineHeight: 1, color: corRegua, fontWeight: 500 }}>
              {String(d.getDate()).padStart(2, "0")}
            </div>
            <div style={{ ...etiqueta, fontSize: 9, color: C.textFaint, marginTop: 3 }}>
              {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").slice(0, 3)}
            </div>
          </>
        ) : (
          <div style={{ ...etiqueta, color: C.alert, marginTop: 4, whiteSpace: "normal", lineHeight: 1.3 }}>
            Atrasado
          </div>
        )}
        {titulo && (
          <div style={{ ...etiqueta, fontSize: 9, color: hoje ? C.gold : C.textFaint, marginTop: 4 }}>
            {titulo}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 pb-2.5"
        style={alerta ? { borderLeft: `2px solid ${C.alert}`, paddingLeft: 14, marginLeft: -8 } : undefined}>
        {acoes.map((a, i) => (
          <LinhaPauta key={a.id} acao={a} aoMarcar={aoMarcar} primeira={i === 0}
            salvando={salvandoId === a.id} mostraPrazo={alerta} />
        ))}
      </div>
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
    <div>
      {/* Atrasado vem sempre no topo e ignora o mês escolhido: dívida vencida
          não some da vista porque a pessoa navegou para outro mês. */}
      <GrupoPauta acoes={atrasadas} tom="alerta" aoMarcar={aoMarcar} salvandoId={salvandoId} />
      {[...porDia.entries()].map(([dia, lista]) => {
        const d = diasAte(dia);
        return (
          <GrupoPauta key={dia} dia={dia} acoes={lista}
            titulo={d === 0 ? "hoje" : d === 1 ? "amanhã" : null}
            tom={d === 0 ? "hoje" : null}
            aoMarcar={aoMarcar} salvandoId={salvandoId} />
        );
      })}
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
      {/* Abas como guias sublinhadas, não pílulas: pílula dourada some no meio
          das outras pílulas douradas da tela. A linha embaixo diz onde você
          está sem gastar mais uma cor. */}
      <div className="flex items-center gap-6 mb-5" style={{ borderBottom: `1px solid ${C.bronzeLine}` }}>
        {[["pauta", "Pauta", ListChecks], ["eventos", "Por evento", CalendarDays]].map(([k, rot, Icone]) => {
          const on = aba === k;
          return (
            <button key={k} onClick={() => setAba(k)}
              className="inline-flex items-center gap-2 pb-2.5 -mb-px"
              style={{
                color: on ? C.text : C.textMuted,
                borderBottom: `2px solid ${on ? C.gold : "transparent"}`,
              }}>
              <Icone size={14} style={{ color: on ? C.gold : C.textFaint }} />
              <span style={{ ...etiqueta, fontSize: 10.5 }}>{rot}</span>
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
