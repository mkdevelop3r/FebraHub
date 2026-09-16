#!/usr/bin/env node

/**
 * Confirma alunos identificados pela entrada em um grupo aberto no WhatsApp Web.
 *
 * Requer um Chrome iniciado com remote debugging e o grupo correto aberto.
 * Por seguranca, a escrita exige --write, titulo exato e telefone associado a um
 * unico aluno elegivel. Pessoas ja confirmadas por qualquer origem nao sao
 * regravadas.
 */

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--write') args.set('write', true);
  else if (arg.startsWith('--') && process.argv[i + 1]) args.set(arg.slice(2), process.argv[++i]);
}

const turma = args.get('turma') || process.env.WHATSAPP_TURMA_ID;
const expectedGroup = args.get('grupo') || process.env.WHATSAPP_GRUPO_TITULO;
const cdpUrl = args.get('cdp') || process.env.WHATSAPP_CDP_URL || 'http://127.0.0.1:9222';
const write = args.has('write');
if (!turma || !expectedGroup) throw new Error('Informe --turma e --grupo.');

const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;
if (!base || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes.');
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function get(resource, params) {
  const url = new URL(`${base}/rest/v1/${resource}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${resource}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function upsert(resource, rows) {
  if (!rows.length) return;
  const url = new URL(`${base}/rest/v1/${resource}`);
  url.searchParams.set('on_conflict', 'aluno_id,turma_id,origem');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`${resource}: ${response.status} ${await response.text()}`);
}

const normalizePhone = value => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  return digits;
};
const variants = value => {
  const digits = normalizePhone(value);
  const result = new Set(digits ? [digits] : []);
  if (digits.length === 10) result.add(digits.slice(0, 2) + '9' + digits.slice(2));
  if (digits.length === 11 && digits[2] === '9') result.add(digits.slice(0, 2) + digits.slice(3));
  return result;
};
const canonicalText = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

async function readOpenGroup() {
  const tabs = await fetch(`${cdpUrl}/json/list`).then(response => response.json());
  const tab = tabs.find(item => item.type === 'page' && item.url.startsWith('https://web.whatsapp.com/'));
  if (!tab) throw new Error('Aba do WhatsApp Web nao encontrada.');
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const callback = pending.get(message.id);
    pending.delete(message.id);
    message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result);
  });
  const send = (method, params = {}) => {
    const id = ++sequence;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  const expression = `(() => document.querySelector('#main header')?.innerText || '')()`;
  const result = await send('Runtime.evaluate', { expression, returnByValue: true });
  socket.close();
  const header = result.result.value || '';
  const [groupName = '', ...participantLines] = header.split('\n');
  const matches = participantLines.join(' ').match(/\+55\s*\d{2}\s*\d{4,5}-\d{4}/g) || [];
  return { groupName: groupName.trim(), phones: new Set(matches.map(normalizePhone).filter(Boolean)) };
}

const { groupName, phones: groupPhones } = await readOpenGroup();
if (canonicalText(groupName) !== canonicalText(expectedGroup)) {
  throw new Error(`Grupo aberto nao confere. Esperado: "${expectedGroup}"; aberto: "${groupName}".`);
}

const facts = await get('fato_base_alunos', {
  select: 'aluno_id,telefone_cliente,status_matricula,tipo_matricula',
  turma: `eq.${turma}`,
  limit: '1000',
});
const eligible = new Map();
for (const row of facts) {
  if (row.status_matricula !== 'Aprovada' || row.tipo_matricula === 'COMPRADOR DE VAGAS') continue;
  eligible.set(String(row.aluno_id), {
    alunoId: String(row.aluno_id),
    phones: variants(row.telefone_cliente),
  });
}

const ids = [...eligible.keys()];
for (let i = 0; i < ids.length; i += 40) {
  const contacts = await get('fato_contatos', {
    select: 'cpf,celular',
    cpf: `in.(${ids.slice(i, i + 40).join(',')})`,
  });
  for (const contact of contacts) {
    const student = eligible.get(String(contact.cpf));
    if (student) for (const phone of variants(contact.celular)) student.phones.add(phone);
  }
}

const phoneIndex = new Map();
for (const student of eligible.values()) for (const phone of student.phones) {
  if (!phoneIndex.has(phone)) phoneIndex.set(phone, new Set());
  phoneIndex.get(phone).add(student.alunoId);
}

const matched = new Map();
let ambiguous = 0;
let unknown = 0;
for (const groupPhone of groupPhones) {
  const candidates = new Set();
  for (const variant of variants(groupPhone)) {
    for (const alunoId of phoneIndex.get(variant) || []) candidates.add(alunoId);
  }
  if (candidates.size === 1) matched.set([...candidates][0], groupPhone);
  else if (candidates.size > 1) ambiguous++;
  else unknown++;
}

const confirmations = await get('pedagogico_confirmacoes', {
  select: 'aluno_id,origem',
  turma_id: `eq.${turma}`,
  limit: '1000',
});
const confirmed = new Set(confirmations.map(row => String(row.aluno_id)));
const newRows = [...matched.entries()]
  .filter(([alunoId]) => !confirmed.has(alunoId))
  .map(([alunoId, phone]) => ({
    aluno_id: alunoId,
    turma_id: turma,
    origem: 'grupo_whatsapp',
    telefone: phone,
    detalhes: { grupo: groupName, metodo: 'telefone_unico_whatsapp_web' },
  }));

if (write) await upsert('pedagogico_confirmacoes', newRows);
console.log(JSON.stringify({
  modo: write ? 'gravacao' : 'diagnostico',
  turma,
  grupo: groupName,
  telefones_visiveis: groupPhones.size,
  inscritos_elegiveis: eligible.size,
  identificados_com_seguranca: matched.size,
  ja_confirmados: [...matched.keys()].filter(id => confirmed.has(id)).length,
  novas_confirmacoes: newRows.length,
  telefones_desconhecidos: unknown,
  telefones_ambiguos: ambiguous,
}, null, 2));
