/* ============================================================
   CENTRAL DE EVENTOS · Hub de Operação do Marketing
   FebraHub — módulo do setor Marketing.

   O que está na agenda, o que cada evento precisa e o que atrasou. Roda
   dentro do Shell, como os outros hubs; a navegação é por estado
   (`tela === "central-eventos"`), não por rota.

   ESCRITA SÓ POR RPC — `mkt_marcar_acao`, `mkt_classificar_evento`,
   `mkt_cancelar_evento` e `mkt_reativar_evento`, todas em lib/dados.js.
   Nenhum update direto: as tabelas têm RLS e as regras (ação automática não
   se marca à mão; classificar e cancelar exigem gestor_marketing; cancelar
   exige motivo) vivem no banco. Quando o banco recusa, o texto dele aparece
   no aviso de erro da própria página — nunca em alert() nem só no console.

   DESENHO: "ordem do dia". O time é designer, audiovisual, social media e
   tráfego — gente de produção —, e a rotina espelha uma call sheet: régua de
   dias na margem, área responsável em etiqueta, entrega ao lado. Densa e
   utilitária, sem decoração. A régua é a assinatura da tela: faz "hoje" ser
   achado sem leitura.
   ============================================================ */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Circle,
  AlertTriangle, Copy, Check, Users, UserCheck, Zap, HelpCircle,
  RefreshCw, X, ListChecks, Ban, Undo2, CalendarClock, Bell, Ticket,
  Save, Lock,
  Database, ShieldAlert, Loader2,
} from "lucide-react";
import {
  mktUnidadesAtivas, mktTiposComChecklist, mktEventosDoMes,
  mktPendentes, mktMarcarAcao, mktClassificarEvento, mktProximoEventoAtivo,
  mktAcoesDoPeriodo, mktAcoesAtrasadas,
  mktCanceladosDoMes, mktCancelarEvento, mktReativarEvento, mktSouGestor,
  mktPublicoDoMes,
  useCentralFebracis, usePodeEditarEvento, salvarEventoDetalhe, useSessao,
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
  panel: "rgba(14,14,16,.72)",
  card: "rgba(255,255,255,.028)",
  cardLine: "rgba(255,255,255,.08)",
  surface: "rgba(255,255,255,.028)",
  bronzeLine: "rgba(255,255,255,.07)",
  /* Contorno de moldura, mais firme que `bronzeLine`. A grade do
     calendario precisa se fechar como objeto; com 7% ela dissolvia no
     fundo. Usar so aqui, para nao virar a nova borda padrao de tudo. */
  moldura: "rgba(255,255,255,.13)",
  hair: "rgba(255,255,255,.045)",
  gold: "#E4C06A",
  goldTop: "#F2D488",
  goldBase: "#B8934A",
  goldDim: "#B8934A",
  text: "#F5F3EE",
  bright: "#EDEBE4",
  muted: "#8B8B90",
  faint: "#6A6A70",
  dim: "#5B5B62",
  down: "#E06C75",
  warn: "#E6B04D",
  up: "#6FCF97",
  textMuted: "#8B8B90",
  textFaint: "#5B5B62",
  alert: "#E06C75",
  positive: "#6FCF97",
};
const FONT_DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const SANS = "'Manrope', system-ui, sans-serif";

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

/* Uma ação abre portão quando o catálogo diz que ela pede algo antes de
   concluir. Fica aqui, e não dentro de cada linha, porque as duas telas
   precisam responder a mesma pergunta — e a resposta tem de ser a mesma. */
const precisaGate = (acao) =>
  !!acao.pede_agendamento || (acao.confirmar_itens?.length ?? 0) > 0;

/* Estado da automática por extenso. "aguardando campanha" some da leitura de
   pendência; "tráfego ativo" diz o que de fato aconteceu, melhor que um ✓. */
const textoAuto = (concluida) => (concluida ? "tráfego ativo" : "aguardando campanha");

/* ============ PORTÃO DE CONCLUSÃO ============
   Duas ações do checklist não se concluem num clique. Elas exigem
   responder algo antes, e este componente é o lugar único onde isso
   acontece — nas duas telas, com o mesmo desenho:

     · "Postagem programada"  pede PARA QUANDO (migration 142);
     · "Envio para o treinador — vídeo, card e link" pede a CONFERÊNCIA
       de link, card e vídeo, um a um (migration 143).

   Os dois requisitos vêm do DADO (`pede_agendamento`, `confirmar_itens`),
   nunca do nome da ação. Foi a escolha das duas migrations e o motivo é o
   mesmo: comparar título dentro do componente faria renomear a ação — ou
   passar a exigir um quarto item — virar mudança de código. Hoje é UPDATE
   numa linha de `mkt_templates_acao`, e esta tela obedece sem saber.

   Por isso o componente também não conhece "link", "card" nem "vídeo":
   ele desenha a lista que vier.

   O botão só acende quando TODOS os requisitos estão satisfeitos. É a
   regra inteira — o banco não verifica a conferência, porque as marcações
   não são gravadas (se a ação não conclui sem elas, "concluída" já quer
   dizer que foram feitas). O portão existe contra desatenção de quem está
   trabalhando, não contra má-fé.

   `colorScheme: dark` no campo de data não é enfeite: sem isso o seletor
   nativo do Chrome desenha texto escuro sobre fundo escuro e o campo fica
   ilegível justamente nesta tela. */
function GateConclusao({ acao, aoConfirmar, aoCancelar, salvando }) {
  const itens = acao.confirmar_itens ?? [];
  const pedeHora = !!acao.pede_agendamento;

  const [conferidos, setConferidos] = useState([]);
  const [quando, setQuando] = useState("");

  const alternar = (item) => setConferidos((v) =>
    v.includes(item) ? v.filter((x) => x !== item) : [...v, item]);

  const pronto = itens.every((i) => conferidos.includes(i)) && (!pedeHora || !!quando);

  const botao = {
    fontSize: 11.5, fontWeight: 700, borderRadius: 8, padding: "6px 12px",
    fontFamily: FONT_DISPLAY, whiteSpace: "nowrap",
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg px-3 py-2.5"
      style={{ background: C.void, border: `1px solid ${C.goldDim}` }}>

      {itens.length > 0 && (
        <>
          <span style={{ ...etiqueta, color: C.gold }}>Conferir</span>
          {itens.map((item) => {
            const on = conferidos.includes(item);
            return (
              <button key={item} onClick={() => alternar(item)}
                aria-pressed={on}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors"
                style={{
                  fontSize: 12.5,
                  color: on ? C.positive : C.textMuted,
                  background: on ? "rgba(143,174,124,0.10)" : C.surface,
                  border: `1px solid ${on ? C.positive : C.bronzeLine}`,
                  cursor: "pointer",
                }}>
                {on ? <CircleCheck size={14} /> : <Circle size={14} />}
                {item}
              </button>
            );
          })}
        </>
      )}

      {pedeHora && (
        <>
          <span className="inline-flex items-center gap-1.5" style={{ ...etiqueta, color: C.gold }}>
            <CalendarClock size={13} /> Programada para
          </span>
          <input
            type="datetime-local"
            value={quando}
            autoFocus
            onChange={(e) => setQuando(e.target.value)}
            className="text-[13px] rounded-md px-2 py-1.5"
            style={{
              background: C.surface, color: C.text,
              border: `1px solid ${C.bronzeLine}`, colorScheme: "dark",
            }}
          />
        </>
      )}

      <button onClick={() => aoConfirmar(quando || null)} disabled={!pronto || salvando}
        style={{
          ...botao, background: pronto ? C.gold : "transparent",
          color: pronto ? C.void : C.textFaint,
          border: `1px solid ${pronto ? C.gold : C.bronzeLine}`,
          cursor: pronto && !salvando ? "pointer" : "not-allowed",
        }}>
        Concluir
      </button>

      <button onClick={aoCancelar}
        style={{ ...botao, background: "transparent", color: C.textMuted, border: "none", cursor: "pointer" }}>
        Cancelar
      </button>
    </div>
  );
}

function LinhaAcao({ acao, aoMarcar, salvando }) {
  const atrasada = !acao.concluida && acao.prazo < HOJE;
  // Ação automática não é clicável: quem marca é o sistema, quando a
  // campanha entra no ar. A RPC recusaria de qualquer jeito.
  const automatica = acao.conclusao === "automatica";
  const cor = acao.concluida ? C.positive : atrasada ? C.alert : C.textMuted;

  /* Concluir pode exigir responder antes — ver GateConclusao. Desmarcar
     nunca abre portão: some o check e o banco limpa o que havia. */
  const [agendando, setAgendando] = useState(false);
  const temGate = !acao.concluida && precisaGate(acao);
  const clicar = () => {
    if (automatica) return;
    if (temGate) { setAgendando((v) => !v); return; }
    aoMarcar(acao.id, !acao.concluida);
  };

  return (
    <div className="my-1 rounded-lg transition-colors"
      style={{ background: atrasada ? "rgba(194,102,90,0.06)" : "transparent" }}>
      <div className="flex items-center gap-4 px-4 py-3.5">
      <button
        onClick={clicar}
        disabled={automatica || salvando}
        aria-label={acao.concluida ? "Desmarcar" : "Concluir"}
        className="shrink-0 transition-transform hover:scale-105 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ color: cor, cursor: automatica ? "not-allowed" : "pointer", opacity: salvando ? 0.5 : 1,
          background: `${cor}0D`, border: `1px solid ${cor}28` }}
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
          {/* O horário da publicação vem DEPOIS de "feito em", e em dourado:
              são duas datas na mesma linha e elas respondem perguntas
              diferentes — quando marcaram, e para quando a postagem está. */}
          {acao.agendado_para && (
            <span style={{ color: C.gold }}> · vai ao ar {fmtDataHora(acao.agendado_para)}</span>
          )}
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

      {agendando && (
        <div className="px-4 pb-3.5">
          <GateConclusao acao={acao} salvando={salvando}
            aoCancelar={() => setAgendando(false)}
            aoConfirmar={(quando) => { setAgendando(false); aoMarcar(acao.id, true, quando); }} />
        </div>
      )}
    </div>
  );
}

/* ============ CANCELAR ============
   Fica DENTRO do card aberto, no rodapé, e só para gestor. Cancelar é raro
   e irreversível na cabeça de quem clica — botão no cabeçalho, ao lado da
   seta de abrir, seria clicado sem querer.

   O motivo não é confirmação, é o dado: o banco recusa cancelamento sem
   texto (132). Por isso não há "tem certeza?" — a pergunta é "por quê?", e
   respondê-la já é a confirmação. */
