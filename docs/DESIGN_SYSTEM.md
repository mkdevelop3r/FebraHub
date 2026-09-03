# Sistema de design — FebraHub

Referência para quem escreve tela neste repositório. Os valores aqui são
**literais do código**, extraídos de `web/src/FebraHub.jsx`, não recomendações
genéricas.

A fonte da verdade é o próprio `FebraHub.jsx`. Onde este documento divergir do
código, o código ganha — mas então este documento está desatualizado e alguém
precisa corrigi-lo.

> **Se você tem cinco minutos, leia só a seção 1 e a seção 9.** A 1 evita que a
> tela pareça de outro produto; a 9 evita que ela minta.

---

## 1. Tokens

Um objeto `C`, em `FebraHub.jsx:63`. **Nunca escreva cor literal fora dele** —
a exceção são os casos listados em §10, e todos têm motivo registrado.

```js
const C = {
  void:     "#08080A",              // fundo da aplicação
  panel:    "rgba(14,14,16,.72)",   // painel flutuante
  card:     "rgba(255,255,255,.028)",
  cardLine: "rgba(255,255,255,.08)",// borda de card
  hair:     "rgba(255,255,255,.05)",// divisor interno

  gold:     "#E4C06A",  goldTop: "#F2D488",  goldBase: "#B8934A",

  text:     "#F5F3EE",  bright: "#EDEBE4",   muted: "#8B8B90",
  faint:    "#6A6A70",  dim:    "#5B5B62",

  down:     "#E06C75",  warn:   "#E6B04D",   up:    "#6FCF97",
};
```

**Hierarquia de texto**, do mais forte ao mais apagado:
`text` → `bright` → `muted` → `faint` → `dim`.
`faint` e `dim` são a cor de **"não sei" / "não se aplica"** — nunca uma faixa
de valor.

### Duas famílias, papéis separados

```js
const GROTESK = "'Space Grotesk', system-ui, sans-serif";  // números e valores
const SANS    = "'Manrope', system-ui, sans-serif";        // texto
```

`SANS` é herdada do `<div>` raiz. Você só a declara explicitamente em
`<button>`, `<input>`, `<table>` e `<text>` de SVG, que não herdam.
`GROTESK` é aplicada **por elemento** — todo número que é um valor
(KPI, célula de tabela, rótulo de eixo) leva `fontFamily: GROTESK`.

### Ritmo vertical

```js
const ALTURA_PAINEL = 260;  // altura máxima do CORPO de um painel de BI
```

O conteúdo **rola dentro do card**, não estica a página. É o que faz o hub
caber numa tela. Um só valor para todos os hubs herdarem o mesmo ritmo.

---

## 2. O padrão de opacidade hexadecimal

Cor semântica com sufixo alfa de dois dígitos em template string:
`` `${C.gold}1F` ``. É o mecanismo mais usado do sistema e tem faixas com
papel definido — **respeite a faixa, não invente um alfa novo**.

| faixa | papel | exemplo |
|---|---|---|
| `08`–`14` | fundo tingido muito sutil | `${C.gold}14` (destaque de linha), `${C.warn}12` (caixa de aviso) |
| `16`–`24` | fundo de chip e quadro de ícone | `${C.gold}1E` (ícone de CardSetor), `${C.gold}24` (ícone do ChipKpi hero) |
| **`1F`** | **botão de filtro ativo** — valor canônico | `background: ativo ? `${C.gold}1F` : "transparent"` |
| `2E`–`3D` | borda de destaque discreta | `${C.gold}38` (borda do ChipKpi hero) |
| `44`–`55` | borda de estado ou alerta declarado | `${cor}44` é o mais reutilizado |
| `66` | contorno forte | Toast, alerta de concentração |

Quando precisar de mistura calculada em vez de alfa fixo, o código usa
`color-mix(in srgb, …)` — há exemplos no bloco `<style>` global.

---

## 3. Componentes de estrutura

### `Bloco` — o contêiner de tudo

```jsx
<Bloco titulo="Ranking das unidades" canto="Agosto 2026 · 42 unidades" altura={260}>
```

| parte | valores |
|---|---|
| shell | `background: C.card` · `border: 1px solid ${C.cardLine}` · `borderRadius: 16` · `marginBottom: 20` · `overflow: hidden` |
| cabeçalho | `padding: "13px 20px"` · `borderBottom: 1px solid ${C.hair}` |
| título | `fontSize: 13.5` · `fontWeight: 800` · `color: C.bright` |
| canto | `fontSize: 11` · `color: C.faint` |
| corpo | `padding: "16px 20px"` (ou `0` com `sem`) |

