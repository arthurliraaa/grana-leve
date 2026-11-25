// Configuração rápida (primeiro uso): bancos e cartões, salário e outras coisas úteis, tudo pulável.
import * as L from './lib.js';

L.run(async ({page}) => {
  const email = await L.signup(page);
  const prefs = () => page.evaluate(key => JSON.parse(localStorage.getItem('granaleve_prefs_' + key) || '{}'), email.toLowerCase());

  L.section('Primeiros passos no Início');
  await L.tab(page, 'dashboard'); await L.sleep(300);
  L.ok(/0 de 4/.test(await L.text(page, '#firstSteps .fs-count')) && !!(await page.$('#firstSteps [data-setup]')) && !!(await page.$('#firstSteps [data-first-nosalary]')), 'o cartão tem 4 passos (inclui o salário), a “Configuração guiada” e o “Não tenho” do salário');

  L.section('Passo 1: bancos e cartões');
  await page.$eval('#firstSteps [data-setup]', e => e.click()); await L.sleep(500);
  L.ok(/Configuração rápida · passo 1 de 3/.test(await L.modalTitle(page)), 'a “Configuração guiada” abre o passo 1');
  await page.type('#sbName', 'Nubank'); await page.type('#sbBalance', '1500');
  await page.$eval('input[name=hasCard]', e => e.click()); await L.sleep(100);
  L.ok(await page.$eval('[data-sb="card"]', e => !e.hidden), 'marcar cartão mostra limite, fechamento e vencimento');
  await page.type('#sbLimit', '3000');
  await page.$eval('[data-setup-more]', e => e.click()); await L.sleep(300);
  L.ok(/dias da fatura|fechamento e vencimento vão de 1 a 31/i.test(await L.modalError(page)), 'faltando os dias da fatura, avisa e não salva');
  L.ok((await L.db(page)).accounts.length === 0, 'nada foi salvo ainda');
  await page.type('#sbClosing', '3'); await page.type('#sbDue', '10');
  await L.sleep(350);
  await page.$eval('[data-setup-more]', e => e.click()); await L.sleep(700);
  L.ok(/passo 1 de 3/.test(await L.modalTitle(page)) && /Nubank · conta e cartão/.test(await L.text(page, '#modalRoot')), '“adicionar outro banco” salva e volta ao passo 1 mostrando o que já foi adicionado');
  let d = await L.db(page);
  L.ok(d.accounts.length === 1 && d.accounts[0].initialBalance === 1500 && d.cards.length === 1 && d.cards[0].limit === 3000 && d.cards[0].closingDay === 3 && d.cards[0].dueDay === 10 && d.cards[0].accountId === d.accounts[0].id, 'o Nubank tem conta (R$ 1.500) e cartão (limite 3.000, fecha dia 3, vence dia 10) ligados');
  await page.type('#sbName', 'Inter');
  await page.$eval('input[name=hasAcc]', e => e.click());
  await page.$eval('input[name=hasCard]', e => e.click()); await L.sleep(100);
  await page.type('#sbLimit', '2000'); await page.type('#sbClosing', '5'); await page.type('#sbDue', '12');
  await L.submitModal(page); await L.sleep(700);
  d = await L.db(page);
  L.ok(d.accounts.length === 1 && d.cards.length === 2 && d.cards[1].name === 'Inter' && d.cards[1].accountId === null, 'o Inter entra só com cartão (sem conta) e o “Continuar” salva e segue');

  L.section('Passo 2: salário');
  L.ok(/passo 2 de 3/.test(await L.modalTitle(page)) && /Você recebe um salário fixo/.test(await L.text(page, '#modalRoot')), 'passo 2 pergunta pelo salário');
  await page.$eval('[data-setup-salary]', e => e.click()); await L.sleep(700);
  L.ok(/Meu salário/.test(await L.modalTitle(page)), '“Calcular o meu salário” abre o Meu salário');
  await L.closeModal(page); await L.sleep(700);
  L.ok(/passo 3 de 3/.test(await L.modalTitle(page)), 'ao fechar, o assistente segue para o passo 3');

  L.section('Passo 3: o resto, e “Não tenho salário”');
  L.ok(['vale', 'fixas', 'limites', 'metas', 'extrato', 'avisos'].every(async id => !!(await page.$('[data-setup-go="' + id + '"]'))) && await page.$$eval('[data-setup-go]', b => b.length) === 6, 'seis atalhos: vale, contas fixas, limites, metas, extrato e avisos');
  await page.$eval('[data-setup-go="vale"]', e => e.click()); await L.sleep(600);
  L.ok(!(await L.modalOpen(page)) && !(await page.$eval('#tab-cartoes', e => e.hidden)), 'tocar em “Vale-alimentação” fecha o assistente e abre Contas e cartões');
  let p = await prefs();
  L.ok(p.setupDone === true, 'a configuração fica marcada como feita');

  L.section('Sem salário fixo');
  await L.tab(page, 'perfil'); await L.sleep(300);
  await page.$eval('[data-setup]', e => e.click()); await L.sleep(500);
  await L.submitModal(page); await L.sleep(500);    // passo 1 vazio: segue
  L.ok(/passo 2 de 3/.test(await L.modalTitle(page)), 'com o passo 1 em branco, “Continuar” só segue');
  await page.$eval('[data-setup-nosalary]', e => e.click()); await L.sleep(500);
  L.ok(/passo 3 de 3/.test(await L.modalTitle(page)) && (await prefs()).noSalary === true, '“Não tenho salário fixo” guarda a escolha e segue');
  await L.submitModal(page); await L.sleep(500);
  L.ok(!(await L.modalOpen(page)) && /Tudo certo/.test(await L.lastToast(page)), '“Concluir” fecha e confirma');
  await L.tab(page, 'dashboard'); await L.sleep(300);
  L.ok(/(2|3) de 4/.test(await L.text(page, '#firstSteps .fs-count')) && await page.$$eval('#firstSteps li.done', l => l.length) >= 2, 'os Primeiros passos refletem: bancos e salário feitos');

  L.section('Celular');
  await page.setViewport({width: 375, height: 780, isMobile: true, hasTouch: true});
  await L.tab(page, 'perfil'); await L.sleep(300);
  await page.$eval('[data-setup]', e => e.click()); await L.sleep(500);
  L.ok(await L.noHorizontalScroll(page) && await page.$eval('#modalRoot .modal', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'o passo 1 cabe na tela do celular');
  L.ok(await page.evaluate(() => !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)), 'e o teclado não abre sozinho');
});
