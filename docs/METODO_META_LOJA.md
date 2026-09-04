# Como a meta da Loja é calculada

Método do Bruno, validado contra o banco em 04/09/2026. Vive aqui porque a
`meta_setor` guarda o **número**, e o número sem o método é indefensável na
primeira vez que alguém perguntar "por que 49 mil?".

---

## A ideia

A receita da loja **não é uma série temporal — é uma função do calendário**.
Um dia de Inteligência Financeira vende R$ 12.883; um dia comum vende R$ 75 de
mediana. **171 vezes mais.** O que muda de um mês para o outro não é
tendência, é quantos dias de curso o mês tem: maio teve IF e fez R$ 69 mil,
junho não teve e fez R$ 19 mil. Não é queda, é calendário.

Por isso a conta é: **conte os dias de cada tipo que o mês vai ter, multiplique
pelo que aquele tipo de dia costuma vender, some.**

---

## Os quatro passos

**1. Classifique cada dia do histórico** pelo evento presencial que acontece
nele.

**2. Meça quanto cada tipo de dia vende.** Média nos dias de curso; **mediana**
nos dias comuns (útil, sábado, domingo) — ali um terço dos dias vende zero e a
média mente.

**3. Conte os dias de cada tipo no mês alvo**, pelo calendário.

**4. Multiplique e some.** O total é a **máster**; a básica é −20% dela; a
mínima é −10% da básica.

---

## As regras que fazem a conta fechar

**Só evento CURTO conta.** O teste é `data_fim − data_inicio <= 7 dias`.
Coaching Individual, Maestria, Team Coaching, LLPASS e Business Evolution
duram meses e aparecem em quase todo dia do calendário sem pôr ninguém no
prédio. Se entrarem, fevereiro parece cheio de curso e a previsão erra 182%
para cima. A pergunta certa não é "que curso está acontecendo", é **"quantas
pessoas este dia põe dentro do prédio"**.

**Cada dia conta uma vez.** Quando dois eventos coincidem, vale o de maior
peso, nesta ordem:

```
IF  >  Workshop  >  FCIS  >  CIS  >  FOP  >  TCE  >  TV  >  BHP  >  outro
```

**Dia comum se separa por dia da semana.** Domingo vende zero em 89% das
vezes; sábado, em 65%; dia útil, em 33%. Uma média única para os três é o
maior erro isolado do método — foi o que separou as duas primeiras versões da
meta de setembro em R$ 11 mil.

**Curso que não é desta loja fica fora da amostra.** O
`BUSINESS HIGH PERFORMANCE COM PAULO VIEIRA GLOBAL` (turma BHPPV-GL) é da
holding: três dias, receita **zero** nos três, coerente com um evento que não
acontece aqui. É o mesmo caso de fevereiro — não é dia fraco, é dia que não
pertence a esta loja, e a média não pode pagar por ele.

A exclusão tem que vir **antes** da classificação, e essa ordem é a armadilha:
o nome da holding contém "BUSINESS HIGH". Classificando primeiro, os três dias
zerados entrariam na média do BHP e a derrubariam de R$ 1.692 para R$ 1.230 —
27% a menos. O filtro é `%PAULO VIEIRA%`, e não `%GLOBAL%`, porque este
pegaria o CIS Global, curso legítimo e terceiro maior gerador de venda da loja.

**Duas fontes de calendário, e elas são diferentes.** Cursos vêm de
`dim_turmas`; palestras e workshops vêm de `mkt_eventos` (a Central Febracis),
filtrando `status = 'ativo'` e `cancelado_em is null`. Mentoria, reunião e
tutoria não entram: são internas.

---

## Os valores medidos (base: jan–ago/2026)

| tipo de dia | valor | medido em |
|---|---:|---:|
| IF | R$ 12.883 | 6 dias |
| Workshop de 8h (PAPW) | R$ 17.002 | **1 dia** |
| TCE | R$ 6.866 | **1 dia** |
| FCIS | R$ 4.548 | 4 dias |
| CIS Global | R$ 2.261 | 9 dias |
| FOP | R$ 1.618 | 6 dias |
| Técnicas de Vendas (TV) | R$ 2.042 | **2 dias** |
| Business High Performance (BHP) | R$ 1.692 | 8 dias |
| dia útil comum | R$ 111 *(mediana)* | 91 dias |
| sábado comum | R$ 0 *(mediana)* | 23 dias |
| domingo comum | R$ 0 *(mediana)* | 30 dias |
| palestra | R$ 544 *(arbitrado)* | 3 dias medidos |
| workshop da Central | **sem medida** | **0 dias** |

