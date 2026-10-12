// Entrar, criar conta e nova senha no modo com servidor, com o Supabase e o captcha SIMULADOS
// (as chamadas são interceptadas no navegador): nenhum e-mail sai e nenhuma conta é criada.
import * as L from './lib.js';

const AUTH = '/auth/v1/';
const NOW = () => Math.floor(Date.now() / 1000);
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const USER = {id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'ana@gmail.com',
  user_metadata: {name: 'Ana'}, app_metadata: {provider: 'email'}, created_at: '2026-10-01T00:00:00Z'};
function session(){
  const jwt = b64({alg: 'HS256', typ: 'JWT'}) + '.' + b64({sub: USER.id, role: 'authenticated', exp: NOW() + 3600, aud: 'authenticated'}) + '.assinatura';
  return {access_token: jwt, refresh_token: 'r1', token_type: 'bearer', expires_in: 3600, expires_at: NOW() + 3600, user: USER};
}
// Turnstile de mentira: aprova na hora e devolve um token novo a cada reset.
const TURNSTILE = `window.turnstile = (function(){ var w = {}, n = 0;
  function fire(id){ setTimeout(function(){ w[id] && w[id].callback && w[id].callback('tok-' + (++n)); }, 5); }
  return {render: function(el, o){ var id = 'w' + (++n); w[id] = o; fire(id); return id; },
    reset: function(id){ fire(id); }, remove: function(id){ delete w[id]; }};
})();`;

