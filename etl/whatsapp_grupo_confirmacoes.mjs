#!/usr/bin/env node

/**
 * Confirma alunos pela presença nos grupos de WhatsApp das turmas ativas.
 *
 * O link_grupo de dim_turmas é a fonte de navegação. A execução padrão percorre
 * todas as turmas ativas que possuem link; --pilot mantém a seleção histórica
 * apenas para diagnósticos dirigidos. Nunca confirma telefone desconhecido ou
 * associado a mais de um aluno elegível.
 */

const booleanArgs = new Set(['write', 'all', 'pilot', 'gated']);
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const name = arg.slice(2);
  if (booleanArgs.has(name)) args.set(name, true);
  else if (process.argv[i + 1]) args.set(name, process.argv[++i]);
}

const cdpUrl = args.get('cdp') || process.env.WHATSAPP_CDP_URL || 'http://127.0.0.1:9222';
const write = args.has('write');
const selection = args.has('pilot') ? 'pilot' : 'all';
const requestedIds = String(args.get('turmas') || '').split(',').map(value => value.trim()).filter(Boolean);
const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;
if (!base || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY ausentes.');
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const watchdog = setTimeout(() => {
  console.error('Tempo limite de 15 minutos excedido.');
  process.exit(1);
}, 15 * 60_000);
watchdog.unref();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const canonicalText = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();
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

async function request(resource, { method = 'GET', params = {}, body, conflict } = {}) {
  const url = new URL(`${base}/rest/v1/${resource}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  if (conflict) url.searchParams.set('on_conflict', conflict);
  const response = await fetch(url, {
    method,
    headers: body ? {
      ...headers,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${resource}: HTTP ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function get(resource, params) {
  return request(resource, { params });
}

async function upsert(resource, rows, conflict) {
  if (!rows.length) return;
  await request(resource, { method: 'POST', body: rows, conflict });
}

class CdpClient {
  static async connect() {
    const response = await fetch(`${cdpUrl}/json/list`);
    if (!response.ok) throw new Error(`Chrome CDP indisponivel: HTTP ${response.status}.`);
    const tabs = await response.json();
    const tab = tabs.find(item => item.type === 'page' && item.url.startsWith('https://web.whatsapp.com/'));
    if (!tab) throw new Error('Aba do WhatsApp Web nao encontrada no perfil de monitoramento.');
    return new CdpClient(tab.webSocketDebuggerUrl);
  }

  constructor(socketUrl) {
    this.socketUrl = socketUrl;
    this.sequence = 0;
    this.pending = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.socketUrl);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const callback = this.pending.get(message.id);
      this.pending.delete(message.id);
      message.error ? callback.reject(new Error(JSON.stringify(message.error))) : callback.resolve(message.result);
    });
    const rejectPending = reason => {
      for (const callback of this.pending.values()) callback.reject(new Error(reason));
      this.pending.clear();
    };
    this.socket.addEventListener('close', () => rejectPending('Conexão com o WhatsApp Web foi encerrada.'));
    this.socket.addEventListener('error', () => rejectPending('Conexão com o WhatsApp Web falhou.'));
    await this.send('Page.enable');
    return this;
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      if (this.socket?.readyState !== WebSocket.OPEN) {
        reject(new Error('Conexão com o WhatsApp Web não está aberta.'));
        return;
      }
      this.pending.set(id, { resolve, reject });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description;
      throw new Error(description || result.exceptionDetails.text || 'Erro ao avaliar WhatsApp Web.');
    }
    return result.result.value;
  }

  async clickPoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    await this.send('Page.bringToFront');
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    return true;
  }

  async openKnownGroup(groupName) {
    const expected = canonicalText(groupName);
    if (!expected) return null;
    const expectedLiteral = JSON.stringify(expected);
    const clickState = await this.evaluate(`(() => {
      const canonical = value => String(value || '').normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toUpperCase();
      const activate = target => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
          target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window }));
        }
      };
      const current = document.querySelector('#main header')?.innerText || '';
      if (canonical(current.split('\\n')[0]) === ${expectedLiteral}) return { current: true };
      const title = [...document.querySelectorAll('#pane-side [title]')]
        .find(element => canonical(element.getAttribute('title')) === ${expectedLiteral});
      if (!title) return {};
      const target = title.closest('[role="row"],[data-testid="cell-frame-container"]') || title;
      activate(target);
      return { clicked: true };
    })()`);
    if (!clickState.current && !clickState.clicked) return null;

    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      const header = await this.evaluate(`document.querySelector('#main header')?.innerText || ''`);
      const [openedName = '', ...participantLines] = header.split('\n');
      if (canonicalText(openedName) === expected) {
        const matches = participantLines.join(' ').match(/\+?55\s*\(?\d{2}\)?\s*\d{4,5}[\s-]?\d{4}/g) || [];
        return { groupName: openedName.trim(), phones: new Set(matches.map(normalizePhone).filter(Boolean)) };
      }
      await sleep(250);
    }
    return null;
  }

  async openGroup(inviteLink, knownGroupName = '') {
    const knownGroup = await this.openKnownGroup(knownGroupName);
    if (knownGroup) return knownGroup;
    let invite;
    try { invite = new URL(inviteLink); } catch { throw new Error('link_grupo invalido.'); }
    if (invite.hostname !== 'chat.whatsapp.com') throw new Error('link_grupo nao pertence a chat.whatsapp.com.');
    const code = invite.pathname.split('/').filter(Boolean)[0];
    if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) throw new Error('link_grupo sem codigo de convite valido.');

    // Limpa a conversa anterior para que um cabecalho antigo nunca seja aceito.
    await this.send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
    await this.send('Page.navigate', { url: `https://web.whatsapp.com/accept?code=${encodeURIComponent(code)}` });

    const deadline = Date.now() + 50_000;
    let openedGroupName = '';
    let joinPromptSince = 0;
    while (Date.now() < deadline) {
      await sleep(1_000);
      const state = await this.evaluate(`(() => {
        const header = document.querySelector('#main header')?.innerText || '';
        const body = document.body?.innerText || '';
        return { header, precisaEntrar: /entrar no grupo|join group/i.test(body) };
      })()`);
      if (state.precisaEntrar && !state.header) {
        if (!joinPromptSince) joinPromptSince = Date.now();
        if (Date.now() - joinPromptSince >= 8_000) {
          throw new Error('A conta de monitoramento ainda nao participa deste grupo.');
        }
        continue;
      }
      joinPromptSince = 0;
      if (state.header) {
        const [groupName = '', ...participantLines] = state.header.split('\n');
        openedGroupName = groupName.trim();
        const matches = participantLines.join(' ').match(/\+?55\s*\(?\d{2}\)?\s*\d{4,5}[\s-]?\d{4}/g) || [];
        const phones = new Set(matches.map(normalizePhone).filter(Boolean));
        return { groupName: openedGroupName, phones };
      }
    }
    throw new Error('Tempo esgotado ao abrir o grupo pelo link_grupo.');
  }

  async readGroupParticipants(groupName) {
    const groupLiteral = JSON.stringify(groupName);
    const result = await this.evaluate(`(async () => {
      const openDb = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('model-storage');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const idbRequest = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const canonical = value => String(value || '').normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toUpperCase();
      const serializedId = value => {
        if (typeof value === 'string') return value;
        if (!value || typeof value !== 'object') return '';
        return value._serialized || value.id || value.user || '';
      };
      const db = await openDb();
      try {
        const metadataStore = db.transaction('group-metadata', 'readonly').objectStore('group-metadata');
        const groups = await idbRequest(metadataStore.getAll());
        const group = groups.find(row => canonical(row.subject) === canonical(${groupLiteral}));
        if (!group) throw new Error('Metadados do grupo nao encontrados no WhatsApp.');

        const participantStore = db.transaction('participant', 'readonly').objectStore('participant');
        const participantRow = await idbRequest(participantStore.get(group.id));
        if (!participantRow) throw new Error('Lista de participantes nao encontrada no WhatsApp.');

        const contactStore = db.transaction('contact', 'readonly').objectStore('contact');
        const contacts = await idbRequest(contactStore.getAll());
        const contactsById = new Map(contacts.map(contact => [serializedId(contact.id), contact]));
        const phones = [];
        for (const participant of participantRow.participants || []) {
          const id = serializedId(participant);
          const contact = contactsById.get(id);
          const phone = serializedId(contact?.phoneNumber)
            || (/@(c\\.us|s\\.whatsapp\\.net)$/i.test(id) ? id : '');
          if (phone) phones.push(phone);
        }
        return { phones };
      } finally {
        db.close();
      }
    })()`);
    return new Set((result.phones || []).map(normalizePhone).filter(Boolean));
  }

  async readPendingRequests(groupName) {
    const groupLiteral = JSON.stringify(groupName);
    const result = await this.evaluate(`(async () => {
      const openDb = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('model-storage');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const idbRequest = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const canonical = value => String(value || '').normalize('NFD')
        .replace(/[\\u0300-\\u036f]/g, '').replace(/\\s+/g, ' ').trim().toUpperCase();
      const serializedId = value => {
        if (typeof value === 'string') return value;
        if (!value || typeof value !== 'object') return '';
        return value._serialized || value.id || value.user || '';
      };
      const db = await openDb();
      try {
        const metadataStore = db.transaction('group-metadata', 'readonly').objectStore('group-metadata');
        const groups = await idbRequest(metadataStore.getAll());
        const group = groups.find(row => canonical(row.subject) === canonical(${groupLiteral}));
        if (!group) throw new Error('Metadados do grupo nao encontrados no WhatsApp.');

        const transaction = db.transaction(['pending-membership-approval-request', 'contact'], 'readonly');
        const pendingStore = transaction.objectStore('pending-membership-approval-request');
        const contactsStore = transaction.objectStore('contact');
        const [pending, contacts] = await Promise.all([
          idbRequest(pendingStore.index('groupId').getAll(group.id)),
          idbRequest(contactsStore.getAll()),
        ]);
        const contactsById = new Map(contacts.map(contact => [serializedId(contact.id), contact]));
        const requests = [];
        for (const row of pending) {
          const candidates = [row.id, row.requesterId, row.participantId, row.participant, row.wid]
            .map(serializedId).filter(Boolean);
          for (const value of Object.values(row)) {
            const id = serializedId(value);
            if (id && /@(lid|c\\.us|s\\.whatsapp\\.net)$/i.test(id)) candidates.push(id);
          }
          let phone = serializedId(row.phoneNumber);
          for (const id of [...new Set(candidates)]) {
            const contact = contactsById.get(id);
            phone = phone || serializedId(contact?.phoneNumber);
            if (phone) break;
            if (/@(c\\.us|s\\.whatsapp\\.net)$/i.test(id)) phone = id;
          }
          requests.push({ phone: phone || null });
        }
        return { total: pending.length, requests };
      } finally {
        db.close();
      }
    })()`);
    return result;
  }

  async approvePendingRequests(groupName, phones) {
    const safePhones = [...new Set(phones.map(normalizePhone).filter(Boolean))];
    if (!safePhones.length) return { approved: 0, failed: 0 };

    let panelReady = false;
    let headerClicked = false;
    for (let attempt = 0; attempt < 20 && !panelReady; attempt++) {
      const openState = await this.evaluate(`(() => {
        const activate = target => {
          for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window }));
          }
        };
        const body = document.body?.innerText || '';
        if (/Você não é mais um admin|You are no longer an admin/i.test(body)) {
          return { error: 'A conta de monitoramento não é administradora do grupo.' };
        }
        const approvalButton = [...document.querySelectorAll('button,[role="button"]')].find(element =>
          /^(Aprovar|Approve)$/i.test((element.innerText || element.getAttribute('aria-label') || '').trim()));
        if (approvalButton) return { ready: true };
        const reviewButton = [...document.querySelectorAll('button,[role="button"]')].find(element =>
          /Analisar\\s+\\d+\\s+pedido|Review\\s+\\d+\\s+request/i.test((element.innerText || '').trim()));
        if (reviewButton) {
          activate(reviewButton);
          return { clicked: 'review' };
        }
        const notification = [...document.querySelectorAll('#main [data-testid="subtype-membership_approval_request"]')]
          .find(element => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0
              && (/pedido|request/i.test(element.innerText || '') || element.getAttribute('role') === 'button');
          });
        if (notification) {
          activate(notification);
          return { clicked: 'notification' };
        }
        return {};
      })()`);
      if (openState.error) throw new Error(openState.error);
      panelReady = Boolean(openState.ready);
      if (!panelReady && !openState.clicked && !headerClicked) {
        const headerPoint = await this.evaluate(`(() => {
          const header = document.querySelector('#main header');
          if (!header) return null;
          const rect = header.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        })()`);
        headerClicked = await this.clickPoint(headerPoint);
      }
      if (!panelReady) await sleep(400);
    }
    if (!panelReady) throw new Error('Painel de pedidos pendentes não abriu no WhatsApp Web.');

    let approved = 0;
    let failed = 0;
    for (const phone of safePhones) {
      const clicked = await this.evaluate(`(() => {
        const activate = target => {
          for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window }));
          }
        };
        const normalize = value => {
          let digits = String(value || '').replace(/\\D/g, '');
          if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
          return digits;
        };
        const variants = value => {
          const digits = normalize(value);
          const result = new Set(digits ? [digits] : []);
          if (digits.length === 10) result.add(digits.slice(0, 2) + '9' + digits.slice(2));
          if (digits.length === 11 && digits[2] === '9') result.add(digits.slice(0, 2) + digits.slice(3));
          return result;
        };
        const wanted = variants(${JSON.stringify(phone)});
        const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(element =>
          /^(Aprovar|Approve)$/i.test((element.innerText || element.getAttribute('aria-label') || '').trim()));
        for (const button of buttons) {
          let row = button;
          while (row?.parentElement && !row.querySelector('[data-testid="name"]')) row = row.parentElement;
          const nameBlock = row?.querySelector('[data-testid="name"]');
          if (!nameBlock) continue;
          const numbers = (nameBlock.innerText || '').match(/\\+?\\d[\\d\\s()-]{8,}\\d/g) || [];
          if (!numbers.some(number => [...variants(number)].some(value => wanted.has(value)))) continue;
          activate(button);
          return true;
        }
        return false;
      })()`);
      if (!clicked) {
        failed++;
        continue;
      }

      let removed = false;
      for (let attempt = 0; attempt < 12 && !removed; attempt++) {
        await sleep(500);
        const state = await this.evaluate(`(() => {
          const normalize = value => {
            let digits = String(value || '').replace(/\\D/g, '');
            if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
            return digits;
          };
          const variants = value => {
            const digits = normalize(value);
            const result = new Set(digits ? [digits] : []);
            if (digits.length === 10) result.add(digits.slice(0, 2) + '9' + digits.slice(2));
            if (digits.length === 11 && digits[2] === '9') result.add(digits.slice(0, 2) + digits.slice(3));
            return result;
          };
          const wanted = variants(${JSON.stringify(phone)});
          const body = document.body?.innerText || '';
          if (/Você não é mais um admin|You are no longer an admin/i.test(body)) {
            return { error: 'A conta de monitoramento não é administradora do grupo.' };
          }
          const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(element =>
            /^(Aprovar|Approve)$/i.test((element.innerText || element.getAttribute('aria-label') || '').trim()));
          const stillPending = buttons.some(button => {
            let row = button;
            while (row?.parentElement && !row.querySelector('[data-testid="name"]')) row = row.parentElement;
            const nameBlock = row?.querySelector('[data-testid="name"]');
            const numbers = (nameBlock?.innerText || '').match(/\\+?\\d[\\d\\s()-]{8,}\\d/g) || [];
            return numbers.some(number => [...variants(number)].some(value => wanted.has(value)));
          });
          return { stillPending };
        })()`);
        if (state.error) throw new Error(state.error);
        removed = !state.stillPending;
      }
      if (removed) approved++;
      else failed++;
    }
    return { approved, failed };
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close();
  }
}