**O `n` é parte do número.** IF se apoia em 6 dias, de duas turmas, que
variaram de R$ 8.527 a R$ 17.424 — mais que o dobro entre o pior e o melhor.
Quando alguém questionar a meta, a diferença entre "medi em 6 dias" e "medi em
60" é a diferença entre defender e ceder.

**Palestra e workshop da Central não têm medida nenhuma.** O calendário da
Central só existe desde **19/08/2026**, e nenhuma palestra ou workshop
aconteceu antes de setembro. Os valores usados na meta de 09/2026 (R$ 544 e
R$ 2.363) são **arbitrados**, e isso está escrito na `observacao` daquela
linha.

Em 04/09 a palestra ganhou os três primeiros dias medidos (01 a 03/09: R$ 0,
R$ 544, R$ 1.375). A **mediana deu exatamente R$ 544**, o mesmo palpite — bom
sinal, mas n=3 não troca uma constante. Fica para o fechamento de setembro. O
workshop da Central continua sem um único dia medido.

**Balde genérico é dívida, não solução.** TV e BHP caíam em "outro curso"
(R$ 1.519/dia, n=44 — cursos que nada têm a ver entre si). Em outubro eram
6 dos 31 dias e R$ 9.114 da máster. Medidos separados valem R$ 2.042 e
R$ 1.692, e a meta subiu de R$ 32.461 para R$ 34.199. Sempre que um curso
ocupar peso real no mês, tire-o do balde e meça (`db/183`).

---

## O quanto o método erra

Backtest de 2026, prevendo cada mês com as médias dos outros:

| método | erro médio | pior mês |
|---|---:|---:|
| **dias × tipo** (sem fevereiro) | **24%** | 69% |
| média dos 3 meses anteriores | 95% | 287% |
| repetir o mês anterior | 170% | 691% |

**Mais que o dobro melhor que a alternativa óbvia.** Em quatro dos oito meses
o erro fica abaixo de 12%; em janeiro cravou.

Mas erra feio em duas situações, e as duas são estruturais:

**Tipo de evento inédito.** Março realizou R$ 60 mil e o modelo previa 17 mil,
porque o workshop de 8h que fez R$ 17 mil num sábado era o primeiro do ano —
sem histórico, o balde fica vazio e o dia é previsto como comum. Quando entrar
um tipo novo, **arbitre o valor e registre na `observacao`**; não deixe o
modelo prever zero.

**Algo fora do calendário.** Fevereiro tinha evento e a loja vendeu R$ 6.993 no
mês inteiro. O dia a dia mostrou o porquê: **onze dias corridos sem um único
cupom, de 13 a 23/02** — a loja esteve parada. Confirmado com o Bruno em
04/09/2026, fevereiro **saiu da amostra**.

O efeito foi grande no método e quase nulo na meta de setembro. No método, o
erro médio caiu de **43% para 24%** e quatro dos sete meses ficaram abaixo de
12% — os onze zeros estavam rebaixando a mediana de todos os dias comuns. Em
setembro mudou R$ 27, porque aquele mês é dominado pelos três dias de IF, e o
IF aconteceu em janeiro e maio, que fevereiro nunca tocou.

---

## O que ainda está em aberto

- **Calendário completo no dia 25.** A meta do mês seguinte é escrita no dia
  25. Se turma ou evento entrar no calendário depois disso, a meta nasce
  contando menos dias do que o mês vai ter. Ninguém mediu esse atraso ainda.
- **De onde sai o −20%.** Hoje a previsão é a máster, então a faixa inteira
  fica abaixo do previsto. A alternativa é a previsão virar a **básica**, com
  a máster acima — decisão do Bruno em 04/09 foi manter como máster.
