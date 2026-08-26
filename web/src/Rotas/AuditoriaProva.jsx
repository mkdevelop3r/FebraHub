/* ============================================================
   PROVA DA AUDITORIA · Hub de Auditoria

   O hub mostrava score e falha por etapa — o VEREDITO — e nenhuma tela
   levava à PROVA. Esta é a tela que a gestão abre quando uma consultora
   contesta a nota: por que a IA deu 0 nesta etapa, e onde na conversa
   está escrito isso.

   DOCUMENTO, NÃO PAINEL
   Não há gráfico aqui, e é deliberado. Isto se lê ao lado de outra
   pessoa, numa devolutiva, rolando a conversa junto. Por isso a medida do
   texto é generosa, a citação tem espaço para respirar e a densidade
   perde para a legibilidade em toda decisão de layout.

   O TRECHO É CITAÇÃO LITERAL
   Nada aqui reescreve, resume ou corrige o `trecho`. Ele é o que foi
   dito, com erro de digitação, emoji e tudo. Qualquer edição destrói o
   valor de prova — o objetivo é que a consultora leia e reconheça, não
   que fique bonito.

   Quando o campo vem vazio, a tela DIZ que está vazio. Não inventa texto
   e não esconde a etapa: "sem trecho isolado" é uma informação legítima
   sobre a auditoria, não uma falha da interface.

   DADO PESSOAL
   A transcrição traz o nome do lead e o que ele falou. As três views
   (`vw_auditoria_lista`, `vw_auditoria_prova`, `vw_auditoria_conversa`)
   carregam `pode_ver('auditoria')` no `where`; quem não tem o setor
   recebe zero linhas. Nada nesta tela afrouxa isso, e nada deve.
   ============================================================ */

import { useState, useMemo } from "react";
import {
  ChevronRight, X, FileText, Mic, CornerDownRight,
  CheckCircle2, XCircle, MinusCircle, MessageSquare, AlertTriangle,
} from "lucide-react";
import {
  useAuditoriaLista, useAuditoriaProva, useAuditoriaConversa,
} from "../lib/dados";
import { rotuloEtapa } from "../lib/etapas";

/* Mesma paleta do FebraHub.jsx. Repetida e não importada porque quem
   renderiza esta tela é o hub, que vive lá — importar de volta criaria
   ciclo entre a tela e a página que a monta. */
const C = {
  void: "#08080A",
  surface: "rgba(255,255,255,.028)",
  linha: "rgba(255,255,255,.08)",
  hair: "rgba(255,255,255,.05)",
  gold: "#E4C06A",
  goldDim: "#B8934A",
  text: "#F5F3EE",
  muted: "#8B8B90",
  faint: "#6A6A70",
  dim: "#5B5B62",
  down: "#E06C75",
  up: "#6FCF97",
  warn: "#E6B04D",
};
const DISPLAY = "'Space Grotesk', system-ui, sans-serif";
const etiqueta = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: ".11em",
  textTransform: "uppercase", fontFamily: DISPLAY, whiteSpace: "nowrap",
};

/* ============ LEITURA DO DADO ============ */

/* O trecho de uma etapa que falhou por AUSÊNCIA vem como salto:
     Quem: "msg A"  →  Quem: "msg B"
   São as mensagens ENTRE as quais a etapa deveria ter entrado. Medido no
   banco, o salto pode ter mais de duas partes — a apresentação de uma das
   auditorias tem três —, então isto divide em N e não em duas. */
const partesDoTrecho = (trecho) =>
  String(trecho ?? "")
    .split("→")
    .map((p) => p.trim())
    .filter(Boolean);

/* `Quem: "mensagem"` -> { quem, texto }. A mensagem pode ter aspas e
   quebras de linha dentro; por isso o corpo é capturado com [\s\S]* até a
   ÚLTIMA aspa, e não até a primeira. Se o formato não bater, devolve o
   texto cru em vez de sumir com ele: prova não se descarta por não casar
   com uma expressão regular. */