async function loadTurmas() {
  const [rows, statusRows] = await Promise.all([
    get('dim_turmas', {
      select: 'turma_id,curso,data_inicio,data_fim,status,confirma_pedagogico,link_grupo',
      status: 'eq.aberta',
      order: 'data_inicio.asc',
      limit: '1000',
    }),
    get('pedagogico_whatsapp_status', {
      select: 'turma_id,grupo',
      monitor: 'eq.participantes',
      limit: '1000',
    }),
  ]);
  const groupNames = new Map(statusRows.filter(row => row.grupo).map(row => [row.turma_id, row.grupo]));
  const today = new Date().toISOString().slice(0, 10);
  return rows
    .filter(row => !row.data_fim || row.data_fim >= today)
    .map(row => ({ ...row, grupo_whatsapp: groupNames.get(row.turma_id) || '' }));
}

function selectPilots(activeTurmas) {
  const if36 = activeTurmas.find(row => row.turma_id === '2026 - IF36');
  const fcis = activeTurmas.find(row => /\bFCIS\s*\d+/i.test(row.turma_id));
  return [if36, fcis].filter(Boolean);
}

async function buildEligibleStudents(turmaId) {
  // A Central Pedagogica usa o roster oficial de Credenciamento__c. Consultar
  // a mesma fonte inclui transferidos e vendas de outras unidades, cujos
  // contatos globais nao necessariamente existem em fato_base_alunos.
  const facts = await get('vw_turma_inscritos_base', {
    select: 'aluno_id,telefone',
    turma_id: `eq.${turmaId}`,
    tipo: 'eq.confirmacao',
    limit: '5000',
  });
  const eligible = new Map();
  for (const row of facts) {
    const alunoId = String(row.aluno_id);
    if (!eligible.has(alunoId)) eligible.set(alunoId, { alunoId, phones: new Set() });
    for (const phone of variants(row.telefone)) eligible.get(alunoId).phones.add(phone);
  }
  const ids = [...eligible.keys()];
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const documents = new Map(batch.map(id => [id.padStart(11, '0'), id]));
    const [contacts, students] = await Promise.all([
      get('fato_contatos', {
        select: 'cpf,celular',
        cpf: `in.(${batch.join(',')})`,
      }),
      get('dim_alunos', {
        select: 'doc_norm,telefone',
        doc_norm: `in.(${[...documents.keys()].join(',')})`,
        limit: '1000',
      }),
    ]);
    for (const contact of contacts) {
      const student = eligible.get(String(contact.cpf));
      if (student) for (const phone of variants(contact.celular)) student.phones.add(phone);
    }
    for (const row of students) {
      const alunoId = documents.get(String(row.doc_norm).padStart(11, '0'));
      const student = eligible.get(alunoId);
      if (student) for (const phone of variants(row.telefone)) student.phones.add(phone);
    }
  }
  return eligible;
}