Com `altura`, o cabeçalho fica fixo e **só o corpo rola** (`className="rolagem"`,
`overflowY: auto`). Sem `altura`, cresce com o conteúdo.

### `ChipKpi` — o indicador

Duas escalas. Use `compacto` em faixas de 4+ indicadores; a normal para 2 ou 3.

| | normal | compacto |
|---|---|---|
| minHeight | `78` | `56` |
| borderRadius / padding | `13` / `"13px 15px"` | `10` / `"8px 11px"` |
| quadro do ícone | `30×30`, raio `8`, `<Icone size={15}/>` | `25×25`, raio `7`, `size={13}` |
| rótulo | `11 / 600 / C.muted` | `10` |
| **valor** | **`GROTESK 22 / 700 / letterSpacing "-.5px"`** | `18` |
| delta | `11 / 800`, `▲`/`▼` | `10` |
| nota / sub | `11 / 800 / C.muted` · `10.5 / C.faint` | `9.5` |

`hero` troca a borda para `${C.gold}38`, o fundo do ícone para `${C.gold}24` e
o valor para `C.gold`. **Um `hero` por faixa** — ele é a âncora da leitura.

### Os demais

| componente | uso | métrica-chave |
|---|---|---|
| `CardSetor` | card clicável de hub | raio `14`, `padding "14px 16px"`, `minHeight 118`, valor `GROTESK 18/700` |
| `Popover` | menu ancorado | `background "#15151a"`, raio `10`, `maxHeight 264`, sombra `0 12px 32px rgba(0,0,0,.5)`. **O pai precisa ser `position: relative`** |
| `ModalCentro` | diálogo | `background "#141418"`, raio `16`, `width: min(560px, 94vw)`, `maxHeight 88vh`, cabeçalho sticky |
| `DrawerLado` | painel lateral | mesmos tokens do ModalCentro, `borderLeft`, `min(500px, 96vw)` |
| `BotaoSalvar` | ação primária | `linear-gradient(90deg, ${C.goldTop}, ${C.goldBase})`, texto `#1A1305`, raio `10`, `padding "9px 16px"`, `800/13`. Desabilitado vira `rgba(255,255,255,.08)` + `C.faint` |
| `Toast` | feedback de escrita | `fixed right:20 bottom:20`, `background "#1B1B20"`, `border 1px solid ${cor}66` |
| `Segmentado` | grupo de opções | trilho `rgba(255,255,255,.04)` raio `10` padding `3`; botão raio `7`, ativo `${C.gold}1F` |
| `SecaoTitulo` | título entre blocos | `margin "26px 0 14px"`, `15 / 800 / C.bright` |

**Estilos compartilhados** para formulário (`FebraHub.jsx:4833`):

```js
const inputAv = { width:"100%", background:"rgba(255,255,255,.04)",
  border:`1px solid ${C.cardLine}`, borderRadius:9, padding:"9px 11px",
  color:C.text, fontFamily:SANS, fontSize:13 };
const labelAv = { fontSize:10.5, fontWeight:700, color:C.muted,
  textTransform:"uppercase", letterSpacing:".4px", marginBottom:4, display:"block" };
```

---

## 4. Tabelas

**Tabela aqui é CSS grid com `<style>` local, não `<table>`.** Quatro
instâncias seguem a mesma anatomia; copie a mais próxima em vez de inventar.

```jsx
<style>{`
  .xxGrade { display: grid; grid-template-columns: minmax(0,1.6fr) 92px 84px 128px;
             align-items: center; gap: 10px; }
  @media (max-width: 1000px) { .xxGrade { … } .xxColunaOpcional { display: none; } }
  .xxLinha:hover { background: rgba(255,255,255,.02); }
`}</style>
```

| parte | valores |
|---|---|
| contêiner | `className="rolagem"` · `maxHeight` 420–520 · `overflowY: auto` · `border: 1px solid ${C.hair}` · `borderRadius: 10` |
| cabeçalho | `position: sticky; top: 0; zIndex: 2` · `background: "#17171c"` · `padding: "8px 12px"` · `borderBottom: 1px solid ${C.cardLine}` |
| rótulo de coluna | `10 / 800 / uppercase / letterSpacing ".4px" / C.dim` |
| linha | `minHeight` 44 ou 48 · `padding: "0 12px"` · borda inferior `C.hair`, **exceto na última** |
| célula principal | `12.5 / 700 / C.text` |
| célula secundária | `10–11.5 / C.faint`, com `textOverflow: ellipsis` |

A primeira coluna é sempre `minmax(0, Nfr)` — é ela que encolhe. As demais têm
largura fixa em px. **Coluna que some no breakpoint precisa de classe própria**
(`.trCurso`, `.tpData`), nunca de índice.

