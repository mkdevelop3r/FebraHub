# O que os dados revelaram

Cada item aqui custou queries e foi verificado. **Não repita a investigação** — e,
principalmente, não construa em cima do que está marcado como falso.

---

## 1. Não existe um funil. Existe uma escada de produto.

```
Lead (Clint · 66.394)          telefone em 99%, e-mail em só 34%
   ↓                            (assinatura de captação Meta Ads/WhatsApp)
Participante (Sympla)          ticket R$ 19,90 a ~R$ 100 · palestras e workshops
   ↓
Aluno GGB/CIS (Salesforce)     ticket R$ 1.900+ · 13.738 alunos
```

**Regra que não se quebra:** um ingresso de R$ 46 e uma matrícula de R$ 6.138 **nunca**
entram na mesma métrica de receita ou conversão. Somá-los produz um número sem
significado. Toda métrica é segmentada por unidade de negócio; a Diretoria vê o
breakdown, jamais um total conjunto.

---

## 2. Os eventos NÃO são o topo do funil da escola

Isto contraria a intuição, e é a descoberta mais importante do projeto.

À primeira vista, 9,1% dos compradores de evento também são alunos. Parecia prova de
que a palestra de R$ 46 alimenta o curso de R$ 1.900.

**Mas 68% desses casos são alunos que JÁ ERAM alunos e foram à palestra.** Não é
conversão — é reentrada.

| | |
|---|---|
| Compradores de evento com CPF | 1.985 |
| Que também são alunos | 178 |
| **Evento veio ANTES da matrícula** (conversão real) | **57** |
| Já era aluno e foi ao evento | 121 |
| **Taxa real de conversão evento → curso** | **2,9%** |
| Tempo médio entre evento e matrícula | **61 dias** |

**Consequência prática:** se o Marketing tratar evento como canal de aquisição e comprar
mídia para encher palestra esperando matrícula, o CAC vai vir péssimo — porque dois
terços do público já é cliente. Evento é **produto de relacionamento e retenção**, não
de aquisição.

Os 61 dias, porém, são acionáveis: é a janela em que o Comercial deve trabalhar quem
saiu de um evento.

---

## 3. As pontes entre sistemas — medidas, não supostas

| ponte | chave | cobertura | veredito |
|---|---|---|---|
| Lead (Clint) → Aluno | **telefone** (últimos 8 dígitos) | **40,2%** | usável |
| Lead → Aluno | e-mail | 3% | inútil |
| Comprador de evento → Aluno | **CPF** | **74%** | bom |
| Pagamento → Curso | **`original_id_venda`** | **84%** | **exato** |
| CisPay → Venda | `cod_salesforce` | **2,7%** | **morto** (ver §5) |

**Nenhuma chega a 100%.** Toda métrica derivada de ponte **precisa exibir a cobertura na
tela**. Número sem rótulo de cobertura é número que a Dulce desconfia uma vez e nunca
mais usa.

**Cuidado com o `aluno_id`:** 42,6% dos alunos fizeram mais de um curso. Cruzar pagamento
por aluno **duplica a receita** — R$ 47M viraria R$ 80M+. A chave certa é a venda, nunca
o aluno.

---

## 4. CPF é TEXT. Sempre.

Os CPFs têm zero à esquerda (`05107434550`). Se alguém "otimizar" a coluna para `bigint`,
o zero some, o CPF vira 10 dígitos e **nunca mais casa com nada**.

---

## 5. A CisPay não liga à venda — e o motivo é de processo

O campo `cod_salesforce` existe em 100% dos registros. Parecia a ponte perfeita.

Mas a cobertura **cai com o tempo até desaparecer**:

| ano | pagamentos casados |
|---|---|
| 2023 | 2,4% |
| 2024 | 4,3% |
| 2025 | 0,4% |
| 2026 | **0%** |

Só cobranças **geradas de dentro do Salesforce** carregam o ID. A Febracis migrou para
**link de pagamento direto** — 86% dos registros trazem um token de 32 caracteres que não
é ID de nada.

**A ponte não está quebrada. Ela deixou de ser criada.** Nenhum SQL conserta isso: o link
de pagamento precisaria carregar o `pagamento_id`. É decisão de processo.

**Isso não invalida a CisPay** — veja o §6.

---

## 6. O que a CisPay entrega (e ninguém mais entrega)

| KPI | número | validação |
|---|---|---|
| **Fluxo de caixa projetado** | 24.890 parcelas com data de liquidação | direto da adquirente |
| **Custo de maquininha** | **3,10%** · R$ 284.759 em 24 meses | **bate com o extrato bancário (3,08%)** |
| Estornos e chargebacks | perdas nunca contabilizadas | novo |

O 3,10% é o **único número deste projeto validado contra a conta corrente**. Todo o resto
é dado de sistema; este é dinheiro contado no banco.

O Salesforce diz *quanto foi vendido e de quê*. A CisPay diz *quanto entra, quando, e
quanto se perde no caminho*. Perguntas diferentes.

**Armadilha:** `valor_bruto` no `/services/schedules-ex` é **por parcela**. No
`/services/payments` o `amount` era o total da venda. Mesmo conceito, semântica oposta —
deduplicar no endpoint errado "sumia" com 25% da receita.

---

## 7. Taxas de plataforma: dinheiro que nunca entrou no caixa

| plataforma | taxa | valor |
|---|---|---|
| Sympla | 11,5% | R$ 17.280 |
| CisPay (cartão) | 3,10% | R$ 284.759 |

O `fato_pagamento_base` registra o **bruto**. Toda margem calculada hoje está otimista
por essa diferença. Receita de evento deve usar `valor_liquido`, não `valor_total`.

---

## 8. `tipo_matricula` não é unidade de negócio

São 17 valores, mas **96,7% é "Matrícula"** (R$ 46,9M). Todo o resto — bônus, cortesias,
taxas, transferências, reciclagem — soma R$ 289 mil, menos de 0,6%.

Não são receita nova: são **ajustes contábeis**. Cortesia a R$ 0. Taxa de transferência a
R$ 324. Crédito de cursos é dinheiro que já entrou antes.

Se o Hub Financeiro somar tudo como "receita", infla o número com movimentações que não
são venda. As views separam `natureza = 'venda'` de `natureza = 'ajuste'`.

---

## 9. O mês corrente é parcial — e isso mente nos KPIs

Comparar 14 dias de julho contra junho inteiro produz **"-99%"**: tecnicamente correto,
completamente enganoso. Todo KPI usa o **último mês fechado**; o mês em curso aparece à
parte, rotulado como parcial.

---

## 10. Fan-out: o erro que infla receita sem avisar

Aconteceu duas vezes:

- **Eventos:** `join` com participantes **e** pedidos na mesma query → cada pedido contado
  uma vez por participante. Taxa do Sympla apareceu como **R$ 887 mil** em vez de R$ 17 mil.
- **CisPay:** deduplicar `valor_bruto` quando ele já era por parcela.

**Regra:** agregue **antes** de juntar, nunca depois. Se um número parecer bom demais ou
absurdo demais, suspeite de fan-out primeiro.