async function buildInvitedStudents(turmaId) {
  const invitations = await get('pedagogico_envios', {
    select: 'aluno_id',
    turma_id: `eq.${turmaId}`,
    tipo: 'in.(grupo,convite,prazo_vencendo)',
    status: 'in.(pendente,aceito)',
    limit: '1000',
  });
  const ids = [...new Set(invitations.map(row => String(row.aluno_id)).filter(Boolean))];
  const invited = new Map(ids.map(alunoId => [alunoId, { alunoId, phones: new Set() }]));
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const documents = new Map(batch.map(id => [id.padStart(11, '0'), id]));
    const [contacts, facts, queueRows, students] = await Promise.all([
      get('fato_contatos', { select: 'cpf,celular', cpf: `in.(${batch.join(',')})` }),
      get('fato_base_alunos', { select: 'aluno_id,telefone_cliente', aluno_id: `in.(${batch.join(',')})`, limit: '1000' }),
      get('fila_prazo', {
        select: 'cpf,telefone',
        cpf: `in.(${batch.join(',')})`,
        proxima_turma: `eq.${turmaId}`,
        limit: '1000',
      }),
      get('dim_alunos', {
        select: 'doc_norm,telefone',
        doc_norm: `in.(${[...documents.keys()].join(',')})`,
        limit: '1000',
      }),
    ]);
    for (const contact of contacts) {
      const student = invited.get(String(contact.cpf));
      if (student) for (const phone of variants(contact.celular)) student.phones.add(phone);
    }
    for (const fact of facts) {
      const student = invited.get(String(fact.aluno_id));
      if (student) for (const phone of variants(fact.telefone_cliente)) student.phones.add(phone);
    }
    for (const queueRow of queueRows) {
      const student = invited.get(String(queueRow.cpf));
      if (student) for (const phone of variants(queueRow.telefone)) student.phones.add(phone);
    }
    for (const row of students) {
      const alunoId = documents.get(String(row.doc_norm).padStart(11, '0'));
      const student = invited.get(alunoId);
      if (student) for (const phone of variants(row.telefone)) student.phones.add(phone);
    }
  }
  return invited;
}

