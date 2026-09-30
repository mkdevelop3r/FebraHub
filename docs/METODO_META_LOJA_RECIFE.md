# Como a meta da Loja de Recife é calculada

Recife é **diferente do Salvador** e por isso tem método próprio. O de Salvador
(`METODO_META_LOJA.md`) conta os dias de curso e multiplica pelo que cada tipo
de dia vende. **Em Recife isso não funciona** — e a razão está logo abaixo.
Este documento vive aqui porque a `meta_setor` guarda o **número**, e o número
sem o método é indefensável na primeira vez que alguém perguntar "por que
R$ 42 mil em outubro?".

Fonte da verdade no banco: função `sugerir_meta_loja_recife(...)`, setor
`loja_recife` em `meta_setor`. Migrations relevantes: `db/208`→`db/222`.

---

## Por que o método do Salvador NÃO serve em Recife

Em Salvador a receita da loja é uma **função do calendário**: um dia de curso
vende centenas de vezes mais que um dia comum, e dá pra prever o mês contando os
dias de cada tipo.

Em Recife a venda é **picada**. Nos meses de 2026 (jan–set): metade dos dias
vende **zero**, a **mediana do dia é ~R$ 15**, a média R$ 734, e um único dia
fez R$ 11.769. Aplicar o método do calendário (mediana do dia comum × dias)
daria uma meta de **~R$ 3 mil/mês** quando a loja fatura **~R$ 22 mil/mês**.
Erraria ~10× para baixo.

**Conclusão:** em Recife o calendário **não define** o número — ele só
**ajusta**. A base do número é o histórico da própria loja.

---

## A fórmula

```
máster  = ref_ano_anterior × fator_tendência × (1 + crescimento) × fator_cursos
básica  = máster × 0,80
mínima  = máster × 0,72   (ou seja, 10% abaixo da básica)
```

É uma **sugestão** — o gestor valida e pode sobrescrever. A meta salva no banco
nunca é apagada por um recálculo automático.

### As quatro peças

**1. `ref_ano_anterior` — o mesmo mês do ano passado.**
O faturamento de Recife no mesmo mês de 2025. É a âncora sazonal: outubro se
compara com outubro, não com setembro. (Ex.: out/2025 = R$ 38.281.)

**2. `fator_tendência` — Recife está subindo ou caindo?**
Soma dos **últimos 6 meses fechados** ÷ soma dos **mesmos 6 meses do ano
anterior**. Hoje ≈ **0,6954** — Recife roda ~30% **abaixo** de 2025. Sem esse
fator, "ano anterior + X%" cru daria uma meta inatingível.

**3. `crescimento` — inflação + uma esticada.**
Padrão **+5%** (repõe IPCA ~4–5% e estica um pouco). É o único número
"aspiracional" da conta, e é pequeno de propósito, porque a base já vem de um
ano em queda.

**4. `fator_cursos` — os cursos do mês modulam pra cima/baixo.**
```
fator_cursos = 1 + peso_cursos × ( score_do_mês / score_médio − 1 )
```
- `score_do_mês` = soma dos **pesos** dos eventos do mês (ver tabela abaixo).
- `score_médio` = média mensal do score nos meses fechados.
- `peso_cursos` = **0,6** (quanto os cursos mexem na meta; editável).

Se o mês tem mais/maiores cursos que a média → fator > 1 (meta sobe). Se tem
menos → fator < 1 (meta cai).

---

## Os cursos são PONDERADOS por tipo (não contados)

O erro que a primeira versão cometia: contar todo evento como "1". Aí uma
**palestra** valia o mesmo que um **FCIS** — e não vale. FCIS e Master Coaching
enchem a loja; palestra rende pouco. Agora cada tipo tem um **peso relativo**,
na tabela **`evento_recife_peso`** (editável quando quiser recalibrar):

| Tipo | Peso | | Tipo | Peso |
|---|---:|---|---|---:|
| FCIS | 5 | | CURSO | 2 |
| MASTER (Master Coaching) | 5 | | TV | 2 |
| IF (Inteligência Financeira) | 4 | | CIS | 2 |
| FGPC | 3 | | WORKSHOP | 1,5 |
| FOP | 3 | | PALESTRA | 1 |
| BHP | 3 | | | |