L.run(async ({page, errors}) => {
  // Respostas do servidor por rota; cada teste troca o que precisa. calls guarda o que o app pediu.
  const calls = [];
  const replies = {};
  const cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*'};
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (/challenges\.cloudflare\.com/.test(url)) return req.respond({status: 200, contentType: 'text/javascript', body: TURNSTILE});
    if (!/supabase\.co/.test(url)) return req.continue();
    if (req.method() === 'OPTIONS') return req.respond({status: 204, headers: cors});
    const path = new URL(url).pathname;
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch { /* sem corpo */ }
    calls.push({method: req.method(), path, body});
    const key = Object.keys(replies).find(k => path.includes(k));
    const r = key ? (typeof replies[key] === 'function' ? replies[key](body, req) : replies[key]) :
      path.includes('/rest/v1/profiles') ? {status: 200, body: [{name: 'Ana', role: 'user', blocked: false, research: null, created_at: '2026-10-01T00:00:00Z'}]} :
      path.includes('/rest/v1/rpc/') ? {status: 200, body: path.endsWith('is_admin') ? false : null} :
      path.includes('/rest/v1/') ? {status: 200, body: []} :
      path.includes(AUTH + 'logout') ? {status: 204, body: ''} :
      {status: 500, body: {msg: 'rota não simulada: ' + path}};
    if (r.redirect) return req.respond({status: 302, headers: {location: L.BASE + '?code=cod-google'}});
    req.respond({status: r.status, headers: {...cors, 'content-type': 'application/json'}, body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body)});
  });
  const err = (status, code, msg) => ({status, body: {code: status, error_code: code, msg}});
  const count = p => calls.filter(c => c.path.includes(p)).length;
  async function open(path){
    await page.goto('about:blank');
    await page.goto(L.BASE + (path || ''), {waitUntil: 'networkidle0'});
    await L.sleep(250);
  }
  await open();
  await page.evaluate(() => localStorage.clear());
  await open();
  L.ok(await page.evaluate(() => import('/js/data/store.js').then(m => m.Store.mode)) === 'supabase', 'app no modo com servidor (simulado)');

  L.section('Entrar e Criar conta numa janela sobre a página inicial');
  await page.click('.topbar [data-action="go-login"]'); await L.sleep(150);
  const overlay = await page.evaluate(() => ({auth: !document.getElementById('viewAuth').hidden, landing: !document.getElementById('viewLanding').hidden,
    inert: document.getElementById('viewLanding').closest('[inert]') !== null, focus: document.activeElement && document.activeElement.id,
    x: !!document.querySelector('#viewAuth [data-auth-close]')}));
  L.ok(overlay.auth && overlay.landing, 'a janela abre por cima e a página inicial continua atrás');
  L.ok(overlay.inert, 'o fundo fica inerte (o Tab não sai da janela)');
  L.ok(overlay.focus === 'loginEmail', 'o foco vai para o e-mail');
  L.ok(overlay.x, 'tem botão X para fechar');
  L.ok(await page.$eval('#googleBox', el => el.hidden), 'Google desligado no Supabase: o botão não aparece');
  await page.click('#viewAuth [data-auth-close]'); await L.sleep(100);
  L.ok(await page.$eval('#viewAuth', el => el.hidden) && await page.evaluate(() => document.getElementById('viewLanding').closest('[inert]') === null), 'o X fecha e devolve a página');
  await page.click('.topbar [data-action="go-signup"]'); await L.sleep(100);
  L.ok(!(await page.$eval('#signupForm', el => el.hidden)) && await page.evaluate(() => document.activeElement.id) === 'signupName', '“Criar conta” abre direto no cadastro');
  await page.keyboard.press('Escape'); await L.sleep(100);
  L.ok(await page.$eval('#viewAuth', el => el.hidden), 'Esc fecha a janela');
  await page.click('.topbar [data-action="go-login"]'); await L.sleep(100);
  await page.mouse.click(8, 450); await L.sleep(100);
  L.ok(await page.$eval('#viewAuth', el => el.hidden), 'clicar fora do cartão fecha');
  await page.setViewport({width: 360, height: 740});
  await page.click('.topbar [data-action="go-signup"]'); await L.sleep(150);
  L.ok(await L.noHorizontalScroll(page) && await page.$eval('.auth-card', el => el.getBoundingClientRect().right <= window.innerWidth), 'no celular, a janela cabe na tela');
  await page.setViewport({width: 1280, height: 900});

  L.section('Cadastro: e-mail com erro de digitação e confirmação dos 18 anos');
  replies['signup'] = () => ({status: 200, body: {...USER, email: calls.at(-1).body.email, confirmation_sent_at: new Date().toISOString()}});
  L.ok(await page.$$eval('#signupAge option', os => os.every(o => !o.value || !/^1[0-7]|menos|menor/.test(o.value + o.textContent))), 'faixa etária não oferece menores de 18');
  await page.type('#signupName', 'Jorge');
  await page.type('#signupEmail', 'seujorge@gmaill.com');
  await page.type('#signupPassword', 'senha@123');
  await page.click('#signupForm button[type=submit]'); await L.sleep(200);
  L.ok(await L.modalTitle(page) === 'Confira o seu e-mail' && /seujorge@gmail\.com/.test(await L.text(page, '#modalRoot')), 'gmaill.com: pergunta se quis dizer gmail.com');
  L.ok(count('signup') === 0, 'nada vai para o servidor antes de responder');
  await L.submitModal(page); await L.sleep(300);
  const sent = calls.filter(c => c.path.endsWith('/signup')).at(-1);
  L.ok(sent && sent.body.email === 'seujorge@gmail.com', 'o cadastro vai com o e-mail corrigido');
  L.ok(sent && sent.body.data.research.consent === false, 'sem marcar a pesquisa, o consentimento vai como “não”');
  L.ok(await L.modalTitle(page) === 'Confirme seu e-mail' && /1 hora/.test(await L.text(page, '#modalRoot')) && /Spam/.test(await L.text(page, '#modalRoot')), 'explica o link: validade de 1 hora e onde procurar');
  await L.closeModal(page);
  // De novo, agora marcando “Tenho 18 anos ou mais”.
  await page.click('[data-authtab="signup"]');
  await page.$eval('#signupEmail', el => { el.value = ''; });
  await page.type('#signupEmail', 'outra@gmail.com');
  await page.type('#signupPassword', 'senha@123');
  await page.$eval('#signupForm details.research-optin', d => { d.open = true; });
  await page.click('#signupResearch');
  L.ok(!(await page.$eval('#signupResearchProfile', el => el.hidden)), 'marcar a pesquisa mostra faixa etária e estado');
  await L.setVal(page, '#signupAge', '18-24');
  await page.click('#signupForm button[type=submit]'); await L.sleep(300);
  const sent2 = calls.filter(c => c.path.endsWith('/signup')).at(-1);
  L.ok(sent2.body.email === 'outra@gmail.com' && sent2.body.data.research.consent === true && sent2.body.data.research.ageRange === '18-24', 'marcando 18+ e o termo, o consentimento vai com a faixa etária');
  L.ok(!(await L.modalOpen(page)) || await L.modalTitle(page) === 'Confirme seu e-mail', 'e-mail sem erro de digitação não pergunta nada');
  await L.closeModal(page);

  L.section('Esqueci minha senha (sem estar logado)');
  await page.click('[data-authtab="login"]');
  await page.$eval('#loginEmail', el => { el.value = 'ana@gmail.com'; });
  replies['recover'] = {status: 200, body: {}};
  await page.click('#forgotBtn'); await L.sleep(150);
  L.ok(await page.$eval('#fpEmail', el => el.value) === 'ana@gmail.com', 'o e-mail digitado no login já vem preenchido');
  L.ok(/1 hora/.test(await L.text(page, '#modalRoot')) && /mais recente/.test(await L.text(page, '#modalRoot')), 'avisa a validade e que só o link mais recente vale');
  await L.submitModal(page); await L.sleep(300);
  L.ok(count('recover') === 1 && await L.modalTitle(page) === 'Confira o seu e-mail', 'pede o link e explica o próximo passo');
  await L.closeModal(page);
  await page.click('#forgotBtn'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(200);
  L.ok(count('recover') === 1 && /Espere \d+ segundos/.test(await L.modalError(page)) && /continua valendo/.test(await L.modalError(page)), 'pedir de novo logo em seguida não invalida o link: pede para esperar');
  await L.closeModal(page);
  await page.evaluate(() => localStorage.removeItem('granaleve_link_sent_v1'));
  replies['recover'] = err(429, 'over_email_send_rate_limit', 'For security purposes, you can only request this after 42 seconds.');
  await page.click('#forgotBtn'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(300);
  L.ok(/espere 42 segundos/i.test(await L.modalError(page)), 'limite do servidor: mostra quantos segundos faltam');
  await L.closeModal(page);
  await page.evaluate(() => localStorage.removeItem('granaleve_link_sent_v1'));
  replies['recover'] = err(429, 'over_email_send_rate_limit', 'email rate limit exceeded');
  await page.click('#forgotBtn'); await L.sleep(150);
  await L.submitModal(page); await L.sleep(300);
  L.ok(/muitos e-mails na última hora/.test(await L.modalError(page)), 'limite de e-mails do projeto: explica que não é culpa da pessoa');
  await L.closeModal(page);

  L.section('Login de conta sem confirmação');
  replies['token'] = err(400, 'email_not_confirmed', 'Email not confirmed');
  replies['resend'] = {status: 200, body: {}};
  await page.$eval('#loginPassword', el => { el.value = 'senha@123'; });
  await page.click('#loginForm button[type=submit]'); await L.sleep(400);
  L.ok(/Confirme seu e-mail/.test(await L.text(page, '#loginError')), 'explica que falta confirmar');
  await page.click('#loginError button'); await L.sleep(300);
  L.ok(count('resend') === 1 && await L.modalTitle(page) === 'Enviamos um novo link', 'oferece reenviar o link ali mesmo');
  await L.closeModal(page);

  L.section('Link de nova senha: troca antes de abrir a conta');
  replies['verify'] = () => ({status: 200, body: session()});
  replies['/auth/v1/user'] = (b) => !b ? {status: 200, body: USER} :
    b.password === 'senha@123' ? err(422, 'weak_password', 'Password is known to be weak and easy to guess, please choose a different one.') :
    b.password === 'igual@123' ? err(422, 'same_password', 'New password should be different from the old password.') :
    {status: 200, body: USER};
  await open('?token_hash=abc123&type=recovery');
  L.ok(await L.modalTitle(page) === 'Escolha a nova senha', 'abre a tela de nova senha');
  L.ok(await page.$eval('#viewApp', el => el.hidden), 'a conta ainda não abriu por trás');
  async function tryPass(p){
    await page.$eval('#npPass', el => { el.value = ''; }); await page.$eval('#npPass2', el => { el.value = ''; });
    await page.type('#npPass', p); await page.type('#npPass2', p);
    await L.submitModal(page); await L.sleep(400);
  }
  await tryPass('senha@123');
  L.ok(/não é aceita/.test(await L.modalError(page)), 'senha recusada por ser fácil/vazada: mensagem clara (antes era genérica)');
  await tryPass('igual@123');
  L.ok(/diferente da senha atual/.test(await L.modalError(page)), 'senha igual à antiga: mensagem clara');
  await tryPass('Nova#senha9');
  await page.waitForSelector('#viewApp:not([hidden])', {timeout: 5000}).catch(() => {});
  L.ok(!(await page.$eval('#viewApp', el => el.hidden)) && /Senha atualizada/.test(await L.allToasts(page)), 'senha aceita: a conta abre');
  await L.closeModal(page);
  await open('?token_hash=abc124&type=recovery');
  const outs = count('logout');
  await page.click('#modalRoot .modal-actions [data-modal-close]'); await L.sleep(400);
  L.ok(await page.$eval('#viewApp', el => el.hidden) && count('logout') > outs, 'cancelar encerra a sessão do link e a conta não abre');
  L.ok(/senha não foi trocada/.test(await L.allToasts(page)), 'avisa que a senha antiga continua');

  L.section('Links vencidos e troca de e-mail');
  replies['verify'] = err(403, 'otp_expired', 'Email link is invalid or has expired');
  await open('?token_hash=velho&type=recovery');
  L.ok(/só o do e-mail mais recente funciona/.test(await L.text(page, '#modalRoot')), 'link de senha vencido explica que só o mais recente vale');
  await L.closeModal(page);
  replies['verify'] = {status: 200, body: {msg: 'Confirmation link accepted. Please proceed to confirm link sent to the other email'}};
  await open('?token_hash=troca1&type=email_change');
  L.ok(await L.modalTitle(page) === 'Falta só mais uma confirmação' && /novo e-mail/.test(await L.text(page, '#modalRoot')), 'primeira confirmação da troca de e-mail explica o que falta');
  await L.closeModal(page);

  L.section('Entrar com o Google');
  replies['settings'] = {status: 200, body: {external: {google: true, email: true}}};
  replies['authorize'] = (b, req) => ({redirect: req.url()});
  replies['token'] = () => ({status: 200, body: session()});
  let authorizeUrl = '';
  page.on('request', req => { if (/\/auth\/v1\/authorize/.test(req.url())) authorizeUrl = req.url(); });
  await open();
  await page.click('.topbar [data-action="go-login"]'); await L.sleep(300);
  L.ok(!(await page.$eval('#googleBox', el => el.hidden)), 'Google ligado: aparece “Continuar com o Google”');
  await Promise.all([page.waitForNavigation({waitUntil: 'networkidle0'}).catch(() => {}), page.click('#googleBtn')]);
  await L.sleep(600);
  const au = new URL(authorizeUrl || 'http://x/');
  L.ok(au.searchParams.get('provider') === 'google' && au.searchParams.get('redirect_to') === L.BASE && au.searchParams.get('code_challenge'), 'vai para o Google com retorno ao app (PKCE)');
  await page.waitForSelector('#viewApp:not([hidden])', {timeout: 5000}).catch(() => {});
  L.ok(!(await page.$eval('#viewApp', el => el.hidden)) && /Bem-vindo\(a\), Ana/.test(await L.allToasts(page)), 'na volta, a conta abre e dá boas-vindas');
  L.ok(!/code=/.test(await page.evaluate(() => location.href)), 'o código sai do endereço');
  L.ok(calls.some(c => c.path.endsWith('/token') && c.body && c.body.auth_code === 'cod-google'), 'troca o código pela sessão');

  // Erros de rede/servidor simulados de propósito não contam como erro de JavaScript.
  errors.splice(0, errors.length, ...errors.filter(e => !/status of (4\d\d|500)|AuthApiError|AuthWeakPasswordError/i.test(e)));
});