function buildPhoneIndex(students) {
  const index = new Map();
  for (const student of students.values()) for (const phone of student.phones) {
    if (!index.has(phone)) index.set(phone, new Set());
    index.get(phone).add(student.alunoId);
  }
  return index;
}

function classifyPendingRequests(pending, approved, invited) {
  const approvedIndex = buildPhoneIndex(approved);
  const invitedIndex = buildPhoneIndex(invited);
  const summary = {
    total_pendente: pending.total,
    aprovaria_automaticamente: 0,
    aprovados_automaticamente: 0,
    revisao_manual: 0,
    nao_elegivel: 0,
    motivos: {},
    erro: null,
  };
  const approvalPhones = [];
  const addReason = reason => { summary.motivos[reason] = (summary.motivos[reason] || 0) + 1; };
  for (const request of pending.requests) {
    const phoneVariants = variants(request.phone);
    if (!phoneVariants.size) {
      summary.revisao_manual++;
      addReason('telefone_nao_disponivel');
      continue;
    }
    const approvedIds = new Set();
    const invitedIds = new Set();
    for (const phone of phoneVariants) {
      for (const id of approvedIndex.get(phone) || []) approvedIds.add(id);
      for (const id of invitedIndex.get(phone) || []) invitedIds.add(id);
    }
    const combined = new Set([...approvedIds, ...invitedIds]);
    if (combined.size === 1) {
      summary.aprovaria_automaticamente++;
      approvalPhones.push(request.phone);
      if (approvedIds.size && invitedIds.size) addReason('matricula_aprovada_e_represado_convidado');
      else if (approvedIds.size) addReason('matricula_aprovada');
      else addReason('represado_convidado');
    } else if (combined.size > 1) {
      summary.revisao_manual++;
      addReason('telefone_ambiguo');
    } else {
      summary.nao_elegivel++;
      addReason('sem_matricula_aprovada_ou_convite');
    }
  }
  return { summary, approvalPhones };
}

