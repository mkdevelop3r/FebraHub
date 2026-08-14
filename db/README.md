# db/ — Registro do schema do Supabase (FebraHub)

## O que é esta pasta

Esta pasta é o **registro versionado** de todas as migrations SQL aplicadas
no banco Supabase do FebraHub (projeto `bcorkfhfjfurlvggzgco`). É a **fonte
da verdade** de como o banco foi construído — as views, tabelas, políticas
RLS, funções e correções, em ordem cronológica.

## O que esta pasta NÃO é

**NÃO é um pipeline executável.** Não rode `supabase db push` apontando para
cá — os arquivos são registro, não um pipeline de migração automática. Rodar
tudo de novo recriaria views e poderia quebrar o banco em produção.

Por isso a pasta se chama `db/` e não `supabase/migrations/` — este último é
o caminho que o CLI do Supabase trata como pipeline. Aqui é só histórico.

## Como o SQL é aplicado (o fluxo real)

1. O SQL é gerado (numa sessão de trabalho) e **salvo aqui**, versionado no Git.
2. O usuário **aplica manualmente** cada arquivo no SQL Editor do Supabase.
3. O Claude Code **não aplica SQL** — ele lê estes arquivos para entender o
   schema e a intenção, e trabalha só no front (React/Vite).

## Por que versionar (e não só confiar no banco vivo)

O banco vivo mostra a **estrutura** (a coluna existe, a view faz X). Estes
arquivos mostram a **intenção** — o *porquê* de cada decisão, nos comentários.
Exemplos de decisões que só existem aqui, não no banco:

- receita = `max(valor)` por venda, nunca `sum` cru (senão infla ~77%)
- CPF normalizado com `lpad(...,11,'0')` nos dois lados do join
- presença ancorada em data de matrícula, não de credenciamento
- período recente usa `data_aprovacao`; faturamento mensal usa `data_pagamento`

Quem lê só a estrutura escreve código que funciona e viola a intenção.

## Duas regras que custaram caro (leia antes de escrever view)

### 1. `norm_curso()` num `join` cru multiplica linha

`dim_cursos` tem 158 linhas para 153 nomes normalizados: mais de um curso
colapsa no mesmo `norm_curso()`. `MÉTODO CIS GLOBAL - INTELIGÊNCIA EMOCIONAL`
casa **três** vezes.

Onde o `norm_curso()` aparece decide se isso vira bug:

| forma | efeito |
|---|---|
| `join x on norm_curso(a) = norm_curso(b)` | **multiplica** — cada linha vira N |
| dentro de `exists` / `not exists` | seguro — responde sim/não |
| `left join lateral (... group by ...)` | seguro — devolve uma linha |
| `join` seguido de `group by` | seguro — o group by absorve |

O join cru triplicou os inscritos de **39 turmas**: a CIS-GL250 mostrava 246
linhas para 82 pessoas. Passou despercebido porque o total "parecia" grande
demais, não errado. Corrigido nas migrations 117 (`vw_turmas_central`) e 118
(`vw_turma_inscritos`); as outras três views que usam `norm_curso()` já
estavam numa das formas seguras.

**Ao escrever view nova:** se o critério é "este curso pertence a X?", use
`exists`. `join` só quando você precisa das COLUNAS do outro lado — e aí
confira se a chave é única depois de normalizada.

### 2. A chave do `distinct on` depende da PERGUNTA da view

Não existe chave padrão do projeto. Uniformizar quebra as duas:

- `vw_boas_vindas_fila` → `distinct on (aluno_id, curso_id)`
  A pergunta é "quem comprou e ainda não foi acolhido". Quem compra **dois
  cursos diferentes deve receber duas boas-vindas**.
- `vw_turma_inscritos` → `distinct on (aluno_id, turma, tipo)`
  A pergunta é "quem está nesta turma". Duas matrículas na mesma turma são
  **uma pessoa só** — a mensagem de confirmação é uma.

O sinal de que a chave está certa: ela bate com o que a função de disparo já
faz. `disparar_turma()` usa `select distinct m.aluno_id` por turma — foi essa
diferença entre a view e a função que denunciou o bug da matrícula repetida
(1.630 CONSUMIDOR DE VAGAS, 395 Matrícula, 224 Bônus em 232 turmas).

## Convenção

- Arquivos numerados em ordem de aplicação: `00_` em diante (hoje na casa dos `118_`).
- Número repetido é armadilha: já aconteceu duas vezes (`99` e `115`), e nos
  dois casos um arquivo sobrescreveu o outro no disco. Antes de numerar,
  `ls db/ | grep ^NN`.
- Cada novo SQL gerado numa sessão entra aqui, numerado na sequência,
  e é commitado junto com a mudança de front que depende dele.
- O cabeçalho de cada arquivo (comentário) explica o que faz e por quê.

## Quando o arquivo e o banco divergirem, o banco ganha

Já aconteceu três vezes de o `db/` descrever algo que não era o que estava
rodando. A regra que ficou:

1. **O banco ganha.** O arquivo se ajusta, não o contrário.
2. Arquivo que descreve uma tentativa que perdeu a corrida **sai** — foi o
   caso das duas versões antigas de `vw_turmas_central`, absorvidas pela 117.
   Documentação errada é pior que documentação nenhuma.
3. Comando que a operação reverteu de propósito vira **nota no cabeçalho**,
   nunca segue executável — senão reexecutar o arquivo desfaz em silêncio uma
   decisão de negócio (ver `115`, o `update` do LIVRÃO MÉTODO CIS).
4. Definição corrigida numa migration posterior **sai do arquivo antigo**, com
   ponteiro para a nova — senão rodar o antigo reintroduz o bug (ver `115` →
   `118`).

Para conferir o registro contra o aplicado:
`select pg_get_viewdef('public.NOME'::regclass, true);`
