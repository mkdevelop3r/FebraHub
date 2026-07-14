# FebraHub

Central de inteligência da **Febracis Salvador**. Substitui os dashboards do Power BI
por hubs setoriais com dados reais, controle de acesso no banco e KPIs que a empresa
não tinha — como fluxo de caixa projetado e custo real de maquininha.

**Stack:** React + Vite · Supabase (Postgres) · Netlify · Python (ETL)

---

## Estrutura

```
web/                  Front-end (React + Vite) → Netlify
etl/                  Scripts de integração (Python) → local ou GitHub Actions
supabase/migrations/  Schema, RLS e views — rodar na ordem numérica
docs/                 Contexto do projeto e decisões
```

---

## Segurança — leia antes de qualquer coisa

**Duas chaves do Supabase, com propósitos opostos:**

| chave | onde vive | o que faz |
|---|---|---|
| `anon` | `web/.env`, Netlify | Pública por design. A RLS é quem protege. |
| `service_role` | `etl/.env`, só local | **Ignora toda a RLS.** Nunca no front, nunca commitada. |

Se a `service_role` vazar, o banco inteiro vaza junto. O `.gitignore` bloqueia `.env`,
mas confira o histórico antes do primeiro push:

```bash
git log --all --oneline -- .env
git log -p --all -S "sb_secret" | head -5
```

Se retornar qualquer linha, **rotacione as chaves** (Supabase, Sympla, CisPay).
Apagar o arquivo não desfaz o histórico do Git.

---

## Rodar o front

```bash
cd web
npm install
cp .env.example .env      # preencha com a URL e a ANON key
npm run dev
```

**Netlify** — Site settings → Environment variables:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Build: `npm run build` · Publish: `dist` · Base directory: `web`

---

## Rodar os ETLs

```bash
cd etl
pip install requests python-dotenv
cp .env.example .env      # preencha com os tokens e a SERVICE_ROLE key

python sympla_sync.py --diagnostico    # descobre as chaves reais da API
python sympla_sync.py --sync           # grava no Supabase

python cispay_sync.py --diagnostico
python cispay_sync.py --sync --meses 24
python cispay_sync.py --extrato
```

### O método `--diagnostico` — use em toda integração nova

Quatro fontes, quatro bugs idênticos: Sympla (valor, e-mail, CPF), Clint (data),
Salesforce (curso). Sempre a mesma causa: **o mapper foi escrito com os nomes que o
Power Query gera depois do rename, não com os nomes crus da API.**

```m
Table.RenameColumns(..., {{"buyer_email", "email_comprador"}, ...})
```

O código Python procurava `email_comprador`. A API devolve `buyer_email`. O `.get()`
retornava `None`, o insert gravava NULL, e ninguém era avisado. **66 mil linhas de NULL
passaram despercebidas.**

O `--diagnostico` achata o JSON, lista todas as chaves reais com taxa de preenchimento,
e mostra qual candidato ganhou. Rode **antes** de escrever qualquer mapper.

E todo ETL aborta se um campo obrigatório vier preenchido em menos de 50%.
Melhor a carga quebrar do que gravar NULL em silêncio.

---

## Migrations

Rodar na ordem, no SQL Editor do Supabase:

| # | o que faz |
|---|---|
| 01 | Padroniza nomes de tabela · liga RLS em tudo |
| 02 | Chaves, FKs e índices |
| 03 | Ponte lead↔aluno (telefone) · perfis · Sympla |
| 04 | Campos do Sympla que a carga descartava |
| 05 | **Views por hub + RLS efetiva** — é o que destrava o deploy |
| 06 | CisPay: liquidação de cartão, caixa e MDR |

---

## Como o acesso funciona

**A segurança está no banco, não no React.**

O bundle JS é público e a `anon key` também. Esconder um botão não é segurança —
qualquer um abre o DevTools e chama o Supabase direto.

```
Login → Supabase Auth → perfis.setor → RLS filtra no Postgres
```

- Tabelas de fato e dimensão: RLS ligada, **zero policies**. Ninguém lê. Nem anon, nem logado.
- Views por hub: único caminho do front. A permissão mora no `WHERE pode_ver('setor')`.
- PII (CPF, telefone, e-mail) nunca entra em view.

Um usuário do Financeiro que tente ler `vw_comercial_funil` recebe **vazio**.
Se tentar `fato_pagamento_base`, recebe **permission denied**. Testado.

> **Atenção:** views no Postgres rodam com privilégio do dono e **ignoram a RLS das
> tabelas de baixo**. Por isso a checagem tem que estar dentro da view. Sem o
> `WHERE pode_ver(...)`, a view vira um buraco na segurança.

---

## Documentação

- [`docs/BRIEFING.md`](docs/BRIEFING.md) — contexto, modelo de negócio, tarefas
- [`docs/DESCOBERTAS.md`](docs/DESCOBERTAS.md) — o que os dados revelaram, e o que não é verdade
- [`docs/DIVIDAS.md`](docs/DIVIDAS.md) — pendências conhecidas, com tamanho e causa