async function saveStatus(turmaId, result, startedAt) {
  const error = result.erro || null;
  const now = new Date().toISOString();
  const duration = Math.round((Date.now() - startedAt) / 100) / 10;
  await upsert('pedagogico_whatsapp_status', [{
    turma_id: turmaId,
    monitor: 'participantes',
    ultima_execucao: now,
    status: error ? 'erro' : 'ok',
    identificados: result.identificados || 0,
    novos: result.novos || 0,
    desconhecidos: result.desconhecidos || 0,
    ambiguos: result.ambiguos || 0,
    total_pendente: 0,
    aprovaria_automaticamente: 0,
    aprovados_automaticamente: 0,
    revisao_manual: 0,
    nao_elegivel: 0,
    motivos: {},
    erro: error,
    grupo: result.grupo || null,
    modo: write ? 'gravacao' : 'diagnostico',
    duracao_segundos: duration,
    atualizado_em: now,
  }], 'turma_id,monitor');
  const message = JSON.stringify({
    turma_id: turmaId,
    modo: write ? 'gravacao' : 'diagnostico',
    grupo: result.grupo || null,
    identificados: result.identificados || 0,
    novos: result.novos || 0,
    desconhecidos: result.desconhecidos || 0,
    ambiguos: result.ambiguos || 0,
    erro: error,
  });
  await upsert('integracao_status', [{
    fonte: `whatsapp_grupo:${turmaId}`,
    nome_exibicao: `WhatsApp · ${turmaId}`,
    ultima_sync: now,
    registros: result.identificados || 0,
    status: error ? 'erro' : 'ok',
    mensagem: message,
    duracao_segundos: duration,
    atualizado_em: now,
  }], 'fonte');
}

