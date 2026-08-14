/* ============================================================
   AVALIAÇÃO DE EVENTO — tela pública
   FebraHub · Hub Pedagógico

   Roda no celular de quem assistiu à palestra, sem login, a partir
   do QR code. É a única tela do sistema usada por gente de fora da
   Febracis — por isso não depende de nada do portal: sem Tailwind,
   sem lucide, sem sidebar, sem sessão.

   COMO MONTAR — funciona dos dois jeitos:

   a) Como rota (se/quando o FebraHub adotar react-router):
        <Route path="/e/:token" element={<Avaliacao />} />
      O componente lê o token da própria URL.

   b) Como prop, em qualquer lugar:
        <Avaliacao token="45d52e5e6d134c95bff7690c155220a0" />

   Precisa de: o cliente Supabase do projeto. Ajuste o import abaixo
   para o caminho real (no FebraHub costuma ser ../supabase).
   ============================================================ */

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/* ---------- tokens do FebraHub ---------- */
const C = {
  void: "#121217",
  surface: "#1C1C24",
  line: "#413a30",
  gold: "#C3A34B",
  goldBright: "#E3C371",
  goldDim: "#8A7239",
  text: "#F2EDE1",
  muted: "#9C968A",
  faint: "#6b665c",
  alert: "#C2665A",
  positive: "#8FAE7C",
};

/* Token vem da prop ou do fim da URL: /e/<token> */
function tokenDaUrl() {
  if (typeof window === "undefined") return null;
  const partes = window.location.pathname.split("/").filter(Boolean);
  return partes[partes.length - 1] || null;
}

const dataLonga = (iso) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });

