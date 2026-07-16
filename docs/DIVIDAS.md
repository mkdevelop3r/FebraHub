# Dívidas conhecidas

Nada aqui bloqueia o FebraHub de ir para a Dulce. Tudo aqui **precisa aparecer na tela**
como cobertura de dado — um painel que admite o próprio buraco sobrevive à primeira
conferência com o extrato. Um que esconde, não.

Ordem de ataque sugerida.

---

## 🔴 1. Inadimplência não é confiável

**15% dos pagamentos sem `status_pagamento`** (1.203 de 7.902).

A inadimplência é calculada em cima desse campo. Com 15% da base sem status, o KPI é
chute — e é justamente o que a Dulce vai querer olhar.

**Causa:** provável falha no ETL do Salesforce (mesma família dos outros bugs de mapper).
**Ação:** rodar o método `--diagnostico` no ETL do Salesforce.

---

## 🔴 2. R$ 241.560 sem data de pagamento

85 pagamentos sem `data_pagamento` — 1% dos registros, mas um valor que a Dulce notaria.

Eles **somem de qualquer gráfico mensal** (não pertencem a mês nenhum), e o Hub Financeiro
mostraria receita menor que a real sem avisar ninguém.

Hoje aparecem no card de cobertura. **Não os esconda.**

---

## 🟡 3. R$ 7,68 milhões sem curso vinculado

900 pagamentos (16% da receita) não têm matrícula correspondente — 851 deles porque a
venda simplesmente **não existe** em `fato_base_alunos`.

Distribuição estranha: 21% de órfãos em 2024, **0,0% em 2025**, 35% em 2026. Um ano
perfeito cercado por anos furados.

**Não é** paginação truncada (os volumes por ano são orgânicos, sem múltiplos redondos de
2k). **Não é** timing de matrícula (2024 está fechado há 18 meses).

Também há mais matrículas do que pagamentos em todos os anos — as duas tabelas contam
coisas diferentes. Suspeita: `fato_pagamento_base` está incompleta, não `fato_base_alunos`.

**Causa em aberto.** A ponte por `original_id_venda` está matematicamente correta (a soma
fecha em R$ 47.178.782,48), então isto não é bug de join — é dado ausente.

---

## 🟡 4. ETL do Clint quebrado

`dim_leads.data_criacao` e `data_atualizacao` são **100% NULL em 66.394 linhas**.

Não é dado ausente na fonte — o Clint obviamente sabe quando cada lead entrou. É o mapper
lendo chave errada, o mesmo bug que travou o Sympla.

A série mensal do Hub de Marketing usa hoje a data do **negócio** (`fato_negocio_lead`),
não a do lead. Funciona, mas é um contorno.

**Ação:** rodar o `--diagnostico` no ETL do Clint.

---

## 🟡 5. CisPay não atribui receita a curso

Ver [DESCOBERTAS.md §5](DESCOBERTAS.md). **Não é problema de dado — é de processo.**

O link de pagamento precisaria carregar o `pagamento_id` do Salesforce. Enquanto não
carregar, a CisPay entrega caixa, taxa e perdas — mas não atribuição.

Não persiga isto no SQL. Não tem saída por lá.

---

## 🟡 6. Conflito de tipo: origem → grupo

```
dim_grupos.grupo_id   → uuid
dim_origens.grupo_id  → text
```

Não podem ser ligados. É o join que o Hub de Marketing precisaria para agrupar origem de
lead. Além disso, `dim_grupos` tem `arquivado_em` e `arquivado_por` — cheiro de tabela de
sistema do Clint que veio junto na carga, não de dimensão de negócio.

**Ação:** confirmar se `dim_grupos` é mesmo a dimensão certa, ou se o "grupo" real é o
`dim_origens.grupo_nome` (que já está lá, denormalizado).

---

## 🟡 7. Timezone inconsistente

`fato_negocio_lead.data_criacao` é `timestamp WITHOUT time zone`; outras colunas são
`WITH`. Em Salvador (UTC−3), um lead criado às 22h vira "dia seguinte" ou não, dependendo
da coluna.

É assim que "a receita de julho não bate com o Power BI" nasce.

---

## 🟢 8. Sem fonte de dados

- **Loja** — Omie PDV + planilhas Sheets (planejado)
- **Compras** (era Estoque) — planilhas Sheets (planejado)
- **Marketing** — falta o gasto do Meta Ads

Os hubs existem e mostram estado vazio honesto: *"sem fonte de dados conectada"*.

**Sobre o Meta Ads:** `fato_negocio_lead` já tem `nome_campanha`, `nome_anuncio` e
`nome_formulario` preenchidos. Se o gasto vier chaveado por campanha, **a junção já
existe** — e você ganha custo por lead real. É o maior ganho pendente da lista.
Confirme antes que os nomes batem com o gerenciador do Meta; se o Clint truncar ou
renomear, precisa de `id_campanha`, não do nome.

**Sobre o Google Sheets:** planilha não tem schema. Alguém insere uma coluna e o ETL
quebra em silêncio. Trate a linha 1 como contrato e valide os cabeçalhos a cada carga.

---

## 🟢 9. Sem metas

Não existe tabela de metas. Onde um mockup pediria "meta comercial em 68%", o sistema
mostra variação real vs. mês anterior.

Se o KPI de meta for necessário, precisa de uma tabela `metas` — e aí ele passa a existir
de verdade, com histórico de quem mudou o quê e quando.

---

## 🟢 10. Não existe IA

A faixa "O mês em uma frase" no Hub Executivo é **calculada dos números reais**, não
gerada por LLM.

Quando a IA existir, ela **não deve** ser um prompt. Deve ser um motor de atribuição:

----
## Conta Azul integrada (12.817 parcelas, R$ 12,5M). É livro-caixa operacional.
 NÃO somar com receita Salesforce (há sobreposição: Maestria, IF, Coaching aparecem nos dois). Usar só para inadimplência, fluxo a receber e caixa recebido. PENDENTE: confirmar com financeiro o que é "Centro Conceito - conta bancária" (R$ 2,6M, provável transferência interna) — pode precisar sair dos cards de caixa.

----
 ### Inadimplência por origem: R$ 821k vencido = 
 Cursos R$ 613k (75%) + Comissão R$ 187k (23%) + Loja R$ 22k (3%). Investigar os R$ 187k de comissão vencida — receita a receber presa? Perguntar ao financeiro.

1. calcula o indicador e sua variação;
2. decompõe em drivers (leads × conversão × ticket);
3. rankeia drivers por contribuição para a variação;
4. **só então** passa os números **já calculados** para o LLM escrever o texto.

Se pular direto para "peça ao LLM que explique o número", ele vai alucinar causas
plausíveis — não reais. E o chat com IA nunca escreve SQL livre: só chama views
pré-aprovadas por tool-call, respeitando a mesma RLS do usuário.