async function savePendingStatus(turmaId, summary, startedAt) {
  const now = new Date().toISOString();
  const duration = Math.round((Date.now() - startedAt) / 100) / 10;
  await upsert('pedagogico_whatsapp_status', [{
    turma_id: turmaId,
    monitor: 'solicitacoes',
    ultima_execucao: now,
    status: summary.erro ? 'erro' : 'ok',
    identificados: 0,
    novos: 0,
    desconhecidos: 0,
    ambiguos: 0,
    total_pendente: summary.total_pendente || 0,
    aprovaria_automaticamente: summary.aprovaria_automaticamente || 0,
    aprovados_automaticamente: summary.aprovados_automaticamente || 0,
    revisao_manual: summary.revisao_manual || 0,
    nao_elegivel: summary.nao_elegivel || 0,
    motivos: summary.motivos || {},
    erro: summary.erro || null,
    grupo: null,
    modo: write ? 'gravacao' : 'diagnostico',
    duracao_segundos: duration,
    atualizado_em: now,
  }], 'turma_id,monitor');
  await upsert('integracao_status', [{
    fonte: `whatsapp_solicitacoes:${turmaId}`,
    nome_exibicao: `WhatsApp solicitações · ${turmaId}`,
    ultima_sync: now,
    registros: summary.total_pendente || 0,
    status: summary.erro ? 'erro' : 'ok',
    mensagem: JSON.stringify(summary),
    duracao_segundos: duration,
    atualizado_em: now,
  }], 'fonte');
}

