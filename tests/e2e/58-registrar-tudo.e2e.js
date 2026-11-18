// Me devem: registrar todos os recebimentos de uma pessoa ou de todas de uma vez, com “Desfazer”.
import * as L from './lib.js';

L.run(async ({page}) => {
  await L.signup(page);
  await L.patchDb(page, `
    u.receivables.push({id: 'r1', person: 'Ana', kind: 'emprestimo', description: 'Empréstimo', totalAmount: 100, receivedAmount: 0, dueDate: null, createdAt: 1});
    u.receivables.push({id: 'r2', person: 'Ana', kind: 'combinado', description: 'Pizza', totalAmount: 50, receivedAmount: 0, dueDate: null, createdAt: 2});
    u.receivables.push({id: 'r3', person: 'Beto', kind: 'combinado', description: 'Ingresso', totalAmount: 80, receivedAmount: 0, dueDate: null, createdAt: 3});`, null);
  await L.tab(page, 'receber');
  L.ok(!!(await page.$('[data-recv-get-all=""]')), 'botão para registrar o de todas as pessoas de uma vez');
  const recvd = async () => (await L.db(page)).receivables.map(r => r.receivedAmount);

  L.section('Uma pessoa');
  await page.click('[data-recv-get-all="ana"]'); await L.sleep(200);
  L.ok(/Registrar tudo de Ana/.test(await L.modalTitle(page)) && /R\$\s?150,00/.test(await L.text(page, '#modalRoot')), 'mostra o que vai registrar: Ana, 150');
  await L.submitModal(page); await L.sleep(400);
  L.ok(JSON.stringify(await recvd()) === JSON.stringify([100, 50, 0]), 'os dois recebimentos da Ana foram registrados e o do Beto não');
  await page.$eval('#toastWrap .toast-btn', el => el.click()); await L.sleep(800);
  L.ok(JSON.stringify(await recvd()) === JSON.stringify([0, 0, 0]), '“Desfazer” volta tudo');

  L.section('Todas as pessoas');
  await page.click('[data-recv-get-all=""]'); await L.sleep(200);
  L.ok(/Registrar todos os recebimentos/.test(await L.modalTitle(page)) && /R\$\s?230,00/.test(await L.text(page, '#modalRoot')), 'todos: 230');
  await L.submitModal(page); await L.sleep(400);
  L.ok(JSON.stringify(await recvd()) === JSON.stringify([100, 50, 80]), 'registrou os três de uma vez');
  L.ok(/Recebido/.test(await L.text(page, '#recvGrid')), 'cartões ficam como recebidos');
});
