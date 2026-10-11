// Cobrança compartilhada sincronizada entre duas contas. O servidor é simulado na página (mesmas
// regras das funções shared_charge_* do banco, testadas de verdade em npm run test:db); a "outra
// pessoa" age mexendo direto nas linhas simuladas.
import * as L from './lib.js';

const FAKE = () => (async () => {
  const {Store} = await import('/js/data/store.js');
  const me = JSON.parse(localStorage.getItem('granaleve_session_v1')).emailKey;
  const now = () => new Date().toISOString();
  const S = window.__srv = {rows: {}, calls: []};
  const ev = (by, kind, amount, date, status) => ({id: crypto.randomUUID(), by, kind, amount, date: date || new Date().toISOString().slice(0, 10), at: now(), status});
  const err = (m) => Object.assign(new Error(m), {userMessage: m});
  Store.sharedSave = async (id, c) => {
    S.calls.push(['save', id]);
    if (!id){ id = crypto.randomUUID(); S.rows[id] = {id, creditor_id: me, debtor_id: null, token: c.token, events: [], creditor_seen_at: now(), debtor_seen_at: null}; }
    Object.assign(S.rows[id], {creditor_name: c.creditorName, debtor_label: c.debtorLabel, description: c.description, total: c.total, received: Math.min(c.received, c.total),
      installments: c.installments, installment_amount: c.installmentAmount, due_date: c.dueDate, pix: c.pix});
    return id;
  };
  Store.sharedAccept = async (id, token) => {
    const r = S.rows[id];
    if (!r || r.token !== token) throw err('Cobrança não encontrada.');
    if (r.creditor_id === me) throw err('Esta cobrança é sua: envie o link para quem deve.');
    r.debtor_id = me; r.debtor_seen_at = now(); r.events.push(ev('debtor', 'accepted', null, null, 'done'));
    const out = Object.assign({}, r); delete out.token; return out;
  };
  Store.sharedEvent = async (id, kind, amount, date, ref) => {
    const r = S.rows[id]; S.calls.push(['event', kind, amount]);
    const side = r.creditor_id === me ? 'creditor' : 'debtor';
    if (side === 'debtor' && kind === 'paid'){ const e = ev('debtor', 'paid', amount, date, 'pending'); r.events.push(e); return e; }
    if (side === 'creditor' && kind === 'received'){ r.received = Math.min(r.total, r.received + amount); const e = ev('creditor', 'received', amount, date, 'done'); r.events.push(e); return e; }
    if (side === 'creditor' && kind === 'unreceived'){ r.received = Math.max(0, r.received - amount); const e = ev('creditor', 'unreceived', amount, date, 'done'); r.events.push(e); return e; }
    const e = r.events.find(x => x.id === ref && x.kind === 'paid' && x.status === 'pending');
    if (!e) throw err('Aviso não encontrado ou já resolvido.');
    e.status = kind === 'confirm' ? 'confirmed' : kind === 'reject' ? 'rejected' : 'cancelled'; e.decided_at = now();
    if (kind === 'confirm') r.received = Math.min(r.total, r.received + e.amount);
    return {id: ref, status: e.status, amount: e.amount};
  };
  Store.sharedList = async () => Object.values(S.rows).filter(r => r.creditor_id === me || r.debtor_id === me).map(r => JSON.parse(JSON.stringify(r)));
  Store.sharedSeen = async (id) => { const r = S.rows[id]; if (r.creditor_id === me) r.creditor_seen_at = now(); if (r.debtor_id === me) r.debtor_seen_at = now(); };
  Store.sharedLeave = async (id) => { S.calls.push(['leave', id]); const r = S.rows[id]; if (r.creditor_id === me) delete S.rows[id]; else { r.debtor_id = null; } };
})();
// A outra pessoa agindo no servidor simulado.
const other = (page, fn, arg) => page.evaluate(new Function('arg', `const S = window.__srv; const now = () => new Date().toISOString();
  const ev = (by, kind, amount, status) => ({id: crypto.randomUUID(), by, kind, amount, date: new Date().toISOString().slice(0, 10), at: now(), status}); ${fn}`), arg);
const sync = (page) => page.evaluate(async () => { (await import('/js/ui/shared-sync.js')).syncShared(); });

