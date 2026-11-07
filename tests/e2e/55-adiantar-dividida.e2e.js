// Adiantar parcelas de compra dividida (A2-02): o lançamento do adiantamento leva a divisão da compra.
// Sem desconto, "seus gastos" e "de outras pessoas" continuam iguais; com desconto, ficam proporcionais
// e fecham no centavo.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.addCard(page, 'Inter', 5000, 3, 10);
  const card = (await L.db(page)).cards[0];
  const today = L.dayOffset(0);
  // Compra de hoje em 3x: a 1ª parcela já caiu, as outras duas ainda vão cair.
  await L.patchDb(page, `
    u.receivables = u.receivables || [];
    const buy = (g, total, parts, split, extra) => {
      u.receivables.push({id: 'r' + g, person: split.people[0].person, description: g, totalAmount: total - split.mine, receivedAmount: 0, payments: [], createdAt: 1});
      parts.forEach((amount, i) => u.transactions.push(Object.assign({id: g + (i + 1), type: 'expense', amount, category: 'lazer', date: arg.dates[i], purchaseDate: arg.dates[0],
        description: g + ' (' + (i + 1) + '/3)', paymentMethod: 'cartao', cardId: arg.card, createdAt: 1 + i,
        installment: {group: g, n: i + 1, total: 3, totalAmount: total, baseDescription: g}, split}, extra)));
    };
    buy('TV', 300, [100, 100, 100], {total: 300, mine: 150, people: [{person: 'Ana', receivableId: 'rTV', amount: 150}]});
    buy('Sofa', 300, [100, 100, 100], {total: 300, mine: 100, people: [{person: 'Bia', receivableId: 'rSofa', amount: 200}]});
  `, {card: card.id, dates: [today, L.plusMonths(today, 1), L.plusMonths(today, 2)]});

  const shares = () => page.evaluate(async () => {
    const {myShare, othersShare} = await import('/js/domain/transactions.js');
    const {sumMoney} = await import('/js/domain/money.js');
    const s = JSON.parse(localStorage.getItem('granaleve_session_v1'));
    const tx = JSON.parse(localStorage.getItem('granaleve_local_db_v1')).users[s.emailKey].transactions;
    const of = g => tx.filter(t => (t.installment && t.installment.group === g) || (t.installmentAdvance && t.installmentAdvance.group === g));
    const r = {};
    for (const g of ['TV', 'Sofa']){
      const l = of(g);
      r[g] = {mine: sumMoney(l, myShare), others: sumMoney(l, othersShare), total: sumMoney(l, t => t.amount), adv: l.find(t => t.installmentAdvance) || null};
    }
    return r;
  });
  const advance = async (group, paid) => {
    await L.tab(page, 'cartoes'); await L.sleep(150);
    await page.$eval('[data-adv-group="' + group + '"]', el => el.click()); await L.sleep(200);
    L.ok(await L.modalTitle(page) === 'Adiantar pagamento', group + ': abre “Adiantar pagamento”');
    await L.setVal(page, '#advCount', '2');
    if (paid){
      await page.$eval('#modalRoot input[name=disc][value=sim]', el => el.click()); await L.sleep(80);
      await L.setVal(page, '#advPaid', paid);
    }
    await L.submitModal(page); await L.sleep(300);
  };

  L.section('Sem desconto: 300 em 3x dividida 50/50, adiantando as 2 últimas');
  await advance('TV');
  let s = await shares();
  L.ok(s.TV.adv && s.TV.adv.amount === 200 && s.TV.adv.split && s.TV.adv.split.total === 200 && s.TV.adv.split.mine === 100 && s.TV.adv.split.people[0].receivableId === 'rTV', 'o adiantamento (200) leva a divisão da compra: 100 seus (' + JSON.stringify(s.TV.adv && s.TV.adv.split) + ')');
  L.ok(s.TV.mine === 150, '“seus gastos” somam 150 (' + s.TV.mine + ')');
  L.ok(s.TV.others === 150, '“de outras pessoas” somam 150 (' + s.TV.others + ')');
  L.ok(s.TV.total === 300, 'total continua 300');

  L.section('Com desconto: 300 em 3x (100 seus, 200 de Bia), 2 últimas pagas por 99,99');
  await advance('Sofa', '99,99');
  s = await shares();
  L.ok(s.Sofa.adv && s.Sofa.adv.amount === 99.99 && s.Sofa.adv.split, 'o adiantamento (99,99) leva a divisão');
  const advMine = await page.evaluate(async t => (await import('/js/domain/transactions.js')).myShare(t), s.Sofa.adv);
  const advOthers = await page.evaluate(async t => (await import('/js/domain/transactions.js')).othersShare(t), s.Sofa.adv);
  L.ok(advMine === 33.33 && advOthers === 66.66, 'parte de cada um proporcional: 33,33 seus e 66,66 de Bia (' + advMine + ' / ' + advOthers + ')');
  L.ok(Math.round((advMine + advOthers) * 100) === 9999, 'as duas partes fecham no centavo com o valor pago');
  L.ok(s.Sofa.total === 199.99 && Math.round((s.Sofa.mine + s.Sofa.others) * 100) === 19999 && Math.abs(s.Sofa.mine - 66.66) < 0.015,
    'na compra toda (100 + 99,99): cerca de 66,66 seus, e seus + de outras pessoas = 199,99 (' + s.Sofa.mine + ' + ' + s.Sofa.others + ')');

  L.section('Depois de recarregar');
  await L.reload(page);
  s = await shares();
  L.ok(s.TV.mine === 150 && s.TV.others === 150, 'continua 150 / 150');
});