async function processTurma(client, turma) {
  const startedAt = Date.now();
  let result;
  try {
    if (!turma.link_grupo?.trim()) throw new Error('Turma ativa sem link_grupo cadastrado.');
    const { groupName, phones: headerPhones } = await client.openGroup(
      turma.link_grupo.trim(),
      turma.grupo_whatsapp,
    );
    const storedPhones = await client.readGroupParticipants(groupName);
    const groupPhones = new Set([...headerPhones, ...storedPhones]);
    if (!groupPhones.size) throw new Error('Nenhum telefone de participante disponivel no WhatsApp.');
    const [eligible, invited] = await Promise.all([
      buildEligibleStudents(turma.turma_id),
      buildInvitedStudents(turma.turma_id),
    ]);
    const confirmationCandidates = new Map();
    for (const source of [eligible, invited]) for (const [alunoId, student] of source) {
      if (!confirmationCandidates.has(alunoId)) {
        confirmationCandidates.set(alunoId, { alunoId, phones: new Set() });
      }
      const candidate = confirmationCandidates.get(alunoId);
      for (const phone of student.phones) candidate.phones.add(phone);
    }
    const phoneIndex = buildPhoneIndex(confirmationCandidates);

    let pendingSummary;
    const pendingStartedAt = Date.now();
    try {
      const pending = await client.readPendingRequests(groupName);
      const classification = classifyPendingRequests(pending, eligible, invited);
      pendingSummary = classification.summary;
      if (write && classification.approvalPhones.length) {
        try {
          const approval = await client.approvePendingRequests(groupName, classification.approvalPhones);
          pendingSummary.aprovados_automaticamente = approval.approved;
          if (approval.failed) pendingSummary.erro = `${approval.failed} pedido(s) elegível(is) não foram aprovados.`;
        } catch (approvalError) {
          pendingSummary.erro = String(approvalError?.message || approvalError).slice(0, 500);
        }
      }
    } catch (pendingError) {
      pendingSummary = {
        total_pendente: 0,
        aprovaria_automaticamente: 0,
        aprovados_automaticamente: 0,
        revisao_manual: 0,
        nao_elegivel: 0,
        motivos: {},
        erro: String(pendingError?.message || pendingError).slice(0, 500),
      };
    }
    await savePendingStatus(turma.turma_id, pendingSummary, pendingStartedAt);

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

    const existing = await get('pedagogico_confirmacoes', {
      select: 'aluno_id',
      turma_id: `eq.${turma.turma_id}`,
      origem: 'eq.grupo_whatsapp',
      limit: '1000',
    });
    const alreadyFromGroup = new Set(existing.map(row => String(row.aluno_id)));
    const newRows = [...matched.entries()]
      .filter(([alunoId]) => !alreadyFromGroup.has(alunoId))
      .map(([alunoId, phone]) => ({
        aluno_id: alunoId,
        turma_id: turma.turma_id,
        origem: 'grupo_whatsapp',
        telefone: phone,
        detalhes: { grupo: groupName, metodo: 'telefone_unico_whatsapp_web' },
        atualizado_em: new Date().toISOString(),
      }));
    if (write) await upsert('pedagogico_confirmacoes', newRows, 'aluno_id,turma_id,origem');

    result = {
      turma: turma.turma_id,
      grupo: groupName,
      participantes_com_telefone: groupPhones.size,
      inscritos_elegiveis: confirmationCandidates.size,
      identificados: matched.size,
      novos: newRows.length,
      desconhecidos: unknown,
      ambiguos: ambiguous,
      solicitacoes: pendingSummary,
      erro: null,
    };
  } catch (error) {
    result = {
      turma: turma.turma_id,
      grupo: null,
      participantes_com_telefone: 0,
      inscritos_elegiveis: 0,
      identificados: 0,
      novos: 0,
      desconhecidos: 0,
      ambiguos: 0,
      erro: String(error?.message || error).slice(0, 500),
    };
  }
  try {
    await saveStatus(turma.turma_id, result, startedAt);
  } catch (statusError) {
    result.erro = result.erro || `Falha ao gravar status: ${String(statusError?.message || statusError).slice(0, 300)}`;
  }
  console.log(JSON.stringify(result));
  return result;
}

