# FebraHub — Briefing

Contexto completo para retomar o projeto (ou passar ao Claude Code).
Leia junto com [`DESCOBERTAS.md`](DESCOBERTAS.md) e [`DIVIDAS.md`](DIVIDAS.md).

---

## O que é

Portal corporativo interno da **Febracis Salvador**, substituindo dashboards do Power BI.
Cada setor vê apenas o próprio hub. A diretora (**Dulce Mariano**) tem o **Hub Executivo**,
com visão consolidada.

Não é um sistema de dashboards. O objetivo é responder:
*onde estamos perdendo dinheiro · quais setores estão abaixo do esperado · o que precisa
da atenção da diretoria hoje.*

**Stack:** React + Vite · Supabase (Postgres) · Netlify · Python (ETL)

**Hubs:** Comercial · Financeiro · Marketing · Pedagógico · Eventos · Loja · Compras
(+ Executivo)

---

## Estado atual

### ✅ Funcionando

- **Schema padronizado** — nomes, PKs, FKs, índices
- **RLS testada e provada** — Financeiro não vê Comercial; tabelas cruas dão
  *permission denied*. Verificado com sessão simulada, não só na teoria.
- **Autenticação real** — Supabase Auth + `perfis` (setor, papel). Os botões
  "Entrar como Diretoria" do protótipo foram removidos.
- **Views por hub** — único caminho do front. Sem PII.
- **Front sem mocks** — `HUB_DATA`, `ALERTAS`, `ROADMAP`, `APIS_INICIAL` eliminados.
- **5 integrações**: Salesforce, Clint, Sympla, CisPay (schedules-ex + extrato)

### Números que a Febracis não tinha

| KPI | valor |
|---|---|
| Fluxo de caixa projetado (30/60/90d) | direto da adquirente |
| Custo de maquininha | **3,10%** — validado contra o extrato bancário |
| Taxa do Sympla | 11,5% — R$ 17.280 |
| Receita por curso | 84% de cobertura, soma fechando em R$ 47,17M |
| Conversão real evento → curso | **2,9%** (não 9,1% — ver DESCOBERTAS §2) |
| Estornos e chargebacks | perdas nunca contabilizadas |

### ⏸️ Pendente

Ver [`DIVIDAS.md`](DIVIDAS.md). Nada bloqueia o uso. Tudo aparece na tela como
cobertura de dado.

---

## Princípios — valem para toda decisão

**1. Fail loud, never silent.**
O bug dos 66 mil NULLs existiu porque o pipeline "funcionava". Todo ETL aborta se um
campo obrigatório vier abaixo de 50%.

**2. Segurança no banco, não no React.**
Se depende de o front esconder o botão, não é segurança. O bundle é público; a anon key
também.

**3. Toda métrica de ponte exibe sua cobertura.**
Nenhuma ponte chega a 100%. Um número sem rótulo de cobertura é um número que a Dulce
desconfia uma vez e nunca mais usa.

**4. Bruto ≠ líquido.**
Sympla come 11,5%. Cartão come 3,10%. Isso aparece como receita no Power BI e nunca
entrou no caixa.

**5. Não somar unidades de negócio diferentes.**
R$ 46 (evento) e R$ 6.138 (curso) não são a mesma coisa. Um total conjunto não significa
nada.

**6. Agregue antes de juntar, nunca depois.**
Fan-out já inflou a receita duas vezes. Se um número parecer bom demais, suspeite disso
primeiro.

**7. Use o último mês fechado.**
Comparar 14 dias contra o mês inteiro produz "-99%". Correto e enganoso.

**8. Nunca invente o que não existe.**
Sem metas no banco → sem KPI de meta. Sem IA → sem "gerado pela IA". Prometer o que não
existe é o jeito mais rápido de perder a confiança da diretoria.

---

## Próximos passos

1. **Deploy no Netlify** — o front está pronto.
2. **Consertar `status_pagamento`** (15% NULL) — destrava a inadimplência.
3. **Meta Ads** — `nome_campanha` já existe em `fato_negocio_lead`. Se o gasto vier
   chaveado por campanha, você ganha custo por lead real. É o maior ganho pendente.
4. **Omie + Sheets** (Loja e Compras) — menor impacto, faça por último.
5. **Motor de atribuição** — só depois de tudo acima. Não é um prompt (ver DIVIDAS §10).