function parteFala(parte) {
  const m = String(parte).match(/^(.*?):\s*"([\s\S]*)"\s*$/);
  if (!m) return { quem: null, texto: String(parte) };
  return { quem: m[1].trim(), texto: m[2] };
}

/* A conversa vem como uma mensagem por linha:
     #12 [2026-07-16 13:46] Quem: mensagem
   Mensagem com quebra de linha continua nas linhas seguintes SEM o
   cabeçalho — por isso a continuação é anexada à anterior em vez de
   virar uma mensagem sem número. */
function lerConversa(texto) {
  const linhas = String(texto ?? "").split("\n");
  const msgs = [];
  for (const linha of linhas) {
    const m = linha.match(/^#(\d+)\s*\[([^\]]*)\]\s*(.*?):\s*([\s\S]*)$/);
    if (m) {
      msgs.push({ n: m[1], quando: m[2], quem: m[3].trim(), texto: m[4] });
    } else if (msgs.length) {
      msgs[msgs.length - 1].texto += "\n" + linha;
    } else if (linha.trim()) {
      msgs.push({ n: null, quando: null, quem: null, texto: linha });
    }
  }
  return msgs;
}

const ehAudio = (t) => String(t ?? "").includes("[ÁUDIO TRANSCRITO]");
/* LEAD e os automáticos não são a consultora. Serve só para dar contraste
   diferente a quem fala — não altera uma vírgula do que foi dito. */
const ehLead = (quem) => /^lead\b/i.test(String(quem ?? ""));

const ESTADO_NOTA = {
  1: { rotulo: "cumprida", cor: C.up, Icone: CheckCircle2 },
  0: { rotulo: "falhou", cor: C.down, Icone: XCircle },
};
const naoSeAplica = { rotulo: "não se aplica", cor: C.dim, Icone: MinusCircle };

const fmtData = (iso) => {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/* ============ CITAÇÃO ============ */

function Fala({ quem, texto }) {
  const lead = ehLead(quem);
  const audio = ehAudio(texto);
  return (
    <div className="rounded-lg px-4 py-3"
      style={{
        background: C.surface,
        borderLeft: `3px solid ${lead ? C.goldDim : C.linha}`,
      }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ ...etiqueta, fontSize: 9, color: lead ? C.gold : C.faint }}>
          {quem || "sem identificação"}
        </span>
        {audio && (
          <span className="inline-flex items-center gap-1"
            style={{ ...etiqueta, fontSize: 8.5, color: C.warn }}>
            <Mic size={9} /> áudio
          </span>
        )}
      </div>
      {/* `pre-wrap` porque a mensagem tem quebra de linha de verdade, e
          juntar tudo numa linha mudaria como a conversa foi lida. */}
      <p style={{
        color: C.text, fontSize: 13.5, lineHeight: 1.65,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {texto}
      </p>
    </div>
  );
}

function Citacao({ trecho }) {
  const partes = partesDoTrecho(trecho);

  if (!partes.length) {
    return (
      <div className="rounded-lg px-4 py-3 text-[12.5px]"
        style={{ background: "rgba(255,255,255,.012)", color: C.faint, border: `1px dashed ${C.linha}` }}>
        Sem trecho isolado — ver a conversa completa.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {partes.map((parte, i) => {
        const { quem, texto } = parteFala(parte);
        return (
          <div key={i} className="flex flex-col gap-2">
            {i > 0 && (
              /* O salto é a prova da AUSÊNCIA: a etapa deveria ter
                 acontecido entre estas duas mensagens e não aconteceu.
                 Dizer isso por extenso importa mais que a seta — sem a
                 frase, as duas citações parecem só duas citações. */
              <div className="flex items-center gap-2 pl-1">
                <CornerDownRight size={12} style={{ color: C.down }} />
                <span style={{ ...etiqueta, fontSize: 9, color: C.down }}>
                  a etapa deveria ter entrado aqui
                </span>
                <span className="flex-1" style={{ height: 1, background: C.hair }} />
              </div>
            )}
            <Fala quem={quem} texto={texto} />
          </div>
        );
      })}
    </div>
  );
}

/* ============ ETAPA ============ */

function EtapaProva({ linha }) {
  const estado = linha.nota == null ? naoSeAplica : (ESTADO_NOTA[linha.nota] ?? naoSeAplica);
  const { Icone } = estado;

  return (
    <div className="py-5" style={{ borderTop: `1px solid ${C.hair}` }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icone size={15} style={{ color: estado.cor }} className="shrink-0" />
          <h4 style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.text }}>
            {rotuloEtapa(linha.etapa)}
          </h4>
          {linha.peso != null && (
            <span style={{ ...etiqueta, fontSize: 9, color: C.faint }}>
              peso {Number(linha.peso).toLocaleString("pt-BR")}
            </span>
          )}
        </div>
        <span style={{ ...etiqueta, fontSize: 9.5, color: estado.cor }}>{estado.rotulo}</span>
      </div>

      {linha.observacao ? (
        <p className="mb-3" style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>
          {linha.observacao}
        </p>
      ) : (
        <p className="mb-3" style={{ color: C.dim, fontSize: 12.5, fontStyle: "italic" }}>
          Sem justificativa registrada.
        </p>
      )}

      <Citacao trecho={linha.trecho} />
    </div>
  );
}

/* ============ CONVERSA COMPLETA ============ */

function ConversaCompleta({ auditoriaId, temProva }) {
  const [aberta, setAberta] = useState(false);
  const conversa = useAuditoriaConversa(auditoriaId, aberta);
  const msgs = useMemo(() => lerConversa(conversa.data?.texto), [conversa.data?.texto]);

  if (!temProva) {
    return (
      <div className="rounded-xl p-5 mt-6" style={{ border: `1px dashed ${C.linha}` }}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} style={{ color: C.warn }} />
          <span style={{ ...etiqueta, color: C.warn }}>Sem conversa gravada</span>
        </div>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6 }}>
          Esta auditoria é anterior à implantação da prova. O score e as notas por
          etapa continuam válidos — o que não existe é a transcrição que a IA leu,
          porque naquela época ela não era guardada. Auditorias a partir da
          implantação trazem a conversa inteira.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button onClick={() => setAberta((v) => !v)}
        className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left"
        style={{ background: C.surface, border: `1px solid ${C.linha}` }}>
        <MessageSquare size={14} style={{ color: C.gold }} className="shrink-0" />
        <span style={{ fontSize: 13.5, color: C.text }}>Conversa completa</span>
        <span style={{ ...etiqueta, fontSize: 9, color: C.faint }}>
          como a IA leu
        </span>
        <ChevronRight size={15} className="ml-auto shrink-0 transition-transform"
          style={{ color: C.faint, transform: aberta ? "rotate(90deg)" : "none" }} />
      </button>

      {aberta && (
        <div className="mt-3">
          {conversa.isLoading ? (
            <p className="text-[13px] px-4 py-6" style={{ color: C.faint }}>Carregando a conversa…</p>
          ) : conversa.error ? (
            <p className="text-[13px] px-4 py-6" style={{ color: C.down }}>{conversa.error.message}</p>
          ) : !msgs.length ? (
            <p className="text-[13px] px-4 py-6" style={{ color: C.faint }}>
              A transcrição está vazia.
            </p>
          ) : (
            <>
              {conversa.data?.audios > 0 && (
                <p className="mb-3 px-1 text-[12px]" style={{ color: C.faint }}>
                  {conversa.data.audios} trecho{conversa.data.audios > 1 ? "s" : ""} veio de áudio
                  transcrito e está marcado na linha.
                </p>
              )}
              <div className="flex flex-col">
                {msgs.map((m, i) => (
                  <div key={i} className="flex gap-3 py-2.5"
                    style={{ borderTop: i ? `1px solid ${C.hair}` : "none" }}>
                    {/* Número discreto e de largura fixa: serve para
                        apontar ("olha a mensagem 12"), não para ser lido
                        junto com o texto. */}
                    <span className="shrink-0 tabular-nums text-right"
                      style={{ width: 34, color: C.dim, fontSize: 11, fontFamily: DISPLAY, paddingTop: 2 }}>
                      {m.n ?? ""}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{
                          ...etiqueta, fontSize: 9,
                          color: ehLead(m.quem) ? C.gold : C.faint,
                        }}>
                          {m.quem || "—"}
                        </span>
                        {m.quando && (
                          <span style={{ fontSize: 10.5, color: C.dim }}>{m.quando}</span>
                        )}
                        {ehAudio(m.texto) && (
                          <span className="inline-flex items-center gap-1"
                            style={{ ...etiqueta, fontSize: 8.5, color: C.warn }}>
                            <Mic size={9} /> áudio
                          </span>
                        )}
                      </div>
                      <p style={{
                        color: C.text, fontSize: 13.5, lineHeight: 1.65, marginTop: 3,
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>
                        {m.texto}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ============ PAINEL ============ */

function PainelProva({ auditoria, aoFechar }) {
  const prova = useAuditoriaProva(auditoria.auditoria_id);
  const cumpridas = auditoria.etapas_cumpridas ?? 0;
  const avaliadas = auditoria.etapas_avaliadas ?? 0;

  const dado = (rotulo, valor, cor) => (
    <div className="min-w-0">
      <div style={{ ...etiqueta, fontSize: 9, color: C.faint }}>{rotulo}</div>
      <div className="mt-1 truncate" style={{ color: cor ?? C.text, fontSize: 13.5 }}>
        {valor ?? "—"}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,.66)" }}
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <aside className="h-full w-full overflow-y-auto"
        style={{ maxWidth: 760, background: "#0E0E10", borderLeft: `1px solid ${C.linha}` }}>

        <div className="px-8 pt-7 pb-6" style={{ borderBottom: `1px solid ${C.linha}` }}>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="min-w-0">
              <div style={{ ...etiqueta, color: C.gold, marginBottom: 8 }}>
                Prova da auditoria
              </div>
              <h2 style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.text }}>
                {auditoria.consultora || "Consultora não identificada"}
              </h2>
              <p className="mt-1.5" style={{ color: C.muted, fontSize: 13 }}>
                {auditoria.contato || "contato não registrado"} · {fmtData(auditoria.data_ref)} · {auditoria.canal}
              </p>
            </div>
            <button onClick={aoFechar} aria-label="Fechar"
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: C.surface, color: C.muted, border: `1px solid ${C.linha}` }}>
              <X size={16} />
            </button>
          </div>

          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
            {dado("Score", auditoria.score, C.gold)}
            {dado("Faixa", auditoria.faixa)}
            {dado("Tipo de atendimento", auditoria.tipo_atendimento)}
            {dado("Etapas cumpridas", `${cumpridas} de ${avaliadas}`)}
          </div>

          {/* A justificativa do TIPO explica por que uma conversa
              operacional não é cobrada como consultiva. Sem ela, a
              devolutiva começa por uma discussão que o dado já resolveu. */}
          {auditoria.tipo_justificativa && (
            <p className="mt-4 text-[12.5px]" style={{ color: C.faint, lineHeight: 1.6 }}>
              {auditoria.tipo_justificativa}
            </p>
          )}
        </div>

        <div className="px-8 py-6">
          <div className="flex items-center gap-2 mb-1">
            <FileText size={13} style={{ color: C.gold }} />
            <span style={{ ...etiqueta, color: C.gold }}>Etapas do roteiro</span>
          </div>
          <p className="mb-2 text-[12.5px]" style={{ color: C.faint }}>
            Na ordem do roteiro. O trecho é citação literal da conversa.
          </p>

          {prova.isLoading ? (
            <p className="py-8 text-[13px]" style={{ color: C.faint }}>Carregando as etapas…</p>
          ) : prova.error ? (
            <p className="py-8 text-[13px]" style={{ color: C.down }}>{prova.error.message}</p>
          ) : !prova.data?.length ? (
            <p className="py-8 text-[13px]" style={{ color: C.faint }}>
              Esta auditoria não tem etapas detalhadas gravadas.
            </p>
          ) : (
            prova.data.map((l) => <EtapaProva key={l.etapa} linha={l} />)
          )}

          <ConversaCompleta auditoriaId={auditoria.auditoria_id} temProva={auditoria.tem_prova} />
        </div>
      </aside>
    </div>
  );
}

/* ============ LISTA ============ */

const CORES_FAIXA = { alta: C.up, media: C.warn, baixa: C.down };

function LinhaAuditoria({ a, aoAbrir }) {
  const corFaixa = CORES_FAIXA[a.faixa] ?? C.muted;
  return (
    <button onClick={aoAbrir}
      className="w-full text-left flex items-center gap-4 px-4 py-3.5 transition-colors"
      style={{ borderTop: `1px solid ${C.hair}` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ color: C.text, fontSize: 13.5, fontWeight: 500 }}>
            {a.consultora || "—"}
          </span>
          {!a.tem_prova && (
            <span style={{ ...etiqueta, fontSize: 8.5, color: C.dim }}>sem conversa</span>
          )}
        </div>
        <div className="text-[11.5px] mt-0.5" style={{ color: C.faint }}>
          {fmtData(a.data_ref)} · {a.tipo_atendimento || "tipo não classificado"}
          {a.contato ? ` · ${a.contato}` : ""}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="tabular-nums" style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, color: corFaixa }}>
          {a.score ?? "—"}
        </div>
        <div style={{ ...etiqueta, fontSize: 8.5, color: C.faint }}>
          {a.etapas_cumpridas ?? 0}/{a.etapas_avaliadas ?? 0} etapas
        </div>
      </div>

      <ChevronRight size={15} className="shrink-0" style={{ color: C.dim }} />
    </button>
  );
}

export default function ProvaAuditoria({ canal, consultora, desde }) {
  const lista = useAuditoriaLista();
  const [aberta, setAberta] = useState(null);

  const filtradas = useMemo(() => {
    const linhas = (lista.data ?? []).filter((a) => {
      if (canal && a.canal !== canal) return false;
      if (consultora && a.consultora !== consultora) return false;
      if (desde && String(a.data_ref ?? "") < desde) return false;
      return true;
    });
    // Mais recente primeiro: a devolutiva olha para o que acabou de sair.
    return linhas.sort((x, y) => String(y.data_ref).localeCompare(String(x.data_ref)));
  }, [lista.data, canal, consultora, desde]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span style={{ ...etiqueta, color: C.gold }}>Auditorias</span>
        <span style={{ ...etiqueta, fontSize: 9, color: C.faint }}>
          {filtradas.length} conversa{filtradas.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mb-3 text-[12.5px]" style={{ color: C.faint }}>
        Abra uma para ver a justificativa de cada etapa e o trecho da conversa que a sustenta.
      </p>

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.linha}` }}>
        {lista.isLoading ? (
          <p className="px-4 py-8 text-[13px]" style={{ color: C.faint }}>Carregando…</p>
        ) : lista.error ? (
          <p className="px-4 py-8 text-[13px]" style={{ color: C.down }}>{lista.error.message}</p>
        ) : !filtradas.length ? (
          <p className="px-4 py-8 text-[13px]" style={{ color: C.faint }}>
            Nenhuma auditoria neste recorte.
          </p>
        ) : (
          filtradas.map((a) => (
            <LinhaAuditoria key={a.auditoria_id} a={a} aoAbrir={() => setAberta(a)} />
          ))
        )}
      </div>

      {aberta && (
        <PainelProva key={aberta.auditoria_id} auditoria={aberta} aoFechar={() => setAberta(null)} />
      )}
    </div>
  );
}
