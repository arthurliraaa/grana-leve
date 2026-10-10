// Modo com servidor (Supabase de verdade). Só roda com E2E_ONLINE=1, para não chamar o projeto
// real a cada push. Não cria contas e não envia e-mail.
import * as L from './lib.js';

if (!process.env.E2E_ONLINE){
  console.log('Pulado: defina E2E_ONLINE=1 para testar contra o Supabase de verdade.');
  process.exit(0);
}

L.run(async ({page, errors}) => {
  async function open(path){
    // Passa por uma página vazia: mudar só o #... não recarregaria o app.
    await page.goto('about:blank');
    await page.goto(L.BASE + (path || ''), {waitUntil: 'networkidle0'});
    await L.sleep(300);
  }
  await open();
  await page.evaluate(() => { localStorage.clear(); });

  L.section('Modo com servidor');
  await open();
  L.ok(await page.evaluate(() => import('/js/data/store.js').then(m => m.Store.mode)) === 'supabase', 'app usa o Supabase');
  await page.click('[data-action="go-signup"]');
  L.ok(!(await page.$eval('.storage-online', el => el.hidden)) && await page.$eval('.storage-notice[data-local-only]', el => el.hidden), 'cadastro mostra o aviso da conta online, não o do navegador');
  await page.click('[data-authtab="login"]');
  L.ok(!(await page.$eval('#forgotBtn', el => el.hidden)), 'login tem “Esqueci minha senha”');

  L.section('Link de e-mail vencido ou já usado');
  await open('?token_hash=pkce_0000000000000000000000000000&type=email');
  L.ok(await L.modalTitle(page) === 'Este link expirou ou já foi usado', 'token inválido mostra a mensagem amigável (não o JSON do servidor)');
  L.ok(!/token_hash/.test(await page.evaluate(() => location.href)), 'o token sai do endereço');
  L.ok(await page.$('#lkEmail') !== null && /Enviar novo link/.test(await L.text(page, '#modalRoot')), 'oferece reenviar a confirmação');
  await L.closeModal(page);
  await open('?token_hash=pkce_0000000000000000000000000000&type=recovery');
  L.ok(/Pedir um novo link/.test(await L.text(page, '#modalRoot')), 'link de senha vencido oferece pedir outro');
  await L.closeModal(page);
  await open('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  L.ok(await L.modalTitle(page) === 'Este link expirou ou já foi usado', 'erro no formato antigo (#error=...) também vira a mensagem amigável');
  await L.closeModal(page);

  L.section('Privacidade e termos da versão online');
  await page.click('[data-info="privacidade"]'); await L.sleep(150);
  const priv = await L.text(page, '#modalRoot');
  L.ok(/Supabase, na região São Paulo/.test(priv) && /administração do app, leiam seus lançamentos/.test(priv) && /art\. 18/.test(priv), 'privacidade fala do servidor, de quem vê e dos direitos');
  L.ok(!/somente neste navegador/.test(priv), 'não diz mais que os dados ficam só no navegador');
  await L.closeModal(page);
  await page.click('[data-info="termos"]'); await L.sleep(150);
  L.ok(/precisa de internet/.test(await L.text(page, '#modalRoot')), 'termos falam da necessidade de internet');
  await L.closeModal(page);

  L.section('Sem internet');
  L.ok(await page.$eval('#offlineBar', el => el.hidden), 'com internet, sem aviso');
  await page.setOfflineMode(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await L.sleep(150);
  L.ok(!(await page.$eval('#offlineBar', el => el.hidden)) && /Sem internet/.test(await L.text(page, '#offlineBar')), 'sem internet, aparece o aviso');
  await page.click('[data-authtab="login"]').catch(() => {});
  await page.click('[data-action="go-login"]').catch(() => {});
  await L.sleep(100);
  await page.type('#loginEmail', 'ninguem@teste.com'); await page.type('#loginPassword', 'senha@123');
  await page.click('#loginForm button[type=submit]'); await L.sleep(1500);
  L.ok(/Sem conexão/.test(await L.text(page, '#loginError')), 'login sem internet explica que falta conexão');
  await page.setOfflineMode(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await L.sleep(150);
  L.ok(await page.$eval('#offlineBar', el => el.hidden), 'internet de volta, o aviso some');
  // Erros de rede esperados neste teste não contam como erro de JavaScript.
  errors.splice(0, errors.length, ...errors.filter(e => !/Failed to fetch|ERR_INTERNET_DISCONNECTED|AuthRetryableFetchError/i.test(e)));
});