export default function Avaliacao({ token: tokenProp }) {
  const token = tokenProp || tokenDaUrl();

  const [carregando, setCarregando] = useState(true);
  const [evento, setEvento] = useState(null);
  const [valores, setValores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState(null);
  const [faltando, setFaltando] = useState([]);

  /* ---------- abre ---------- */
  useEffect(() => {
    let vivo = true;

    (async () => {
      if (!token) {
        setEvento({ estado: "inexistente" });
        setCarregando(false);
        return;
      }

      /* já respondeu neste aparelho? não impede, só evita o duplo envio
         acidental de quem recarrega a página */
      try {
        if (window.localStorage.getItem("avaliacao:" + token)) setEnviado(true);
      } catch (e) {
        /* navegador sem storage — segue normal */
      }

      const { data, error } = await supabase.rpc("evento_abrir", { p_token: token });
      if (!vivo) return;

      if (error) setErro("Não foi possível abrir a avaliação. Tente de novo em instantes.");
      else setEvento(data);

      setCarregando(false);
    })();

    return () => { vivo = false; };
  }, [token]);

  const responder = (id, valor) => {
    setValores((v) => ({ ...v, [id]: valor }));
    setFaltando((f) => f.filter((x) => x !== id));
  };

  /* ---------- envia ---------- */
  const enviar = async () => {
    const pendentes = evento.perguntas
      .filter((p) => p.obrigatoria)
      .filter((p) => {
        const v = valores[p.id];
        return v === undefined || v === null || String(v).trim() === "";
      })
      .map((p) => p.id);

    if (pendentes.length) {
      setFaltando(pendentes);
      setErro("Faltam respostas obrigatórias.");
      document.getElementById("pergunta-" + pendentes[0])
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setErro(null);
    setEnviando(true);

    const respostas = evento.perguntas
      .filter((p) => valores[p.id] !== undefined && String(valores[p.id]).trim() !== "")
      .map((p) =>
        p.tipo === "escala_0_10" || p.tipo === "escala_1_5"
          ? { pergunta_id: p.id, valor_num: Number(valores[p.id]) }
          : { pergunta_id: p.id, valor_texto: String(valores[p.id]) }
      );

    const { error } = await supabase.rpc("evento_responder", {
      p_token: token,
      p_respostas: respostas,
    });

    setEnviando(false);

    if (error) {
      setErro(error.message || "O envio não foi concluído. Tente de novo.");
      return;
    }

    try { window.localStorage.setItem("avaliacao:" + token, "1"); } catch (e) { /* ok */ }
    setEnviado(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---------- telas de estado ---------- */
  if (carregando) return <Moldura><Recado texto="Abrindo a avaliação…" /></Moldura>;

  if (enviado)
    return (
      <Moldura>
        <Selo />
        <h1 style={S.titulo}>Avaliação enviada</h1>
        <p style={S.corpo}>
          Obrigado. O que você escreveu chega direto em quem organiza e em quem
          apresentou — é assim que a próxima fica melhor.
        </p>
      </Moldura>
    );

  if (!evento || evento.estado === "inexistente")
    return (
      <Moldura>
        <h1 style={S.titulo}>Avaliação não encontrada</h1>
        <p style={S.corpo}>
          O link pode ter sido copiado incompleto. Confira o QR code com quem
          organizou o evento.
        </p>
      </Moldura>
    );

  if (evento.estado === "aguardando")
    return (
      <Moldura>
        <p style={S.olho}>{evento.titulo}</p>
        <h1 style={S.titulo}>A avaliação abre em {dataLonga(evento.abre_em)}</h1>
        <p style={S.corpo}>
          Guarde este link. Ele funciona a partir do dia do evento.
        </p>
      </Moldura>
    );

  if (evento.estado === "encerrada")
    return (
      <Moldura>
        <p style={S.olho}>{evento.titulo}</p>
        <h1 style={S.titulo}>Esta avaliação foi encerrada</h1>
        <p style={S.corpo}>
          O prazo de resposta terminou em {dataLonga(evento.fecha_em)}.
        </p>
      </Moldura>
    );

  /* ---------- formulário ---------- */
  const daElis = evento.perguntas.filter((p) => !p.nucleo);
  const doNucleo = evento.perguntas.filter((p) => p.nucleo);

  return (
    <Moldura larga>
      <p style={S.olho}>Avaliação · {dataLonga(evento.data)}</p>
      <h1 style={S.titulo}>{evento.titulo}</h1>
      {evento.objetivo && <p style={{ ...S.corpo, marginBottom: 20 }}>{evento.objetivo}</p>}

      <div style={S.aviso}>
        Esta avaliação é anônima. Suas respostas vão para a coordenação e para
        quem apresentou.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 28 }}>
        {[...daElis, ...doNucleo].map((p, i) => (
          <Pergunta
            key={p.id}
            pergunta={p}
            numero={i + 1}
            valor={valores[p.id]}
            faltando={faltando.includes(p.id)}
            onResponder={(v) => responder(p.id, v)}
          />
        ))}
      </div>

      {erro && <p style={S.erro}>{erro}</p>}

      <button
        onClick={enviar}
        disabled={enviando}
        style={{ ...S.botaoEnviar, opacity: enviando ? 0.6 : 1 }}
      >
        {enviando ? "Enviando…" : "Enviar avaliação"}
      </button>

      <p style={S.rodape}>Febracis · {evento.titulo}</p>
    </Moldura>
  );
}

/* ============================================================
   PERGUNTA
   ============================================================ */
function Pergunta({ pergunta, numero, valor, faltando, onResponder }) {
  const { id, texto, tipo, obrigatoria, opcoes } = pergunta;

  return (
    <div id={"pergunta-" + id}>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <span style={S.numero}>{String(numero).padStart(2, "0")}</span>
        <div>
          <p style={{ ...S.enunciado, color: faltando ? C.alert : C.text }}>{texto}</p>
          {!obrigatoria && <span style={S.opcional}>opcional</span>}
        </div>
      </div>

      {tipo === "escala_0_10" && (
        <Escala de={0} ate={10} valor={valor} onResponder={onResponder}
                legendas={["Não recomendaria", "Recomendaria muito"]} />
      )}

      {tipo === "escala_1_5" && (
        <Escala de={1} ate={5} valor={valor} onResponder={onResponder}
                legendas={["Nada claro", "Muito claro"]} />
      )}

      {tipo === "sim_nao" && (
        <Opcoes lista={["Sim", "Não"]} valor={valor} onResponder={onResponder} />
      )}

      {tipo === "escolha_unica" && (
        <Opcoes lista={opcoes || []} valor={valor} onResponder={onResponder} />
      )}

      {tipo === "texto_livre" && (
        <textarea
          value={valor || ""}
          onChange={(e) => onResponder(e.target.value)}
          rows={3}
          placeholder="Escreva aqui"
          style={{ ...S.textarea, borderColor: faltando ? C.alert : C.line }}
        />
      )}
    </div>
  );
}

/* Escala numérica. Alvo de 46px de altura: é dedo em pé na saída da palestra. */
function Escala({ de, ate, valor, onResponder, legendas }) {
  const nums = [];
  for (let n = de; n <= ate; n++) nums.push(n);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {nums.map((n) => {
          const ativo = valor === n;
          return (
            <button
              key={n}
              onClick={() => onResponder(n)}
              aria-pressed={ativo}
              style={{
                ...S.bolha,
                flex: nums.length > 6 ? "1 1 15%" : "1 1 18%",
                background: ativo ? C.gold : C.surface,
                color: ativo ? C.void : C.muted,
                borderColor: ativo ? C.goldBright : C.line,
                fontWeight: ativo ? 600 : 400,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={S.legendas}>
        <span>{legendas[0]}</span>
        <span>{legendas[1]}</span>
      </div>
    </div>
  );
}

function Opcoes({ lista, valor, onResponder }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {lista.map((o) => {
        const ativo = valor === o;
        return (
          <button
            key={o}
            onClick={() => onResponder(o)}
            aria-pressed={ativo}
            style={{
              ...S.opcao,
              background: ativo ? "rgba(195,163,75,0.12)" : C.surface,
              borderColor: ativo ? C.gold : C.line,
              color: ativo ? C.goldBright : C.muted,
            }}
          >
            <span style={{ ...S.marca, borderColor: ativo ? C.gold : C.line }}>
              {ativo && <span style={S.marcaCheia} />}
            </span>
            {o}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   MOLDURA E AVULSOS
   ============================================================ */
function Moldura({ children, larga }) {
  return (
    <div style={S.fundo}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button { font-family: inherit; cursor: pointer; }
        button:focus-visible, textarea:focus-visible {
          outline: 2px solid ${C.gold}; outline-offset: 2px;
        }
        textarea { font-family: inherit; }
        textarea::placeholder { color: ${C.faint}; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>
      <div style={{ ...S.coluna, paddingTop: larga ? 28 : 56 }}>
        <img
          src="/logo-febracis.webp"
          alt="Febracis"
          width={46}
          height={46}
          style={{ display: "block", margin: "0 auto 22px", filter: `drop-shadow(0 6px 22px ${C.gold}33)` }}
        />
        {children}
      </div>
    </div>
  );
}

function Recado({ texto }) {
  return <p style={{ ...S.corpo, textAlign: "center" }}>{texto}</p>;
}

function Selo() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" style={{ marginBottom: 20 }}>
      <circle cx="22" cy="22" r="21" stroke={C.gold} strokeWidth="1.5" opacity="0.5" />
      <path d="M13 22.5 L19.5 29 L31 17" stroke={C.goldBright} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ============================================================
   ESTILOS
   ============================================================ */
const S = {
  fundo: {
    minHeight: "100vh",
    background: C.void,
    fontFamily: "'Inter', system-ui, sans-serif",
    color: C.text,
  },
  coluna: {
    maxWidth: 560,
    margin: "0 auto",
    padding: "32px 20px 56px",
  },
  olho: {
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: C.goldDim,
    margin: "0 0 8px",
  },
  titulo: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 26,
    lineHeight: 1.2,
    fontWeight: 500,
    margin: "0 0 10px",
    color: C.text,
  },
  corpo: { fontSize: 15, lineHeight: 1.55, color: C.muted, margin: 0 },
  aviso: {
    fontSize: 13,
    lineHeight: 1.5,
    color: C.muted,
    background: C.surface,
    border: `1px solid ${C.line}`,
    borderLeft: `3px solid ${C.goldDim}`,
    borderRadius: 10,
    padding: "12px 14px",
  },
  numero: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 12,
    color: C.goldDim,
    paddingTop: 3,
    minWidth: 22,
  },
  enunciado: { fontSize: 16, lineHeight: 1.4, fontWeight: 500, margin: 0 },
  opcional: {
    fontSize: 11,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: C.faint,
  },
  bolha: {
    minHeight: 46,
    borderRadius: 10,
    border: "1px solid",
    fontSize: 15,
    transition: "background 0.15s ease, color 0.15s ease",
  },
  legendas: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: C.faint,
    marginTop: 8,
  },
  opcao: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid",
    fontSize: 15,
    textAlign: "left",
    transition: "background 0.15s ease",
  },
  marca: {
    width: 16,
    height: 16,
    borderRadius: "50%",
    border: "1.5px solid",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  marcaCheia: { width: 8, height: 8, borderRadius: "50%", background: C.gold },
  textarea: {
    width: "100%",
    background: C.surface,
    border: "1px solid",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 15,
    lineHeight: 1.5,
    color: C.text,
    resize: "vertical",
  },
  erro: {
    fontSize: 14,
    color: C.alert,
    marginTop: 24,
    marginBottom: 0,
  },
  botaoEnviar: {
    width: "100%",
    minHeight: 52,
    marginTop: 32,
    borderRadius: 12,
    border: "none",
    background: `linear-gradient(135deg, ${C.goldBright}, ${C.gold})`,
    color: C.void,
    fontSize: 16,
    fontWeight: 600,
  },
  rodape: {
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: C.faint,
    textAlign: "center",
    marginTop: 32,
  },
};