Breakpoints em uso, e só estes: **520, 680, 720, 900, 980, 1000, 1040, 1100**.
`min-width` para grids de layout; `max-width` para as tabelas.

---

## 5. Estados: carregando, erro, vazio

Envolva todo conteúdo que vem de view no `Estado` (`FebraHub.jsx:1926`).
Precedência: carregando → erro → vazio → conteúdo.

```jsx
<Estado carregando={q.isLoading} erro={q.error} vazio={!linhas.length}
  vazioTitulo="Ninguém represado agora"
  vazioDica="Represado é quem comprou, está dentro da validade e tem turma antes de vencer.">
```

| estado | ícone | título | detalhe |
|---|---|---|---|
| carregando | `Loader2` girando, `C.goldBase` | "Carregando" `13 / C.faint` | — |
| erro | `ShieldAlert`, `C.down` | "Não foi possível carregar" `13.5 / 600 / **C.bright**` | `erro.message` cru, `12 / C.faint` |
| vazio | `Database`, `C.faint` | `vazioTitulo` `13.5 / 600 / **C.muted**` | `vazioDica` `12 / C.faint` |

A diferença de cor no título (`bright` no erro, `muted` no vazio) é o que separa
**falha** de **ausência**. Não uniformize.

**Sempre passe `vazioTitulo` e `vazioDica`.** O padrão genérico existe como
rede, não como resposta: uma tela vazia sem explicação faz a pessoa achar que o
sistema quebrou quando o correto seria "não há ninguém nessa situação".

---

## 6. Formatadores

Nunca formate número na mão. Os que existem:

```js
moeda(v)              // R$ 1,2 mil acima de 1000; R$ 850,00 abaixo
numero(v)             // 1.234
fmtPct(v, casas = 0)  // "83%" — aceita 0,83 ou 83 (pctTaxa normaliza)
dataBR(iso)           // 02/09/2026
dataCurta(d)          // ago/26
rotuloMes(iso)        // Agosto 2026
mesCurto(ym, comAno)  // Ago  ou  Ago/26
formataCpf(v)         // 123.456.789-01
formataTelefone(tel)  // (71) 99999-8888
linkWhatsapp(tel)     // https://wa.me/55… ou null
compacto(v)           // 1,2 mil
```

**A ausência é sempre `"—"` (travessão).** Não use "N/A", "0", "-" nem string
vazia. `0` é um valor; `"—"` é a falta dele, e a diferença importa.

---

## 7. Cores semânticas

| cor | significado |
|---|---|
| `C.up` | delta positivo · faixa boa · série secundária em gráfico de barra+linha |
| `C.down` | delta negativo · faixa ruim · erro |
| `C.warn` | **faixa intermediária** e "atenção que ainda não é erro" — nunca extremo |
| `C.gold` | estado ativo/selecionado · 1º lugar · o número-âncora (`hero`) · ação primária · foco |
| `C.faint` / `C.dim` | não sei / não se aplica |

Escalas de corte, todas com o mesmo formato de três faixas:

```js
corScore(s)  = s >= 65 ? C.up : s >= 40 ? C.warn : C.down;   // maior é melhor
corFalha(p)  = p >  60 ? C.down : p >= 35 ? C.warn : C.up;   // menor é melhor
credenciamento = pct >= 80 ? C.up : pct >= 50 ? C.warn : C.down;
```

Ao criar uma métrica nova, **espelhe esse formato** e diga no comentário se
maior é melhor ou pior. Duas escalas invertidas sem aviso é como se erra aqui.

---

## 8. Gráficos

**SVG inline escrito à mão. Não há Recharts, D3 ou Chart.js, e não instale
nenhum.** `viewBox` fixo + `style={{ width:"100%", height:"auto" }}` dá escala
fluida sem biblioteca.

Geometria dos existentes: `W = 720` em todos; `H` entre 196 e 250;
`padL` 10–54 conforme haja rótulo de eixo.

- **Grade:** `stroke="rgba(255,255,255,.06)" strokeWidth="1"`.
- **Eixo Y:** três marcadores. `textAnchor="end"`, `fill={C.faint}`, `9`–`11`.
- **Eixo direito** (segunda escala): sempre `fill={C.up} opacity="0.8"`.
- **Eixo X:** rotule ~7 pontos (`passo = Math.max(1, Math.round((n-1)/(alvo-1)))`),
  não um por tick.
- **Área sob a linha:** gradiente vertical `stopOpacity "0.16" → "0"`.
- **Barra:** gradiente `C.goldTop → C.goldBase`.

### Tracejado é semântica, não decoração