**Por que os pesos vêm do negócio e não dos dados.** A gente tentou estimar
"quanto cada tipo rende" a partir do histórico e **não dá pra confiar**: 2026 é
ano em queda, a amostra é minúscula e ruidosa, e o cálculo até apontou o FCIS
como *baixo* (porque os meses de FCIS de 2026 foram fracos por acaso) — o que
todo mundo sabe que é falso. Então os pesos são **conhecimento do negócio**, e
ficam numa tabela fácil de ajustar.

---

## De onde vem o calendário

Os eventos vivem na tabela **`evento_recife` (dia, tipo, obs)** — um **snapshot
manual** do Google Calendar "FEBRACIS RECIFE". Entra só o que **enche a loja**
(palestra, workshop, curso, IF, FCIS, BHP, FOP, TV, FGPC, Master...). **Ficam de
fora:** lives, webinars, mentorias, café, eventos de *venda* por zoom, e CIS de
**outra cidade** (SP/RJ/BH/Curitiba/Goiânia).

> ⚠️ **É manual.** Atualização automática mensal precisaria de uma conta de
> serviço Google. Por ora, quando o calendário mudar, atualize a `evento_recife`
> à mão e recalcule pelo botão.

---

## Exemplo real — outubro/2026

Outubro tem **FCIS + Master Coaching + FGPC + Workshop**:

| Passo | Conta | Valor |
|---|---|---:|
| Ref. ano anterior (out/2025) | — | R$ 38.281 |
| × fator de tendência | × 0,6954 | R$ 26.621 *(base run-rate)* |
| Score dos cursos do mês | FCIS 5 + Master 5 + FGPC 3 + Workshop 1,5 | **14,5 pts** |
| Score médio mensal | média dos meses fechados | 7,88 pts |
| fator_cursos | 1 + 0,6 × (14,5/7,88 − 1) | **× 1,504** |
| × crescimento | × 1,05 | — |
| **= máster** | 26.621 × 1,05 × 1,504 | **R$ 42.042** |
| básica | × 0,80 | R$ 33.634 |
| mínima | × 0,72 | R$ 30.270 |

Tudo isso aparece na **"memória de cálculo"** do card da meta (Hub de Metas →
Loja Recife), incluindo a quebra por tipo dos cursos do mês.

---

## Como ajustar

- **Um curso rende mais/menos do que o peso diz?** Mude o número na tabela
  `evento_recife_peso` e recalcule (botão "calcular pelo histórico" no card, ou
  a função `sugerir_meta_loja_recife`).
- **Os cursos estão pesando demais/de menos no geral?** Mude o `peso_cursos`
  (parâmetro da função; padrão 0,6). Histórico: começou em 0,4, foi a 0,6, o
  gestor testou 1,2 (outubro estourou pra R$ 56 mil, acima de 2025) e voltou
  pra **0,6**.
- **Entrou/saiu evento no calendário?** Atualize `evento_recife` e recalcule.
- **A meta salva está boa e não quer que mude?** Não faça nada — o recálculo
  automático (`aplicar_meta_loja_recife`, dia 25) só grava mês que ainda não
  existe; nunca sobrescreve o que já foi salvo.

---

## O que ainda está em aberto

- **`evento_recife` é manual.** Sem conta de serviço Google, o calendário não
  se atualiza sozinho. Se o mês ganhar um curso depois da meta escrita, a meta
  nasce contando de menos.
- **Os pesos por tipo são julgamento, não medição.** Não há histórico limpo em
  Recife para calibrá-los. Se um dia houver receita real por tipo de curso na
  loja, dá pra trocar o julgamento por número medido — igual o Salvador fez.
- **`fator_tendência` embute a queda de 2026.** Enquanto Recife rodar abaixo de
  2025, a meta nasce abaixo de 2025. É proposital (run-rate, não aspiracional),
  mas revisite quando a loja virar a curva.