function FormCancelamento({ evento, aoCancelar }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const valido = motivo.trim().length >= 3;

  const confirmar = async () => {
    setSalvando(true);
    try {
      await aoCancelar(evento.id, motivo.trim());
      // Sucesso: o card some da lista no recarregamento. Não mexemos em
      // estado depois — o componente já não existe.
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) {
    return (
      <div className="flex justify-end pt-2.5 mt-1" style={{ borderTop: `1px solid ${C.hair}` }}>
        <button onClick={() => setAberto(true)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors"
          style={{ ...etiqueta, color: C.textFaint }}
          title="Cancelar este evento — pede o motivo">
          <Ban size={11} /> Cancelar evento
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3 mt-2 subir"
      style={{ background: "rgba(194,102,90,0.06)", border: `1px solid ${C.alert}` }}>
      <p className="text-[12.5px] mb-2" style={{ color: C.text }}>
        Cancelar <b>{evento.nome}</b>? O evento sai da pauta e o checklist para
        de cobrar — nada é apagado, e dá para reativar depois.
      </p>
      <label className="block mb-1" style={{ ...etiqueta, color: C.textFaint }}>
        Por quê?
      </label>
      <textarea
        value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} autoFocus
        placeholder="Ex.: treinador remarcou para outubro"
        className="w-full rounded-md px-2.5 py-2 text-[13px] resize-y"
        style={{ background: C.void, color: C.text, border: `1px solid ${C.bronzeLine}`, outline: "none" }}
      />
      <div className="flex items-center gap-2 mt-2.5">
        <button onClick={confirmar} disabled={!valido || salvando}
          className="px-3 py-1.5 rounded-md transition-colors"
          style={{
            ...etiqueta,
            background: valido ? "rgba(194,102,90,0.16)" : "transparent",
            color: valido ? C.alert : C.textFaint,
            border: `1px solid ${valido ? C.alert : C.bronzeLine}`,
            cursor: valido && !salvando ? "pointer" : "not-allowed",
            opacity: salvando ? 0.5 : 1,
          }}>
          {salvando ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button onClick={() => { setAberto(false); setMotivo(""); }} disabled={salvando}
          style={{ ...etiqueta, color: C.textMuted }}>
          Voltar
        </button>
        {/* O mínimo do banco é 3 caracteres. Dizer isso antes do clique
            evita a viagem de ida e volta até a mensagem de erro. */}
        {!valido && motivo.length > 0 && (
          <span className="text-[11px]" style={{ color: C.textFaint }}>
            escreva o motivo
          </span>
        )}
      </div>
    </div>
  );
}

/* ============ CARD DE EVENTO ============ */
function EventoCard({ evento, publico, aberto, aoAbrir, aoMarcar, salvandoId, podeCancelar, aoCancelar }) {
  const total = evento.acoes.length;
  const feitas = evento.acoes.filter((a) => a.concluida).length;
  const atrasadas = evento.acoes.filter((a) => !a.concluida && a.prazo < HOJE).length;
  const dias = diasAte(evento.data_evento);
  const r = evento.resultados;

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ background: C.surface, border: `1px solid ${aberto ? C.goldDim : C.bronzeLine}` }}>

      <button onClick={aoAbrir} className="w-full flex items-center gap-5 p-5 text-left">
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

        {/* O canto do card responde por número, e a resposta vem de
            lugares diferentes conforme o evento:

              Sympla       inscritos e presentes, do próprio ingresso;
              Salesforce   vendas (migration 145).

            Sem valor em espécie, por escolha do Louis. A view calcula
            `receita` e ela continua lá para quem precisar; a Central
            responde quantas, não quanto.

            O treinamento mostra SÓ venda, por escolha do Louis. A view
            também sabe quantas pessoas ocupam cadeira — `inscritos`, que
            soma quem comprou agora com quem consome vaga de pacote antigo
            — e esse número segue no sino. No card ele competia com a
            venda sem responder à pergunta que o card faz.

            `vendas` é nulo fora do Salesforce, nunca zero: no Sympla essa
            pergunta não tem resposta, e 0 seria uma. */}
        {publico?.fonte === "salesforce" && publico.vendas != null ? (
          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-xs" style={{ color: C.textMuted }}>
            <span className="inline-flex items-center gap-1"
              title="Matrículas vendidas para esta turma. Quem consome vaga comprada antes ocupa cadeira e não entra aqui.">
              <Ticket size={12} style={{ color: C.positive }} /> {publico.vendas} venda{publico.vendas === 1 ? "" : "s"}
            </span>
          </div>
        ) : r ? (
          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-xs" style={{ color: C.textMuted }}>
            <span className="inline-flex items-center gap-1"><Users size={12} style={{ color: C.gold }} /> {r.inscritos ?? 0} inscritos</span>
            <span className="inline-flex items-center gap-1"><UserCheck size={12} style={{ color: C.textFaint }} /> {r.presentes ?? 0} presentes</span>
          </div>
        ) : null}
        <ChevronRight size={16} className="shrink-0 transition-transform" style={{ color: C.textFaint, transform: aberto ? "rotate(90deg)" : "none" }} />
      </button>

      {aberto && (
        <div className="px-5 pb-5 subir">
          <div className="flex items-center justify-between gap-3 mb-4 pt-3 flex-wrap"
            style={{ borderTop: `1px solid ${C.bronzeLine}` }}>
            <p className="text-[11px] uppercase tracking-widest pt-2" style={{ color: C.textFaint }}>
              Checklist de divulgação
            </p>
            <div className="pt-2"><CodigoEvento codigo={evento.codigo} /></div>
          </div>
          <div className="flex flex-col gap-2 py-1">
            {evento.acoes.map((a) => (
              <LinhaAcao key={a.id} acao={a} aoMarcar={aoMarcar} salvando={salvandoId === a.id} />
            ))}
          </div>
          {podeCancelar && <FormCancelamento evento={evento} aoCancelar={aoCancelar} />}
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
        className="w-full flex items-center gap-4 px-5 py-4 mb-6 rounded-xl text-left"
        style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
        <HelpCircle size={14} style={{ color: C.gold }} className="shrink-0" />
        {/* Três textos de pesos diferentes numa linha só: a contagem (o que
            importa), a explicação (por que importa) e a ação. Colados, viram
            uma frase comprida sem hierarquia — o vão entre eles é o que
            separa "10 eventos esperando" de "sem tipo, não geram checklist".
            `shrink-0` na contagem para a explicação ceder primeiro quando a
            largura aperta; quem some é o acessório, nunca o número. */}
        <span className="text-[13px] shrink-0" style={{ color: C.text }}>
          {pendentes.length} evento{pendentes.length > 1 ? "s" : ""} esperando classificação
        </span>
        <span className="text-[11.5px] hidden sm:inline truncate" style={{ color: C.textFaint }}>
          — sem tipo, não geram checklist
        </span>
        <span className="ml-auto shrink-0 pl-3" style={{ ...etiqueta, color: C.gold }}>Ver fila</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl p-6 mb-6"
      style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
      {/* "Fechar" é texto de 9.5px encostado na borda da caixa: sem área
          própria, ele é difícil de acertar com o mouse e visualmente parece
          grudado no canto. Ganha padding (a área clicável) e o `-mr-1`
          devolve o alinhamento — a borda direita do TEXTO continua na mesma
          coluna do resto do painel, que é o que o olho segue. */}
      <div className="flex items-center gap-2.5 mb-4">
        <HelpCircle size={14} style={{ color: C.gold }} className="shrink-0" />
        <p className="text-[13px]" style={{ color: C.text }}>
          {pendentes.length} evento{pendentes.length > 1 ? "s" : ""} esperando classificação
        </p>
        <button onClick={() => { setExpandida(false); setAberto(null); }}
          className="ml-auto shrink-0 px-2 py-1 -mr-1 rounded-md"
          style={{ ...etiqueta, color: C.textMuted }}>
          Fechar
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {pendentes.map((p) => (
          <div key={p.id} className="rounded-lg p-4" style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
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

/* ============ CANCELADOS ============
   Vem fechado, como a fila de classificação: é consulta, não trabalho. Mas
   PRECISA existir — cancelar tira o evento das quatro consultas da tela, e
   sem esta lista o motivo que o gestor escreveu ficaria só no banco, onde
   ninguém do time olha.

   Também é o único lugar onde aparece o que o Google apagou. O sync não
   avisa ninguém; a linha com "Apagado da agenda do Google" é o aviso. */
const MOTIVO_AGENDA = "Apagado da agenda do Google";

function PainelCancelados({ cancelados, mes, podeReativar, aoReativar }) {
  const [expandida, setExpandida] = useState(false);
  const [reativando, setReativando] = useState(null);
  if (!cancelados.length) return null;

  const daAgenda = cancelados.filter((c) => c.cancelado_motivo === MOTIVO_AGENDA).length;

  if (!expandida) {
    return (
      <button onClick={() => setExpandida(true)}
        className="w-full flex items-center gap-4 px-5 py-4 mb-6 rounded-xl text-left"
        style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
        <Ban size={14} style={{ color: C.textFaint }} className="shrink-0" />
        <span className="text-[13px] shrink-0" style={{ color: C.textMuted }}>
          {cancelados.length} evento{cancelados.length > 1 ? "s" : ""} cancelado
          {cancelados.length > 1 ? "s" : ""} em {MESES[mes]}
        </span>
        {daAgenda > 0 && (
          <span className="text-[11.5px] hidden sm:inline truncate" style={{ color: C.textFaint }}>
            — {daAgenda} apagado{daAgenda > 1 ? "s" : ""} da agenda
          </span>
        )}
        <span className="ml-auto shrink-0 pl-3" style={{ ...etiqueta, color: C.textMuted }}>Ver</span>
      </button>
    );
  }

  const reativar = async (id) => {
    setReativando(id);
    try { await aoReativar(id); } finally { setReativando(null); }
  };

  return (
    <div className="rounded-xl p-6 mb-6"
      style={{ background: C.surface, border: `1px solid ${C.bronzeLine}` }}>
      <div className="flex items-center gap-2.5 mb-4">
        <Ban size={14} style={{ color: C.textFaint }} className="shrink-0" />
        <p className="text-[13px]" style={{ color: C.textMuted }}>
          Cancelados em {MESES[mes]}
        </p>
        <button onClick={() => setExpandida(false)}
          className="ml-auto shrink-0 px-2 py-1 -mr-1 rounded-md"
          style={{ ...etiqueta, color: C.textMuted }}>
          Fechar
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {cancelados.map((c) => (
          <div key={c.id} className="rounded-lg p-4"
            style={{ background: C.surface, border: `1px solid ${C.hair}` }}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-sm truncate" style={{ color: C.textMuted }}>{c.nome}</p>
                  <span className="tabular-nums shrink-0"
                    style={{ fontFamily: FONT_DISPLAY, fontSize: 11, color: C.textFaint }}>
                    {fmtDiaMes(c.data_evento)}
                  </span>
                </div>
                {/* O motivo é a razão de a tela existir: vem inteiro, sem
                    truncar, mesmo que ocupe três linhas. */}
                <p className="text-[12.5px] mt-1" style={{ color: C.text }}>
                  {c.cancelado_motivo}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: C.textFaint }}>
                  {c.cancelado_motivo === MOTIVO_AGENDA ? "sumiu da agenda" : "cancelado"}
                  {c.cancelado_em && ` em ${fmtDataHora(c.cancelado_em)}`}
                </p>
              </div>
              {podeReativar && (
                <button onClick={() => reativar(c.id)} disabled={reativando === c.id}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md"
                  style={{ ...etiqueta, color: C.gold, background: `${C.gold}14`,
                    border: `1px solid ${C.gold}33`, opacity: reativando === c.id ? 0.5 : 1 }}>
                  <Undo2 size={11} /> {reativando === c.id ? "Reativando…" : "Reativar"}
                </button>
              )}
            </div>
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

  /* Mesma regra da LinhaAcao: a mesma ação aparece nas duas telas, e pedir
     a confirmação só numa delas seria uma porta dos fundos para concluir
     sem responder. */
  const [agendando, setAgendando] = useState(false);
  const temGate = !acao.concluida && precisaGate(acao);
  const clicar = () => {
    if (automatica) return;
    if (temGate) { setAgendando((v) => !v); return; }
    aoMarcar(acao.id, !acao.concluida);
  };

  return (
    /* A primeira linha do dia não desenha o próprio filete: a borda do grupo
       já está ali, e as duas juntas faziam a divisão entre dias parecer igual
       à divisão entre linhas. */
    <div style={primeira ? undefined : { borderTop: `1px solid ${C.hair}` }}>
      <div className="flex items-start gap-4 py-3 pr-2">
      <button
        onClick={clicar}
        disabled={automatica || salvando}
        aria-label={acao.concluida ? "Desmarcar" : "Concluir"}
        className="shrink-0 transition-transform hover:scale-105 w-8 h-8 rounded-full flex items-center justify-center"
        style={{
          color: corMarca, cursor: automatica ? "not-allowed" : "pointer",
          opacity: salvando ? 0.4 : 1, background: `${corMarca}0D`, border: `1px solid ${corMarca}28`,
        }}
        title={automatica ? TituloAuto : ""}
      >
        {/* Mesmos dois ícones das manuais — ver o comentário em LinhaAcao. */}
        {acao.concluida ? <CircleCheck size={18} /> : <Circle size={18} />}
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

        {acao.agendado_para && (
          <div className="mt-1 inline-flex items-center gap-1.5"
            style={{ ...etiqueta, color: C.gold }}>
            <CalendarClock size={11} /> vai ao ar {fmtDataHora(acao.agendado_para)}
          </div>
        )}
      </div>
      </div>

      {agendando && (
        <div className="pb-3 pr-2" style={{ paddingLeft: 48 }}>
          <GateConclusao acao={acao} salvando={salvando}
            aoCancelar={() => setAgendando(false)}
            aoConfirmar={(quando) => { setAgendando(false); aoMarcar(acao.id, true, quando); }} />
        </div>
      )}
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
    <div className="flex gap-5 sm:gap-6 py-1" style={{ borderTop: `1px solid ${C.bronzeLine}` }}>
      <div className="shrink-0 pt-4 text-right" style={{ width: 52 }}>
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

      <div className="flex-1 min-w-0 pb-3.5"
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

/* ============ SINO ============
   Duas perguntas que a Central respondia só depois de navegar: o que ainda
   falta fazer neste mês, e quanta gente cada evento tem. O sino junta as
   duas num lugar só, porque são as duas coisas que fazem alguém abrir a
   tela sem ter tarefa marcada.

   A bolinha vermelha conta AÇÃO PENDENTE DO MÊS, não notificação nova. É
   uma distinção que muda o comportamento: contador de "não lido" zera
   quando você olha e volta a mentir depois; contador de pendência só zera
   quando o trabalho é feito. Nada aqui guarda estado de leitura, e é de
   propósito — o sino não tem memória para ter opinião sobre.

   Público vem da view 144, com a fonte declarada. Evento sem número não
   aparece com zero: aparece fora da lista. Zero e "não sei" são coisas
   diferentes, e a Central tem os dois casos — palestra sem link do Sympla
   e treinamento sem turma casada. */
/* O número de cada linha depende da fonte, e a diferença é real: no Sympla
   a pergunta que tem resposta é quantos se INSCREVERAM; no Salesforce, o
   card mostra VENDA, e o sino tinha de dizer o mesmo — dois lugares com
   números diferentes para o mesmo evento confundem mais do que informam.

   Consequência assumida: o total soma coisas de naturezas diferentes,
   inscrição e venda. Ele serve para dar ordem de grandeza do mês, não para
   virar métrica — por isso a legenda embaixo nomeia cada metade. */
const numeroDoPublico = (p) => (p.fonte === "salesforce" ? p.vendas : p.inscritos) ?? 0;

function Sino({ pendentes, atrasadas, publico, mes }) {
  const [aberto, setAberto] = useState(false);
  const total = pendentes.length;
  const totalPessoas = publico.reduce((s, p) => s + numeroDoPublico(p), 0);

  return (
    <div className="relative">
      <style>{`
        @keyframes pulsoAlerta {
          0%, 100% {
            box-shadow: 0 0 0 2px ${C.void},
                        0 0 4px color-mix(in srgb, ${C.alert} 55%, transparent);
          }
          50% {
            box-shadow: 0 0 0 2px ${C.void},
                        0 0 9px ${C.alert},
                        0 0 16px color-mix(in srgb, ${C.alert} 50%, transparent);
          }
        }
        .pulsoAlerta { animation: pulsoAlerta 2.1s ease-in-out infinite; }

        /* Sem animação para quem pediu menos movimento — mas o ponto NÃO
           some, e nem fica sem brilho: vira o mesmo halo, parado. A
           preferência é por movimento, não por deixar de ser avisado. */
        @media (prefers-reduced-motion: reduce) {
          .pulsoAlerta {
            animation: none;
            box-shadow: 0 0 0 2px ${C.void},
                        0 0 7px color-mix(in srgb, ${C.alert} 70%, transparent);
          }
        }
      `}</style>

      <button onClick={() => setAberto((v) => !v)}
        aria-label={total ? `${total} ação(ões) pendente(s) em ${MESES[mes]}` : "Sem pendências no mês"}
        aria-expanded={aberto}
        className="w-8 h-8 rounded-lg flex items-center justify-center relative"
        style={{
          background: C.surface, color: aberto ? C.gold : C.textMuted,
          border: `1px solid ${aberto ? C.goldDim : C.bronzeLine}`,
        }}>
        <Bell size={14} />
        {total > 0 && (
          /* Ponto, não número: a contagem exata cabe no painel, e um "27"
             de 7px encolhido dentro de um botão de 32px vira sujeira.

             O brilho pulsa porque o sino mora num canto que ninguém olha de
             propósito — movimento é o que traz o olho até lá. Ciclo de 2,1s,
             o mesmo dos deltas do FebraHub.jsx: piscar mais rápido lê como
             erro de sistema, não como aviso.

             O anel de 2px da cor do fundo entrou DENTRO da animação. Ele
             separa o ponto da borda do botão, e se ficasse no `style`
             inline o box-shadow animado o sobrescreveria a cada quadro. */
          <span aria-hidden="true" className="absolute rounded-full pulsoAlerta"
            style={{ width: 7, height: 7, top: 5, right: 5, background: C.alert }} />
        )}
      </button>

      {aberto && (
        <>
          {/* Fundo invisível: clicar fora fecha. Sem ele o painel só sai da
              tela por outro clique no sino, que ninguém adivinha. */}
          <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setAberto(false)} />

          <div className="absolute right-0 mt-2 rounded-xl overflow-hidden subir"
            style={{
              /* 24px de respiro e 400 de largura. Começou em 16/360 e
                 passou por 20/384 — o Louis apontou aperto nas duas. 24 é
                 a régua dos painéis grandes desta tela (FilaPendentes e
                 PainelCancelados usam p-6); abaixo disso o texto encosta
                 na borda e o número da direita parece colado nele. A
                 largura sobe junto para o respiro não sair do espaço do
                 nome do evento, que já trunca. */
              zIndex: 41, width: 400, maxHeight: "70vh", overflowY: "auto",
              background: "#101012", border: `1px solid ${C.bronzeLine}`,
              boxShadow: "0 18px 50px rgba(0,0,0,.55)",
            }}>

            {/* ---- ações do mês ---- */}
            <div className="px-6 pt-4 pb-2.5 flex items-baseline justify-between gap-3"
              style={{ borderBottom: `1px solid ${C.hair}` }}>
              <span style={{ ...etiqueta, color: C.gold }}>Falta fazer em {MESES[mes]}</span>
              <span className="tabular-nums" style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: C.text }}>
                {total}
              </span>
            </div>

            {total === 0 ? (
              <p className="px-6 py-3.5 text-[12.5px]" style={{ color: C.textFaint }}>
                Nenhuma ação pendente no mês.
              </p>
            ) : (
              <div className="px-6 py-2.5">
                {atrasadas.length > 0 && (
                  <p className="text-[12px] mb-1.5" style={{ color: C.alert }}>
                    {atrasadas.length} vencida{atrasadas.length > 1 ? "s" : ""} —
                    {" "}{total - atrasadas.length} ainda no prazo
                  </p>
                )}
                {pendentes.slice(0, 6).map((a) => (
                  <div key={a.id} className="flex items-baseline gap-3 py-1.5">
                    <span className="text-[12.5px] truncate flex-1 min-w-0"
                      style={{ color: C.text }} title={`${a.nome} · ${a.evento?.nome ?? ""}`}>
                      {a.nome}
                      <span style={{ color: C.textFaint }}> · {a.evento?.nome}</span>
                    </span>
                    <span className="shrink-0 tabular-nums"
                      style={{
                        fontFamily: FONT_DISPLAY, fontSize: 11,
                        color: a.prazo < HOJE ? C.alert : C.textFaint,
                      }}>
                      {fmtDiaMes(a.prazo)}
                    </span>
                  </div>
                ))}
                {total > 6 && (
                  <p className="text-[11px] pt-1" style={{ color: C.textFaint }}>
                    e mais {total - 6} na aba Pauta
                  </p>
                )}
              </div>
            )}

            {/* ---- público ---- */}
            <div className="px-6 pt-3.5 pb-2.5 flex items-baseline justify-between gap-3"
              style={{ borderTop: `1px solid ${C.hair}`, borderBottom: `1px solid ${C.hair}` }}>
              <span style={{ ...etiqueta, color: C.gold }}>Inscritos e vendas</span>
              <span className="tabular-nums" style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: C.text }}>
                {totalPessoas}
              </span>
            </div>

            {publico.length === 0 ? (
              <p className="px-6 py-3.5 text-[12.5px]" style={{ color: C.textFaint }}>
                Nenhum evento do mês com número conhecido.
              </p>
            ) : (
              <div className="px-6 py-2.5 pb-4">
                {publico.map((p) => (
                  <div key={p.evento_id} className="flex items-baseline gap-2.5 py-1.5">
                    <Ticket size={11} className="shrink-0"
                      style={{ color: p.fonte === "sympla" ? C.gold : C.positive }} />
                    <span className="text-[12.5px] truncate flex-1 min-w-0"
                      style={{ color: C.text }} title={p.nome}>
                      {p.nome}
                    </span>
                    <span className="shrink-0 tabular-nums"
                      style={{ fontFamily: FONT_DISPLAY, fontSize: 12.5, color: C.text }}>
                      {numeroDoPublico(p)}
                    </span>
                  </div>
                ))}
                {/* A legenda existe porque os dois números respondem à mesma
                    pergunta por caminhos diferentes, e a diferença importa:
                    ingresso vendido não é matrícula aprovada. */}
                <p className="text-[10.5px] pt-2" style={{ color: C.textFaint }}>
                  <span style={{ color: C.gold }}>●</span> inscritos no Sympla
                  {"   "}
                  <span style={{ color: C.positive }}>●</span> vendas no Salesforce
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ============ PÁGINA ============ */
export function CentralEventosLegado() {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth());
  const [aba, setAba] = useState("pauta"); // pauta = onde se trabalha
  const [eventos, setEventos] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [atrasadas, setAtrasadas] = useState([]);
  const [pendentes, setPendentes] = useState([]);
  const [cancelados, setCancelados] = useState([]);
  const [publico, setPublico] = useState([]);
  /* Só o gestor cancela/reativa (132). A flag decide o que a tela OFERECE;
     quem decide o que ela PODE é a RPC, que recusa qualquer outro. */
  const [souGestor, setSouGestor] = useState(false);
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
      const [evs, acs, atr, pends, canc, gestor, tps, unis, prox, publ] = await Promise.all([
        mktEventosDoMes(ini, fim), mktAcoesDoPeriodo(ini, fim), mktAcoesAtrasadas(HOJE),
        mktPendentes(), mktCanceladosDoMes(ini, fim), mktSouGestor(),
        mktTiposComChecklist(), mktUnidadesAtivas(), mktProximoEventoAtivo(fim),
        mktPublicoDoMes(ini, fim),
      ]);
      setEventos(evs);
      setAcoes(acs);
      setAtrasadas(atr);
      setPendentes(pends);
      setCancelados(canc);
      setSouGestor(gestor);
      setTipos(tps);
      setUnidades(unis);
      setProximo(prox);
      setPublico(publ);
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
  const canceladosVisiveis = soDaUnidade(cancelados, (c) => c.unidade_id);
  // Na pauta a unidade vem do evento embutido, não da própria ação.
  const acoesVisiveis = soDaUnidade(acoes, (a) => a.evento?.unidade_id);
  const atrasadasVisiveis = soDaUnidade(atrasadas, (a) => a.evento?.unidade_id);
  const publicoVisivel = soDaUnidade(publico, (p) => p.unidade_id);
  /* Índice por evento: são duas listas separadas (eventos e público) e o
     card precisa cruzar as duas. Sem o Map, cada card varreria a lista
     inteira a cada render. */
  const publicoPorEvento = new Map(publicoVisivel.map((p) => [p.evento_id, p]));

  /* O que o sino conta. `acoesVisiveis` são as que VENCEM no mês; as
     atrasadas entram porque dívida vencida não deixa de ser trabalho do
     mês só porque o prazo era de antes — e a Pauta já as mostra no topo
     pelo mesmo motivo.

     Dedupe por id: uma ação de agosto ainda não feita aparece nas duas
     listas, e somar os dois comprimentos contaria ela duas vezes. */
  const pendentesDoMes = (() => {
    const porId = new Map();
    for (const a of [...atrasadasVisiveis, ...acoesVisiveis]) {
      if (!a.concluida) porId.set(a.id, a);
    }
    return [...porId.values()].sort((a, b) => a.prazo.localeCompare(b.prazo));
  })();

  /* `quando` é a string do <input type="datetime-local">, no fuso de quem
     digitou. `new Date(...)` interpreta como hora local e `toISOString`
     converte para UTC, que é o que timestamptz guarda — mandar a string
     crua faria o banco ler como UTC e a postagem apareceria três horas
     deslocada. */
  const marcar = async (acaoId, concluida, quando = null) => {
    const agendadoPara = quando ? new Date(quando).toISOString() : null;
    setSalvandoId(acaoId);
    /* Otimista: o check aparece na hora. Nas TRÊS listas — a mesma ação
       aparece no card do evento e na pauta, e atualizar só uma deixaria as
       abas discordando entre si. */
    const aplicar = (a) => (a.id === acaoId
      ? {
        ...a, concluida,
        concluida_em: concluida ? new Date().toISOString() : null,
        // Desmarcar limpa o horário aqui também: o banco faz o mesmo, e
        // deixar o otimismo discordar dele piscaria a data de volta.
        agendado_para: concluida ? agendadoPara : null,
      }
      : a);
    setEventos((prev) => prev.map((e) => ({ ...e, acoes: e.acoes.map(aplicar) })));
    setAcoes((prev) => prev.map(aplicar));
    setAtrasadas((prev) => (concluida ? prev.filter((a) => a.id !== acaoId) : prev));
    try {
      await mktMarcarAcao(acaoId, concluida, agendadoPara);
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

  /* Cancelar e reativar NÃO são otimistas, ao contrário do check: os dois
     mexem em qual lista o evento habita (some da pauta, aparece nos
     cancelados, volta). Adiantar isso no cliente significaria recriar aqui
     a regra de status que a 132 escreveu no banco — duas réguas que cedo ou
     tarde discordam. Recarrega e pronto; é um clique raro. */
  const cancelar = async (eventoId, motivo) => {
    try {
      await mktCancelarEvento(eventoId, motivo);
      setAberto(null);
      await carregar();
    } catch (e) {
      setErro(`Não foi possível cancelar: ${e.message}`);
    }
  };

  const reativar = async (eventoId) => {
    try {
      await mktReativarEvento(eventoId);
      await carregar();
    } catch (e) {
      setErro(`Não foi possível reativar: ${e.message}`);
    }
  };

  /* Conta a base inteira de atrasadas, não só as do mês na tela: é aviso de
     dívida, e escondê-la ao navegar de mês seria o mesmo erro que a tela
     indexada por data de evento cometia. */
  const totalAtrasadas = atrasadasVisiveis.length;

  const nomeUnidade = unidades.find((u) => u.id === unidadeAlvo)?.nome;

  return (
    <div className="subir" style={{ maxWidth: 1120, margin: "0 auto", paddingBottom: 48 }}>
      {/* ESPAÇO NO TOPO. São CINCO faixas empilhadas antes do primeiro card —
          etiqueta, título, subtítulo, abas e a barra da fila — e as duas
          últimas ainda carregam filete próprio. Espremidas, o conjunto lia
          como um bloco só e os dois filetes pareciam engano de renderização.

          A régua, de cima para baixo: 8 (etiqueta -> título), 10 (título ->
          subtítulo), 18 (subtítulo -> abas), 24 (abas -> trabalho). Cada
          faixa abre embaixo de si um vão proporcional ao seu peso, e a
          passagem de CABEÇALHO para TRABALHO é a MAIOR de todas — é ali que
          a leitura muda de assunto. Se o vão das abas voltar a empatar com
          o do subtítulo, essa hierarquia some. */}
      <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap" style={{ marginBottom: 10 }}>
        <div>
          <p className="uppercase tracking-widest" style={{ color: C.gold, fontSize: 13, marginBottom: 8, fontWeight: 700 }}>
            Marketing{nomeUnidade ? ` · ${nomeUnidade}` : ""}
          </p>
          {/* leading-tight: sem controlar a entrelinha, o título — que
              chega a 36px — carrega o espaço interno da fonte e o vão de
              baixo fica menor do que o número da margem promete.

              700 e não 650: a Space Grotesk entra pelo index.html só nos
              pesos 500/600/700, sem eixo variável. 650 não existe e o
              navegador arredonda para 700 — o número no código dizia uma
              coisa e a tela mostrava outra. */}
          <h2 className="leading-tight" style={{ color: C.text, fontFamily: FONT_DISPLAY,
            fontSize: "clamp(28px, 2.6vw, 36px)", fontWeight: 700 }}>
            Central de Eventos
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <SeletorMes ano={ano} mes={mes} aoMudar={(a, m) => { setAno(a); setMes(m); setAberto(null); }} />
          {/* O sino fica à esquerda do atualizar: um é leitura, o outro é
              ação sobre a tela inteira. Juntos e na mesma caixa de 32px
              para não virarem dois pesos diferentes no canto. */}
          <Sino pendentes={pendentesDoMes} atrasadas={atrasadasVisiveis}
            publico={publicoVisivel} mes={mes} />
          <button onClick={carregar} aria-label="Atualizar" className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: C.surface, color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
            <RefreshCw size={14} className={carregando ? "girar" : ""} />
          </button>
        </div>
      </div>

      <p className="leading-relaxed" style={{ color: C.textMuted, marginBottom: 18, fontSize: 15 }}>
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
      <div className="flex items-center gap-8" style={{ borderBottom: `1px solid ${C.bronzeLine}`, marginBottom: 24 }}>
        {[["pauta", "Pauta", ListChecks], ["eventos", "Por evento", CalendarDays]].map(([k, rot, Icone]) => {
          const on = aba === k;
          return (
            <button key={k} onClick={() => setAba(k)}
              className="inline-flex items-center gap-2 pb-3.5 -mb-px"
              style={{
                color: on ? C.text : C.textMuted,
                borderBottom: `2px solid ${on ? C.gold : "transparent"}`,
              }}>
              <Icone size={14} style={{ color: on ? C.gold : C.textFaint }} />
              <span style={{ ...etiqueta, fontSize: 12 }}>{rot}</span>
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="flex items-start gap-2.5 rounded-xl p-3.5 mb-6 text-sm"
          style={{ background: "rgba(194,102,90,0.1)", border: `1px solid ${C.alert}`, color: C.text }}>
          <AlertTriangle size={15} style={{ color: C.alert, marginTop: 1 }} className="shrink-0" />
          <span className="min-w-0 break-words">{erro}</span>
          <button onClick={() => setErro(null)} className="ml-auto shrink-0" style={{ color: C.textMuted }} aria-label="Fechar aviso">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Sem invólucro de espaçamento em volta destes três. Cada um já
          carrega a própria margem de baixo, e os três somem da tela quando
          não há o que mostrar — unidade única, fila vazia, nada cancelado.
          Margem por fora sobreviveria ao null e abriria um vão sem
          conteúdo, que é como o buraco no meio da página aparece. */}
      <AbasUnidade unidades={unidades} ativa={unidadeAlvo} aoMudar={setUnidadeAtiva} />

      <FilaPendentes pendentes={pendentesVisiveis} tipos={tipos} aoClassificar={classificar} />

      {/* Depois da fila: a fila pede decisão, os cancelados são só registro.
          Aparece nas duas abas — cancelar é do evento, não da pauta. */}
      <PainelCancelados cancelados={canceladosVisiveis} mes={mes}
        podeReativar={souGestor} aoReativar={reativar} />

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
        <div className="flex flex-col gap-4">
          {eventosVisiveis.map((e) => (
            <EventoCard key={e.id} evento={e}
              publico={publicoPorEvento.get(e.id)}
              aberto={aberto === e.id}
              aoAbrir={() => setAberto(aberto === e.id ? null : e.id)}
              aoMarcar={marcar}
              salvandoId={salvandoId}
              podeCancelar={souGestor}
              aoCancelar={cancelar} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ CENTRAL FEBRACIS · SALVADOR ============ */
const fmtPeriodoCentral = (inicio, fim) => {
  const fmt = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  if (!inicio) return "Data não informada";
  return !fim || String(fim).slice(0, 10) === String(inicio).slice(0, 10)
    ? fmt(inicio) : `${fmt(inicio)} a ${fmt(fim)}`;
};

/* ============ CALENDARIO ============
   Grade mensal no formato que todo mundo ja sabe ler, o da agenda do
   Google: sete colunas de domingo a sabado, o numero do dia no canto, e o
   evento como pastilha dentro da celula. Clicar na pastilha abre o
   detalhe que ja existia.

   POR QUE A PASTILHA FICA SO NO DIA DE INICIO
   Curso tem duracao de 0 a 382 dias nesta base — ha programa que corre o
   ano inteiro. Desenhar barra atravessando os dias encheria o mes todo
   com um curso so, e a pergunta que a Central responde e "o que comeca
   quando". O periodo completo aparece no painel de detalhe. */

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/* CODIGO DA TURMA — o vocabulario da casa.
   O time nao chama o curso de "FORMACAO INTERNACIONAL EM COACHING INTEGRAL
   SISTEMICO": chama de FCIS 37. O codigo estava dentro de `turma_id`
   ("2026 - FCIS37") e nao aparecia em lugar nenhum da tela.

   Ele resolve de quebra o problema da pastilha estreita: numa celula de
   ~140px o titulo trunca sempre, e o que sobra e o comeco de uma frase
   generica ("FORMACAO INTERNAC..."). O codigo cabe inteiro e identifica.

   Palestra e workshop vem da agenda e nao tem codigo — devolve null, e a
   pastilha mostra so o titulo. */
const codigoTurma = (turmaId) => {
  if (!turmaId || turmaId.startsWith("mkt:")) return null;
  const semAno = turmaId.replace(/^\d{4}\s*-\s*/, "");
  return semAno.split(" - ")[0].trim() || null;
};

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* A grade sempre comeca no domingo anterior ao dia 1 e termina no sabado
   seguinte ao ultimo dia. Seis semanas fixas manteriam a altura estavel
   entre meses, mas deixariam uma linha vazia na maioria deles; prefiro a
   grade do tamanho do mes. */
function gradeDoMes(refDate) {
  const primeiro = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const ultimo = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);

  const inicio = new Date(primeiro);
  inicio.setDate(primeiro.getDate() - primeiro.getDay());

  const fim = new Date(ultimo);
  fim.setDate(ultimo.getDate() + (6 - ultimo.getDay()));

  const dias = [];
  for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
    dias.push(new Date(d));
  }
  return { dias, inicio, fim, mes: refDate.getMonth() };
}

/* Cor por tipo. Nao e decoracao: com curso, palestra e workshop na mesma
   grade, a cor e o que deixa varrer o mes sem ler cada pastilha. */
const CORES_TIPO = {
  Curso:     { fundo: `${C.gold}14`, texto: C.gold, acento: C.gold },
  Palestra:  { fundo: `${C.up}14`, texto: C.up, acento: C.up },
  Workshop:  { fundo: C.card, texto: C.bright, acento: C.muted },
  Live:      { fundo: `${C.down}14`, texto: C.down, acento: C.down },
};
// A view anterior à migration 151 não expunha `tipo` e continha somente
// cursos. Se o schema cache ainda servir essa versão, o fallback correto é
// Curso (dourado), não Workshop (branco).
const corDoTipo = (tipo) => CORES_TIPO[tipo] ?? CORES_TIPO.Curso;

/* SEM NUMERO NA PASTILHA. Eu tinha posto a contagem de vendas dentro da
   celula do dia, apostando que a Central existe para responder "quanto ja
   vendeu". O Louis olhou na tela e cortou: no meio da grade o numero
   competia com a data e com o codigo, e transformava o calendario em
   planilha. O numero continua no painel de detalhe, que e onde alguem vai
   quando quer o numero — e no titulo do `title`, para quem passar o mouse.

   Com a largura liberada, o codigo passa a dividir a linha com o titulo:
   `IF36 · Inteligencia Financeira`. O codigo identifica mesmo truncado, o
   titulo diz do que se trata, e nada disputa com eles. */
function PastilhaEvento({ evento, onAbrir }) {
  const cor = corDoTipo(evento.tipo);
  const codigo = codigoTurma(evento.turma_id);
  const numero = evento.vendas;
  const palavra = evento.metrica === "inscrito" ? "inscritos" : "vendas";

  return (
    <button type="button" onClick={onAbrir}
      title={`${evento.tipo} · ${evento.titulo}${numero == null ? "" : ` · ${numero} ${palavra}`}`}
      className="w-full flex items-baseline gap-1 truncate transition-colors"
      style={{
        background: cor.fundo,
        color: cor.texto,
        fontSize: 11, lineHeight: 1.35,
        padding: "3px 6px 3px 6px",
        borderRadius: 4,
        borderLeft: `3px solid ${cor.acento}`,
      }}>
      {codigo && (
        <span className="shrink-0" style={{ fontWeight: 700 }}>{codigo}</span>
      )}
      <span className="truncate text-left" style={{ opacity: codigo ? .75 : 1, fontWeight: codigo ? 500 : 600 }}>
        {evento.titulo}
      </span>
    </button>
  );
}

function CelulaDia({ data, doMes, eventos, hoje, onAbrir }) {
  const ehHoje = iso(data) === hoje;
  const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
  /* Ate tres pastilhas por dia. Passando disso a celula esticava e
     desalinhava a semana inteira; o resto vira "+N", que abre o dia
     quando alguem clicar. */
  const visiveis = eventos.slice(0, 3);
  const resto = eventos.length - visiveis.length;

  return (
    <div className="p-1.5 flex flex-col gap-1 min-w-0"
      style={{
        minHeight: 112,
        borderTop: `1px solid ${C.bronzeLine}`,
        borderLeft: `1px solid ${C.bronzeLine}`,
        /* A celula tem fundo proprio. Transparente sobre o void, a grade
           virava um risco de 4,5% de branco e nao lia como calendario.
           Fim de semana afunda, dia de outro mes afunda mais ainda — e
           continua visivel, porque some-lo quebraria a leitura da semana. */
        background: ehHoje
          ? "rgba(195,163,75,0.09)"
          : !doMes
            ? "rgba(255,255,255,0.008)"
            : fimDeSemana
              ? "rgba(255,255,255,0.012)"
              : "rgba(255,255,255,0.028)",
        /* A ESPINHA DOURADA. O arquivo ja declara, no cabecalho, que "a
           regua e a assinatura da tela: faz hoje ser achado sem leitura".
           A grade mensal tinha perdido isso — hoje era so um fundo um
           pouco mais claro. A barra na lateral esquerda devolve: acha-se
           antes de ler qualquer numero. */
        boxShadow: ehHoje ? `inset 3px 0 0 0 ${C.gold}` : "none",
        opacity: doMes ? 1 : 0.5,
      }}>

      <div className="flex justify-end mb-0.5">
        <span className="tabular-nums inline-flex items-center justify-center"
          style={{
            fontFamily: FONT_DISPLAY, fontSize: 12.5,
            width: 22, height: 22, borderRadius: 999,
            /* Numero do dia em texto cheio, nao em cinza medio: era o
               unico elemento fixo de toda celula vazia e ficava invisivel. */
            color: ehHoje ? C.void : doMes ? C.text : C.textMuted,
            background: ehHoje ? C.gold : "transparent",
            fontWeight: ehHoje ? 700 : 600,
          }}>
          {data.getDate()}
        </span>
      </div>

      {visiveis.map((e) => (
        <PastilhaEvento key={e.turma_id} evento={e} onAbrir={() => onAbrir(e)} />
      ))}
      {resto > 0 && (
        <button type="button" onClick={() => onAbrir(eventos[visiveis.length])}
          className="text-left px-1.5" style={{ fontSize: 10.5, color: C.textFaint }}>
          +{resto}
        </button>
      )}
    </div>
  );
}

/* FORA do componente, de proposito. Definida dentro, `Secao` seria uma
   funcao nova a cada render — o React trataria como outro tipo de
   componente, desmontaria a subarvore e remontaria os inputs a cada
   tecla. Efeito pratico: o cursor pula fora do campo enquanto a pessoa
   digita, e o motivo nao aparece em lugar nenhum. */
function Secao({ titulo, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3.5">
        {/* Barra dourada curta antes do texto. Antes a secao era so um
            filete de 4,5% de branco com letra minuscula por cima — do
            tamanho de um sublinhado, e sumia. */}
        <span style={{ width: 3, height: 12, borderRadius: 2, background: C.gold }} />
        <span style={{ ...etiqueta, fontSize: 10.5, color: C.gold }}>{titulo}</span>
        <span className="flex-1" style={{ height: 1, background: C.hair }} />
      </div>
      {children}
    </div>
  );
}

/* O ROTULO NAO PODE ENVOLVER O CAMPO com o estilo `etiqueta`.
   Era o bug da tela: `etiqueta` carrega `whiteSpace: nowrap`, e aplicado
   no <label> que contem o <input> ele prendia rotulo e campo na MESMA
   linha. O input de largura 100% entao transbordava o painel — dai a
   barra de rolagem horizontal e o botao Salvar cortado pela metade.

   Aqui o rotulo e um bloco proprio, acima, e o campo e irmao dele. */
function Campo({ rotulo, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="block mb-2" style={{ ...etiqueta, color: C.textMuted }}>
        {rotulo}
      </span>
      {children}
    </label>
  );
}

function PainelDetalheEvento({ evento, podeEditar, usuarioId, onFechar, onSalvo }) {
  const [form, setForm] = useState({
    local: evento.local_padrao ? "" : (evento.local ?? ""),
    endereco: evento.endereco ?? "",
    confirmados: evento.confirmados ?? "",
    capacidade: evento.capacidade ?? "",
    observacao: evento.observacao ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const campo = (key) => (e) => setForm((v) => ({ ...v, [key]: e.target.value }));
  /* Estilo do campo mora numa classe, nao so em `style`: estilo inline
     nao alcanca `:focus`, e sem foco visivel o formulario fica morto ao
     teclado — quem navega por Tab nao sabe onde esta. */
  /* Fundo mais claro que o painel, nao mais escuro. Em #08080A sobre um
     painel #101012 o campo virava um buraco: nao se via onde clicar. */
  const inputStyle = {
    width: "100%", maxWidth: "100%", boxSizing: "border-box",
    background: "rgba(255,255,255,.045)",
    border: `1px solid ${C.bronzeLine}`, borderRadius: 8,
    padding: "10px 12px", color: C.text, fontSize: 13,
    outline: "none",
  };

  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      await salvarEventoDetalhe({
        turma_id: evento.turma_id,
        local: form.local.trim() || null,
        endereco: form.endereco.trim() || null,
        confirmados: form.confirmados === "" ? null : Number(form.confirmados),
        capacidade: form.capacidade === "" ? null : Number(form.capacidade),
        observacao: form.observacao.trim() || null,
        atualizado_por: usuarioId,
        atualizado_em: new Date().toISOString(),
      });
      await onSalvo();
      onFechar();
    } catch (e) { setErro(e.message || String(e)); }
    finally { setSalvando(false); }
  };

  const cor = corDoTipo(evento.tipo);
  const quando = Number(evento.dias_para_inicio);
  const numero = evento.vendas;
  const palavra = evento.metrica === "inscrito" ? "inscritos" : "vendas";

  /* Ocupacao so aparece quando os DOIS numeros existem. Com um so, a conta
     nao existe — e escrever "12 de —" seria pior que nao escrever. */
  const ocupacao = (form.confirmados !== "" && form.capacidade !== "" && Number(form.capacidade) > 0)
    ? Math.round((Number(form.confirmados) / Number(form.capacidade)) * 100)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,.62)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>

      <style>{`
        .campoCentral:focus {
          border-color: ${C.goldDim} !important;
          box-shadow: 0 0 0 3px rgba(195,163,75,.14);
        }
        .campoCentral::placeholder { color: ${C.textFaint}; }
        @keyframes entrarPainel {
          from { transform: translateX(24px); opacity: .4; }
          to   { transform: none; opacity: 1; }
        }
        .painelCentral { animation: entrarPainel .22s ease-out; }
        @media (prefers-reduced-motion: reduce) { .painelCentral { animation: none; } }
      `}</style>

      <aside className="painelCentral h-full flex flex-col"
        style={{ width: "min(500px, 96vw)", background: "#141418", borderLeft: `1px solid ${C.cardLine}` }}>

        {/* ---------- cabecalho ---------- */}
        <div className="px-6 pt-6 pb-5" style={{ borderBottom: `1px solid ${C.hair}` }}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0">
              {/* O tipo vem como a MESMA pastilha do calendario. Quem clicou
                  numa pastilha verde tem de encontrar verde aqui, senao
                  perde a linha entre o que clicou e o que abriu. */}
              <span className="inline-block mb-2.5"
                style={{
                  ...etiqueta, fontSize: 10, color: cor.texto,
                  background: cor.fundo, borderLeft: `3px solid ${cor.acento}`,
                  padding: "4px 9px", borderRadius: 5,
                }}>
                {evento.tipo}
              </span>
              {codigoTurma(evento.turma_id) && (
                <span className="ml-2 tabular-nums" style={{
                  ...etiqueta, fontSize: 10.5, color: C.textMuted,
                }}>
                  {codigoTurma(evento.turma_id)}
                </span>
              )}
              <h2 className="leading-snug" style={{
                fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 600, color: C.text,
              }}>
                {evento.titulo}
              </h2>
            </div>
            <button onClick={onFechar} aria-label="Fechar"
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: C.surface, color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
              <X size={15} />
            </button>
          </div>

          {/* Fatos que nao se editam, numa faixa so: quando, e quanto ja
              vendeu ou inscreveu. Antes o painel repetia titulo e data e
              mais nada — quem abria para lancar confirmados nao via o
              numero contra o qual esta comparando. */}
          {/* Faixa de fatos com fundo proprio. Solta sobre o painel, ela
              se confundia com o formulario que vem logo abaixo; com caixa,
              fica claro que ali NADA se edita. */}
          <div className="flex flex-wrap rounded-lg overflow-hidden"
            style={{ border: `1px solid ${C.bronzeLine}`, background: "rgba(255,255,255,.025)" }}>
            <div className="px-4 py-3 min-w-0 flex-1">
              <div style={{ ...etiqueta, fontSize: 9, color: C.textFaint }}>Quando</div>
              <div className="text-[13px] mt-1.5" style={{ color: C.text }}>
                {fmtPeriodoCentral(evento.data_inicio, evento.data_fim)}
              </div>
              <div className="text-[11.5px] mt-0.5"
                style={{ color: quando >= 0 && quando <= 7 ? C.gold : C.textFaint,
                  fontWeight: quando >= 0 && quando <= 7 ? 700 : 400 }}>
                {quando < 0 ? "realizado" : quando === 0 ? "hoje" : `em ${quando} dias`}
              </div>
            </div>
            <div className="px-4 py-3 min-w-0" style={{ borderLeft: `1px solid ${C.bronzeLine}` }}>
              <div style={{ ...etiqueta, fontSize: 9, color: C.textFaint }}>{palavra}</div>
              <div className="mt-1 tabular-nums" style={{
                color: numero == null ? C.textFaint : cor.texto,
                fontFamily: numero == null ? undefined : FONT_DISPLAY,
                fontSize: numero == null ? 13 : 24,
                fontWeight: numero == null ? 400 : 700,
                lineHeight: 1.1,
              }}>
                {numero == null ? "sem número" : Number(numero).toLocaleString("pt-BR")}
              </div>
            </div>
          </div>
        </div>

        {/* ---------- formulario ---------- */}
        <div className="px-6 py-5 flex-1 overflow-y-auto flex flex-col gap-6">
          {!podeEditar && (
            <div className="flex items-center gap-2 rounded-lg p-3 text-xs"
              style={{ background: C.surface, color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
              <Lock size={13} className="shrink-0" /> Somente leitura para o seu perfil.
            </div>
          )}

          <Secao titulo="Onde acontece">
            <Campo rotulo="Local">
              <input className="campoCentral" disabled={!podeEditar} value={form.local}
                onChange={campo("local")}
                placeholder={evento.local_padrao ? "Sede Febracis (sugestão)" : "Informe o local"}
                style={{ ...inputStyle, opacity: podeEditar ? 1 : .6 }} />
            </Campo>
            <Campo rotulo="Endereço" className="mt-4">
              <input className="campoCentral" disabled={!podeEditar} value={form.endereco}
                onChange={campo("endereco")} placeholder="Rua, número, bairro"
                style={{ ...inputStyle, opacity: podeEditar ? 1 : .6 }} />
            </Campo>
          </Secao>

          <Secao titulo="Quantas pessoas">
            <div className="grid grid-cols-2 gap-4">
              <Campo rotulo="Confirmados">
                <input className="campoCentral" disabled={!podeEditar} type="number" min="0"
                  value={form.confirmados} onChange={campo("confirmados")} placeholder="—"
                  style={{ ...inputStyle, opacity: podeEditar ? 1 : .6 }} />
              </Campo>
              <Campo rotulo="Capacidade">
                <input className="campoCentral" disabled={!podeEditar} type="number" min="0"
                  value={form.capacidade} onChange={campo("capacidade")} placeholder="—"
                  style={{ ...inputStyle, opacity: podeEditar ? 1 : .6 }} />
              </Campo>
            </div>

            {ocupacao != null && (
              <div className="mt-3">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span style={{ ...etiqueta, fontSize: 9.5, color: C.textFaint }}>Ocupação</span>
                  <span className="tabular-nums text-[12px]"
                    style={{ color: ocupacao > 100 ? C.alert : C.textMuted }}>
                    {ocupacao}%
                  </span>
                </div>
                {/* Passar de 100% nao e necessariamente erro de digitacao —
                    sala com cadeira extra acontece. Marca em vermelho e
                    deixa passar. */}
                <div style={{ height: 4, borderRadius: 999, background: C.surface, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(ocupacao, 100)}%`, height: "100%",
                    background: ocupacao > 100 ? C.alert : C.gold,
                  }} />
                </div>
              </div>
            )}
          </Secao>

          <Secao titulo="Anotações">
            <textarea className="campoCentral" disabled={!podeEditar} rows="5"
              value={form.observacao} onChange={campo("observacao")}
              placeholder="O que a equipe precisa saber sobre este evento"
              style={{ ...inputStyle, resize: "vertical", opacity: podeEditar ? 1 : .6 }} />
          </Secao>

          {evento.atualizado_em && (
            <div className="text-[11px]" style={{ color: C.textFaint }}>
              Última edição por {evento.atualizado_por || "usuário não identificado"},
              em {fmtDataHora(evento.atualizado_em)}.
            </div>
          )}
        </div>

        {/* ---------- rodape fixo ---------- */}
        {/* O botao sai do fim do formulario e vira barra fixa: com a
            anotacao aberta, salvar exigia rolar ate o fim para achar o
            botao que confirma o que ja estava preenchido. */}
        {podeEditar && (
          <div className="px-6 py-4" style={{ borderTop: `1px solid ${C.hair}`, background: "#141418" }}>
            {erro && (
              <div className="flex items-start gap-2 text-xs mb-3" style={{ color: C.alert }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {erro}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={salvar} disabled={salvando}
                className="flex-1 rounded-lg py-2.5 flex items-center justify-center gap-2 text-sm font-bold"
                style={{
                  background: `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})`, color: "#1A1305",
                  opacity: salvando ? .6 : 1,
                  cursor: salvando ? "default" : "pointer",
                }}>
                <Save size={14} /> {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button onClick={onFechar} className="rounded-lg py-2.5 px-4 text-sm"
                style={{ background: "transparent", color: C.textMuted, border: `1px solid ${C.bronzeLine}` }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function CentralEventosAnterior() {
  const sessao = useSessao();
  const permissao = usePodeEditarEvento();
  const [selecionado, setSelecionado] = useState(null);

  /* Mes visivel. Guarda o dia 1 para nao esbarrar no problema classico de
     somar mes a partir do dia 31. */
  const [mesRef, setMesRef] = useState(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), 1);
  });
  /* UM movimento, nao varios. A grade inteira entra deslizando do lado de
     onde veio — para frente vem da direita, para tras vem da esquerda.
     Nada mais nesta tela anima: pastilha nao pulsa, celula nao cresce no
     hover. Efeito espalhado e o que faz interface parecer gerada. */
  const [direcao, setDirecao] = useState(0);

  const grade = useMemo(() => gradeDoMes(mesRef), [mesRef]);
  const hoje = iso(new Date());

  const central = useCentralFebracis(iso(grade.inicio), iso(grade.fim));

  /* Indice dia -> eventos. Sem ele, cada uma das ~35 celulas varreria a
     lista inteira a cada render. */
  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const e of central.data ?? []) {
      const chave = String(e.data_inicio).slice(0, 10);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(e);
    }
    return mapa;
  }, [central.data]);

  const andarMes = (passo) => {
    setDirecao(passo);
    setMesRef((m) => new Date(m.getFullYear(), m.getMonth() + passo, 1));
  };

  const irParaHoje = () => {
    const h = new Date();
    const alvo = new Date(h.getFullYear(), h.getMonth(), 1);
    setDirecao(alvo < mesRef ? -1 : 1);
    setMesRef(alvo);
  };

  const noMesCorrente =
    mesRef.getMonth() === new Date().getMonth() &&
    mesRef.getFullYear() === new Date().getFullYear();

  const botaoIcone = {
    width: 32, height: 32, borderRadius: 8,
    background: C.surface, color: C.textMuted,
    border: `1px solid ${C.bronzeLine}`,
  };

  return (
    <div className="subir mx-auto w-full" style={{ maxWidth: 1180, paddingBottom: 48 }}>

      {/* As keyframes moram AQUI, e nao no painel de detalhe: o painel so
          existe quando alguem abre um evento, e a troca de mes acontece
          com ele fechado. */}
      <style>{`
        @keyframes mesEntraDireita {
          from { opacity: 0; transform: translateX(14px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes mesEntraEsquerda {
          from { opacity: 0; transform: translateX(-14px); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mesGrade { animation: none !important; }
        }
      `}</style>

      <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap" style={{ marginBottom: 10 }}>
        <div>
          <p className="uppercase tracking-widest"
            style={{ color: C.gold, fontSize: 13, marginBottom: 8, fontWeight: 700 }}>
            Marketing · Febracis Salvador
          </p>
          <h2 className="leading-tight" style={{
            color: C.text, fontFamily: FONT_DISPLAY,
            fontSize: "clamp(28px, 2.6vw, 36px)", fontWeight: 700,
          }}>
            Central Febracis
          </h2>
        </div>

        {/* Navegacao igual a da agenda do Google, na ordem que a pessoa ja
            conhece: "Hoje", setas, e o mes escrito. */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={irParaHoje} disabled={noMesCorrente}
            className="px-3 h-8 rounded-lg text-[12px] font-semibold"
            style={{
              ...botaoIcone, width: "auto",
              color: noMesCorrente ? C.textFaint : C.text,
              cursor: noMesCorrente ? "default" : "pointer",
            }}>
            Hoje
          </button>
          <button onClick={() => andarMes(-1)} aria-label="Mês anterior"
            className="flex items-center justify-center" style={botaoIcone}>
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => andarMes(1)} aria-label="Próximo mês"
            className="flex items-center justify-center" style={botaoIcone}>
            <ChevronRight size={15} />
          </button>
          <span className="ml-1" style={{
            fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, color: C.text,
          }}>
            {MESES[mesRef.getMonth()]} de {mesRef.getFullYear()}
          </span>
          <button onClick={central.refetch} aria-label="Atualizar"
            className="flex items-center justify-center" style={botaoIcone}>
            <RefreshCw size={14} className={central.isFetching ? "girar" : ""} />
          </button>
        </div>
      </div>

      <p className="leading-relaxed" style={{ color: C.textMuted, marginBottom: 20, fontSize: 15 }}>
        Cursos, palestras e workshops de Salvador. Clique no evento para ver e editar os detalhes.
      </p>

      {/* Resumo do mes E legenda na mesma faixa. Antes a legenda era so
          tres bolinhas cinza: ocupava uma linha inteira sem dizer nada
          sobre o mes que esta na tela. Aqui cada tipo mostra QUANTOS sao,
          e a cor da contagem e a mesma da pastilha — a legenda deixa de
          ser um aviso e vira o proprio numero. */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {["Curso", "Palestra", "Workshop"].map((t) => {
          const cor = corDoTipo(t);
          const qtd = (central.data ?? []).filter(
            (e) => e.tipo === t && new Date(e.data_inicio + "T00:00:00").getMonth() === mesRef.getMonth()
          ).length;
          return (
            <span key={t} className="inline-flex items-center gap-2 rounded-lg"
              style={{
                padding: "6px 11px 6px 9px",
                background: cor.fundo,
                borderLeft: `3px solid ${cor.acento}`,
                borderRadius: 6,
              }}>
              <span className="tabular-nums" style={{
                fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, color: cor.texto,
              }}>
                {qtd}
              </span>
              <span style={{ ...etiqueta, fontSize: 10, color: cor.texto, opacity: .85 }}>
                {t}{qtd === 1 ? "" : "s"}
              </span>
            </span>
          );
        })}
      </div>

      {central.error ? (
        <div className="flex items-start gap-2.5 rounded-xl p-3.5 text-sm"
          style={{ background: "rgba(194,102,90,0.1)", border: `1px solid ${C.alert}`, color: C.text }}>
          <AlertTriangle size={15} style={{ color: C.alert, marginTop: 1 }} className="shrink-0" />
          <span className="min-w-0 break-words">{central.error.message}</span>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{
          border: `1px solid ${C.moldura}`,
          borderTop: "none", borderLeft: "none",
          background: C.void,
          position: "relative",
        }}>
          {/* Banda de cabecalho, como na agenda do Google: fundo proprio
              e texto claro. Sem ela, os dias da semana boiavam soltos
              acima da grade. */}
          <div className="grid grid-cols-7" style={{ background: "rgba(255,255,255,.05)" }}>
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-2.5 text-center"
                style={{
                  ...etiqueta, fontSize: 10, color: C.textMuted,
                  borderLeft: `1px solid ${C.bronzeLine}`,
                  borderBottom: `1px solid ${C.bronzeLine}`,
                }}>
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 mesGrade"
            key={`${mesRef.getFullYear()}-${mesRef.getMonth()}`}
            style={{ animation: direcao === 0 ? "none" : `${direcao > 0 ? "mesEntraDireita" : "mesEntraEsquerda"} .26s ease-out` }}>
            {grade.dias.map((d) => (
              <CelulaDia key={iso(d)} data={d} hoje={hoje}
                doMes={d.getMonth() === grade.mes}
                eventos={porDia.get(iso(d)) ?? []}
                onAbrir={setSelecionado} />
            ))}
          </div>

          {/* Carregando por cima da grade, nao no lugar dela: trocar o mes
              nao deve fazer a tela saltar para uma tarja e voltar. */}
          {central.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm"
              style={{ background: "rgba(8,8,10,.55)", color: C.textFaint }}>
              <RefreshCw size={14} className="girar" /> Carregando…
            </div>
          )}
        </div>
      )}

      {selecionado && (
        <PainelDetalheEvento key={selecionado.turma_id} evento={selecionado}
          podeEditar={permissao.data === true} usuarioId={sessao?.user?.id}
          onFechar={() => setSelecionado(null)} onSalvo={central.refetch} />
      )}
    </div>
  );
}

/* ============ CENTRAL FEBRACIS · REDESENHO 2026 ============
   Uma pergunta: o que começa neste mês e quanto sabemos sobre o público?
   O calendário continua sendo a peça principal; os indicadores só dão o
   contexto necessário antes da leitura da grade. */
function EstadoCentral({ consulta, vazio, children }) {
  const base = {
    minHeight: 220, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", textAlign: "center",
    padding: 24,
  };
  if (consulta.isLoading) return (
    <div style={base}>
      <Loader2 size={20} className="girar" style={{ color: C.goldBase }} />
      <div style={{ marginTop: 10, fontSize: 13, color: C.faint }}>Carregando</div>
    </div>
  );
  if (consulta.error) return (
    <div style={base}>
      <ShieldAlert size={21} style={{ color: C.down }} />
      <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, color: C.bright }}>
        Não foi possível carregar
      </div>
      <div style={{ marginTop: 5, maxWidth: 560, fontSize: 12, color: C.faint }}>
        {consulta.error.message}
      </div>
    </div>
  );
  if (vazio) return (
    <div style={base}>
      <Database size={21} style={{ color: C.faint }} />
      <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, color: C.muted }}>
        Nenhum evento neste mês
      </div>
      <div style={{ marginTop: 5, maxWidth: 520, fontSize: 12, color: C.faint }}>
        Cursos vêm do Salesforce; palestras e workshops entram pela agenda institucional.
      </div>
    </div>
  );
  return children;
}

function KpiCentral({ rotulo, valor, nota, Icone, cor = C.text, hero = false }) {
  return (
    <div style={{
      minHeight: 78, borderRadius: 13, padding: "13px 15px",
      background: C.card,
      border: `1px solid ${hero ? `${C.gold}38` : C.cardLine}`,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: hero ? C.gold : cor,
        background: hero ? `${C.gold}24` : `${cor}1E`,
      }}><Icone size={15} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{rotulo}</div>
        <div style={{
          marginTop: 2, fontFamily: FONT_DISPLAY, fontSize: 22,
          fontWeight: 700, letterSpacing: "-.5px", color: hero ? C.gold : cor,
        }}>{valor}</div>
        <div style={{ marginTop: 1, fontSize: 10.5, color: C.faint }}>{nota}</div>
      </div>
    </div>
  );
}

function BlocoCentral({ titulo, canto, children }) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.cardLine}`,
      borderRadius: 16, marginBottom: 20, overflow: "hidden",
    }}>
      <div style={{
        padding: "13px 20px", borderBottom: `1px solid ${C.hair}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 800, color: C.bright }}>{titulo}</h2>
        <span style={{ fontSize: 11, color: C.faint, textAlign: "right" }}>{canto}</span>
      </div>
      {children}
    </section>
  );
}

export default function CentralEventos() {
  const sessao = useSessao();
  const permissao = usePodeEditarEvento();
  const [selecionado, setSelecionado] = useState(null);
  const [mesRef, setMesRef] = useState(() => {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), 1);
  });
  const [direcao, setDirecao] = useState(0);
  const grade = useMemo(() => gradeDoMes(mesRef), [mesRef]);
  const hoje = iso(new Date());
  const central = useCentralFebracis(iso(grade.inicio), iso(grade.fim));

  const eventosMes = useMemo(() => (central.data ?? []).filter((e) => {
    const d = new Date(`${String(e.data_inicio).slice(0, 10)}T12:00:00`);
    return d.getMonth() === mesRef.getMonth() && d.getFullYear() === mesRef.getFullYear();
  }), [central.data, mesRef]);

  const resumo = useMemo(() => {
    const cursos = eventosMes.filter((e) => e.tipo === "Curso");
    const palestras = eventosMes.filter((e) => e.tipo === "Palestra");
    const medidos = eventosMes.filter((e) => e.vendas != null);
    const vendas = cursos.reduce((s, e) => s + Number(e.vendas ?? 0), 0);
    const inscritos = palestras.reduce((s, e) => s + Number(e.vendas ?? 0), 0);
    const cobertura = eventosMes.length ? Math.round(medidos.length / eventosMes.length * 100) : null;
    return { cursos, palestras, medidos, vendas, inscritos, cobertura };
  }, [eventosMes]);

  const porDia = useMemo(() => {
    const mapa = new Map();
    for (const evento of central.data ?? []) {
      const chave = String(evento.data_inicio).slice(0, 10);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(evento);
    }
    return mapa;
  }, [central.data]);

  const andarMes = (passo) => {
    setDirecao(passo);
    setMesRef((m) => new Date(m.getFullYear(), m.getMonth() + passo, 1));
  };
  const irParaHoje = () => {
    const h = new Date();
    const alvo = new Date(h.getFullYear(), h.getMonth(), 1);
    setDirecao(alvo < mesRef ? -1 : 1);
    setMesRef(alvo);
  };
  const noMesCorrente = mesRef.getMonth() === new Date().getMonth()
    && mesRef.getFullYear() === new Date().getFullYear();
  const coberturaCor = resumo.cobertura == null ? C.faint
    : resumo.cobertura >= 80 ? C.up : resumo.cobertura >= 50 ? C.warn : C.down;
  const botaoIcone = {
    height: 32, borderRadius: 8, padding: "0 10px", fontFamily: SANS,
    background: "transparent", color: C.muted, border: `1px solid ${C.cardLine}`,
  };

  return (
    <div className="subir" style={{ maxWidth: 1180, margin: "0 auto", paddingBottom: 48, fontFamily: SANS }}>
      <style>{`
        @keyframes centralMesDireita { from { opacity:0; transform:translateX(14px) } to { opacity:1; transform:none } }
        @keyframes centralMesEsquerda { from { opacity:0; transform:translateX(-14px) } to { opacity:1; transform:none } }
        .centralScroll { overflow-x:auto; }
        .centralGrade { min-width:760px; }
        @media (prefers-reduced-motion: reduce) { .mesGrade { animation:none !important; } }
        @media (max-width:680px) {
          .centralKpis { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
          .centralCabecalho { align-items:flex-start !important; }
        }
        @media (max-width:520px) {
          .centralKpis { grid-template-columns:1fr !important; }
          .centralMesNome { width:100%; order:-1; margin-bottom:4px; }
        }
      `}</style>

      <header className="centralCabecalho" style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 20, flexWrap: "wrap", marginBottom: 20,
      }}>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: ".6px",
            color: C.gold, textTransform: "uppercase", marginBottom: 6,
          }}>Central Febracis · Salvador</div>
          <h1 style={{ fontSize: 29, lineHeight: 1.15, fontWeight: 800, letterSpacing: "-.6px", color: C.text }}>
            Agenda de {MESES[mesRef.getMonth()]}
          </h1>
          <p style={{ marginTop: 5, fontSize: 13, color: C.faint }}>
            O que começa no mês e quanto já sabemos sobre o público.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span className="centralMesNome" style={{
            marginRight: 4, fontFamily: FONT_DISPLAY, fontSize: 14,
            fontWeight: 700, color: C.bright,
          }}>{MESES[mesRef.getMonth()]} {mesRef.getFullYear()}</span>
          <button onClick={irParaHoje} disabled={noMesCorrente} style={{
            ...botaoIcone, cursor: noMesCorrente ? "default" : "pointer",
            color: noMesCorrente ? C.dim : C.muted,
          }}>Hoje</button>
          <button onClick={() => andarMes(-1)} aria-label="Mês anterior" style={{ ...botaoIcone, width: 32, padding: 0 }}>
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => andarMes(1)} aria-label="Próximo mês" style={{ ...botaoIcone, width: 32, padding: 0 }}>
            <ChevronRight size={15} />
          </button>
          <button onClick={() => central.refetch()} aria-label="Atualizar" style={{ ...botaoIcone, width: 32, padding: 0 }}>
            <RefreshCw size={14} className={central.isFetching ? "girar" : ""} />
          </button>
        </div>
      </header>

      <div className="centralKpis" style={{
        display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))",
        gap: 10, marginBottom: 20,
      }}>
        <KpiCentral hero Icone={CalendarDays} rotulo="programação"
          valor={central.isLoading ? "—" : eventosMes.length}
          nota={`${MESES[mesRef.getMonth()]} · total do mês`} />
        <KpiCentral Icone={Ticket} rotulo="cursos"
          valor={central.isLoading ? "—" : resumo.cursos.length}
          nota={`${resumo.vendas.toLocaleString("pt-BR")} vendas · ${resumo.cursos.filter((e) => e.vendas != null).length} de ${resumo.cursos.length} medidos`}
          cor={C.gold} />
        <KpiCentral Icone={Users} rotulo="palestras"
          valor={central.isLoading ? "—" : resumo.palestras.length}
          nota={`${resumo.inscritos.toLocaleString("pt-BR")} inscritos · ${resumo.palestras.filter((e) => e.vendas != null).length} de ${resumo.palestras.length} medidas`}
          cor={C.up} />
        <KpiCentral Icone={Database} rotulo="cobertura do público"
          valor={resumo.cobertura == null ? "—" : `${resumo.cobertura}%`}
          nota={`${resumo.medidos.length} de ${eventosMes.length} eventos com número`}
          cor={coberturaCor} />
      </div>

      <BlocoCentral titulo="Calendário institucional"
        canto={`${eventosMes.length.toLocaleString("pt-BR")} eventos · início de cada experiência`}>
        <EstadoCentral consulta={central} vazio={!eventosMes.length}>
          <div className="centralScroll">
            <div className="centralGrade">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", background: "#17171c" }}>
                {DIAS_SEMANA.map((dia) => <div key={dia} style={{
                  padding: "8px 12px", textAlign: "center", fontSize: 10,
                  fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase",
                  color: C.dim, borderBottom: `1px solid ${C.cardLine}`,
                }}>{dia}</div>)}
              </div>
              <div className="mesGrade" key={`${mesRef.getFullYear()}-${mesRef.getMonth()}`}
                style={{
                  display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))",
                  animation: direcao === 0 ? "none" : `${direcao > 0 ? "centralMesDireita" : "centralMesEsquerda"} .22s ease-out`,
                }}>
                {grade.dias.map((dia) => <CelulaDia key={iso(dia)} data={dia} hoje={hoje}
                  doMes={dia.getMonth() === grade.mes} eventos={porDia.get(iso(dia)) ?? []}
                  onAbrir={setSelecionado} />)}
              </div>
            </div>
          </div>
        </EstadoCentral>
      </BlocoCentral>

      <div style={{ fontSize: 10.5, color: C.dim, marginTop: -8 }}>
        Fontes: Salesforce para cursos e vendas; agenda institucional para palestras e workshops.
        A view ainda não informa a hora da última carga.
      </div>

      {selecionado && <PainelDetalheEvento key={selecionado.turma_id} evento={selecionado}
        podeEditar={permissao.data === true} usuarioId={sessao?.user?.id}
        onFechar={() => setSelecionado(null)} onSalvo={central.refetch} />}
    </div>
  );
}