**Tracejado = valor que ainda vai mudar, ou que não foi medido do mesmo jeito.**

| caso | tratamento |
|---|---|
| mês parcial (linha) | `strokeDasharray="5 4"` + `opacity 0.6` |
| dado provisório (outra fonte) | `strokeDasharray="5 4"` + `opacity 0.85` |
| mês parcial (barra) | **hachura** `<pattern>` a 45° + borda tracejada — nunca barra sólida |
| ponto do mês parcial | círculo **vazado**: `fill={C.void} stroke={cor} strokeWidth="1.6"` |
| linha de meta / ano anterior | `#6BA8E5` azul, `strokeDasharray="5 4"` |

A área de preenchimento **cobre só os pontos sólidos**. A linha de meta é
desenhada em **segmentos contíguos** — não liga por cima de meses sem meta,
senão inventaria meta onde não há.

Rotule só **máximo, mínimo e o ponto parcial**, não todos os pontos.

---

## 9. As regras que não são de estilo

Esta seção é a que mais separa uma tela que parece do FebraHub de uma que não
parece. Ela sai dos comentários do código, que são consistentes o bastante para
serem regra.

**1. Número sem denominador não decide nada.** "12 confirmados" não diz se é
muito ou pouco — 12 de 14 e 12 de 400 pedem ações opostas. Todo contador anda
com o total ao lado.

**2. Dado tem idade, e a tela precisa dizer.** Onde o número vem de carga ou de
refresh externo, a data da captura fica visível junto dele. Dado velho passando
por atual já custou caro aqui mais de uma vez.

**3. A tela não inventa e não esconde.** KPI sem fonte fica desenhado,
esmaecido, com o motivo escrito ("em construção") — escondê-lo apagaria a
lacuna; preenchê-lo seria mentir. Linha de referência histórica não vira "meta"
porque não existe meta no banco.

**4. Não uniformize o que significa coisas diferentes.** Duas situações com a
mesma cor obrigam a ler o texto de cada linha, que é o oposto de uma lista
escaneável.

**5. Uma tela responde uma pergunta.** O detalhe fica recolhido até alguém
pedir. Ranking longo empurra o que importa para fora da primeira tela.

**6. 403 e RLS não se contornam** — mensagem clara e para por aí.

**7. Comentário explica o PORQUÊ, não o quê.** É o padrão da casa e o motivo de
o código ser legível meses depois. Comente a decisão de produto, o bug que
originou a solução, e o que aconteceria se fosse feito do jeito óbvio. Nomeie a
pessoa que vai ler a tela quando isso explicar a escolha. Registre a
compatibilidade retroativa ("comportamento idêntico ao de antes") e o contrato
do componente ("o pai precisa ser `position: relative`").

---

## 10. Exceções e dívidas conhecidas

Coisas que existem no código e **não** devem ser copiadas como padrão:

**As rotas redeclaram a paleta, com valores divergentes.** `C`, `GROTESK` e
`SANS` são redeclarados em cada arquivo de `web/src/Rotas/`:

| arquivo | divergência |
|---|---|
| `AuditoriaProva.jsx:45` | quase igual, nomes diferentes (`surface`, `linha`, `goldDim`) |
| `CentralEventos.jsx:47` | nomes próprios (`bronzeLine`, `moldura`, `textMuted`) |
| `Avaliacao.jsx:27` | **paleta inteiramente outra** — `void "#121217"`, `gold "#C3A34B"`, `text "#F2EDE1"` |

O cânone é o `C` de `FebraHub.jsx`. Tela nova segue ele. Consolidar as rotas
numa importação única é dívida aberta.

**Tailwind está instalado** (`@import "tailwindcss"` no `index.css`) mas é usado
**só** em `CentralEventos.jsx`. `FebraHub.jsx` é 100% estilo inline. Não misture
os dois na mesma tela.

**Cores fora do objeto `C`**, todas com motivo:
`ARRED_META`/`AZUL_ANTERIOR` `#6BA8E5` (azul de referência, deliberadamente
distinto do dourado da receita), `COR_VARIACAO_ALTA` `#B7F34A`,
`COR_VARIACAO_QUEDA` `#FF6B5F`, e os fundos literais de superfície elevada:
`#15151a` (Popover), `#141418` (Modal e Drawer), `#17171c` (cabeçalho de
tabela), `#1B1B20` (Toast).

**Só um gráfico tem `aria-label`.** Acessibilidade é dívida aberta, não padrão.

**`html, body, #root` têm `background: #08080A`** fixo no `index.css`, e a
Manrope precisa ser declarada lá e não só inline — CSS sem camada vence
`@layer base`, independente de especificidade.
