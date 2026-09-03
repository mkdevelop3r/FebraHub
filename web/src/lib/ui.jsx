/* ============ PRIMITIVOS COMPARTILHADOS ============

   Tokens e os três componentes que toda tela usa. Vivem aqui, e não no
   FebraHub.jsx, por um motivo concreto: eles PRECISAM ser importáveis.

   Antes, `Bloco`, `ChipKpi` e `Estado` eram funções privadas de um arquivo
   de 9.600 linhas cujo único `export` era o `Root`. O `docs/DESIGN_SYSTEM.md`
   mandava usá-los, mas não havia como — então quem escrevia tela nova em
   `Rotas/` reimplementava de memória, e a reimplementação divergia
   exatamente onde não havia código para copiar: ícone do KPI tingido pela
   cor semântica em vez de neutro, valor colorido em chip não-hero, estado
   vazio como caixa centrada em vez de linha. Aconteceu na Central Febracis.

   Documentação não conserta o que a arquitetura impede. Por isso o módulo.

   O `FebraHub.jsx` importa daqui, então não há duas definições nem risco de
   as duas divergirem: existe uma só. */

import { Loader2, ShieldAlert, Database } from "lucide-react";

export const C = {
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

export const GROTESK = "'Space Grotesk', system-ui, sans-serif";
export const SANS = "'Manrope', system-ui, sans-serif";

// Altura máxima do CORPO de um painel de BI. O conteúdo rola dentro do
// card (overflow interno) em vez de esticar a página — é o que faz o Hub
// caber numa tela. Um só valor pra todos os hubs herdarem o mesmo ritmo.
export const ALTURA_PAINEL = 260;


/* Painel. Com `altura`, o cabeçalho fica fixo e só o CORPO rola
   (overflow-y interno) — o card nunca passa da altura, então a página
   não cresce. Sem `altura`, cresce com o conteúdo (comportamento antigo). */
export function Bloco({ titulo, canto, children, sem, altura }) {
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


/* Indicador. Duas escalas: `compacto` para faixas de 4+, a normal para 2 ou 3.

   O QUADRO DO ÍCONE É NEUTRO, E ISSO NÃO É DESCUIDO. Tingi-lo com a cor da
   métrica põe quatro caixinhas coloridas lado a lado e a faixa vira um
   semáforo — a pessoa lê as cores em vez dos números. O `hero` é o único
   dourado, e é ele a âncora da leitura.

   Pelo mesmo motivo o valor de um chip não-hero é `C.text`: dois números
   dourados na mesma faixa não têm âncora nenhuma. */
export function ChipKpi({ Icone, label, valor, unidade, delta, up, nota, hero, compacto, sub, className, deltaBrilha, deltaNota, subCentralizado, deltaAbaixo }) {
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


/* Carregando, erro e vazio — nessa ordem de precedência.

   O título do ERRO é `C.bright` e o do VAZIO é `C.muted`. A diferença de
   cor é o que separa "falhou" de "não há". Uniformizar os dois faz a
   pessoa tratar ausência como defeito.

   `vazioTitulo` e `vazioDica` têm padrão genérico como REDE, não como
   resposta: tela vazia sem explicação faz quem olha achar que o sistema
   quebrou, quando o certo seria "não há ninguém nessa situação". Passe os
   dois sempre que souber o que dizer. */
export function Estado({ carregando, erro, vazio, children, vazioTitulo, vazioDica }) {
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