L.run(async ({page}) => {
  await L.signup(page);
  await L.patchDb(page, `u.receivables = [{id: 'r1', person: 'Gessi Lira', kind: 'cartao', description: 'TV', totalAmount: 1200, receivedAmount: 0,
    installments: 12, installmentAmount: 100, dueDate: arg, urgency: 'media', createdAt: 1}];`, L.dayOffset(-5));
  await page.evaluate(FAKE);
  await L.tab(page, 'receber');

  L.section('Quem cobra: compartilhar cria a cobrança no servidor');
  await page.$eval('[data-recv-share="r1"]', el => el.click()); await L.sleep(300);
  const link = await page.$eval('#shareLink', el => el.value);
  const payload = JSON.parse(Buffer.from(link.split('#/cobranca/')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  let r1 = (await L.db(page)).receivables[0];
  L.ok(r1.sharedId && payload.sid === r1.sharedId && r1.shareRef.length >= 24 && payload.ref === r1.shareRef, 'link leva o id da cobrança e um segredo forte');
  L.ok(/acompanham juntos|Quando Gessi aceitar/.test(await L.text(page, '#modalRoot')), 'explica o acompanhamento');
  await L.closeModal(page);
  L.ok(/esperando Gessi aceitar/.test(await L.text(page, '#recvGrid')), 'cartão mostra que espera a pessoa aceitar');

  L.section('Novidades no login: aceitou e avisou que pagou');
  await other(page, `const r = S.rows[arg]; r.debtor_id = 'gessi'; r.events.push(ev('debtor', 'accepted', null, 'done')); r.events.push(ev('debtor', 'paid', 100, 'pending'));`, r1.sharedId);
  await sync(page); await L.sleep(400);
  L.ok(await L.modalTitle(page) === 'Novidades das cobranças compartilhadas', 'abre a janela de novidades');
  let body = await L.text(page, '#modalRoot');
  L.ok(/Gessi aceitou a cobrança/.test(body) && /Gessi avisou que pagou R\$\s?100,00/.test(body), 'mostra que aceitou e o aviso de pagamento');
  await page.$eval('#modalRoot [data-sc="ok"]', el => el.click()); await L.sleep(400);
  L.ok(/Confirmado: R\$\s?100,00 registrado/.test(await L.text(page, '#modalRoot')), 'confirmar marca na hora');
  await L.closeModal(page);
  r1 = (await L.db(page)).receivables[0];
  let row = await page.evaluate((id) => window.__srv.rows[id], r1.sharedId);
  L.ok(r1.receivedAmount === 100 && r1.payments.some(p => p.fromShared === 'Gessi') && row.received === 100, 'recebimento entra aqui e no servidor');
  L.ok(/Acompanhando com Gessi/.test(await L.text(page, '#recvGrid')), 'cartão mostra que acompanham juntos');

  L.section('Quem cobra registra um recebimento');
  await page.$eval('[data-recv-get="r1"]', el => el.click()); await L.sleep(200);
  await L.submitModal(page); await L.sleep(300);
  row = await page.evaluate((id) => window.__srv.rows[id], r1.sharedId);
  L.ok(row.received === 200 && row.events.some(e => e.kind === 'received' && e.amount === 100), 'avisa o servidor (a outra pessoa vê no login)');

  L.section('Aviso pendente fica no cartão; “Não recebi”');
  await L.sleep(20);
  await other(page, `S.rows[arg].events.push(ev('debtor', 'paid', 100, 'pending'));`, r1.sharedId);
  await page.evaluate(async () => { (await import('/js/ui/shared-sync.js')).syncShared({quiet: true}); }); await L.sleep(400);
  L.ok(!(await L.modalOpen(page)), 'só aviso pendente já visto: não abre janela no modo discreto');
  L.ok(/Gessi avisou que pagou R\$\s?100,00/.test(await L.text(page, '#recvGrid')), 'o aviso aparece no cartão');
  await page.$eval('[data-shared-pending="r1"]', el => el.click()); await L.sleep(300);
  await page.$eval('#modalRoot [data-sc="no"]', el => el.click()); await L.sleep(300);
  await L.closeModal(page);
  row = await page.evaluate((id) => window.__srv.rows[id], r1.sharedId);
  L.ok(row.events.some(e => e.status === 'rejected') && row.received === 200 && (await L.db(page)).receivables[0].receivedAmount === 200, '“Não recebi” recusa o aviso e não muda o recebido');

  L.section('Quem deve: aceitar e avisar pagamento');
  const sid = await other(page, `const id = crypto.randomUUID(); S.rows[id] = {id, creditor_id: 'ana', debtor_id: null, token: 'tok-1234567890abcdef1234', creditor_name: 'Ana Souza',
    description: 'Show', total: 300, received: 0, installments: 3, installment_amount: 100, due_date: null, pix: 'ana@pix', events: [], creditor_seen_at: now(), debtor_seen_at: null}; return id;`);
  await page.evaluate(async (sid) => { const m = await import('/js/ui/share-charge.js');
    m.acceptCharge(m.parsePayload({t: 'granaleve-cobranca', v: 1, ref: 'tok-1234567890abcdef1234', sid, from: 'Ana Souza', person: 'Eu', desc: 'Show', total: 300, received: 0, at: '2026-10-11'})); }, sid);
  await L.sleep(300);
  L.ok(/Vocês vão acompanhar juntos/.test(await L.text(page, '#modalRoot')), 'ao aceitar, explica que vão acompanhar juntos');
  await L.submitModal(page); await L.sleep(500);
  await L.closeModal(page);
  let debt = (await L.db(page)).debts.find(d => d.shared && d.shared.sid === sid);
  L.ok(debt && debt.totalAmount === 300 && debt.monthlyPayment === 100 && (await page.evaluate((id) => window.__srv.rows[id].debtor_id, sid)) !== null, 'dívida ligada à cobrança do servidor');
  await L.tab(page, 'dividas');
  L.ok(/Acompanhando com Ana/.test(await L.text(page, '#debtGrid')), 'cartão da dívida mostra o acompanhamento');
  await page.$eval('[data-debt-pay="' + debt.id + '"]', el => el.click()); await L.sleep(200);
  await page.$eval('input[name=expense]', el => { if (el.checked) el.click(); });
  await L.submitModal(page); await L.sleep(400);
  row = await page.evaluate((id) => window.__srv.rows[id], sid);
  debt = (await L.db(page)).debts.find(d => d.id === debt.id);
  const pend = row.events.find(e => e.kind === 'paid' && e.status === 'pending');
  L.ok(pend && pend.amount === 100 && debt.payments[0].sharedEvent === pend.id && debt.paidAmount === 100, 'pagamento vira aviso pendente para Ana confirmar');
  L.ok(/esperando Ana confirmar/.test(await L.text(page, '#debtGrid')), 'mostra que espera a confirmação');

  L.section('Quem deve vê as novidades no login');
  await other(page, `const r = S.rows[arg]; const e = r.events.find(x => x.kind === 'paid' && x.status === 'pending'); e.status = 'confirmed'; e.decided_at = now();
    r.received = 100; r.events.push(ev('creditor', 'received', 50, 'done')); r.received = 150;`, sid);
  await sync(page); await L.sleep(400);
  body = await L.text(page, '#modalRoot');
  L.ok(/Ana confirmou o seu pagamento de R\$\s?100,00/.test(body) && /Ana registrou que recebeu R\$\s?50,00/.test(body), 'avisa a confirmação e o recebimento registrado por Ana');
  await L.closeModal(page);
  debt = (await L.db(page)).debts.find(d => d.id === debt.id);
  L.ok(debt.paidAmount === 150 && debt.payments.some(p => p.fromShared === 'Ana' && p.amount === 50), 'já pago acompanha o servidor (100 + 50) e o recebimento de Ana entra no histórico');
  await page.$eval('[data-debt-pay="' + debt.id + '"]', el => el.click()); await L.sleep(200);
  await page.$eval('input[name=expense]', el => { if (el.checked) el.click(); });
  await L.submitModal(page); await L.sleep(400);
  await other(page, `const r = S.rows[arg]; const e = r.events.find(x => x.kind === 'paid' && x.status === 'pending'); e.status = 'rejected'; e.decided_at = now();`, sid);
  await sync(page); await L.sleep(400);
  L.ok(/Ana disse que não recebeu o pagamento de R\$\s?100,00/.test(await L.text(page, '#modalRoot')), 'avisa quando Ana diz que não recebeu');
  await L.closeModal(page);
  debt = (await L.db(page)).debts.find(d => d.id === debt.id);
  L.ok(debt.paidAmount === 150 && debt.payments.some(p => p.rejected && p.undone), 'o valor volta para “falta” e o pagamento fica marcado');

  L.section('Excluir sai da cobrança');
  await page.$eval('[data-debt-del="' + debt.id + '"]', el => el.click()); await L.sleep(200);
  await L.submitModal(page); await L.sleep(300);
  L.ok((await page.evaluate(() => window.__srv.calls)).some(c => c[0] === 'leave' && c[1] === sid), 'excluir a dívida sai da cobrança no servidor');
});
