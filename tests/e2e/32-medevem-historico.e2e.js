// Me devem puxa o histórico da compra: parcelas que já passaram pelas faturas geram alerta e um botão
// para atualizar (caso da TV em 24x, cadastrada antes). "Ligar à compra" já pergunta isso.
import * as L from './lib.js';
import {invoiceDates, txInvoiceKey} from '../../js/domain/cards.js';
import {addMonthsIso} from '../../js/domain/dates.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'MercadoPago', 5000, 1, 10);
  let d = await L.db(page);
  const card = d.cards[0], today = L.dayOffset(0), buy = L.monthKey(-11) + '-15';
  const dates = Array.from({length: 24}, (_, i) => addMonthsIso(buy, i));
  const passed = dates.filter(dt => invoiceDates(txInvoiceKey({date: dt}, card), card).due < today).length;
  await L.patchDb(page, `
    for (let i = 0; i < 24; i++) u.transactions.push({id: 'tv' + i, type: 'expense', amount: 66.20, category: 'compras', date: arg.dates[i], description: 'Tv (' + (i + 1) + '/24)',
      paymentMethod: 'cartao', cardId: arg.card, forOther: {person: 'Mãe', receivableId: 'rtv'}, createdAt: i,
      installment: {group: 'gtv', n: i + 1, total: 24, totalAmount: 1588.80, baseDescription: 'Tv'}});
    u.receivables.push({id: 'rtv', person: 'Mãe', kind: 'cartao', description: 'Tv', totalAmount: 1588.80, receivedAmount: 0, installments: 24, installmentAmount: 66.20,
      dueDate: arg.firstDue, linked: true, cardId: arg.card, createdAt: 1});
    u.transactions.push({id: 'old1', type: 'expense', amount: 300, category: 'compras', date: arg.oldDate, description: 'Fone', paymentMethod: 'cartao', cardId: arg.card, createdAt: 50});
    u.receivables.push({id: 'rjo', person: 'João', kind: 'combinado', description: 'Fone', totalAmount: 300, receivedAmount: 0, dueDate: null, createdAt: 51});
  `, {dates, card: card.id, firstDue: invoiceDates(txInvoiceKey({date: dates[0]}, card), card).due, oldDate: L.dayOffset(-70)});

  L.section('Alerta quando o recebido ficou para trás das faturas');
  await L.tab(page, 'receber');
  L.ok(passed >= 10, 'parcelas que já passaram pelas faturas: ' + passed);
  const tv = () => page.$eval('[data-recv-get="rtv"]', el => el.closest('.debt-card').textContent.replace(/\s+/g, ' '));
  L.ok(new RegExp(passed + ' de 24 parcela\\(s\\) dessa compra já passaram pelas faturas').test(await tv()), 'avisa quantas parcelas já passaram pelas faturas');
  await page.click('[data-recv-sync="rtv"]'); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Atualizar pelas faturas' && await page.$eval('input[name=prior][value=paid]', el => el.checked), 'pergunta se a pessoa já devolveu (padrão: sim)');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const r = d.receivables.find(x => x.id === 'rtv');
  L.ok(Math.abs(r.receivedAmount - passed * 66.20) < 0.01 && r.syncedParcels === passed, 'recebido atualizado pelas faturas (' + passed + ' × 66,20)');
  L.ok(r.payments.length === 1 && r.payments[0].fromInvoices, 'fica no histórico de recebimentos');
  const t2 = await tv();
  L.ok(!/dessa compra já passaram pelas faturas/.test(t2) && new RegExp('Parcela ' + (passed + 1) + ' de 24').test(t2) && !/atrasado/.test(t2), 'alerta some; próxima parcela certa e sem “atrasado”');
  L.ok(/já tinham vencido antes do cadastro e já foram acertadas/.test(t2), 'explica que as parcelas já foram acertadas');

  L.section('“Ligar à compra” já atualiza pelas faturas');
  await page.click('[data-recv-link="rjo"]'); await L.sleep(200);
  await L.setVal(page, '#lkTx', 't:old1');
  await L.submitModal(page); await L.sleep(300);
  L.ok(await L.modalTitle(page) === 'Atualizar pelas faturas', 'compra antiga: já abre a atualização pelas faturas');
  await page.click('input[name=prior][value=owed]');
  await L.submitModal(page); await L.sleep(300);
  d = await L.db(page);
  const jo = d.receivables.find(x => x.id === 'rjo');
  L.ok(jo.receivedAmount === 0 && jo.priorSettled.paid === false && jo.syncedParcels === 1, '“ainda me deve”: nada recebido, mas registra a escolha');
  L.ok(!/já passaram pelas faturas/.test(await page.$eval('[data-recv-get="rjo"]', el => el.closest('.debt-card').textContent)), 'e não alerta de novo');
});