const activeTurmas = await loadTurmas();
let pilots = selectPilots(activeTurmas);
if (requestedIds.length) {
  const requested = new Set(requestedIds.map(canonicalText));
  pilots = activeTurmas.filter(row => requested.has(canonicalText(row.turma_id)));
}
if (selection === 'pilot' && !pilots.length && !requestedIds.length) {
  throw new Error('Nenhuma turma piloto ativa encontrada.');
}

const results = [];
const firstBatch = requestedIds.length
  ? pilots
  : selection === 'pilot'
    ? pilots
    : activeTurmas.filter(row => row.link_grupo?.trim());
let client;
try {
  client = await CdpClient.connect().then(instance => instance.open());
} catch (error) {
  for (const turma of firstBatch) {
    const startedAt = Date.now();
    const result = {
      turma: turma.turma_id,
      grupo: null,
      participantes_com_telefone: 0,
      inscritos_elegiveis: 0,
      identificados: 0,
      novos: 0,
      desconhecidos: 0,
      ambiguos: 0,
      erro: String(error?.message || error).slice(0, 500),
    };
    try { await saveStatus(turma.turma_id, result, startedAt); } catch {}
    console.log(JSON.stringify(result));
    results.push(result);
  }
}

if (client) {
  try {
    for (const turma of firstBatch) results.push(await processTurma(client, turma));

  } finally {
    client.close();
  }
}

console.log(JSON.stringify({
  modo: write ? 'gravacao' : 'diagnostico',
  selecao: selection,
  turmas_processadas: results.map(result => result.turma),
  pilotos_aprovados: pilots.length > 0 && pilots.every(pilot => results.some(result => result.turma === pilot.turma_id && !result.erro)),
  total_identificados: results.reduce((sum, result) => sum + result.identificados, 0),
  total_novos: results.reduce((sum, result) => sum + result.novos, 0),
  total_desconhecidos: results.reduce((sum, result) => sum + result.desconhecidos, 0),
  erros: results.filter(result => result.erro).map(result => ({ turma: result.turma, erro: result.erro })),
}, null, 2));

if (results.some(result => result.erro)) process.exitCode = 1;
