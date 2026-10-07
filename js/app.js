(function(){
  "use strict";

  /* ============ Constants ============ */
  var DEFAULT_EXPENSE_CATS = [
    {id:'moradia', label:'Moradia', color:'var(--cat-1)'},
    {id:'alimentacao', label:'Alimentação', color:'var(--cat-2)'},
    {id:'transporte', label:'Transporte', color:'var(--cat-3)'},
    {id:'lazer', label:'Lazer', color:'var(--cat-4)'},
    {id:'saude', label:'Saúde', color:'var(--cat-5)'},
    {id:'educacao', label:'Educação', color:'var(--cat-6)'},
    {id:'compras', label:'Compras', color:'var(--cat-7)'},
    {id:'dividas', label:'Dívidas', color:'var(--cat-9)'},
    {id:'outros', label:'Outros', color:'var(--cat-8)'}
  ];
  var DEFAULT_INCOME_CATS = [
    {id:'salario', label:'Salário'},
    {id:'freelance', label:'Freelance / Extra'},
    {id:'presente', label:'Presente / Ajuda'},
    {id:'recebimento', label:'Recebimento de terceiros'},
    {id:'outros_receita', label:'Outros'}
  ];
  var CUSTOM_COLORS = ['#2a9d8f','#8e6cc2','#c2577a','#4f7cac','#b0883a','#5a9e4b','#d0703d','#6b7280'];
  var PAYMENT_LABELS = {conta:'Dinheiro, Pix ou débito', vale:'Vale-alimentação / refeição', cartao:'Cartão de crédito'};
  var DEBT_KINDS = [
    {id:'banco', label:'Banco ou cartão'},
    {id:'emprestimo', label:'Empréstimo'},
    {id:'pessoal', label:'Pessoal (amigo ou familiar)'},
    {id:'financiamento', label:'Financiamento'},
    {id:'outro', label:'Outro'}
  ];
  var RECV_KINDS = [
    {id:'emprestimo', label:'Empréstimo que fiz'},
    {id:'cartao', label:'Compra no meu cartão'},
    {id:'combinado', label:'Valor combinado'},
    {id:'outro', label:'Outro'}
  ];
  var TIPS = [
    {tag:'Planejamento mensal', title:'Monte seu mês em 15 minutos',
     text:'Antes do dia 5, liste sua renda e separe em três blocos: essencial (moradia, contas, transporte), desejado (lazer, compras) e futuro (poupança, dívidas). Uma referência comum é 50/30/20. Ajuste à sua realidade, mas trate a poupança como parcela fixa, não como o que sobra no fim do mês.'},
    {tag:'Organização de gastos', title:'Registre na hora, não depois',
     text:'Na nossa pesquisa, 26 em cada 48 pessoas disseram esquecer de anotar gastos. O hábito quebra quando a gente deixa para depois. Anote o gasto assim que ele acontece, mesmo só com valor e categoria; ajustar detalhes depois é fácil, lembrar o gasto no fim da semana não é.'},
    {tag:'Cartão de crédito', title:'O limite do cartão não é renda',
     text:'O limite é crédito, não dinheiro seu: vira dívida se a fatura não for paga inteira. Antes de parcelar, pergunte: eu compraria isso à vista? Se a resposta for não, o parcelamento provavelmente está cobrindo uma compra que não cabia no orçamento.'},
    {tag:'Como economizar', title:'Pague-se primeiro',
     text:'Assim que o dinheiro entra, separe o valor da meta antes de gastar com qualquer outra coisa, mesmo que seja pouco. Poupar o que sobra raramente funciona porque quase sempre sobra pouco; poupar primeiro inverte essa lógica.'},
    {tag:'Sair das dívidas', title:'Ataque a dívida mais cara primeiro',
     text:'Liste as dívidas com a taxa de juros de cada uma. Pague o mínimo de todas, mas destine qualquer valor extra para quitar antes a de juros mais alto, geralmente o cartão de crédito. Isso reduz o total pago em juros mais rápido.'}
  ];
  var TIPS_GROW = [
    {tag:'Primeiro passo', title:'Reserva de emergência antes de investir',
     text:'Antes de buscar rendimento alto, junte o equivalente a 3 a 6 meses dos seus gastos essenciais em um lugar seguro e que permita sacar a qualquer momento. É ela que evita entrar no cheque especial quando surge um imprevisto.'},
    {tag:'Onde guardar', title:'Poupança não é a única opção',
     text:'Tesouro Selic e CDBs de liquidez diária que pagam 100% do CDI ou mais costumam render mais que a poupança, com risco baixo. CDBs têm proteção do FGC até R$ 250 mil por instituição. Compare sempre o rendimento já descontado o imposto.'},
    {tag:'Juros compostos', title:'O tempo trabalha a seu favor',
     text:'Guardar R$ 100 por mês a 0,8% ao mês vira cerca de R$ 7.600 em 5 anos, sendo uns R$ 1.600 só de rendimento. Começar cedo, mesmo com pouco, faz mais diferença do que começar tarde com muito.'},
    {tag:'Cuidado', title:'Desconfie de promessa de lucro fácil',
     text:'Rendimento garantido muito acima do mercado, pressão para decidir rápido e ganho por indicar amigos são sinais clássicos de golpe (pirâmide). Na dúvida, não invista no que você não consegue explicar.'},
    {tag:'Diversificar', title:'Não coloque tudo no mesmo lugar',
     text:'Depois da reserva pronta, dividir o dinheiro entre tipos diferentes de investimento (renda fixa de prazos diferentes, por exemplo) reduz o risco de um único problema afetar tudo o que você juntou.'}
  ];
  var HOW_TO = [
    ['Painel', 'mostra o resumo do mês: saldo, ganhos, gastos, previsões de entrada e gráficos. O botão “Relatório em PDF” gera um resumo para guardar ou compartilhar.'],
    ['Ganhos e gastos', 'é onde você anota o que entra e o que sai e deixa previsto o que ainda vai receber. Escolha a forma de pagamento (dinheiro/Pix, vale ou cartão) e crie categorias próprias em “Minhas categorias”.'],
    ['Cartões e vale', 'cadastre o cartão com limite, fechamento e vencimento e o seu vale-alimentação. Os gastos no cartão entram sozinhos na fatura do mês certo, e os do vale descontam do saldo.'],
    ['Planejar gastos', 'defina quanto quer gastar por categoria. A barra fica amarela perto do valor planejado e vermelha quando passa.'],
    ['Metas', 'crie objetivos com prazo, guarde valores aos poucos e escolha em “Me avise em” quando quer um lembrete na sua agenda.'],
    ['Dívidas', 'registre o que você deve, para banco ou para pessoas, e marque cada parcela paga.'],
    ['A receber', 'anote o que te devem e use “Cobrar” para enviar uma mensagem pronta.'],
    ['Botão +', 'fica sempre no canto da tela e abre o formulário para lançar um gasto ou ganho. Para corrigir um lançamento, toque no lápis ao lado dele.'],
    ['Chat de lançamento', 'aparece ao entrar, uma vez por dia, e também pelo link “Lance pelo chat” no botão +. Escreva como numa conversa: “gastei 30 no mercado e 20 no uber”.'],
    ['Conexões', 'mostra as integrações: app no celular e Google Agenda (já disponíveis), WhatsApp e Open Finance (em preparação).'],
    ['Backup dos dados', 'fica no rodapé. Salve um arquivo de backup de vez em quando: seus dados ficam só neste navegador.']
  ];
  var OPEN_FINANCE_BANKS = ['Nubank','Itaú','Bradesco','Banco do Brasil','Caixa','Santander','Inter','C6 Bank','Mercado Pago','PicPay'];
  var INFO_PAGES = {
    'sobre': {title:'Sobre o projeto', body:
      '<p>O Grana Leve nasceu na Atividade Extensionista do curso de Engenharia de Software, com o tema “Tecnologia aplicada à inclusão digital”. A proposta é uma ferramenta gratuita e simples de controle financeiro para jovens e famílias da comunidade local.</p>' +
      '<p>As funcionalidades foram definidas a partir de uma pesquisa anônima com 48 pessoas sobre hábitos financeiros, relacionada aos Objetivos de Desenvolvimento Sustentável 1 (erradicação da pobreza), 8 (trabalho decente e crescimento econômico) e 10 (redução das desigualdades).</p>'},
    'privacidade': {title:'Privacidade', body:
      '<p>Nesta versão, seus dados ficam salvos <strong>somente neste navegador</strong>, no seu aparelho. Nada é enviado para servidores do Grana Leve.</p>' +
      '<ul><li>Sua senha é guardada de forma embaralhada (hash PBKDF2 com sal), nunca em texto puro.</li><li>Não usamos cookies de rastreamento nem anúncios.</li><li>Se você limpar os dados do navegador, as informações são apagadas.</li><li>Você pode apagar sua conta e todos os seus dados a qualquer momento pelo botão abaixo (quando estiver conectado).</li></ul>'},
    'termos': {title:'Termos de uso', body:
      '<p>O Grana Leve é um projeto acadêmico oferecido gratuitamente, “como está”. Ele ajuda a organizar suas finanças, mas não substitui orientação profissional.</p>' +
      '<ul><li>Os conteúdos da aba Aprenda são educativos e não são recomendação de investimento.</li><li>Você é responsável pelas informações que registra.</li><li>Como os dados ficam no seu navegador, recomendamos exportar seus lançamentos em CSV de tempos em tempos.</li></ul>'},
    'contato': {title:'Contato', body:
      '<p>Sugestões, dúvidas ou problemas? O código do projeto está no GitHub, onde você pode abrir uma <em>issue</em>:</p>' +
      '<p><strong>github.com/arthurliraaa/grana-leve</strong></p>'}
  };

  var PBKDF2_ITER = 210000;
  var currencyFmt = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
  var monthNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  /* ============ Helpers ============ */
  function fmtMoney(v){ return currencyFmt.format(Number(v) || 0); }
  function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function toDateKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
  function todayKey(){ return toDateKey(new Date()); }
  function monthKeyOf(dateStr){ return (dateStr || '').slice(0,7); }
  function parseDate(iso){ var p = String(iso||'').split('-'); return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]||1)); }
  function daysInMonth(y, m){ return new Date(y, m+1, 0).getDate(); }
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function csvCell(s){ s = String(s == null ? '' : s); if (/^[=+\-@]/.test(s)) s = "'" + s; if (/[;"\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"'; return s; }
  function formatDateBr(iso){ if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1]; }
  function formatDateFull(iso){ if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function validDateStr(s){ if (!s) return true; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var y = Number(s.slice(0,4)); return y >= 1900 && y <= 3000; }
  function money(v){ var n = Math.round(Number(v) * 100) / 100; return isFinite(n) ? n : 0; }
  function findById(list, id){ for (var i=0;i<list.length;i++){ if (list[i].id === id) return list[i]; } return null; }
  function sum(list, fn){ return list.reduce(function(s,x){ return s + Number(fn(x) || 0); }, 0); }
  function optionsHtml(list, selected){ return list.map(function(o){ return '<option value="'+escapeHtml(o.id)+'"'+(o.id===selected?' selected':'')+'>'+escapeHtml(o.label)+'</option>'; }).join(''); }
  function labelOf(list, id){ var o = findById(list, id); return o ? o.label : ''; }
  function icon(name, cls){ return '<svg class="ico'+(cls?' '+cls:'')+'" aria-hidden="true"><use href="#i-'+name+'"/></svg>'; }

  function resolveVar(cssVarExpr, el){
    var m = /var\((--[a-z0-9-]+)\)/.exec(cssVarExpr);
    if (!m) return cssVarExpr;
    return getComputedStyle(el || document.documentElement).getPropertyValue(m[1]).trim();
  }

  function monthBounds(offset){
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    var key = d.getFullYear() + '-' + pad2(d.getMonth()+1);
    return {key: key, label: monthNames[d.getMonth()] + ' de ' + d.getFullYear(), date: d};
  }
  function monthLabelOf(key){ var p = key.split('-'); return monthNames[Number(p[1])-1] + ' de ' + p[0]; }

  /* ============ Categorias ============ */
  function expenseCats(){
    return DEFAULT_EXPENSE_CATS.concat(State.categories.filter(function(c){ return c.type === 'expense'; }));
  }
  function incomeCats(){
    return DEFAULT_INCOME_CATS.concat(State.categories.filter(function(c){ return c.type === 'income'; }));
  }
  function catLabel(id, type, fallback){
    var c = findById(type === 'income' ? incomeCats() : expenseCats(), id);
    return c ? c.label : (fallback || 'Sem categoria');
  }
  function catColor(id){
    var c = findById(expenseCats(), id);
    return c ? c.color : 'var(--text-muted)';
  }

  /* ============ Segurança: senha ============ */
  function bufToHex(buf){ return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join(''); }
  function hexToBuf(hex){ var out = new Uint8Array(hex.length/2); for (var i=0;i<out.length;i++){ out[i] = parseInt(hex.substr(i*2,2),16); } return out; }
  function randomHex(bytes){ var a = new Uint8Array(bytes); crypto.getRandomValues(a); return bufToHex(a); }
  async function sha256Hex(str){ return bufToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))); }
  async function pbkdf2Hex(password, saltHex, iterations){
    var key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    var bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt: hexToBuf(saltHex), iterations: iterations, hash:'SHA-256'}, key, 256);
    return bufToHex(bits);
  }
  // Comparação em tempo constante, para não vazar quantos caracteres batem.
  function safeEqual(a, b){
    a = String(a); b = String(b);
    var diff = a.length ^ b.length;
    for (var i=0;i<Math.max(a.length,b.length);i++){ diff |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0); }
    return diff === 0;
  }
  async function makePasswordRecord(password){
    var salt = randomHex(16);
    return {passwordAlgo:'pbkdf2-sha256', passwordIter: PBKDF2_ITER, passwordSalt: salt, passwordHash: await pbkdf2Hex(password, salt, PBKDF2_ITER)};
  }
  // Retorna {ok, legacy}. Contas antigas usavam SHA-256 sem sal e são migradas no login.
  async function verifyPassword(user, email, password){
    if (user.passwordAlgo === 'pbkdf2-sha256'){
      return {ok: safeEqual(await pbkdf2Hex(password, user.passwordSalt, user.passwordIter || PBKDF2_ITER), user.passwordHash), legacy:false};
    }
    var legacy = await sha256Hex('granaleve::' + email.toLowerCase() + '::' + password);
    return {ok: safeEqual(legacy, user.passwordHash), legacy:true};
  }
  function passwordProblem(pw){
    if (pw.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use pelo menos uma letra e um número na senha.';
    return '';
  }
  function sanitizeEmailKey(email){
    return String(email).trim().toLowerCase().replace(/[^a-z0-9_.~:@+-]/g, '_');
  }
  function validEmail(email){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

  // Limite de tentativas de login: 5 erros seguidos bloqueiam por 60 segundos.
  var LOCK_KEY = 'granaleve_login_lock_v1';
  function readLock(){ try{ return JSON.parse(localStorage.getItem(LOCK_KEY)) || {}; } catch(e){ return {}; } }
  function writeLock(v){ try{ localStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch(e){} }
  function lockRemaining(emailKey){ var l = readLock()[emailKey]; return (l && l.until > Date.now()) ? Math.ceil((l.until - Date.now())/1000) : 0; }
  function registerFail(emailKey){
    var all = readLock(); var l = all[emailKey] || {fails:0, until:0};
    l.fails += 1;
    if (l.fails >= 5){ l.until = Date.now() + 60000; l.fails = 0; }
    all[emailKey] = l; writeLock(all);
  }
  function clearFails(emailKey){ var all = readLock(); delete all[emailKey]; writeLock(all); }

  /* ============ Arquivos ============ */
  // Salva um arquivo: usa a capacidade de downloads do Claude quando existe,
  // senão cai no download padrão do navegador.
  async function saveFile(filename, data, mimeType){
    if (window.claude && typeof window.claude.use === 'function'){
      var downloads = await window.claude.use('downloads');
      if (downloads){ await downloads.save({filename: filename, data: data}); return; }
    }
    var blob = data instanceof Blob ? data : new Blob([data], {type: mimeType});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function toast(msg){
    var wrap = document.getElementById('toastWrap');
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function(){ el.remove(); }, 3200);
  }

  /* ============ Store (cloud via db capability, local fallback) ============ */
  var COLLECTIONS = ['transactions','budgets','goals','debts','cards','receivables','forecasts','categories','vouchers'];

  var Store = {
    mode: 'local',
    db: null,
    LOCAL_KEY: 'granaleve_local_db_v1',

    async init(){
      try{
        if (window.claude && typeof window.claude.use === 'function'){
          var db = await window.claude.use('db');
          if (db){ this.db = db; this.mode = 'cloud'; return; }
        }
      } catch(e){ /* fall through to local */ }
      this.mode = 'local';
    },

    _readLocal(){
      try{
        var raw = localStorage.getItem(this.LOCAL_KEY);
        return raw ? JSON.parse(raw) : {users:{}};
      } catch(e){ return {users:{}}; }
    },
    _writeLocal(data){
      try{ localStorage.setItem(this.LOCAL_KEY, JSON.stringify(data)); }
      catch(e){ toast('Não foi possível salvar: o armazenamento do navegador está cheio ou bloqueado.'); }
    },
    _userLocal(data, key){
      var u = data.users[key];
      if (!u) u = data.users[key] = {profile:null};
      // Versões antigas guardavam os limites como objeto {categoria: valor}.
      if (u.budgets && !Array.isArray(u.budgets)){
        u.budgets = Object.keys(u.budgets).map(function(k){ return {id:k, limit:u.budgets[k]}; });
      }
      COLLECTIONS.forEach(function(c){ if (!Array.isArray(u[c])) u[c] = []; });
      return u;
    },
    _userDoc(key){ return this.db.doc('users/' + key); },

    async getUser(key){
      if (this.mode === 'cloud'){
        var snap = await this._userDoc(key).get();
        return snap.exists ? snap.data() : null;
      }
      var u = this._readLocal().users[key];
      return (u && u.profile) ? u.profile : null;
    },
    async createUser(key, profile){
      if (this.mode === 'cloud'){ await this._userDoc(key).set(profile); return; }
      var data = this._readLocal();
      this._userLocal(data, key).profile = profile;
      this._writeLocal(data);
    },
    async updateUser(key, partial){
      if (this.mode === 'cloud'){ await this._userDoc(key).update(partial); return; }
      var data = this._readLocal();
      var u = this._userLocal(data, key);
      u.profile = Object.assign({}, u.profile, partial);
      this._writeLocal(data);
    },
    async deleteUser(key){
      if (this.mode === 'cloud'){
        for (var i=0;i<COLLECTIONS.length;i++){
          var q = await this._userDoc(key).collection(COLLECTIONS[i]).get();
          for (var j=0;j<q.docs.length;j++){ await this._userDoc(key).collection(COLLECTIONS[i]).doc(q.docs[j].id).delete(); }
        }
        await this._userDoc(key).delete();
        return;
      }
      var data = this._readLocal();
      delete data.users[key];
      this._writeLocal(data);
    },

    // Substitui todos os dados do usuário (usado ao restaurar um backup). O perfil e a senha não mudam.
    async replaceAll(key, data){
      if (this.mode === 'cloud'){
        for (var i=0;i<COLLECTIONS.length;i++){
          var c = COLLECTIONS[i];
          var q = await this._userDoc(key).collection(c).get();
          for (var j=0;j<q.docs.length;j++){ await this._userDoc(key).collection(c).doc(q.docs[j].id).delete(); }
          for (var n=0;n<data[c].length;n++){ var item = Object.assign({}, data[c][n]); var id = item.id; delete item.id; await this._userDoc(key).collection(c).doc(id).set(item); }
        }
        return;
      }
      var all = this._readLocal();
      var u = this._userLocal(all, key);
      COLLECTIONS.forEach(function(c){ u[c] = data[c].slice(); });
      this._writeLocal(all);
    },

    async list(key, coll){
      if (this.mode === 'cloud'){
        var q = await this._userDoc(key).collection(coll).get();
        return q.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      }
      return this._userLocal(this._readLocal(), key)[coll].slice();
    },
    async add(key, coll, obj){
      if (this.mode === 'cloud'){
        var ref = await this._userDoc(key).collection(coll).add(obj);
        return Object.assign({id: ref.id}, obj);
      }
      var data = this._readLocal();
      var withId = Object.assign({id: uid()}, obj);
      this._userLocal(data, key)[coll].push(withId);
      this._writeLocal(data);
      return withId;
    },
    async put(key, coll, id, obj){
      if (this.mode === 'cloud'){ await this._userDoc(key).collection(coll).doc(id).set(obj); return; }
      var data = this._readLocal();
      var u = this._userLocal(data, key);
      u[coll] = u[coll].filter(function(x){ return x.id !== id; });
      u[coll].push(Object.assign({id:id}, obj));
      this._writeLocal(data);
    },
    async update(key, coll, id, partial){
      if (this.mode === 'cloud'){ await this._userDoc(key).collection(coll).doc(id).update(partial); return; }
      var data = this._readLocal();
      var u = this._userLocal(data, key);
      u[coll] = u[coll].map(function(x){ return x.id === id ? Object.assign({}, x, partial) : x; });
      this._writeLocal(data);
    },
    async remove(key, coll, id){
      if (this.mode === 'cloud'){ await this._userDoc(key).collection(coll).doc(id).delete(); return; }
      var data = this._readLocal();
      var u = this._userLocal(data, key);
      u[coll] = u[coll].filter(function(x){ return x.id !== id; });
      this._writeLocal(data);
    }
  };

  /* ============ App state ============ */
  var State = {
    session: null,        // {emailKey, name, email, expiresAt}
    transactions: [],
    budgetBase: {},       // planejamento antigo, de antes de cada mês ter o seu
    budgetMonths: {},     // {'2026-10': {categoria: valor}}
    goals: [],
    debts: [],
    cards: [],
    receivables: [],
    forecasts: [],
    categories: [],
    vouchers: [],
    txMonthOffset: 0,
    budgetMonthOffset: 0,
    invoiceOffsets: {},
    goalFilter: 'andamento',
    donutView: 'chart',
    barView: 'chart',
    barMonths: 6,
    activeTab: 'dashboard',
    authTab: 'login'
  };

  function k(){ return State.session.emailKey; }

  var SESSION_KEY = 'granaleve_session_v1';
  var SESSION_DAYS = 30;
  function saveSession(s){ try{ localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch(e){} }
  function loadSession(){
    try{
      var s = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (!s) return null;
      if (s.expiresAt && s.expiresAt < Date.now()){ clearSession(); return null; }
      return s;
    } catch(e){ return null; }
  }
  function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); } catch(e){} }
  function newSession(emailKey, user){
    return {emailKey: emailKey, name: user.name, email: user.email, expiresAt: Date.now() + SESSION_DAYS*86400000};
  }

  // Preferências do usuário neste navegador (ex.: “não perguntar novamente”).
  function prefsKey(){ return 'granaleve_prefs_' + (State.session ? State.session.emailKey : 'anon'); }
  function getPrefs(){ try{ return JSON.parse(localStorage.getItem(prefsKey())) || {}; } catch(e){ return {}; } }
  function setPref(name, value){ var p = getPrefs(); p[name] = value; try{ localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch(e){} }

  /* ============ Tema claro/escuro ============ */
  var THEME_KEY = 'granaleve_theme';
  function currentTheme(){
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(t){
    if (t) document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('themeToggle');
    var isDark = currentTheme() === 'dark';
    btn.innerHTML = icon(isDark ? 'sun' : 'moon');
    btn.setAttribute('aria-label', isDark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro');
    btn.title = isDark ? 'Modo claro' : 'Modo escuro';
  }
  function toggleTheme(){
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    try{ localStorage.setItem(THEME_KEY, next); } catch(e){}
    applyTheme(next);
    if (State.session) renderAll();
  }
  (function initTheme(){
    var saved = null;
    try{ saved = localStorage.getItem(THEME_KEY); } catch(e){}
    applyTheme(saved === 'dark' || saved === 'light' ? saved : null);
  })();

  /* ============ Modal ============ */
  // opts: {title, body, submitLabel, cancelLabel, danger, wide, onOpen(root, close), onSubmit(form) -> valor | {error}}
  function openModal(opts){
    return new Promise(function(resolve){
      var root = document.getElementById('modalRoot');
      var prevFocus = document.activeElement;
      var submitLabel = opts.submitLabel === undefined ? 'Salvar' : opts.submitLabel;
      var cancelLabel = opts.cancelLabel === undefined ? 'Cancelar' : opts.cancelLabel;
      root.innerHTML =
        '<div class="modal-backdrop" data-modal-close></div>' +
        '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
          '<div class="modal-head"><h3 id="modalTitle">' + escapeHtml(opts.title) + '</h3>' +
          '<button type="button" class="modal-x" data-modal-close aria-label="Fechar">×</button></div>' +
          '<form class="modal-body" novalidate>' + (opts.body || '') +
            '<p class="form-error" data-modal-error></p>' +
            '<div class="modal-actions">' +
              (cancelLabel ? '<button type="button" class="btn btn-ghost" data-modal-close>' + escapeHtml(cancelLabel) + '</button>' : '') +
              (submitLabel ? '<button type="submit" class="btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary') + '">' + escapeHtml(submitLabel) + '</button>' : '') +
            '</div>' +
          '</form>' +
        '</div>';
      root.hidden = false;
      document.body.classList.add('modal-open');
      var form = root.querySelector('form');
      var done = false;
      function close(val){
        if (done) return; done = true;
        root.hidden = true; root.innerHTML = '';
        document.body.classList.remove('modal-open');
        document.removeEventListener('keydown', onKey);
        if (opts.onClose) opts.onClose();
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(val);
      }
      function onKey(e){ if (e.key === 'Escape') close(null); }
      document.addEventListener('keydown', onKey);
      qsa('[data-modal-close]', root).forEach(function(el){ el.addEventListener('click', function(){ close(null); }); });
      form.addEventListener('submit', async function(e){
        e.preventDefault();
        var err = form.querySelector('[data-modal-error]');
        err.textContent = '';
        if (!opts.onSubmit){ close(true); return; }
        try{
          var r = await opts.onSubmit(form);
          if (r && r.error){ err.textContent = r.error; return; }
          if (r && r.keepOpen) return;
          close(r === undefined ? true : r);
        } catch(ex){ err.textContent = 'Algo deu errado. Tente novamente.'; }
      });
      // Os ouvintes vão no elemento .modal, que é recriado a cada abertura (o #modalRoot é reaproveitado).
      attachCounters(root);
      if (opts.onOpen) opts.onOpen(root.querySelector('.modal'), close);
      // Em confirmações de exclusão o foco começa no “Cancelar”, para um Enter acidental não apagar nada.
      var first = opts.danger ? form.querySelector('.modal-actions [data-modal-close]') : form.querySelector('input:not([type=checkbox]), select, textarea, button[type=submit]');
      if (first) first.focus();
    });
  }

  // Confirmação antes de excluir. Com skipKey, oferece “Não perguntar novamente”.
  async function confirmAction(opts){
    if (opts.skipKey && (getPrefs().skipConfirm || {})[opts.skipKey]) return true;
    var ok = await openModal({
      title: opts.title || 'Tem certeza?',
      body: '<p>' + escapeHtml(opts.message) + '</p>' +
        (opts.skipKey ? '<label class="check"><input type="checkbox" name="skip"> Não perguntar novamente</label>' : ''),
      submitLabel: opts.confirmLabel || 'Excluir',
      danger: opts.danger !== false,
      onSubmit: function(form){
        if (opts.skipKey && form.skip && form.skip.checked){
          var sc = getPrefs().skipConfirm || {};
          sc[opts.skipKey] = true;
          setPref('skipConfirm', sc);
        }
        return true;
      }
    });
    return ok === true;
  }

  // Pede um valor em reais. Retorna o número ou null.
  async function askAmount(opts){
    var r = await openModal({
      title: opts.title,
      body: (opts.message ? '<p>' + escapeHtml(opts.message) + '</p>' : '') +
        '<div class="field"><label for="askAmount">' + escapeHtml(opts.label || 'Valor') + '</label>' +
        '<span class="money-input"><span>R$</span><input id="askAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + (opts.value ? money(opts.value) : '') + '"></span></div>' +
        (opts.checkbox ? '<label class="check"><input type="checkbox" name="extra"' + (opts.checkboxDefault ? ' checked' : '') + '> ' + escapeHtml(opts.checkbox) + '</label>' : ''),
      submitLabel: opts.submitLabel || 'Confirmar',
      onSubmit: function(form){
        var v = money(form.amount.value);
        if (!(v > 0)) return {error:'Informe um valor maior que zero.'};
        if (opts.max && v > opts.max + 0.001) return {error:'O valor não pode passar de ' + fmtMoney(opts.max) + '.'};
        return {amount: v, extra: !!(form.extra && form.extra.checked)};
      }
    });
    return r && r.amount ? r : null;
  }

  /* ============ Contador de caracteres ============ */
  function counterText(el){ var left = Number(el.maxLength) - el.value.length; return left + (left === 1 ? ' caractere restante' : ' caracteres restantes'); }
  function attachCounters(root){
    qsa('textarea[maxlength]', root || document).forEach(function(el){
      if (el.getAttribute('data-counted')) return;
      el.setAttribute('data-counted', '1');
      var span = document.createElement('span');
      span.className = 'field-hint char-count';
      span.setAttribute('aria-live', 'polite');
      span.textContent = counterText(el);
      el.insertAdjacentElement('afterend', span);
    });
  }
  document.addEventListener('input', function(e){
    var el = e.target;
    if (el.tagName === 'TEXTAREA' && el.getAttribute('data-counted')){
      var span = el.nextElementSibling;
      if (span && span.classList.contains('char-count')){
        span.textContent = counterText(el);
        span.classList.toggle('low', Number(el.maxLength) - el.value.length <= 20);
      }
    }
  });
  // Ao limpar um formulário (reset), o contador volta ao máximo.
  document.addEventListener('reset', function(e){
    setTimeout(function(){ qsa('textarea[data-counted]', e.target).forEach(function(el){ el.nextElementSibling.textContent = counterText(el); el.nextElementSibling.classList.remove('low'); }); }, 0);
  });

  /* ============ Rendering ============ */
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  function showView(name){
    ['viewLanding','viewAuth','viewApp'].forEach(function(id){
      document.getElementById(id).hidden = (id !== name);
    });
    document.getElementById('fabAdd').hidden = (name !== 'viewApp');
    window.scrollTo(0,0);
  }

  function renderTopbar(){
    var wrap = document.getElementById('topbarActions');
    if (State.session){
      var cloud = Store.mode === 'cloud';
      wrap.innerHTML =
        '<span class="sync-badge" title="' + (cloud ? 'Seus dados estão salvos na nuvem.' : 'Os dados ficam salvos apenas neste navegador.') + '">' +
          '<span class="sync-dot ' + (cloud ? 'cloud' : 'local') + '"></span><span class="sync-text">' + (cloud ? 'Sincronizado' : 'Salvo neste navegador') + '</span>' +
        '</span>' +
        '<span class="user-chip">Olá, <strong>' + escapeHtml(State.session.name.split(' ')[0]) + '</strong></span>' +
        '<button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Sair</button>';
      qs('#logoutBtn').addEventListener('click', logout);
    } else {
      wrap.innerHTML =
        '<button class="btn btn-ghost btn-sm" data-action="go-login">Entrar</button>' +
        '<button class="btn btn-primary btn-sm" data-action="go-signup">Criar conta</button>';
    }
  }

  async function loadAllData(){
    var key = k();
    var res = await Promise.all(COLLECTIONS.map(function(c){ return Store.list(key, c); }));
    var byName = {};
    COLLECTIONS.forEach(function(c, i){ byName[c] = res[i]; });
    State.transactions = byName.transactions;
    sortTransactions();
    State.budgetBase = {}; State.budgetMonths = {};
    byName.budgets.forEach(function(b){
      if (b.month && b.limits) State.budgetMonths[b.month] = b.limits;
      else State.budgetBase[b.id] = Number(b.limit) || 0;
    });
    State.goals = byName.goals;
    State.debts = byName.debts;
    State.cards = byName.cards;
    State.receivables = byName.receivables;
    State.forecasts = byName.forecasts;
    State.categories = byName.categories;
    State.vouchers = byName.vouchers;
  }
  function sortTransactions(){
    State.transactions.sort(function(a,b){ return (b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0); });
  }

  function txForMonth(key){
    return State.transactions.filter(function(t){ return monthKeyOf(t.date) === key; });
  }
  function monthTotals(key){
    var tx = txForMonth(key);
    var income = sum(tx.filter(function(t){ return t.type==='income'; }), function(t){ return t.amount; });
    var expense = sum(tx.filter(function(t){ return t.type==='expense'; }), function(t){ return t.amount; });
    return {income: income, expense: expense, saldo: income-expense};
  }
  function expenseCategoryTotals(key){
    var out = {};
    txForMonth(key).filter(function(t){ return t.type==='expense'; }).forEach(function(t){
      out[t.category] = (out[t.category]||0) + Number(t.amount||0);
    });
    return out;
  }

  function pctDelta(cur, prev){
    if (!prev) return null;
    return ((cur-prev)/Math.abs(prev))*100;
  }
  function deltaBadge(cur, prev, downIsGood){
    var pct = pctDelta(cur, prev);
    if (pct === null){
      if (!cur && !prev) return '<span class="cmp-delta neutral">—</span>';
      return '<span class="cmp-delta neutral">novo</span>';
    }
    var up = pct >= 0;
    var isGood = downIsGood ? !up : up;
    var cls = Math.abs(pct) < 1 ? 'neutral' : (isGood ? 'good' : 'critical');
    return '<span class="cmp-delta ' + cls + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(Math.round(pct)) + '%</span>';
  }

  /* ---------- Previsões de entrada ---------- */
  // Uma previsão pode ser única ou repetir todo mês. Os recebimentos ficam em received[mês] = valor.
  function forecastOccurrences(key){
    var out = [];
    State.forecasts.forEach(function(f){
      var fKey = monthKeyOf(f.date);
      var applies = f.recurring ? fKey <= key : fKey === key;
      if (!applies) return;
      var day = Math.min(Number(f.date.slice(8,10)), daysInMonth(Number(key.slice(0,4)), Number(key.slice(5,7))-1));
      var received = (f.received || {})[key];
      out.push({f: f, date: key + '-' + pad2(day), received: received});
    });
    return out.sort(function(a,b){ return a.date.localeCompare(b.date); });
  }

  function renderForecasts(){
    var cur = monthBounds(0);
    document.getElementById('forecastMonthLabel').textContent = cur.label;
    var occ = forecastOccurrences(cur.key);
    var list = document.getElementById('forecastList');
    var pending = occ.filter(function(o){ return o.received === undefined; });
    var receivedOcc = occ.filter(function(o){ return o.received !== undefined; });
    if (!occ.length){ list.innerHTML = '<p class="empty-state" style="padding:14px">Nenhuma entrada prevista para este mês.</p>'; return; }
    list.innerHTML = pending.concat(receivedOcc).map(function(o){
      var done = o.received !== undefined;
      return '<div class="list-row">' +
        '<span class="tx-cat-dot" style="background:' + (done ? 'var(--good)' : 'var(--accent)') + '"></span>' +
        '<div class="tx-main"><div class="tx-desc">' + escapeHtml(o.f.description) + (o.f.recurring ? ' <span class="pill">todo mês</span>' : '') + '</div>' +
        '<div class="tx-meta">' + (done ? 'Recebido · ' : 'Previsto para ') + formatDateFull(o.date) + '</div></div>' +
        '<span class="tx-amount income tabular">' + fmtMoney(done ? o.received : o.f.amount) + '</span>' +
        '<div class="row-actions">' +
          (done ? '<span class="status-pill good">recebido</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-fc-receive="' + o.f.id + '" data-fc-date="' + o.date + '">Recebi</button>') +
          '<button class="tx-del" type="button" data-fc-del="' + o.f.id + '" aria-label="Excluir previsão" title="Excluir">' + icon('trash') + '</button>' +
        '</div></div>';
    }).join('');
  }

  async function receiveForecast(id, date){
    var f = findById(State.forecasts, id);
    if (!f) return;
    var r = await askAmount({title:'Registrar recebimento', message:'Confirme quanto entrou de “' + f.description + '”. O valor vai para os seus ganhos.', value: f.amount, submitLabel:'Registrar'});
    if (!r) return;
    var key = monthKeyOf(date);
    var tx = {type:'income', amount:r.amount, category: f.category || 'salario', date: date > todayKey() ? todayKey() : date, description: f.description, paymentMethod:null, createdAt: Date.now()};
    var saved = await Store.add(k(), 'transactions', tx);
    State.transactions.unshift(saved); sortTransactions();
    var received = Object.assign({}, f.received || {}); received[key] = r.amount;
    await Store.update(k(), 'forecasts', id, {received: received});
    f.received = received;
    renderDashboard(); renderTransactionsTab();
    toast('Ganho de ' + fmtMoney(r.amount) + ' registrado.');
  }

  /* ---------- Painel ---------- */
  function renderStatTiles(){
    var cur = monthBounds(0);
    var t = monthTotals(cur.key);
    var pendingForecast = sum(forecastOccurrences(cur.key).filter(function(o){ return o.received === undefined; }), function(o){ return o.f.amount; });
    var savedInGoals = sum(State.goals.filter(function(g){ return !g.deletedAt; }), function(g){ return g.currentAmount; });
    var debtRemaining = sum(State.debts, function(d){ return Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0)); }) +
      sum(installmentGroups(), function(g){ return g.remaining; });
    var toReceive = sum(State.receivables, function(r){ return Math.max(0, Number(r.totalAmount||0)-Number(r.receivedAmount||0)); });
    function tile(label, value, cls, sub){
      return '<div class="tile"><span class="tile-lbl">' + label + '</span><span class="tile-val tabular ' + (cls||'') + '">' + fmtMoney(value) + '</span>' + (sub ? '<span class="tile-sub">' + sub + '</span>' : '') + '</div>';
    }
    document.getElementById('statTiles').innerHTML =
      tile('Ganhos do mês', t.income, '', pendingForecast > 0 ? 'Previsto: ' + fmtMoney(t.income + pendingForecast) : '') +
      tile('Gastos do mês', t.expense) +
      tile('Saldo do mês', t.saldo, t.saldo < 0 ? 'neg' : 'pos') +
      tile('Guardado nas metas', savedInGoals) +
      tile('Dívida restante', debtRemaining) +
      tile('A receber', toReceive);
  }

  function renderComparison(){
    var cur = monthBounds(0), prev = monthBounds(-1);
    document.getElementById('comparisonMonthsLabel').textContent = cur.label + ' vs ' + prev.label;
    var curT = monthTotals(cur.key), prevT = monthTotals(prev.key);
    var curCats = expenseCategoryTotals(cur.key), prevCats = expenseCategoryTotals(prev.key);

    document.getElementById('comparisonSummary').innerHTML =
      '<div class="tile tile-sm"><span class="tile-lbl">Ganhos</span><span class="tile-val tabular">'+fmtMoney(curT.income)+'</span>'+deltaBadge(curT.income, prevT.income, false)+'</div>' +
      '<div class="tile tile-sm"><span class="tile-lbl">Gastos</span><span class="tile-val tabular">'+fmtMoney(curT.expense)+'</span>'+deltaBadge(curT.expense, prevT.expense, true)+'</div>' +
      '<div class="tile tile-sm"><span class="tile-lbl">Saldo</span><span class="tile-val tabular">'+fmtMoney(curT.saldo)+'</span>'+deltaBadge(curT.saldo, prevT.saldo, false)+'</div>';

    var list = document.getElementById('comparisonList');
    var cats = expenseCats().map(function(c){
      return {label:c.label, color:c.color, cur: curCats[c.id]||0, prev: prevCats[c.id]||0};
    }).filter(function(c){ return c.cur>0 || c.prev>0; });
    if (!cats.length){
      list.innerHTML = '<p class="chart-empty">Ainda não há gastos suficientes para comparar os dois meses.</p>';
      return;
    }
    list.innerHTML = '<div class="cmp-row cmp-head"><span>Categoria</span><span class="tabular">'+cur.label.slice(0,3)+'</span><span class="tabular">'+prev.label.slice(0,3)+'</span><span>Variação</span></div>' +
      cats.map(function(c){
        return '<div class="cmp-row"><span class="cmp-cat"><span class="legend-swatch" style="background:'+resolveVar(c.color, list)+'"></span>'+escapeHtml(c.label)+'</span>' +
          '<span class="tabular">'+fmtMoney(c.cur)+'</span><span class="tabular">'+fmtMoney(c.prev)+'</span>' + deltaBadge(c.cur, c.prev, true) + '</div>';
      }).join('');
  }

  function renderDashboard(){
    var cur = monthBounds(0);
    document.getElementById('monthLabel').textContent = 'Painel de ' + cur.label;
    renderStatTiles();
    renderForecasts();
    renderDonut(txForMonth(cur.key));
    renderBarChart();
    renderComparison();
    renderRecentTx();
  }

  function setToggleLabel(which){
    var btn = qs('[data-view-toggle="' + which + '"]');
    var view = which === 'donut' ? State.donutView : State.barView;
    btn.textContent = view === 'chart' ? 'Ver como tabela' : 'Ver como gráfico';
  }

  function renderDonut(monthTx){
    var wrap = document.getElementById('donutWrap');
    setToggleLabel('donut');
    var byCat = {};
    monthTx.filter(function(t){ return t.type==='expense'; }).forEach(function(t){
      byCat[t.category] = (byCat[t.category]||0) + Number(t.amount||0);
    });
    var entries = expenseCats().map(function(c){ return {label:c.label, color:c.color, value: byCat[c.id]||0}; }).filter(function(e){ return e.value>0; });
    var total = sum(entries, function(e){ return e.value; });

    if (!total){
      wrap.innerHTML = '<p class="chart-empty">Sem gastos registrados neste mês ainda.</p>';
      return;
    }
    if (State.donutView === 'table'){
      wrap.innerHTML = '<table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' +
        entries.map(function(e){ return '<tr><td>'+escapeHtml(e.label)+'</td><td class="tabular">'+fmtMoney(e.value)+'</td><td class="tabular">'+Math.round(100*e.value/total)+'%</td></tr>'; }).join('') +
        '<tr><td><strong>Total</strong></td><td class="tabular"><strong>'+fmtMoney(total)+'</strong></td><td>100%</td></tr></tbody></table>';
      return;
    }
    var size = 220, r = 80, cx = size/2, cy = size/2, circumference = 2*Math.PI*r;
    var cum = 0;
    var circles = entries.map(function(e){
      var frac = e.value/total;
      var dash = frac*circumference;
      var offset = -cum*circumference;
      cum += frac;
      return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+resolveVar(e.color, wrap)+'" stroke-width="26" ' +
        'stroke-dasharray="'+dash.toFixed(2)+' '+(circumference-dash).toFixed(2)+'" stroke-dashoffset="'+offset.toFixed(2)+'" ' +
        'transform="rotate(-90 '+cx+' '+cy+')" tabindex="0" data-label="'+escapeHtml(e.label)+'" data-value="'+fmtMoney(e.value)+'" class="donut-seg"></circle>';
    }).join('');

    var svg = '<svg viewBox="0 0 '+size+' '+size+'" width="100%" height="240" role="img" aria-label="Gastos por categoria">' +
      '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="var(--gridline)" stroke-width="26"></circle>' +
      circles +
      '<text x="'+cx+'" y="'+(cy-4)+'" text-anchor="middle" font-size="13" fill="var(--text-secondary)">Total</text>' +
      '<text x="'+cx+'" y="'+(cy+16)+'" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text-primary)">'+fmtMoney(total)+'</text>' +
      '</svg>';
    var legend = '<div class="legend">' + entries.map(function(e){
      return '<span class="legend-item"><span class="legend-swatch" style="background:'+resolveVar(e.color,wrap)+'"></span>' + escapeHtml(e.label) + ' · ' + fmtMoney(e.value) + '</span>';
    }).join('') + '</div>';

    wrap.innerHTML = svg + legend;
    wireTooltips(wrap, '.donut-seg');
  }

  function wireTooltips(wrap, selector){
    var tip = null;
    function hide(){ if (tip){ tip.remove(); tip = null; } }
    qsa(selector, wrap).forEach(function(seg){
      var text = seg.getAttribute('data-label') + ': ' + seg.getAttribute('data-value');
      seg.addEventListener('mouseenter', function(e){ hide(); tip = showChartTip(wrap, e.clientX, e.clientY, text); });
      seg.addEventListener('mousemove', function(e){ if (tip) positionTip(wrap, tip, e.clientX, e.clientY); });
      seg.addEventListener('mouseleave', hide);
      seg.addEventListener('focus', function(){ hide(); tip = showChartTip(wrap, null, null, text, seg); });
      seg.addEventListener('blur', hide);
    });
  }
  function showChartTip(wrap, clientX, clientY, text, refEl){
    var tip = document.createElement('div');
    tip.className = 'chart-tooltip';
    tip.textContent = text;
    wrap.appendChild(tip);
    if (refEl){
      var r = refEl.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      tip.style.left = (r.left - w.left + r.width/2) + 'px';
      tip.style.top = (r.top - w.top) + 'px';
    } else {
      positionTip(wrap, tip, clientX, clientY);
    }
    return tip;
  }
  function positionTip(wrap, tip, clientX, clientY){
    var w = wrap.getBoundingClientRect();
    tip.style.left = (clientX - w.left) + 'px';
    tip.style.top = (clientY - w.top) + 'px';
  }

  function renderBarChart(){
    var wrap = document.getElementById('barWrap');
    setToggleLabel('bar');
    var n = State.barMonths;
    var months = [];
    for (var i=n-1;i>=0;i--){ months.push(monthBounds(-i)); }
    var data = months.map(function(m){
      var t = monthTotals(m.key);
      return {label: m.label.slice(0,3), full: m.label, inc: t.income, exp: t.expense};
    });

    if (State.barView === 'table'){
      wrap.innerHTML = '<table class="data-table"><thead><tr><th>Mês</th><th>Ganhos</th><th>Gastos</th><th>Saldo</th></tr></thead><tbody>' +
        data.map(function(d){ return '<tr><td>'+d.full+'</td><td class="tabular">'+fmtMoney(d.inc)+'</td><td class="tabular">'+fmtMoney(d.exp)+'</td><td class="tabular">'+fmtMoney(d.inc-d.exp)+'</td></tr>'; }).join('') +
        '</tbody></table>';
      return;
    }

    var max = Math.max(1, Math.max.apply(null, data.map(function(d){ return Math.max(d.inc,d.exp); })));
    var W = 320, H = 200, padL = 34, padB = 22, padT = 10, padR = 6;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var groupW = plotW / data.length;
    var barW = Math.min(16, groupW/3);
    var incColor = resolveVar('var(--cat-1)', wrap), expColor = resolveVar('var(--cat-8)', wrap);
    var grid = [0,0.5,1].map(function(f){
      var y = padT + plotH*(1-f);
      return '<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="var(--gridline)" stroke-width="1"></line>' +
        '<text x="'+(padL-6)+'" y="'+(y+3)+'" text-anchor="end" font-size="8">'+fmtMoney(max*f).replace('R$','').trim()+'</text>';
    }).join('');
    var bars = data.map(function(d, idx){
      var gx = padL + idx*groupW;
      var hInc = (d.inc/max)*plotH, hExp = (d.exp/max)*plotH;
      var x1 = gx + groupW/2 - barW - 1, x2 = gx + groupW/2 + 1;
      return '<rect class="bar-seg" data-label="Ganhos · '+d.full+'" data-value="'+fmtMoney(d.inc)+'" x="'+x1+'" y="'+(padT+plotH-hInc)+'" width="'+barW+'" height="'+Math.max(hInc,1)+'" rx="3" fill="'+incColor+'" tabindex="0"></rect>' +
        '<rect class="bar-seg" data-label="Gastos · '+d.full+'" data-value="'+fmtMoney(d.exp)+'" x="'+x2+'" y="'+(padT+plotH-hExp)+'" width="'+barW+'" height="'+Math.max(hExp,1)+'" rx="3" fill="'+expColor+'" tabindex="0"></rect>' +
        '<text x="'+(gx+groupW/2)+'" y="'+(H-4)+'" text-anchor="middle" font-size="'+(n > 6 ? 7 : 9)+'">'+d.label+'</text>';
    }).join('');
    var svg = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="220" role="img" aria-label="Ganhos e gastos dos últimos '+n+' meses">' +
      grid + '<line x1="'+padL+'" y1="'+(padT+plotH)+'" x2="'+(W-padR)+'" y2="'+(padT+plotH)+'" stroke="var(--baseline)" stroke-width="1"></line>' +
      bars + '</svg>';
    var legend = '<div class="legend">' +
      '<span class="legend-item"><span class="legend-swatch" style="background:'+incColor+'"></span>Ganhos</span>' +
      '<span class="legend-item"><span class="legend-swatch" style="background:'+expColor+'"></span>Gastos</span>' +
      '</div>';
    wrap.innerHTML = svg + legend;
    wireTooltips(wrap, '.bar-seg');
  }

  function renderRecentTx(){
    var list = document.getElementById('recentTxList');
    var today = todayKey();
    var recent = State.transactions.filter(function(t){ return t.date <= today; }).slice(0,5);
    if (!recent.length){ list.innerHTML = '<p class="empty-state">Nenhum lançamento ainda. Toque no botão “+” para começar.</p>'; return; }
    list.innerHTML = recent.map(txRowHtml).join('');
  }

  function paymentLabel(t){
    if (t.type !== 'expense' || !t.paymentMethod) return '';
    if (t.paymentMethod === 'cartao'){
      var c = findById(State.cards, t.cardId);
      return c ? 'Cartão ' + c.name : 'Cartão de crédito';
    }
    if (t.paymentMethod === 'vale'){
      var v = voucherOf(t);
      return v ? 'Vale ' + v.name : 'Vale';
    }
    return '';
  }

  function txRowHtml(t){
    var isExpense = t.type === 'expense';
    var dot = isExpense ? resolveVar(catColor(t.category)) : 'var(--good)';
    var cat = catLabel(t.category, t.type, t.categoryLabel);
    var pay = paymentLabel(t);
    return '<div class="tx-row" data-id="'+escapeHtml(t.id)+'">' +
      '<span class="tx-cat-dot" style="background:'+dot+'"></span>' +
      '<div class="tx-main"><div class="tx-desc">'+escapeHtml(t.description || cat)+'</div>' +
      '<div class="tx-meta">'+escapeHtml(cat) + ' · ' + formatDateBr(t.date) + (pay ? ' · ' + escapeHtml(pay) : '') + '</div></div>' +
      '<span class="tx-amount ' + (isExpense ? 'expense' : 'income') + ' tabular">' + (isExpense ? '-' : '+') + ' ' + fmtMoney(t.amount) + '</span>' +
      '<button class="tx-del tx-edit" type="button" data-edit-tx="'+escapeHtml(t.id)+'" aria-label="Editar lançamento" title="Editar">' + icon('edit') + '</button>' +
      '<button class="tx-del" type="button" data-del-tx="'+escapeHtml(t.id)+'" aria-label="Excluir lançamento" title="Excluir">' + icon('trash') + '</button>' +
      '</div>';
  }

  /* ---------- Ganhos e gastos ---------- */
  function currentTxType(){ return qs('#typeToggle button.active').getAttribute('data-type'); }

  function populateCategorySelect(selected){
    var sel = document.getElementById('txCategory');
    var list = currentTxType() === 'income' ? incomeCats() : expenseCats();
    sel.innerHTML = optionsHtml(list, selected) + '<option value="__new">+ Nova categoria…</option>';
    if (!selected) sel.value = list[0].id;
  }
  // Formas de pagamento de um gasto (usadas no formulário da aba e no popup de lançamento).
  function paymentOptions(){
    var opts = [{id:'conta', label: PAYMENT_LABELS.conta}];
    if (State.vouchers.length) State.vouchers.forEach(function(v){ opts.push({id:'vale:' + v.id, label:'Vale · ' + v.name}); });
    else opts.push({id:'vale', label: PAYMENT_LABELS.vale});
    State.cards.forEach(function(c){ opts.push({id:'card:' + c.id, label:'Cartão de crédito · ' + c.name}); });
    if (!State.cards.length) opts.push({id:'card:none', label:'Cartão de crédito (cadastre na aba Cartões)'});
    return opts;
  }
  // Valor do select de pagamento que corresponde a um lançamento já salvo.
  function paymentValue(t){
    if (t.paymentMethod === 'cartao' && t.cardId) return 'card:' + t.cardId;
    if (t.paymentMethod === 'vale'){ var v = voucherOf(t); return v ? 'vale:' + v.id : 'vale'; }
    return 'conta';
  }
  // Grava no lançamento a forma de pagamento escolhida. Campos que não se aplicam ficam nulos,
  // para que a edição apague o cartão ou o vale de antes.
  function applyPayment(tx, pay){
    tx.cardId = null; tx.voucherId = null;
    if (pay.indexOf('card:') === 0){ tx.paymentMethod = 'cartao'; tx.cardId = pay.slice(5); }
    else if (pay.indexOf('vale:') === 0){ tx.paymentMethod = 'vale'; tx.voucherId = pay.slice(5); }
    else tx.paymentMethod = pay;
  }
  function populatePaymentSelect(){
    var sel = document.getElementById('txPayment');
    var prev = sel.value;
    var opts = paymentOptions();
    sel.innerHTML = optionsHtml(opts, prev);
    if (!findById(opts, prev)) sel.value = 'conta';
    syncTxFormVisibility();
  }
  function installOptions(amount){
    var opts = [];
    for (var i=1;i<=24;i++){
      opts.push({id:String(i), label: i === 1 ? 'À vista (1x)' : i + 'x' + (amount > 0 ? ' de ' + fmtMoney(Math.floor(amount*100/i)/100) : '')});
    }
    return opts;
  }
  function populateInstallSelect(){
    var sel = document.getElementById('txInstall');
    var prev = sel.value || '1';
    sel.innerHTML = optionsHtml(installOptions(money(document.getElementById('txAmount').value)), prev);
  }
  function syncTxFormVisibility(){
    var isExpense = currentTxType() === 'expense';
    var onCard = isExpense && document.getElementById('txPayment').value.indexOf('card:') === 0 && document.getElementById('txPayment').value !== 'card:none';
    document.getElementById('txInstallField').hidden = !onCard;
    if (!onCard) document.getElementById('txInstall').value = '1';
    document.getElementById('txPaymentField').hidden = !isExpense;
    document.getElementById('txForOtherField').hidden = !isExpense;
    var other = document.getElementById('txForOther').checked;
    document.getElementById('txOtherName').hidden = !other;
    document.getElementById('txOtherHint').hidden = !other;
  }

  // Até quantos meses à frente existem lançamentos (parcelas futuras).
  function maxTxMonthOffset(){
    var cur = monthBounds(0).key, max = 0;
    State.transactions.forEach(function(t){ var d = monthsBetween(cur, monthKeyOf(t.date)); if (d > max) max = d; });
    return max;
  }

  function renderTransactionsTab(){
    var mb = monthBounds(State.txMonthOffset);
    document.getElementById('txMonthLabel').textContent = mb.label;
    document.getElementById('nextMonth').disabled = State.txMonthOffset >= maxTxMonthOffset();
    var tx = filterTransactions(txForMonth(mb.key));
    var filtering = tx.length !== txForMonth(mb.key).length || isFiltering();
    var income = sum(tx.filter(function(t){ return t.type==='income'; }), function(t){ return t.amount; });
    var expenseTx = tx.filter(function(t){ return t.type==='expense'; });
    var expense = sum(expenseTx, function(t){ return t.amount; });
    var onCard = sum(expenseTx.filter(function(t){ return t.paymentMethod==='cartao'; }), function(t){ return t.amount; });
    var onVale = sum(expenseTx.filter(function(t){ return t.paymentMethod==='vale'; }), function(t){ return t.amount; });
    document.getElementById('txSummary').textContent = (filtering ? 'Filtrando: ' : '') + tx.length + ' lançamento(s) · ganhos ' + fmtMoney(income) + ' · gastos ' + fmtMoney(expense) +
      (onCard ? ' (no cartão ' + fmtMoney(onCard) + ')' : '') + (onVale ? ' · no vale ' + fmtMoney(onVale) : '');
    var list = document.getElementById('txList');
    if (!tx.length){ list.innerHTML = '<p class="empty-state">' + (filtering ? 'Nenhum lançamento encontrado com esses filtros.' : 'Nenhum lançamento neste mês.') + '</p>'; return; }
    list.innerHTML = tx.map(txRowHtml).join('');
  }

  // Busca sem diferenciar acentos e maiúsculas ("almoco" encontra "Almoço").
  function fold(s){ return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function isFiltering(){
    return !!document.getElementById('txSearch').value.trim() || document.getElementById('txFilterType').value !== 'all' || document.getElementById('txFilterPay').value !== 'all';
  }
  function filterTransactions(list){
    var q = fold(document.getElementById('txSearch').value.trim());
    var type = document.getElementById('txFilterType').value;
    var pay = document.getElementById('txFilterPay').value;
    return list.filter(function(t){
      if (type !== 'all' && t.type !== type) return false;
      if (pay !== 'all' && (t.type !== 'expense' || (t.paymentMethod || 'conta') !== pay)) return false;
      if (q && fold((t.description || '') + ' ' + catLabel(t.category, t.type, t.categoryLabel) + ' ' + paymentLabel(t)).indexOf(q) < 0) return false;
      return true;
    });
  }

  // Nome repetido é recusado sem diferenciar maiúsculas. exceptId permite manter o nome ao renomear.
  function categoryNameProblem(name, type, exceptId){
    if (!name) return 'Dê um nome para a categoria.';
    var all = type === 'income' ? incomeCats() : expenseCats();
    if (all.some(function(c){ return c.id !== exceptId && c.label.toLowerCase() === name.toLowerCase(); })) return 'Já existe uma categoria com esse nome.';
    return '';
  }
  // A mesma lista de categorias serve para “Ganhos e gastos” e “Planejar gastos”.
  async function addCategory(name, type){
    name = String(name || '').trim();
    var problem = categoryNameProblem(name, type);
    if (problem) return {error: problem};
    var color = CUSTOM_COLORS[State.categories.length % CUSTOM_COLORS.length];
    var saved = await Store.add(k(), 'categories', {label:name, type:type, color:color, createdAt:Date.now()});
    State.categories.push(saved);
    return saved;
  }
  async function createCategory(type){
    var r = await openModal({
      title: 'Nova categoria de ' + (type === 'income' ? 'ganho' : 'gasto'),
      body: '<div class="field"><label for="newCatName">Nome</label><input id="newCatName" name="name" type="text" maxlength="30" placeholder="Ex: Pets, Academia"></div>' +
        '<p class="field-hint">A categoria aparece em “Ganhos e gastos”' + (type === 'income' ? '.' : ' e em “Planejar gastos”.') + '</p>',
      submitLabel: 'Criar categoria',
      onSubmit: function(form){ return addCategory(form.name.value, type); }
    });
    if (r && r.id){ toast('Categoria “' + r.label + '” criada.'); return r.id; }
    return null;
  }

  /* ---------- Popup de lançamento (botão + e edição) ---------- */
  function txModalBody(t, isEdit){
    var inst = isEdit && t.installment;
    var type = t.type || 'expense';
    function typeBtn(id, label){ return '<button type="button" data-type="' + id + '"' + (type === id ? ' class="active"' : '') + (inst ? ' disabled' : '') + '>' + label + '</button>'; }
    return '<div class="type-toggle" id="mType" role="group" aria-label="Tipo de lançamento">' + typeBtn('expense', 'Gasto') + typeBtn('income', 'Ganho') + '</div>' +
      '<div class="field"><label for="mAmount">' + (inst ? 'Valor da parcela' : 'Valor') + '</label><span class="money-input"><span>R$</span><input id="mAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" inputmode="decimal" value="' + (t.amount || '') + '"' + (inst ? ' disabled' : '') + '></span></div>' +
      '<div class="field"><label for="mCategory">Categoria</label><select id="mCategory" name="category"></select></div>' +
      '<div class="field" id="mNewCatField" hidden><label for="mNewCat">Nome da nova categoria</label><input id="mNewCat" name="newCat" type="text" maxlength="30" placeholder="Ex: Pets, Academia"></div>' +
      '<div class="field"><label for="mDate">Data</label><input id="mDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + escapeHtml(t.date || todayKey()) + '"' + (inst ? ' disabled' : '') + '></div>' +
      '<div class="field" id="mPayField"><label for="mPay">Forma de pagamento</label><select id="mPay" name="pay"' + (inst ? ' disabled' : '') + '></select></div>' +
      (isEdit ? '' : '<div class="field" id="mInstallField" hidden><label for="mInstall">Parcelas</label><select id="mInstall" name="install"></select></div>') +
      '<div class="field"><label for="mDesc">Descrição (opcional)</label><input id="mDesc" name="desc" type="text" maxlength="80" placeholder="Ex: mercado da semana" value="' + escapeHtml(inst ? t.installment.baseDescription : (t.description || '')) + '"></div>' +
      (inst ? '<p class="field-hint">Parcela ' + t.installment.n + ' de ' + t.installment.total + '. A categoria e a descrição mudam em todas as parcelas. Para mudar valor, data ou número de parcelas, exclua a compra e lance de novo.</p>' : '') +
      (isEdit ? '' : '<button type="button" class="linklike" data-m-chat style="justify-self:start">Prefere escrever? Lance pelo chat</button>');
  }

  async function openTxModal(t){
    var isEdit = !!(t && t.id);
    t = t || {type: 'expense'};
    var inst = isEdit && t.installment;
    var mType = t.type || 'expense';
    await openModal({
      title: isEdit ? 'Editar lançamento' : 'Novo lançamento',
      body: txModalBody(t, isEdit),
      submitLabel: isEdit ? 'Salvar alterações' : 'Adicionar lançamento',
      onOpen: function(modal, close){
        var catSel = qs('#mCategory', modal), paySel = qs('#mPay', modal), instSel = qs('#mInstall', modal);
        function syncNewCat(){ qs('#mNewCatField', modal).hidden = catSel.value !== '__new'; }
        function fillCats(selected){
          var list = mType === 'income' ? incomeCats() : expenseCats();
          catSel.innerHTML = optionsHtml(list, selected) + '<option value="__new">+ Nova categoria…</option>';
          if (!findById(list, selected)) catSel.value = list[0].id;
          syncNewCat();
        }
        function fillInstall(){
          if (instSel) instSel.innerHTML = optionsHtml(installOptions(money(qs('#mAmount', modal).value)), instSel.value || '1');
        }
        function sync(){
          var isExp = mType === 'expense';
          qs('#mPayField', modal).hidden = !isExp;
          if (!instSel) return;
          var onCard = isExp && paySel.value.indexOf('card:') === 0 && paySel.value !== 'card:none';
          qs('#mInstallField', modal).hidden = !onCard;
          if (!onCard) instSel.value = '1';
        }
        paySel.innerHTML = optionsHtml(paymentOptions(), paymentValue(t));
        fillCats(t.category); fillInstall(); sync();
        qs('#mType', modal).addEventListener('click', function(e){
          var b = e.target.closest('button[data-type]');
          if (!b || b.disabled) return;
          mType = b.getAttribute('data-type');
          qsa('button', qs('#mType', modal)).forEach(function(x){ x.classList.toggle('active', x === b); });
          fillCats(); sync();
        });
        catSel.addEventListener('change', syncNewCat);
        paySel.addEventListener('change', function(){
          if (paySel.value.indexOf('vale') === 0 && mType === 'expense') catSel.value = 'alimentacao';
          syncNewCat(); sync();
        });
        qs('#mAmount', modal).addEventListener('input', fillInstall);
        var chat = qs('[data-m-chat]', modal);
        if (chat) chat.addEventListener('click', function(){ close(null); openQuickEntry(false); });
      },
      onSubmit: async function(form){
        var amount = inst ? t.amount : money(form.amount.value);
        if (!(amount > 0)) return {error:'Informe um valor maior que zero.'};
        var date = inst ? t.date : (form.date.value || todayKey());
        if (!validDateStr(date)) return {error:'Use uma data entre 1900 e 3000.'};
        var category = form.category.value;
        if (category === '__new'){
          var made = await addCategory(form.newCat.value, mType);
          if (made.error) return made;
          category = made.id;
        }
        var tx = {type: mType, amount: amount, category: category, categoryLabel: catLabel(category, mType), date: date, description: form.desc.value.trim()};
        if (mType === 'income'){ tx.paymentMethod = null; tx.cardId = null; tx.voucherId = null; }
        else if (!inst){
          if (form.pay.value === 'card:none') return {error:'Cadastre um cartão na aba “Cartões e vale” primeiro.'};
          applyPayment(tx, form.pay.value);
        }
        if (isEdit){ await saveTxEdit(t, tx); return true; }
        tx.createdAt = Date.now();
        var n = tx.paymentMethod === 'cartao' ? Number(form.install.value) || 1 : 1;
        await saveTransactions(expandInstallments(tx, n));
        renderAll();
        toast((mType === 'expense' ? 'Gasto' : 'Ganho') + ' de ' + fmtMoney(amount) + (n > 1 ? ' em ' + n + 'x' : '') + ' registrado.');
        return true;
      }
    });
  }

  // Na compra parcelada, categoria e descrição mudam em todas as parcelas; valor e datas ficam como estão.
  async function saveTxEdit(t, patch){
    if (t.installment){
      var base = patch.description || catLabel(patch.category, 'expense');
      var group = State.transactions.filter(function(x){ return x.installment && x.installment.group === t.installment.group; });
      for (var i=0;i<group.length;i++){
        var x = group[i];
        var p = {category: patch.category, categoryLabel: patch.categoryLabel, description: base + ' (' + x.installment.n + '/' + x.installment.total + ')',
          installment: Object.assign({}, x.installment, {baseDescription: base})};
        await Store.update(k(), 'transactions', x.id, p);
        Object.assign(x, p);
      }
    } else {
      await Store.update(k(), 'transactions', t.id, patch);
      Object.assign(t, patch);
    }
    sortTransactions();
    renderAll();
    toast('Lançamento atualizado.');
  }

  async function manageCategories(){
    var editing = null;
    function bodyHtml(){
      if (!State.categories.length) return '<p>Você ainda não criou categorias próprias. Use “+ Nova categoria” em “Planejar gastos” ou a opção “+ Nova categoria…” no campo Categoria.</p>';
      return '<div>' + State.categories.map(function(c){
        if (c.id === editing){
          return '<div class="list-row"><span class="tx-cat-dot" style="background:' + escapeHtml(c.color) + '"></span>' +
            '<input class="chat-input cat-rename" type="text" maxlength="30" value="' + escapeHtml(c.label) + '" aria-label="Novo nome da categoria">' +
            '<button class="btn btn-primary btn-sm" type="button" data-cat-save="' + escapeHtml(c.id) + '">Salvar</button></div>';
        }
        return '<div class="list-row"><span class="tx-cat-dot" style="background:' + escapeHtml(c.color) + '"></span>' +
          '<div class="tx-main"><div class="tx-desc">' + escapeHtml(c.label) + '</div><div class="tx-meta">' + (c.type === 'income' ? 'Ganho' : 'Gasto') + '</div></div>' +
          '<button class="tx-del tx-edit" type="button" data-cat-edit="' + escapeHtml(c.id) + '" aria-label="Renomear categoria" title="Renomear">' + icon('edit') + '</button>' +
          '<button class="tx-del" type="button" data-cat-del="' + escapeHtml(c.id) + '" aria-label="Excluir categoria" title="Excluir">' + icon('trash') + '</button></div>';
      }).join('') + '</div><p class="field-hint">Ao renomear, os lançamentos da categoria passam a mostrar o nome novo. Ao excluir, eles continuam guardados com o nome antigo.</p>';
    }
    await openModal({
      title: 'Minhas categorias',
      body: '<div id="catManageBody">' + bodyHtml() + '</div>',
      submitLabel: null, cancelLabel: 'Fechar',
      onOpen: function(root){
        var body = qs('#catManageBody', root);
        function redraw(){ body.innerHTML = bodyHtml(); var inp = qs('.cat-rename', body); if (inp){ inp.focus(); inp.select(); } }
        async function saveRename(id){
          var c = findById(State.categories, id);
          var name = qs('.cat-rename', body).value.trim();
          var problem = categoryNameProblem(name, c.type, c.id);
          if (problem){ qs('[data-modal-error]', root).textContent = problem; return; }
          qs('[data-modal-error]', root).textContent = '';
          await Store.update(k(), 'categories', id, {label: name});
          c.label = name;
          editing = null;
          redraw(); populateCategorySelect(document.getElementById('txCategory').value); renderAll();
          toast('Categoria renomeada para “' + name + '”.');
        }
        root.addEventListener('click', async function(e){
          var b;
          if ((b = e.target.closest('[data-cat-edit]'))){ editing = b.getAttribute('data-cat-edit'); redraw(); return; }
          if ((b = e.target.closest('[data-cat-save]'))){ saveRename(b.getAttribute('data-cat-save')); return; }
          if (!(b = e.target.closest('[data-cat-del]'))) return;
          var id = b.getAttribute('data-cat-del');
          await Store.remove(k(), 'categories', id);
          State.categories = State.categories.filter(function(c){ return c.id !== id; });
          redraw();
          populateCategorySelect();
          renderAll();
        });
        // Enter no campo de renomear salva, em vez de enviar o formulário do popup.
        root.addEventListener('keydown', function(e){
          if (e.key === 'Enter' && e.target.classList.contains('cat-rename')){ e.preventDefault(); saveRename(editing); }
        });
      }
    });
  }

  /* ---------- Compras parceladas ---------- */
  function addMonthsIso(iso, n){
    var d = parseDate(iso);
    var y = d.getFullYear(), m = d.getMonth() + n;
    var first = new Date(y, m, 1);
    return toDateKey(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), daysInMonth(first.getFullYear(), first.getMonth()))));
  }
  // Divide uma compra no cartão em N lançamentos, um por mês. Os centavos que sobram ficam na 1ª parcela.
  function expandInstallments(tx, n){
    if (!(n > 1) || tx.paymentMethod !== 'cartao') return [tx];
    var group = uid();
    var cents = Math.round(tx.amount * 100);
    var base = Math.floor(cents / n), first = cents - base * (n - 1);
    var name = tx.description || catLabel(tx.category, tx.type);
    var out = [];
    for (var i=0;i<n;i++){
      out.push(Object.assign({}, tx, {
        amount: (i === 0 ? first : base) / 100,
        date: addMonthsIso(tx.date, i),
        description: name + ' (' + (i+1) + '/' + n + ')',
        installment: {group: group, n: i+1, total: n, totalAmount: tx.amount, baseDescription: name},
        createdAt: tx.createdAt + i
      }));
    }
    return out;
  }
  async function saveTransactions(list){
    var saved = [];
    for (var i=0;i<list.length;i++){
      var s = await Store.add(k(), 'transactions', list[i]);
      State.transactions.unshift(s);
      saved.push(s);
    }
    sortTransactions();
    checkBudgetAlerts(saved);
    return saved;
  }

  // Avisa na hora quando um gasto do mês atual faz a categoria chegar a 80% ou passar do planejado.
  function checkBudgetAlerts(newTx){
    var cur = monthBounds(0).key, added = {};
    newTx.forEach(function(t){ if (t.type === 'expense' && monthKeyOf(t.date) === cur) added[t.category] = (added[t.category]||0) + Number(t.amount); });
    var spentNow = expenseCategoryTotals(cur);
    Object.keys(added).forEach(function(cat){
      var limit = budgetLimit(cur, cat);
      if (!limit) return;
      var after = spentNow[cat] || 0, before = after - added[cat];
      var name = catLabel(cat, 'expense');
      if (after > limit && before <= limit){
        toast('Atenção: você passou ' + fmtMoney(after - limit) + ' do planejado para ' + name + ' neste mês.');
      } else if (after >= 0.8 * limit && before < 0.8 * limit){
        toast('Você já usou ' + Math.round(100 * after / limit) + '% do planejado para ' + name + '. Restam ' + fmtMoney(limit - after) + '.');
      }
    });
  }
  // Agrupa as parcelas de cada compra. "Pagas" = parcelas com data até hoje (já entraram em fatura).
  function installmentGroups(){
    var map = {}, today = todayKey();
    State.transactions.forEach(function(t){
      if (!t.installment) return;
      var g = map[t.installment.group];
      if (!g) g = map[t.installment.group] = {id: t.installment.group, name: t.installment.baseDescription, total: t.installment.total,
        totalAmount: Number(t.installment.totalAmount), cardId: t.cardId, category: t.category, items: []};
      g.items.push(t);
    });
    return Object.keys(map).map(function(key){
      var g = map[key];
      g.items.sort(function(a,b){ return a.installment.n - b.installment.n; });
      g.paid = g.items.filter(function(t){ return t.date <= today; });
      g.future = g.items.filter(function(t){ return t.date > today; });
      g.advanced = g.total - g.items.length;
      g.remaining = sum(g.future, function(t){ return t.amount; });
      g.perInstallment = g.items.length ? g.items[g.items.length-1].amount : 0;
      g.lastDate = g.items.length ? g.items[g.items.length-1].date : '';
      g.card = findById(State.cards, g.cardId);
      return g;
    }).sort(function(a,b){ return a.lastDate.localeCompare(b.lastDate); });
  }
  function installmentRowHtml(g, withCard){
    var pct = g.total > 0 ? (g.paid.length + g.advanced) / g.total : 0;
    return '<div class="debt-card">' +
      '<div class="budget-top"><h4>' + escapeHtml(g.name) + '</h4><span class="pill">' + g.total + 'x' + (withCard && g.card ? ' · ' + escapeHtml(g.card.name) : '') + '</span></div>' +
      '<div class="progress"><span style="width:' + (pct*100) + '%; background:var(--good)"></span></div>' +
      '<div class="debt-figs"><span class="tabular">Parcela ' + Math.min(g.total, g.paid.length + g.advanced) + ' de ' + g.total + ' · ' + fmtMoney(g.perInstallment) + '</span><span class="tabular">Falta: ' + fmtMoney(g.remaining) + '</span></div>' +
      '<span class="tx-meta">Compra de ' + fmtMoney(g.totalAmount) + (g.advanced ? ' · ' + g.advanced + ' parcela(s) adiantada(s)' : '') + (g.future.length ? ' · última parcela em ' + formatDateFull(g.lastDate) : '') + '</span>' +
      '<div class="card-actions">' + (g.future.length ? '<button class="btn btn-ghost btn-sm" type="button" data-adv-group="' + escapeHtml(g.id) + '">Adiantar pagamento</button>' : '<span class="status-pill good">Quitada</span>') + '</div>' +
      '</div>';
  }

  async function advanceInstallments(groupId){
    var g = installmentGroups().filter(function(x){ return x.id === groupId; })[0];
    if (!g || !g.future.length) return;
    var R = g.future.length;
    var counts = [];
    for (var i=R;i>=1;i--) counts.push({id: String(i), label: i === R ? 'Todas as ' + R + ' restantes' : i + ' parcela(s)'});
    function totalFor(n){ return sum(g.future.slice(R - n), function(t){ return t.amount; }); }
    var r = await openModal({
      title: 'Adiantar pagamento',
      body: '<p>“' + escapeHtml(g.name) + '”: faltam ' + R + ' parcela(s) de ' + fmtMoney(g.perInstallment) + ', total de ' + fmtMoney(g.remaining) + '. As últimas parcelas são as adiantadas.</p>' +
        '<div class="field"><label for="advCount">Quantas parcelas quer adiantar?</label><select id="advCount" name="count">' + optionsHtml(counts, String(R)) + '</select></div>' +
        '<p>Valor sem desconto: <strong id="advTotal" class="tabular">' + fmtMoney(g.remaining) + '</strong></p>' +
        '<fieldset class="radio-group"><legend>Teve desconto adiantando o pagamento?</legend>' +
          '<label class="check"><input type="radio" name="disc" value="sim"> Sim</label>' +
          '<label class="check"><input type="radio" name="disc" value="nao" checked> Não</label>' +
        '</fieldset>' +
        '<div class="field" id="advPaidField" hidden><label for="advPaid">Quanto você pagou?</label><span class="money-input"><span>R$</span><input id="advPaid" name="paid" type="number" step="0.01" min="0.01" max="99999999"></span></div>' +
        '<div class="tip-box" id="advTip"><strong>Dica: veja se compensa.</strong> Sem desconto, adiantar não gera economia: o dinheiro sai antes e deixa de render até a data das parcelas. Costuma valer a pena só se você precisa liberar limite do cartão. Se a compra tem juros, peça o abatimento: o Código de Defesa do Consumidor (art. 52, §2º) garante a redução proporcional dos juros para quem antecipa o pagamento.</div>' +
        '<p class="field-hint">O valor pago entra na fatura atual do cartão' + (g.card ? ' ' + escapeHtml(g.card.name) : '') + '.</p>',
      submitLabel: 'Adiantar',
      onOpen: function(modal){
        function sync(){
          var n = Number(qs('#advCount', modal).value);
          qs('#advTotal', modal).textContent = fmtMoney(totalFor(n));
          var yes = qs('input[name=disc][value=sim]', modal).checked;
          qs('#advPaidField', modal).hidden = !yes;
          qs('#advTip', modal).hidden = yes;
        }
        modal.addEventListener('change', sync);
        sync();
      },
      onSubmit: function(form){
        var n = Number(form.count.value);
        var total = money(totalFor(n));
        var yes = form.disc.value === 'sim';
        var paid = yes ? money(form.paid.value) : total;
        if (yes && !(paid > 0)) return {error:'Informe quanto você pagou com o desconto.'};
        if (yes && paid >= total) return {error:'Com desconto, o valor pago precisa ser menor que ' + fmtMoney(total) + '. Se não teve desconto, marque “Não”.'};
        return {n: n, total: total, paid: paid};
      }
    });
    if (!r || !r.n) return;
    var toRemove = g.future.slice(R - r.n);
    for (var j=0;j<toRemove.length;j++){ await Store.remove(k(), 'transactions', toRemove[j].id); }
    var ids = toRemove.map(function(t){ return t.id; });
    State.transactions = State.transactions.filter(function(t){ return ids.indexOf(t.id) < 0; });
    await saveTransactions([{type:'expense', amount: r.paid, category: g.category, categoryLabel: catLabel(g.category, 'expense'), date: todayKey(),
      description: g.name + ' (adiantamento de ' + r.n + ' parcela' + (r.n > 1 ? 's' : '') + ')', paymentMethod:'cartao', cardId: g.cardId,
      installmentAdvance: {group: g.id, count: r.n, original: r.total, discount: money(r.total - r.paid)}, createdAt: Date.now()}]);
    renderAll();
    toast(r.total > r.paid ? 'Adiantamento registrado. Você economizou ' + fmtMoney(r.total - r.paid) + '!' : 'Adiantamento de ' + fmtMoney(r.paid) + ' registrado.');
  }

  /* ---------- Relatório por cartão ---------- */
  async function cardReport(cardId){
    var c = findById(State.cards, cardId);
    var cats = [{id:'all', label:'Todas as categorias'}].concat(expenseCats().map(function(x){ return {id:x.id, label:x.label}; }));
    var periods = [{id:'1', label:'Fatura atual'}, {id:'3', label:'Últimas 3 faturas'}, {id:'6', label:'Últimas 6 faturas'}, {id:'12', label:'Últimas 12 faturas'}, {id:'next', label:'Próximas faturas (parcelas)'}];
    var st = {period:'6', cat:'all'};
    function keys(){
      var base = invoiceKeyFor(todayKey(), c), out = [];
      if (st.period === 'next'){ for (var i=1;i<=12;i++) out.push(shiftMonthKey(base, i)); return out; }
      for (var j=Number(st.period)-1;j>=0;j--) out.push(shiftMonthKey(base, -j));
      return out;
    }
    function data(){
      var ks = keys();
      var rows = ks.map(function(key){
        var items = invoiceItems(c, key).filter(function(t){ return st.cat === 'all' || t.category === st.cat; });
        return {key:key, items:items, total: sum(items, function(t){ return t.amount; })};
      });
      if (st.period === 'next') rows = rows.filter(function(r){ return r.total > 0; });
      var byCat = {};
      rows.forEach(function(r){ r.items.forEach(function(t){ byCat[t.category] = (byCat[t.category]||0) + Number(t.amount); }); });
      var catRows = expenseCats().map(function(x){ return {label:x.label, color:x.color, value: byCat[x.id]||0}; }).filter(function(x){ return x.value > 0; }).sort(function(a,b){ return b.value - a.value; });
      return {rows: rows, catRows: catRows, total: sum(rows, function(r){ return r.total; })};
    }
    function render(modal){
      var d = data();
      var max = Math.max(1, Math.max.apply(null, d.rows.map(function(r){ return r.total; }).concat([0])));
      qs('#crBody', modal).innerHTML = !d.total ? '<p class="empty-state">Nenhuma compra neste período' + (st.cat !== 'all' ? ' nessa categoria' : '') + '.</p>' :
        '<div class="tile"><span class="tile-lbl">Total no período</span><span class="tile-val tabular">' + fmtMoney(d.total) + '</span></div>' +
        '<h4>Por fatura</h4><div class="report-bars">' + d.rows.map(function(r){
          return '<div class="report-bar"><span>' + monthLabelOf(r.key) + '</span><span class="bar-track"><span style="width:' + (100*r.total/max) + '%"></span></span><strong class="tabular">' + fmtMoney(r.total) + '</strong></div>';
        }).join('') + '</div>' +
        '<h4>Por categoria</h4><div class="table-scroll"><table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' + d.catRows.map(function(x){
          return '<tr><td><span class="legend-swatch" style="display:inline-block;margin-right:6px;background:' + resolveVar(x.color) + '"></span>' + escapeHtml(x.label) + '</td><td class="tabular">' + fmtMoney(x.value) + '</td><td class="tabular">' + Math.round(100*x.value/d.total) + '%</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function pdf(){
      if (!pdfReady()) return;
      var d = data();
      var w = pdfWriter('Relatório do cartão ' + c.name, labelOf(periods, st.period) + '  ·  ' + labelOf(cats, st.cat));
      w.section('Por fatura'); w.header(['Fatura', 'Total'], [220, 140]);
      d.rows.forEach(function(r){ w.row([monthLabelOf(r.key), fmtMoney(r.total)], [220, 140]); });
      w.row(['Total', fmtMoney(d.total)], [220, 140], {bold:true}); w.space(12);
      w.section('Por categoria');
      if (!d.catRows.length) w.text('Nenhuma compra no período.');
      else { w.header(['Categoria', 'Valor', '%'], [220, 140, 80]); d.catRows.forEach(function(x){ w.row([x.label, fmtMoney(x.value), Math.round(100*x.value/d.total) + '%'], [220, 140, 80]); }); }
      w.footer();
      saveFile('grana-leve-relatorio-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '.pdf', w.doc.output('blob'), 'application/pdf').then(function(){ toast('Relatório baixado.'); });
    }
    await openModal({
      title: 'Relatório · ' + c.name, wide: true, submitLabel: null, cancelLabel: 'Fechar',
      body: '<div class="report-filters">' +
          '<div class="field"><label for="crPeriod">Período</label><select id="crPeriod">' + optionsHtml(periods, st.period) + '</select></div>' +
          '<div class="field"><label for="crCat">Categoria</label><select id="crCat">' + optionsHtml(cats, st.cat) + '</select></div>' +
        '</div><div id="crBody" class="stack"></div>' +
        '<div class="pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-cr-pdf>Baixar em PDF</button></div>',
      onOpen: function(modal){
        render(modal);
        modal.addEventListener('change', function(){ st.period = qs('#crPeriod', modal).value; st.cat = qs('#crCat', modal).value; render(modal); });
        qs('[data-cr-pdf]', modal).addEventListener('click', pdf);
      }
    });
  }

  /* ---------- Cartões e faturas ---------- */
  // A fatura é identificada pelo mês em que fecha. Compra feita depois do dia de fechamento vai para a fatura seguinte.
  function invoiceKeyFor(dateStr, card){
    var d = parseDate(dateStr);
    var m = d.getMonth() + (d.getDate() > Number(card.closingDay) ? 1 : 0);
    var x = new Date(d.getFullYear(), m, 1);
    return x.getFullYear() + '-' + pad2(x.getMonth()+1);
  }
  function invoiceDates(key, card){
    var y = Number(key.slice(0,4)), m = Number(key.slice(5,7)) - 1;
    var closing = new Date(y, m, Math.min(Number(card.closingDay), daysInMonth(y, m)));
    var dueMonth = Number(card.dueDay) > Number(card.closingDay) ? m : m + 1;
    var dm = new Date(y, dueMonth, 1);
    var due = new Date(dm.getFullYear(), dm.getMonth(), Math.min(Number(card.dueDay), daysInMonth(dm.getFullYear(), dm.getMonth())));
    return {closing: toDateKey(closing), due: toDateKey(due)};
  }
  function invoiceItems(card, key){
    return State.transactions.filter(function(t){
      return t.type === 'expense' && t.paymentMethod === 'cartao' && t.cardId === card.id && invoiceKeyFor(t.date, card) === key;
    }).sort(function(a,b){ return a.date.localeCompare(b.date); });
  }
  function invoiceStatus(card, key){
    if ((card.paidInvoices || []).indexOf(key) >= 0) return 'paga';
    var d = invoiceDates(key, card), today = todayKey();
    if (today > d.due) return 'vencida';
    if (today > d.closing) return 'fechada';
    return 'aberta';
  }
  function cardUsed(card){
    var keys = {};
    State.transactions.forEach(function(t){
      if (t.type === 'expense' && t.paymentMethod === 'cartao' && t.cardId === card.id) keys[invoiceKeyFor(t.date, card)] = true;
    });
    return sum(Object.keys(keys).filter(function(key){ return invoiceStatus(card, key) !== 'paga'; }), function(key){
      return sum(invoiceItems(card, key), function(t){ return t.amount; });
    });
  }
  function shiftMonthKey(key, n){
    var d = new Date(Number(key.slice(0,4)), Number(key.slice(5,7)) - 1 + n, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth()+1);
  }

  var INVOICE_PILL = {aberta:'good', fechada:'warning', vencida:'critical', paga:'good'};

  function renderCards(){
    var wrap = document.getElementById('cardList');
    if (!State.cards.length){ wrap.innerHTML = '<p class="empty-state">Nenhum cartão cadastrado. Cadastre acima para acompanhar faturas e limite.</p>'; return; }
    wrap.innerHTML = State.cards.map(function(c){
      var baseKey = invoiceKeyFor(todayKey(), c);
      var key = shiftMonthKey(baseKey, State.invoiceOffsets[c.id] || 0);
      var items = invoiceItems(c, key);
      var total = sum(items, function(t){ return t.amount; });
      var dates = invoiceDates(key, c);
      var status = invoiceStatus(c, key);
      var used = cardUsed(c);
      var limit = Number(c.limit) || 0;
      var pct = limit > 0 ? Math.min(1, used/limit) : 0;
      return '<div class="credit-card">' +
        '<div class="credit-card-top">' +
          '<div><h4>' + escapeHtml(c.name) + '</h4><span class="sub">Fecha dia ' + c.closingDay + ' · vence dia ' + c.dueDay + '</span></div>' +
          '<div class="avail"><span class="sub">Limite disponível</span><strong class="tabular">' + fmtMoney(Math.max(0, limit - used)) + '</strong><span class="sub">de ' + fmtMoney(limit) + '</span></div>' +
        '</div>' +
        '<div class="credit-card-body">' +
          '<div class="progress" title="Limite usado"><span style="width:' + (pct*100) + '%; background:' + (pct >= 0.9 ? 'var(--critical)' : pct >= 0.7 ? 'var(--warning)' : 'var(--brand)') + '"></span></div>' +
          '<div class="invoice-head">' +
            '<div class="month-switch">' +
              '<button type="button" data-inv-shift="' + c.id + '" data-dir="-1" aria-label="Fatura anterior">' + icon('chevron-left') + '</button>' +
              '<strong>Fatura de ' + monthLabelOf(key) + '</strong>' +
              '<button type="button" data-inv-shift="' + c.id + '" data-dir="1" aria-label="Próxima fatura">' + icon('chevron-right') + '</button>' +
            '</div>' +
            '<span class="status-pill ' + INVOICE_PILL[status] + '">' + status + '</span>' +
          '</div>' +
          '<div class="invoice-head"><span class="invoice-total tabular">' + fmtMoney(total) + '</span>' +
            '<span class="meta-line"><span>Fecha ' + formatDateFull(dates.closing) + '</span><span>Vence ' + formatDateFull(dates.due) + '</span></span></div>' +
          (items.length ? '<details class="budget-details"><summary>Ver ' + items.length + ' compra(s)</summary>' + items.map(txRowHtml).join('') + '</details>' : '<p class="tx-meta">Nenhuma compra nesta fatura.</p>') +
          (function(){
            var gs = installmentGroups().filter(function(g){ return g.cardId === c.id && g.future.length; });
            return gs.length ? '<details class="budget-details" open><summary>Compras parceladas (' + gs.length + ')</summary><div class="debt-grid" style="margin-top:8px">' + gs.map(function(g){ return installmentRowHtml(g, false); }).join('') + '</div></details>' : '';
          })() +
          '<div class="card-actions">' +
            '<button class="btn btn-ghost btn-sm" type="button" data-inv-pdf="' + c.id + '" data-key="' + key + '">Ver fatura em PDF</button>' +
            (total > 0 ? '<button class="btn btn-ghost btn-sm" type="button" data-inv-paid="' + c.id + '" data-key="' + key + '">' + (status === 'paga' ? 'Desmarcar paga' : 'Marcar como paga') + '</button>' : '') +
            '<button class="btn btn-ghost btn-sm" type="button" data-card-report="' + c.id + '">Relatório</button>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-card-edit="' + c.id + '">Editar</button>' +
            '<button class="btn btn-danger btn-sm" type="button" data-card-del="' + c.id + '">Excluir</button>' +
          '</div>' +
        '</div></div>';
    }).join('');
  }

  function cardFormBody(c){
    c = c || {};
    return '<div class="field"><label for="ecName">Nome do cartão</label><input id="ecName" name="name" type="text" maxlength="40" value="' + escapeHtml(c.name||'') + '"></div>' +
      '<div class="field"><label for="ecLimit">Limite</label><span class="money-input"><span>R$</span><input id="ecLimit" name="limit" type="number" step="0.01" min="0" max="99999999" value="' + (c.limit||'') + '"></span></div>' +
      '<div class="field"><label for="ecClosing">Dia do fechamento</label><input id="ecClosing" name="closing" type="number" min="1" max="31" value="' + (c.closingDay||'') + '"></div>' +
      '<div class="field"><label for="ecDue">Dia do vencimento</label><input id="ecDue" name="due" type="number" min="1" max="31" value="' + (c.dueDay||'') + '"></div>';
  }
  function readCardFields(name, limit, closing, due){
    name = String(name).trim();
    limit = money(limit); closing = Number(closing); due = Number(due);
    if (!name) return {error:'Dê um nome para o cartão.'};
    if (!(limit >= 0)) return {error:'Informe o limite do cartão.'};
    if (!(closing >= 1 && closing <= 31) || !(due >= 1 && due <= 31) || closing % 1 || due % 1) return {error:'Os dias de fechamento e vencimento vão de 1 a 31.'};
    return {name:name, limit:limit, closingDay:closing, dueDay:due};
  }

  async function editCard(id){
    var c = findById(State.cards, id);
    await openModal({
      title: 'Editar cartão', body: cardFormBody(c),
      onSubmit: async function(form){
        var v = readCardFields(form.name.value, form.limit.value, form.closing.value, form.due.value);
        if (v.error) return v;
        await Store.update(k(), 'cards', id, v);
        Object.assign(c, v);
        renderCards(); populatePaymentSelect();
        toast('Cartão atualizado.');
      }
    });
  }

  /* ---------- Vale-alimentação / refeição ---------- */
  // Gastos antigos com "vale" sem vale cadastrado contam no primeiro vale.
  function voucherOf(t){
    if (t.voucherId) return findById(State.vouchers, t.voucherId);
    return State.vouchers[0] || null;
  }
  function voucherTx(v){
    return State.transactions.filter(function(t){ return t.type === 'expense' && t.paymentMethod === 'vale' && voucherOf(t) === v; });
  }
  function monthsBetween(fromKey, toKey){
    return (Number(toKey.slice(0,4)) - Number(fromKey.slice(0,4))) * 12 + Number(toKey.slice(5,7)) - Number(fromKey.slice(5,7));
  }
  // Saldo: com acúmulo, parte do saldo informado (ou do primeiro crédito) e soma um crédito por mês;
  // sem acúmulo, é o crédito do mês menos o que foi gasto no mês.
  function voucherBalance(v){
    var cur = monthBounds(0).key;
    var all = voucherTx(v);
    if (!v.carryOver){
      return money(Number(v.amount) - sum(all.filter(function(t){ return monthKeyOf(t.date) === cur; }), function(t){ return t.amount; }));
    }
    var start = v.startDate || todayKey();
    var base = v.initialBalance !== null && v.initialBalance !== undefined && v.initialBalance !== '' ? Number(v.initialBalance) : Number(v.amount);
    var credits = base + Number(v.amount) * Math.max(0, monthsBetween(monthKeyOf(start), cur));
    var spent = sum(all.filter(function(t){ return t.date >= start; }), function(t){ return t.amount; });
    return money(credits - spent);
  }

  function renderVouchers(){
    var wrap = document.getElementById('voucherList');
    if (!State.vouchers.length){ wrap.innerHTML = ''; return; }
    var cur = monthBounds(0).key;
    wrap.innerHTML = State.vouchers.map(function(v){
      var monthTx = voucherTx(v).filter(function(t){ return monthKeyOf(t.date) === cur; });
      var spent = sum(monthTx, function(t){ return t.amount; });
      var bal = voucherBalance(v);
      var pct = Number(v.amount) > 0 ? Math.min(1, spent / Number(v.amount)) : 0;
      return '<div class="goal-card">' +
        '<div class="budget-top"><h4>' + escapeHtml(v.name) + '</h4><span class="pill">' + (v.carryOver ? 'saldo acumula' : 'saldo zera todo mês') + '</span></div>' +
        '<div class="goal-figs"><span>Saldo disponível</span><strong class="tabular ' + (bal < 0 ? 'neg-text' : '') + '">' + fmtMoney(bal) + '</strong></div>' +
        '<div class="progress" title="Gasto do crédito deste mês"><span style="width:' + (pct*100) + '%; background:' + (pct >= 1 ? 'var(--critical)' : pct >= 0.8 ? 'var(--warning)' : 'var(--brand)') + '"></span></div>' +
        '<div class="meta-line"><span>Cai por mês: ' + fmtMoney(v.amount) + '</span><span>Gasto em ' + monthLabelOf(cur) + ': ' + fmtMoney(spent) + '</span></div>' +
        (monthTx.length ? '<details class="budget-details"><summary>Ver ' + monthTx.length + ' gasto(s) deste mês</summary>' + monthTx.map(txRowHtml).join('') + '</details>' : '') +
        '<div class="card-actions">' +
          '<button class="btn btn-ghost btn-sm" type="button" data-voucher-edit="' + v.id + '">Editar</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-voucher-del="' + v.id + '">Excluir</button>' +
        '</div></div>';
    }).join('');
  }

  async function editVoucher(id){
    var v = findById(State.vouchers, id);
    await openModal({
      title: 'Editar vale',
      body: '<div class="field"><label for="evName">Nome</label><input id="evName" name="name" type="text" maxlength="30" value="' + escapeHtml(v.name) + '"></div>' +
        '<div class="field"><label for="evAmount">Valor que cai por mês</label><span class="money-input"><span>R$</span><input id="evAmount" name="amount" type="number" step="0.01" min="0.01" max="99999999" value="' + v.amount + '"></span></div>' +
        '<div class="field"><label for="evBalance">Saldo atual</label><span class="money-input"><span>R$</span><input id="evBalance" name="balance" type="number" step="0.01" min="0" max="99999999" value="' + voucherBalance(v) + '"></span><span class="field-hint">Corrija aqui se o saldo do app estiver diferente do saldo real do cartão.</span></div>' +
        '<label class="check"><input type="checkbox" name="carry"' + (v.carryOver ? ' checked' : '') + '> Saldo acumula de um mês para o outro</label>',
      onSubmit: async function(form){
        var name = form.name.value.trim(), amount = money(form.amount.value);
        if (!name || !(amount > 0)) return {error:'Informe o nome e o valor mensal do vale.'};
        var patch = {name:name, amount:amount, carryOver: form.carry.checked};
        var bal = money(form.balance.value);
        if (form.carry.checked && bal !== voucherBalance(v)){ patch.initialBalance = bal; patch.startDate = todayKey(); patch.adjustedAt = Date.now(); }
        // Ao reajustar o saldo, gastos de hoje já lançados não podem descontar de novo.
        if (patch.startDate){
          patch.initialBalance = money(bal + sum(voucherTx(v).filter(function(t){ return t.date >= patch.startDate; }), function(t){ return t.amount; }));
        }
        await Store.update(k(), 'vouchers', id, patch);
        Object.assign(v, patch);
        renderVouchers(); populatePaymentSelect();
        toast('Vale atualizado.');
      }
    });
  }

  /* ---------- PDF ---------- */
  function pdfWriter(title, subtitle){
    var doc = new window.jspdf.jsPDF({unit:'pt', format:'a4'});
    var pageW = doc.internal.pageSize.getWidth();
    var marginX = 48, line = [225,224,217];
    var w = {doc: doc, y: 56};
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(20,20,20);
    doc.text(title, marginX, w.y); w.y += 20;
    doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85);
    doc.text(subtitle, marginX, w.y); w.y += 6;
    doc.setDrawColor.apply(doc, line); doc.line(marginX, w.y+8, pageW-marginX, w.y+8);
    w.y += 30;
    function ensure(space){ if (w.y + space > 770){ doc.addPage(); w.y = 56; } }
    w.section = function(t){ ensure(40); doc.setFont('helvetica','bold'); doc.setFontSize(12.5); doc.setTextColor(20,20,20); doc.text(t, marginX, w.y); w.y += 16; };
    w.header = function(cols, widths){
      ensure(30);
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(110,108,100);
      var x = marginX; cols.forEach(function(c,i){ doc.text(c, x, w.y); x += widths[i]; });
      w.y += 8; doc.setDrawColor.apply(doc, line); doc.line(marginX, w.y, pageW-marginX, w.y); w.y += 14;
    };
    w.row = function(cells, widths, opts){
      opts = opts || {};
      ensure(17);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(10.5); doc.setTextColor(30,30,28);
      var x = marginX;
      cells.forEach(function(c,i){ doc.text(doc.splitTextToSize(String(c), widths[i]-8)[0] || '', x, w.y); x += widths[i]; });
      w.y += 17;
    };
    w.text = function(t){ ensure(20); doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85); doc.text(t, marginX, w.y); w.y += 20; };
    w.space = function(n){ w.y += n; };
    w.footer = function(){
      var pages = doc.getNumberOfPages();
      for (var i=1;i<=pages;i++){
        doc.setPage(i);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(140,138,130);
        doc.text('Gerado pelo Grana Leve em ' + new Date().toLocaleDateString('pt-BR') + '  ·  página ' + i + ' de ' + pages, marginX, 810);
      }
    };
    return w;
  }

  // Mostra o PDF dentro do sistema, com opções de baixar e compartilhar.
  async function showPdf(doc, filename, title){
    var blob = doc.output('blob');
    var url = URL.createObjectURL(blob);
    var file = null, canShare = false;
    try{ file = new File([blob], filename, {type:'application/pdf'}); canShare = !!(navigator.canShare && navigator.canShare({files:[file]})); } catch(e){}
    await openModal({
      title: title, wide: true, submitLabel: null, cancelLabel: 'Fechar',
      body: '<iframe class="pdf-frame" src="' + url + '" title="' + escapeHtml(title) + '"></iframe>' +
        '<p class="field-hint">Se a pré-visualização não aparecer (comum no celular), use os botões abaixo.</p>' +
        '<div class="pdf-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-pdf="download">Baixar PDF</button>' +
          (canShare ? '<button type="button" class="btn btn-ghost btn-sm" data-pdf="share">Compartilhar</button>' : '') +
          '<button type="button" class="btn btn-ghost btn-sm" data-pdf="open">Abrir em nova aba</button>' +
        '</div>',
      onOpen: function(root){
        root.addEventListener('click', function(e){
          var b = e.target.closest('[data-pdf]');
          if (!b) return;
          var act = b.getAttribute('data-pdf');
          if (act === 'download') saveFile(filename, blob, 'application/pdf').then(function(){ toast('PDF baixado.'); });
          if (act === 'share') navigator.share({files:[file], title:title}).catch(function(){});
          if (act === 'open') window.open(url, '_blank', 'noopener');
        });
      },
      onClose: function(){ setTimeout(function(){ URL.revokeObjectURL(url); }, 60000); }
    });
  }

  function pdfReady(){
    if (!window.jspdf || !window.jspdf.jsPDF){ toast('Não foi possível carregar o gerador de PDF agora. Verifique a internet.'); return false; }
    return true;
  }

  function generateInvoicePdf(cardId, key){
    if (!pdfReady()) return;
    var c = findById(State.cards, cardId);
    var items = invoiceItems(c, key);
    var dates = invoiceDates(key, c);
    var w = pdfWriter('Fatura ' + c.name + ' · ' + monthLabelOf(key), (State.session ? State.session.name : '') + '  ·  Fecha ' + formatDateFull(dates.closing) + '  ·  Vence ' + formatDateFull(dates.due));
    w.section('Resumo');
    w.row(['Total da fatura', fmtMoney(sum(items, function(t){ return t.amount; }))], [200, 200], {bold:true});
    w.row(['Situação', invoiceStatus(c, key)], [200, 200]);
    w.row(['Limite do cartão', fmtMoney(c.limit)], [200, 200]);
    w.space(12);
    w.section('Compras');
    if (!items.length){ w.text('Nenhuma compra nesta fatura.'); }
    else {
      var widths = [70, 190, 130, 100];
      w.header(['Data', 'Descrição', 'Categoria', 'Valor'], widths);
      items.forEach(function(t){ w.row([formatDateFull(t.date), t.description || '-', catLabel(t.category, 'expense', t.categoryLabel), fmtMoney(t.amount)], widths); });
    }
    w.footer();
    showPdf(w.doc, 'grana-leve-fatura-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + key + '.pdf', 'Fatura ' + c.name + ' · ' + monthLabelOf(key));
  }

  function pct1(n){ return (Math.round(n*10)/10).toString().replace('.',','); }

  function generateMonthlyReport(){
    if (!pdfReady()) return;
    var cur = monthBounds(0), prev = monthBounds(-1);
    var curT = monthTotals(cur.key), prevT = monthTotals(prev.key);
    var curCats = expenseCategoryTotals(cur.key), prevCats = expenseCategoryTotals(prev.key);
    var cats = expenseCats().map(function(c){ return {label:c.label, cur:curCats[c.id]||0, prev:prevCats[c.id]||0}; })
      .filter(function(c){ return c.cur>0 || c.prev>0; }).sort(function(a,b){ return b.cur-a.cur; });
    function deltaText(a, b){ var d = pctDelta(a, b); if (d === null) return (a>0 && !b) ? 'novo' : '-'; return (d>=0?'+':'') + pct1(d) + '%'; }

    var title = cur.label.charAt(0).toUpperCase() + cur.label.slice(1);
    var w = pdfWriter('Grana Leve · Relatório mensal', title + '  ·  ' + (State.session ? State.session.name : ''));
    var W4 = [140,130,130,80];
    w.section('Resumo do mês');
    w.header(['', 'Este mês', 'Mês anterior', 'Variação'], W4);
    w.row(['Ganhos', fmtMoney(curT.income), fmtMoney(prevT.income), deltaText(curT.income, prevT.income)], W4);
    w.row(['Gastos', fmtMoney(curT.expense), fmtMoney(prevT.expense), deltaText(curT.expense, prevT.expense)], W4);
    w.row(['Saldo', fmtMoney(curT.saldo), fmtMoney(prevT.saldo), deltaText(curT.saldo, prevT.saldo)], W4, {bold:true});
    w.space(12);

    w.section('Gastos por categoria');
    if (!cats.length) w.text('Nenhum gasto registrado neste mês.');
    else { w.header(['Categoria', 'Este mês', 'Mês anterior', 'Variação'], [160,120,120,80]); cats.forEach(function(c){ w.row([c.label, fmtMoney(c.cur), fmtMoney(c.prev), deltaText(c.cur, c.prev)], [160,120,120,80]); }); }
    w.space(12);

    var goals = State.goals.filter(function(g){ return !g.deletedAt; });
    w.section('Metas de economia');
    if (!goals.length) w.text('Nenhuma meta cadastrada.');
    else { w.header(['Meta', 'Guardado', 'Objetivo', 'Progresso'], [180,110,110,80]); goals.forEach(function(g){ var p = g.targetAmount>0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0; w.row([g.name, fmtMoney(g.currentAmount||0), fmtMoney(g.targetAmount), Math.round(p*100)+'%'], [180,110,110,80]); }); }
    w.space(12);

    w.section('Dívidas');
    if (!State.debts.length) w.text('Nenhuma dívida cadastrada.');
    else { w.header(['Dívida', 'Pago', 'Falta', 'Total'], [180,110,110,80]); State.debts.forEach(function(d){ w.row([d.name, fmtMoney(d.paidAmount||0), fmtMoney(Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0))), fmtMoney(d.totalAmount)], [180,110,110,80]); }); }
    var openGroups = installmentGroups().filter(function(g){ return g.future.length; });
    if (openGroups.length){
      w.space(8); w.section('Compras parceladas no cartão');
      w.header(['Compra', 'Parcela', 'Falta', 'Total'], [180,110,110,80]);
      openGroups.forEach(function(g){ w.row([g.name, (g.paid.length + g.advanced) + ' de ' + g.total, fmtMoney(g.remaining), fmtMoney(g.totalAmount)], [180,110,110,80]); });
    }
    w.space(12);

    w.section('A receber');
    var recv = State.receivables.filter(function(r){ return Number(r.receivedAmount||0) < Number(r.totalAmount||0); });
    if (!recv.length) w.text('Nada pendente para receber.');
    else { w.header(['Pessoa', 'Tipo', 'Falta receber', 'Combinado'], [160,140,100,80]); recv.forEach(function(r){ w.row([r.person, labelOf(RECV_KINDS, r.kind), fmtMoney(Number(r.totalAmount)-Number(r.receivedAmount||0)), r.dueDate ? formatDateFull(r.dueDate) : '-'], [160,140,100,80]); }); }

    w.footer();
    showPdf(w.doc, 'grana-leve-relatorio-' + cur.key + '.pdf', 'Relatório de ' + cur.label);
  }

  /* ---------- Planejar gastos (aba "limites") ---------- */
  function statusForPct(pct){
    if (pct >= 1) return 'critical';
    if (pct >= 0.8) return 'warning';
    return 'good';
  }
  var statusLabel = {good:'sob controle', warning:'quase no limite', critical:'estourou'};

  // Cada mês guarda o próprio planejamento em budgetMonths[mês]. Um mês sem planejamento próprio
  // usa o do último mês planejado antes dele; sem nenhum, usa os valores antigos (budgetBase),
  // de quando o planejamento valia para todos os meses.
  function budgetsFor(key){
    var best = null;
    Object.keys(State.budgetMonths).forEach(function(m){ if (m <= key && (!best || m > best)) best = m; });
    return best ? State.budgetMonths[best] : State.budgetBase;
  }
  function budgetLimit(key, cat){ return Number(budgetsFor(key)[cat] || 0); }
  // Só o mês atual e o próximo podem mudar; os meses que já passaram ficam travados.
  function budgetLocked(key){ return key < monthBounds(0).key; }
  async function setBudget(key, cat, val){
    var plan = Object.assign({}, budgetsFor(key));
    if (val > 0) plan[cat] = val; else delete plan[cat];
    await Store.put(k(), 'budgets', 'plan-' + key, {month: key, limits: plan});
    State.budgetMonths[key] = plan;
  }

  function renderBudgets(){
    var mb = monthBounds(State.budgetMonthOffset);
    var locked = budgetLocked(mb.key);
    document.getElementById('budgetMonthLabel').textContent = mb.label;
    document.getElementById('budgetNext').disabled = State.budgetMonthOffset >= 1;
    document.getElementById('budgetNote').innerHTML = locked ?
      icon('lock') + ' Mês encerrado: o planejamento fica como estava e não pode ser alterado.' :
      (State.budgetMonthOffset > 0 ? 'Planejando o próximo mês. Ele começa com os valores do mês atual.' : 'Os valores valem a partir deste mês. Os meses anteriores continuam como estavam.');
    document.getElementById('budgetNote').classList.toggle('locked', locked);
    document.getElementById('budgetNewCat').hidden = locked;
    var monthTx = txForMonth(mb.key).filter(function(t){ return t.type==='expense'; });
    var list = document.getElementById('budgetList');
    list.innerHTML = expenseCats().map(function(c){
      var catTx = monthTx.filter(function(t){ return t.category === c.id; });
      var limit = budgetLimit(mb.key, c.id);
      var spent = sum(catTx, function(t){ return t.amount; });
      var pct = limit > 0 ? spent/limit : 0;
      var status = limit > 0 ? statusForPct(pct) : 'good';
      var barColor = status === 'critical' ? 'var(--critical)' : status === 'warning' ? 'var(--warning)' : 'var(--good)';
      return '<div class="budget-row">' +
        '<div class="budget-top">' +
          '<span class="budget-cat"><span class="legend-swatch" style="background:'+resolveVar(c.color, list)+'"></span>'+escapeHtml(c.label)+'</span>' +
          '<span class="money-input sm"><span>R$</span><input class="tabular" type="number" min="0" step="10" max="99999999" data-budget-cat="'+escapeHtml(c.id)+'" value="'+(limit||'')+'" placeholder="'+(locked ? '—' : 'Sem limite')+'"'+(locked ? ' disabled' : '')+' aria-label="Quanto quero gastar com '+escapeHtml(c.label)+'"></span>' +
        '</div>' +
        (limit > 0 ?
          '<div class="progress"><span style="width:'+Math.min(100,pct*100)+'%; background:'+barColor+'"></span></div>' +
          '<div class="budget-top"><span class="budget-figs tabular">'+fmtMoney(spent)+' de '+fmtMoney(limit)+(limit > spent ? ' · restam ' + fmtMoney(limit-spent) : '')+'</span><span class="status-pill '+status+'">'+statusLabel[status]+'</span></div>'
          : (spent > 0 ? '<span class="budget-figs tabular">Gasto no mês: '+fmtMoney(spent)+(locked ? '' : ' (digite ao lado quanto quer gastar)')+'</span>' : '')
        ) +
        (catTx.length ? '<details class="budget-details"><summary>Ver com o que gastou (' + catTx.length + ')</summary>' + catTx.map(txRowHtml).join('') + '</details>' : '') +
        '</div>';
    }).join('');

    qsa('[data-budget-cat]', list).forEach(function(input){
      input.addEventListener('change', async function(){
        var cat = input.getAttribute('data-budget-cat');
        var key = monthBounds(State.budgetMonthOffset).key;
        if (budgetLocked(key)) return;
        await setBudget(key, cat, Math.max(0, money(input.value || 0)));
        renderBudgets();
        toast('Planejamento de ' + catLabel(cat,'expense') + ' em ' + monthLabelOf(key) + ' atualizado.');
      });
    });
  }

  /* ---------- Metas ---------- */
  var GOAL_FILTERS = [
    {id:'andamento', label:'Em andamento'},
    {id:'concluidas', label:'Concluídas'},
    {id:'naobatidas', label:'Não batidas'},
    {id:'excluidas', label:'Excluídas'}
  ];
  function goalStatus(g){
    if (g.deletedAt) return 'excluidas';
    if (Number(g.currentAmount||0) >= Number(g.targetAmount||0)) return 'concluidas';
    if (g.targetDate && g.targetDate < todayKey()) return 'naobatidas';
    return 'andamento';
  }

  function calendarUrl(title, dateIso, details){
    var d = dateIso.replace(/-/g,'');
    var next = toDateKey(new Date(parseDate(dateIso).getTime() + 86400000)).replace(/-/g,'');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
      '&dates=' + d + '/' + next + '&details=' + encodeURIComponent(details);
  }

  function renderGoals(){
    var counts = {};
    GOAL_FILTERS.forEach(function(f){ counts[f.id] = 0; });
    State.goals.forEach(function(g){ counts[goalStatus(g)]++; });
    document.getElementById('goalFilter').innerHTML = GOAL_FILTERS.map(function(f){
      return '<button type="button" role="tab" aria-selected="' + (State.goalFilter === f.id) + '" class="' + (State.goalFilter === f.id ? 'active' : '') + '" data-goal-filter="' + f.id + '">' + f.label + '<span class="count">' + counts[f.id] + '</span></button>';
    }).join('');

    var grid = document.getElementById('goalGrid');
    var goals = State.goals.filter(function(g){ return goalStatus(g) === State.goalFilter; });
    if (!goals.length){
      var empty = {andamento:'Nenhuma meta em andamento. Que tal criar a primeira acima?', concluidas:'Nenhuma meta concluída ainda. Você chega lá!', naobatidas:'Nenhuma meta com prazo vencido.', excluidas:'Nenhuma meta excluída.'};
      grid.innerHTML = '<p class="empty-state">' + empty[State.goalFilter] + '</p>';
      return;
    }
    grid.innerHTML = goals.map(function(g){
      var status = goalStatus(g);
      var pct = g.targetAmount > 0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0;
      var remindDate = g.reminderDate || g.targetDate;
      var actions;
      if (status === 'excluidas'){
        actions = '<button class="btn btn-ghost btn-sm" type="button" data-goal-restore="'+g.id+'">Restaurar</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-goal-purge="'+g.id+'">Apagar de vez</button>';
      } else {
        actions = (status === 'concluidas' ? '<span class="status-pill good">Meta concluída</span>' :
            '<form class="deposit-form" data-goal-deposit="'+g.id+'"><span class="money-input sm"><span>R$</span><input type="number" step="0.01" min="0.01" max="99999999" name="amount" placeholder="Valor" aria-label="Valor para guardar"></span><button class="btn btn-primary btn-sm" type="submit">Guardar</button></form>') +
          '<button class="btn btn-ghost btn-sm" type="button" data-goal-edit="'+g.id+'">Editar</button>' +
          (remindDate ? '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(calendarUrl('Grana Leve: meta “' + g.name + '”', remindDate, 'Lembrete para guardar dinheiro na meta “' + g.name + '”. Faltam ' + fmtMoney(Math.max(0, g.targetAmount - (g.currentAmount||0))) + '.')) + '">' + icon('calendar') + 'Google Agenda</a>' : '') +
          '<button class="btn btn-ghost btn-sm" type="button" disabled title="Em breve: lembretes pelo WhatsApp">' + icon('chat') + 'WhatsApp (em breve)</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-goal-del="'+g.id+'">Excluir</button>';
      }
      return '<div class="goal-card">' +
        '<div class="budget-top"><h4>'+escapeHtml(g.name)+'</h4>' + (status === 'naobatidas' ? '<span class="status-pill critical">prazo vencido</span>' : '') + '</div>' +
        '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--brand)"></span></div>' +
        '<div class="goal-figs"><span class="tabular">'+fmtMoney(g.currentAmount||0)+' de '+fmtMoney(g.targetAmount)+'</span><span>'+Math.round(pct*100)+'%</span></div>' +
        '<div class="meta-line">' +
          (g.targetDate ? '<span>Prazo: '+formatDateFull(g.targetDate)+'</span>' : '<span>Sem prazo</span>') +
          (g.reminderDate ? '<span>Me avise em: '+formatDateFull(g.reminderDate)+'</span>' : '') +
        '</div>' +
        (g.note ? '<div class="note">'+escapeHtml(g.note)+'</div>' : '') +
        '<div class="card-actions">' + actions + '</div></div>';
    }).join('');
  }

  function goalFormBody(g){
    return '<div class="field"><label for="egName">Nome da meta</label><input id="egName" name="name" type="text" maxlength="50" value="' + escapeHtml(g.name) + '"></div>' +
      '<div class="field"><label for="egTarget">Valor alvo</label><span class="money-input"><span>R$</span><input id="egTarget" name="target" type="number" step="0.01" min="1" max="99999999" value="' + g.targetAmount + '"></span></div>' +
      '<div class="field"><label for="egCurrent">Já guardado</label><span class="money-input"><span>R$</span><input id="egCurrent" name="current" type="number" step="0.01" min="0" max="99999999" value="' + (g.currentAmount||0) + '"></span></div>' +
      '<div class="field"><label for="egDate">Prazo</label><input id="egDate" name="date" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.targetDate||'') + '"></div>' +
      '<div class="field"><label for="egReminder">Me avise em</label><input id="egReminder" name="reminder" type="date" min="1900-01-01" max="3000-12-31" value="' + (g.reminderDate||'') + '"></div>' +
      '<div class="field"><label for="egNote">Observação</label><textarea id="egNote" name="note" rows="3" maxlength="300">' + escapeHtml(g.note||'') + '</textarea></div>';
  }

  async function editGoal(id){
    var g = findById(State.goals, id);
    await openModal({
      title: 'Editar meta', body: goalFormBody(g),
      onSubmit: async function(form){
        var v = {
          name: form.name.value.trim(), targetAmount: money(form.target.value), currentAmount: Math.max(0, money(form.current.value)),
          targetDate: form.date.value || null, reminderDate: form.reminder.value || null, note: form.note.value.trim()
        };
        if (!v.name || !(v.targetAmount > 0)) return {error:'Informe o nome e um valor alvo maior que zero.'};
        if (!validDateStr(v.targetDate) || !validDateStr(v.reminderDate)) return {error:'Use datas entre os anos de 1900 e 3000.'};
        await Store.update(k(), 'goals', id, v);
        Object.assign(g, v);
        renderGoals(); renderDashboard();
        toast('Meta atualizada.');
      }
    });
  }

  /* ---------- Dívidas ---------- */
  function renderDebts(){
    var gs = installmentGroups().filter(function(g){ return g.future.length; });
    document.getElementById('installDebtWrap').innerHTML = gs.length ?
      '<div class="card"><div class="card-head"><h3>Compras parceladas no cartão</h3><span class="pill brand">automático</span></div>' +
      '<p class="card-sub">Vêm das compras parceladas em “Ganhos e gastos”. Cada parcela entra sozinha na fatura do mês, então não precisa registrar pagamento. Se quiser quitar antes, use “Adiantar pagamento”.</p>' +
      '<div class="debt-grid">' + gs.map(function(g){ return installmentRowHtml(g, true); }).join('') + '</div></div>' : '';
    var grid = document.getElementById('debtGrid');
    if (!State.debts.length){ grid.innerHTML = gs.length ? '' : '<p class="empty-state">Nenhuma dívida cadastrada. Se você não tem dívidas, ótimo: pode pular esta seção.</p>'; return; }
    grid.innerHTML = State.debts.map(function(d){
      var remaining = Math.max(0, Number(d.totalAmount||0) - Number(d.paidAmount||0));
      var pct = d.totalAmount > 0 ? Math.min(1, Number(d.paidAmount||0)/Number(d.totalAmount)) : 0;
      var done = remaining <= 0;
      return '<div class="debt-card">' +
        '<div class="budget-top"><h4>'+escapeHtml(d.name)+'</h4><span class="pill">' + escapeHtml(labelOf(DEBT_KINDS, d.kind) || 'Dívida') + '</span></div>' +
        (d.creditor ? '<span class="tx-meta">Com: ' + escapeHtml(d.creditor) + '</span>' : '') +
        '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--good)"></span></div>' +
        '<div class="debt-figs"><span class="tabular">Pago: '+fmtMoney(d.paidAmount||0)+'</span><span class="tabular">Falta: '+fmtMoney(remaining)+'</span></div>' +
        (d.monthlyPayment ? '<span class="tx-meta">Parcela mensal: '+fmtMoney(d.monthlyPayment)+(remaining > 0 ? ' · cerca de ' + Math.ceil(remaining / d.monthlyPayment) + ' parcela(s) restante(s)' : '')+'</span>' : '') +
        '<div class="card-actions">' +
          (done ? '<span class="status-pill good">Quitada</span>' : '<button class="btn btn-ghost btn-sm" type="button" data-debt-pay="'+d.id+'">Registrar pagamento</button>') +
          '<button class="btn btn-danger btn-sm" type="button" data-debt-del="'+d.id+'">Excluir</button>' +
        '</div></div>';
    }).join('');
  }

  async function payDebt(id){
    var d = findById(State.debts, id);
    var remaining = Math.max(0, Number(d.totalAmount) - Number(d.paidAmount||0));
    var r = await askAmount({
      title: 'Registrar pagamento', message: '“' + d.name + '”: faltam ' + fmtMoney(remaining) + '.',
      value: Number(d.monthlyPayment) > 0 ? Math.min(d.monthlyPayment, remaining) : remaining, max: remaining,
      checkbox: 'Lançar também como gasto do mês', checkboxDefault: true, submitLabel: 'Registrar'
    });
    if (!r) return;
    var newPaid = money(Math.min(Number(d.totalAmount), Number(d.paidAmount||0) + r.amount));
    await Store.update(k(), 'debts', id, {paidAmount: newPaid});
    d.paidAmount = newPaid;
    if (r.extra){
      var saved = await Store.add(k(), 'transactions', {type:'expense', amount:r.amount, category:'dividas', date: todayKey(), description:'Pagamento: ' + d.name, paymentMethod:'conta', createdAt: Date.now()});
      State.transactions.unshift(saved); sortTransactions();
    }
    renderAll();
    toast('Pagamento de ' + fmtMoney(r.amount) + ' registrado em “' + d.name + '”.');
  }

  /* ---------- A receber ---------- */
  function renderReceivables(){
    var grid = document.getElementById('recvGrid');
    if (!State.receivables.length){ grid.innerHTML = '<p class="empty-state">Ninguém te deve nada por aqui. Quando emprestar dinheiro ou alguém usar seu cartão, anote acima.</p>'; return; }
    var items = State.receivables.slice().sort(function(a,b){
      var ad = Number(a.receivedAmount||0) >= Number(a.totalAmount), bd = Number(b.receivedAmount||0) >= Number(b.totalAmount);
      return (ad - bd) || String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));
    });
    grid.innerHTML = items.map(function(r){
      var remaining = Math.max(0, Number(r.totalAmount||0) - Number(r.receivedAmount||0));
      var pct = r.totalAmount > 0 ? Math.min(1, Number(r.receivedAmount||0)/Number(r.totalAmount)) : 0;
      var done = remaining <= 0;
      var late = !done && r.dueDate && r.dueDate < todayKey();
      return '<div class="debt-card">' +
        '<div class="budget-top"><h4>'+escapeHtml(r.person)+'</h4><span class="pill brand">' + escapeHtml(labelOf(RECV_KINDS, r.kind)) + '</span></div>' +
        (r.description ? '<span class="tx-meta">' + escapeHtml(r.description) + '</span>' : '') +
        '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--good)"></span></div>' +
        '<div class="debt-figs"><span class="tabular">Recebido: '+fmtMoney(r.receivedAmount||0)+'</span><span class="tabular">Falta: '+fmtMoney(remaining)+'</span></div>' +
        (r.dueDate ? '<span class="tx-meta">Combinado para ' + formatDateFull(r.dueDate) + (late ? ' · <strong style="color:var(--critical)">atrasado</strong>' : '') + '</span>' : '') +
        '<div class="card-actions">' +
          (done ? '<span class="status-pill good">Recebido</span>' :
            '<button class="btn btn-ghost btn-sm" type="button" data-recv-get="'+r.id+'">Registrar recebimento</button>' +
            '<button class="btn btn-ghost btn-sm" type="button" data-recv-charge="'+r.id+'">' + icon('chat') + 'Cobrar</button>') +
          '<button class="btn btn-danger btn-sm" type="button" data-recv-del="'+r.id+'">Excluir</button>' +
        '</div></div>';
    }).join('');
  }

  async function receiveReceivable(id){
    var r = findById(State.receivables, id);
    var remaining = Math.max(0, Number(r.totalAmount) - Number(r.receivedAmount||0));
    var a = await askAmount({title:'Registrar recebimento', message: r.person + ' te deve ' + fmtMoney(remaining) + '.', value: remaining, max: remaining,
      checkbox:'Lançar também como ganho do mês', checkboxDefault: r.kind !== 'cartao', submitLabel:'Registrar'});
    if (!a) return;
    var newReceived = money(Math.min(Number(r.totalAmount), Number(r.receivedAmount||0) + a.amount));
    await Store.update(k(), 'receivables', id, {receivedAmount: newReceived});
    r.receivedAmount = newReceived;
    if (a.extra){
      var saved = await Store.add(k(), 'transactions', {type:'income', amount:a.amount, category:'recebimento', date: todayKey(), description:'Recebido de ' + r.person, paymentMethod:null, createdAt: Date.now()});
      State.transactions.unshift(saved); sortTransactions();
    }
    renderAll();
    toast('Recebimento de ' + fmtMoney(a.amount) + ' registrado.');
  }

  function onlyDigits(s){ return String(s||'').replace(/\D/g,''); }

  async function chargeReceivable(id){
    var r = findById(State.receivables, id);
    var remaining = Math.max(0, Number(r.totalAmount) - Number(r.receivedAmount||0));
    var first = State.session.name.split(' ')[0];
    var msg = 'Oi, ' + r.person.split(' ')[0] + '! Tudo bem? Passando para lembrar do valor de ' + fmtMoney(remaining) +
      (r.description ? ' (' + r.description + ')' : '') + (r.dueDate ? ', combinado para ' + formatDateFull(r.dueDate) : '') +
      '. Quando puder, me avisa. Obrigado! ' + first;
    await openModal({
      title: 'Cobrar ' + r.person,
      body: '<div class="field"><label for="chargeMsg">Mensagem (pode editar)</label><textarea id="chargeMsg" name="msg" rows="5" maxlength="600">' + escapeHtml(msg) + '</textarea></div>' +
        '<div class="field"><label for="chargePhone">WhatsApp da pessoa (opcional)</label><input id="chargePhone" name="phone" type="tel" maxlength="20" value="' + escapeHtml(r.phone||'') + '" placeholder="(11) 98888-7777"></div>' +
        '<div class="pdf-actions"><button type="button" class="btn btn-ghost btn-sm" data-charge="copy">Copiar mensagem</button></div>',
      submitLabel: 'Abrir no WhatsApp', cancelLabel: 'Fechar',
      onOpen: function(root){
        qs('[data-charge="copy"]', root).addEventListener('click', function(){
          var text = qs('#chargeMsg', root).value;
          if (navigator.clipboard) navigator.clipboard.writeText(text).then(function(){ toast('Mensagem copiada.'); }, function(){ toast('Não foi possível copiar.'); });
        });
      },
      onSubmit: async function(form){
        var phone = onlyDigits(form.phone.value);
        if (phone && phone.length >= 10 && phone.length <= 11) phone = '55' + phone;
        if (phone !== onlyDigits(r.phone) && form.phone.value.trim()){ await Store.update(k(), 'receivables', id, {phone: form.phone.value.trim()}); r.phone = form.phone.value.trim(); }
        window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(form.msg.value), '_blank', 'noopener');
        return true;
      }
    });
  }

  /* ---------- Aprenda ---------- */
  function renderLearn(){
    function tipCards(list){
      return '<div class="tips-grid">' + list.map(function(t){
        return '<div class="tip-card"><span class="tip-tag">'+escapeHtml(t.tag)+'</span><h4>'+escapeHtml(t.title)+'</h4><p>'+escapeHtml(t.text)+'</p></div>';
      }).join('') + '</div>';
    }
    document.getElementById('learnWrap').innerHTML =
      '<section class="learn-section"><h3>Organizar o dinheiro</h3>' + tipCards(TIPS) + '</section>' +
      '<section class="learn-section"><h3>Fazer o dinheiro render</h3>' + tipCards(TIPS_GROW) +
        '<p class="disclaimer" style="margin-top:10px">Conteúdo educativo. Não é recomendação de investimento. Valores e taxas são exemplos e mudam com o tempo.</p></section>' +
      '<section class="learn-section card"><h3>Como usar o Grana Leve</h3><ol class="howto-list">' +
        HOW_TO.map(function(h){ return '<li><strong>' + escapeHtml(h[0]) + '</strong> ' + escapeHtml(h[1]) + '</li>'; }).join('') +
      '</ol></section>';
  }

  /* ---------- Chat de lançamento ---------- */
  // Grava lançamentos vindos de fora do formulário. Hoje: o chat. No futuro: WhatsApp e Open Finance
  // (basta o servidor entregar itens no mesmo formato do GranaParser e indicar a origem em `source`).
  async function importTransactions(items, source){
    var saved = [];
    for (var i=0;i<items.length;i++){
      var it = items[i];
      var tx = {type: it.type, amount: money(it.amount), category: it.category, categoryLabel: catLabel(it.category, it.type),
        date: it.date || todayKey(), description: it.description || '', paymentMethod: null, source: source, createdAt: Date.now() + i};
      if (it.type === 'expense'){
        tx.paymentMethod = it.paymentMethod || 'conta';
        if (tx.paymentMethod === 'cartao'){
          if (State.cards.length) tx.cardId = State.cards[0].id;
          else tx.paymentMethod = 'conta';
        }
        if (tx.paymentMethod === 'vale' && State.vouchers.length) tx.voucherId = State.vouchers[0].id;
      }
      var list = await saveTransactions(expandInstallments(tx, it.installments || 1));
      saved.push(list[0]);
    }
    renderAll();
    return saved;
  }

  function bubble(who, html){ return '<div class="bubble ' + who + '">' + html + '</div>'; }

  function describeSaved(t){
    var cat = catLabel(t.category, t.type, t.categoryLabel);
    var pay = paymentLabel(t);
    var inst = t.installment;
    return '<strong>' + (t.type === 'income' ? 'Ganho' : 'Gasto') + ' de ' + fmtMoney(inst ? inst.totalAmount : t.amount) + (inst ? ' em ' + inst.total + 'x' : '') + '</strong> em ' + escapeHtml(cat) +
      (inst ? ' (' + escapeHtml(inst.baseDescription) + ')' : (t.description && t.description.toLowerCase() !== cat.toLowerCase() ? ' (' + escapeHtml(t.description) + ')' : '')) +
      (pay ? ' · ' + escapeHtml(pay) : '') + (t.date !== todayKey() ? ' · ' + formatDateFull(t.date) : '') +
      ' <button type="button" class="linklike" data-undo-tx="' + escapeHtml(t.id) + '">Desfazer</button>';
  }

  async function openQuickEntry(welcome){
    var first = escapeHtml(State.session.name.split(' ')[0]);
    var closeFn = null;
    function log(root){ return qs('#chatLog', root || document); }
    function say(who, html){
      var l = log(); if (!l) return;
      l.insertAdjacentHTML('beforeend', bubble(who, html));
      l.scrollTop = l.scrollHeight;
    }
    async function handle(text){
      say('me', escapeHtml(text));
      var r = window.GranaParser ? window.GranaParser.parse(text) : {error:'O leitor de mensagens não carregou.'};
      if (r.nothing){
        say('bot', 'Beleza! Então é só usar o Grana Leve à vontade.');
        setTimeout(function(){ if (closeFn) closeFn(true); }, 900);
        return;
      }
      if (r.error){ say('bot', escapeHtml(r.error)); return; }
      var saved = await importTransactions(r.items, 'chat');
      say('bot', 'Anotei:<ul class="chat-list">' + saved.map(function(t){ return '<li data-chat-tx="' + escapeHtml(t.id) + '">' + describeSaved(t) + '</li>'; }).join('') + '</ul>' +
        (saved.some(function(t){ return t.category === 'outros' || t.category === 'outros_receita'; }) ? '<span class="chat-hint">Não reconheci a categoria de algum item e coloquei em “Outros”. Dá para ajustar em Ganhos e gastos.</span><br>' : '') +
        'Mais alguma coisa? Quando terminar, é só fechar.');
    }
    await openModal({
      title: welcome ? 'Antes de começar…' : 'Chat de lançamento',
      body: '<div class="chat-log" id="chatLog" aria-live="polite">' +
          bubble('bot', (welcome ? 'Oi, ' + first + '! Teve algum gasto ou ganho desde a última vez?' : 'Me conta o que entrou ou saiu.') +
            '<br><span class="chat-hint">Escreva do seu jeito: “gastei 30 no mercado”, “recebi 1.500 de salário ontem”, “paguei 120 de luz e 80 de internet”.</span>') +
        '</div>' +
        '<div class="chips" id="chatChips">' +
          '<button type="button" class="chip" data-chip-send="Não, nada">Não, nada</button>' +
          '<button type="button" class="chip" data-chip="gastei ">Gastei…</button>' +
          '<button type="button" class="chip" data-chip="recebi ">Recebi…</button>' +
        '</div>' +
        '<input id="chatInput" class="chat-input" name="msg" type="text" maxlength="200" autocomplete="off" placeholder="Ex: gastei 25 no almoço" aria-label="Mensagem">' +
        '<button type="button" class="linklike" data-chat-form style="justify-self:start">Prefiro preencher o formulário completo</button>' +
        (welcome ? '<label class="check"><input type="checkbox" name="off"' + (getPrefs().quickEntryOff ? ' checked' : '') + '> Não perguntar ao entrar</label>' : ''),
      submitLabel: 'Enviar', cancelLabel: welcome ? 'Pular' : 'Fechar',
      onOpen: function(root, close){
        closeFn = close;
        root.addEventListener('click', async function(e){
          var b;
          if ((b = e.target.closest('[data-chip-send]'))){ handle(b.getAttribute('data-chip-send')); return; }
          if (e.target.closest('[data-chat-form]')){ close(null); showTab('lancamentos'); document.getElementById('txAmount').focus(); return; }
          if ((b = e.target.closest('[data-chip]'))){ var inp = qs('#chatInput', root); inp.value = b.getAttribute('data-chip'); inp.focus(); return; }
          if ((b = e.target.closest('[data-undo-tx]'))){
            var id = b.getAttribute('data-undo-tx');
            await Store.remove(k(), 'transactions', id);
            State.transactions = State.transactions.filter(function(x){ return x.id !== id; });
            renderAll();
            var li = b.closest('[data-chat-tx]');
            li.innerHTML = '<s>' + li.textContent.replace('Desfazer','').trim() + '</s> · desfeito';
          }
        });
        var off = root.querySelector('input[name=off]');
        if (off) off.addEventListener('change', function(){ setPref('quickEntryOff', off.checked); });
      },
      onSubmit: async function(form){
        var text = form.msg.value.trim();
        form.msg.value = '';
        if (text) await handle(text);
        form.msg.focus();
        return {keepOpen: true};
      }
    });
  }

  // Ao entrar no app, pergunta uma vez por dia (dá para desligar no próprio chat).
  function maybeWelcome(){
    var p = getPrefs();
    if (p.quickEntryOff || p.lastWelcome === todayKey()) return;
    setPref('lastWelcome', todayKey());
    setTimeout(function(){ if (State.session && document.getElementById('modalRoot').hidden) openQuickEntry(true); }, 350);
  }

  /* ---------- Conexões ---------- */
  function renderConnections(){
    var opt = getPrefs().waOptin;
    document.getElementById('connWrap').innerHTML =
      '<div class="conn-card">' +
        '<div class="conn-head"><span class="feature-icon">' + icon('chat') + '</span><h3>WhatsApp</h3><span class="status-pill warning">Em breve</span></div>' +
        '<p>Registre gastos mandando uma mensagem, do jeito que você fala. O Grana Leve entende, lança sozinho e também te lembra das metas e das contas a receber.</p>' +
        '<div class="phone-mock" aria-hidden="true">' +
          bubble('me', 'gastei 25 no almoço no vale') +
          bubble('bot', 'Anotei: <strong>Gasto de R$ 25,00</strong> em Alimentação · Vale') +
          bubble('bot', 'Lembrete: faltam R$ 750,00 para a meta “Viagem”.') +
        '</div>' +
        '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-conn="chat">' + icon('chat') + 'Testar o chat agora</button></div>' +
        (opt ? '<p class="field-hint">Pronto! Vamos te avisar no número ' + escapeHtml(opt.phone) + ' quando estiver disponível. <button type="button" class="linklike" data-conn="wa-remove">Remover</button></p>' :
          '<form id="waOptinForm" class="deposit-form"><input class="select-sm" style="padding:8px 10px" name="phone" type="tel" maxlength="20" placeholder="Seu WhatsApp" aria-label="Seu número de WhatsApp"><button class="btn btn-ghost btn-sm" type="submit">Quero ser avisado</button></form>') +
      '</div>' +
      '<div class="conn-card">' +
        '<div class="conn-head"><span class="feature-icon">' + icon('bank') + '</span><h3>Open Finance</h3><span class="status-pill warning">Em breve</span></div>' +
        '<p>Conecte sua conta do banco para trazer extratos e faturas automaticamente, já com categoria, sem digitar nada.</p>' +
        '<ol class="howto-list"><li>Escolha o seu banco.</li><li>Autorize no app do banco: você decide o que compartilhar e por quanto tempo.</li><li>Os lançamentos aparecem aqui sozinhos.</li></ol>' +
        '<div class="chips">' + OPEN_FINANCE_BANKS.map(function(b){ return '<button type="button" class="chip" disabled title="Em breve">' + escapeHtml(b) + '</button>'; }).join('') + '</div>' +
        '<p class="field-hint">' + icon('lock') + ' O Open Finance é regulado pelo Banco Central. O Grana Leve nunca vai pedir a senha do seu banco.</p>' +
      '</div>' +
      '<div class="conn-card">' +
        '<div class="conn-head"><span class="feature-icon">' + icon('phone') + '</span><h3>App no celular</h3><span class="status-pill good">Disponível</span></div>' +
        '<p>Instale o Grana Leve na tela inicial: ele abre como um aplicativo e funciona mesmo sem internet.</p>' +
        (installPrompt ? '<div class="card-actions"><button class="btn btn-primary btn-sm" type="button" data-conn="install">Instalar agora</button></div>' :
          (isStandalone() ? '<p class="field-hint">O Grana Leve já está instalado neste aparelho.</p>' :
          '<ul class="howto-list"><li><strong>Android (Chrome):</strong> menu ⋮ e depois “Instalar app” ou “Adicionar à tela inicial”.</li><li><strong>iPhone (Safari):</strong> botão Compartilhar e depois “Adicionar à Tela de Início”.</li></ul>')) +
      '</div>' +
      '<div class="conn-card">' +
        '<div class="conn-head"><span class="feature-icon">' + icon('calendar') + '</span><h3>Google Agenda</h3><span class="status-pill good">Disponível</span></div>' +
        '<p>Crie lembretes das suas metas na sua agenda com um toque. É só preencher “Me avise em” ou o prazo na meta e tocar em “Google Agenda”.</p>' +
        '<div class="card-actions"><button class="btn btn-ghost btn-sm" type="button" data-conn="metas">Ir para Metas</button></div>' +
      '</div>';
  }

  /* ---------- Tudo ---------- */
  function renderAll(){
    document.getElementById('greeting').textContent = 'Olá, ' + State.session.name.split(' ')[0];
    renderTopbar();
    populatePaymentSelect();
    renderDashboard();
    renderTransactionsTab();
    renderCards();
    renderVouchers();
    renderBudgets();
    renderGoals();
    renderDebts();
    renderReceivables();
    renderLearn();
    renderConnections();
  }

  /* ============ Tabs / navigation ============ */
  var TABS = ['dashboard','lancamentos','cartoes','limites','metas','dividas','receber','aprenda','conexoes'];
  function showTab(name){
    State.activeTab = name;
    qsa('#tabbar button').forEach(function(b){
      var on = b.getAttribute('data-tab') === name;
      b.classList.toggle('active', on);
      if (on) b.scrollIntoView({block:'nearest', inline:'nearest'});
    });
    TABS.forEach(function(t){ document.getElementById('tab-' + t).hidden = (t !== name); });
  }

  function showAuthTab(name){
    State.authTab = name;
    qsa('[data-authtab]').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-authtab') === name); });
    document.getElementById('loginForm').hidden = (name !== 'login');
    document.getElementById('signupForm').hidden = (name !== 'signup');
    document.getElementById('authFoot').textContent = name === 'login' ? 'Ainda não tem conta? Clique em “Criar conta” acima.' : 'Já é cadastrado? Clique em “Entrar” acima.';
    document.getElementById('loginError').textContent = '';
    document.getElementById('signupError').textContent = '';
  }

  async function enterApp(){
    showView('viewApp');
    await loadAllData();
    document.getElementById('txDate').value = todayKey();
    document.getElementById('fcDate').value = todayKey();
    populateCategorySelect();
    populateInstallSelect();
    renderAll();
    syncTxFormVisibility();
    showTab('dashboard');
    maybeWelcome();
  }

  function logout(){
    clearSession();
    State.session = null;
    showView('viewLanding');
    renderTopbar();
  }

  function backupData(){
    var data = {};
    COLLECTIONS.forEach(function(c){ data[c] = []; });
    data.transactions = State.transactions; data.goals = State.goals; data.debts = State.debts; data.cards = State.cards;
    data.receivables = State.receivables; data.forecasts = State.forecasts; data.categories = State.categories; data.vouchers = State.vouchers;
    data.budgets = Object.keys(State.budgetBase).map(function(id){ return {id:id, limit: State.budgetBase[id]}; })
      .concat(Object.keys(State.budgetMonths).map(function(m){ return {id:'plan-' + m, month:m, limits: State.budgetMonths[m]}; }));
    return {app:'grana-leve', version:1, exportedAt: new Date().toISOString(), profile:{name: State.session.name, email: State.session.email}, data: data};
  }
  // Valida o arquivo antes de gravar: só aceita as coleções conhecidas, com objetos que tenham id.
  function validateBackup(obj){
    if (!obj || obj.app !== 'grana-leve' || typeof obj.data !== 'object' || !obj.data) return 'Este arquivo não é um backup do Grana Leve.';
    for (var i=0;i<COLLECTIONS.length;i++){
      var list = obj.data[COLLECTIONS[i]];
      if (list === undefined){ obj.data[COLLECTIONS[i]] = []; continue; }
      if (!Array.isArray(list)) return 'O backup está corrompido (' + COLLECTIONS[i] + ').';
      for (var j=0;j<list.length;j++){
        var it = list[j];
        if (!it || typeof it !== 'object' || Array.isArray(it) || typeof it.id !== 'string' || !it.id) return 'O backup está corrompido (' + COLLECTIONS[i] + ').';
        if (it.amount !== undefined && !isFinite(Number(it.amount))) return 'O backup tem valores inválidos.';
      }
    }
    return '';
  }
  async function backupModal(){
    if (!State.session){
      await openModal({title:'Backup dos dados', body:'<p>Entre na sua conta para salvar ou restaurar um backup.</p>', submitLabel:null, cancelLabel:'Fechar'});
      return;
    }
    var counts = State.transactions.length + ' lançamentos, ' + State.cards.length + ' cartões, ' + State.goals.length + ' metas, ' + State.debts.length + ' dívidas';
    await openModal({
      title: 'Backup dos dados',
      body: '<p>Seus dados ficam só neste navegador. Se você limpar o navegador ou trocar de aparelho, eles se perdem. Salve um backup de vez em quando e guarde o arquivo (no Google Drive, por exemplo).</p>' +
        '<div class="tip-box"><strong>Agora você tem:</strong> ' + counts + '.</div>' +
        '<div class="pdf-actions"><button type="button" class="btn btn-primary btn-sm" data-backup="export">Salvar backup</button></div>' +
        '<h4>Restaurar um backup</h4>' +
        '<p>Escolha um arquivo salvo antes. Ele <strong>substitui</strong> os dados atuais desta conta. Sua senha não muda.</p>' +
        '<input type="file" id="backupFile" accept="application/json,.json" aria-label="Arquivo de backup">' +
        '<p class="form-error" id="backupError"></p>',
      submitLabel: null, cancelLabel: 'Fechar',
      onOpen: function(modal, close){
        qs('[data-backup="export"]', modal).addEventListener('click', function(){
          saveFile('grana-leve-backup-' + todayKey() + '.json', JSON.stringify(backupData(), null, 2), 'application/json')
            .then(function(){ setPref('lastBackup', Date.now()); toast('Backup salvo.'); });
        });
        qs('#backupFile', modal).addEventListener('change', function(e){
          var file = e.target.files[0];
          var err = qs('#backupError', modal);
          err.textContent = '';
          if (!file) return;
          if (file.size > 5 * 1024 * 1024){ err.textContent = 'Arquivo grande demais para ser um backup do Grana Leve.'; return; }
          var reader = new FileReader();
          reader.onload = async function(){
            var obj;
            try{ obj = JSON.parse(reader.result); } catch(ex){ err.textContent = 'Não foi possível ler o arquivo.'; return; }
            var problem = validateBackup(obj);
            if (problem){ err.textContent = problem; return; }
            var n = obj.data.transactions.length;
            close(null);
            var ok = await confirmAction({title:'Restaurar backup?', message:'O backup de ' + (obj.exportedAt ? new Date(obj.exportedAt).toLocaleDateString('pt-BR') : 'data desconhecida') + ' tem ' + n + ' lançamentos. Os dados atuais desta conta serão substituídos.', confirmLabel:'Restaurar'});
            if (!ok) return;
            await Store.replaceAll(k(), obj.data);
            await loadAllData();
            renderAll();
            toast('Backup restaurado.');
          };
          reader.readAsText(file);
        });
      }
    });
  }

  async function showInfo(id){
    if (id === 'backup'){ backupModal(); return; }
    var page = INFO_PAGES[id];
    if (id === 'como-usar'){
      page = {title:'Como usar o Grana Leve', body:'<ol class="howto-list">' + HOW_TO.map(function(h){ return '<li><strong>' + escapeHtml(h[0]) + '</strong> ' + escapeHtml(h[1]) + '</li>'; }).join('') + '</ol>'};
    }
    var canDelete = id === 'privacidade' && State.session;
    var r = await openModal({
      title: page.title, body: page.body, wide: false,
      submitLabel: canDelete ? 'Apagar minha conta e dados' : null, danger: true, cancelLabel: 'Fechar'
    });
    if (r && canDelete){
      var ok = await confirmAction({title:'Apagar conta?', message:'Todos os seus lançamentos, cartões, metas, dívidas e valores a receber serão apagados deste navegador. Isso não pode ser desfeito.', confirmLabel:'Apagar tudo'});
      if (!ok) return;
      await Store.deleteUser(k());
      try{ localStorage.removeItem(prefsKey()); } catch(e){}
      logout();
      toast('Conta e dados apagados.');
    }
  }

  /* ============ Event wiring ============ */
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  attachCounters(document);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  document.addEventListener('click', async function(e){
    var t = e.target;
    var el;
    if ((el = t.closest('[data-action]'))){
      var action = el.getAttribute('data-action');
      if (action === 'go-login'){ showView('viewAuth'); showAuthTab('login'); }
      if (action === 'go-signup'){ showView('viewAuth'); showAuthTab('signup'); }
      if (action === 'go-tab-lancamentos'){ showTab('lancamentos'); }
      return;
    }
    if ((el = t.closest('[data-info]'))){ showInfo(el.getAttribute('data-info')); return; }
    if (!State.session) return;
    if (t.closest('#modalRoot')) return;

    if ((el = t.closest('[data-edit-tx]'))){
      var et = findById(State.transactions, el.getAttribute('data-edit-tx'));
      if (et) openTxModal(et);
      return;
    }
    if ((el = t.closest('[data-del-tx]'))){
      var id = el.getAttribute('data-del-tx');
      var tx = findById(State.transactions, id);
      if (!tx) return;
      var ok, ids = [id];
      if (tx.installment){
        ids = State.transactions.filter(function(x){ return x.installment && x.installment.group === tx.installment.group; }).map(function(x){ return x.id; });
        ok = await confirmAction({title:'Excluir compra parcelada?', message:'“' + tx.installment.baseDescription + '” foi parcelada em ' + tx.installment.total + 'x. Excluir apaga as ' + ids.length + ' parcelas desta compra.'});
      } else {
        ok = await confirmAction({title:'Excluir lançamento?', message:'Tem certeza que deseja excluir “' + (tx.description || catLabel(tx.category, tx.type, tx.categoryLabel)) + '” de ' + fmtMoney(tx.amount) + '?', skipKey:'deleteTx'});
      }
      if (!ok) return;
      for (var di=0;di<ids.length;di++){ await Store.remove(k(), 'transactions', ids[di]); }
      State.transactions = State.transactions.filter(function(x){ return ids.indexOf(x.id) < 0; });
      renderAll();
      toast('Lançamento excluído.');
      return;
    }
    if ((el = t.closest('[data-view-toggle]'))){
      var which = el.getAttribute('data-view-toggle');
      if (which === 'donut'){ State.donutView = State.donutView === 'chart' ? 'table' : 'chart'; renderDonut(txForMonth(monthBounds(0).key)); }
      else { State.barView = State.barView === 'chart' ? 'table' : 'chart'; renderBarChart(); }
      return;
    }
    if ((el = t.closest('[data-fc-receive]'))){ receiveForecast(el.getAttribute('data-fc-receive'), el.getAttribute('data-fc-date')); return; }
    if ((el = t.closest('[data-fc-del]'))){
      var f = findById(State.forecasts, el.getAttribute('data-fc-del'));
      if (!(await confirmAction({title:'Excluir previsão?', message:'Excluir a previsão “' + f.description + '”' + (f.recurring ? ' de todos os meses' : '') + '? Os ganhos já registrados continuam.'}))) return;
      await Store.remove(k(), 'forecasts', f.id);
      State.forecasts = State.forecasts.filter(function(x){ return x.id !== f.id; });
      renderDashboard();
      return;
    }
    // Cartões
    if ((el = t.closest('[data-inv-shift]'))){
      var cid = el.getAttribute('data-inv-shift');
      State.invoiceOffsets[cid] = (State.invoiceOffsets[cid] || 0) + Number(el.getAttribute('data-dir'));
      renderCards();
      return;
    }
    if ((el = t.closest('[data-inv-pdf]'))){ generateInvoicePdf(el.getAttribute('data-inv-pdf'), el.getAttribute('data-key')); return; }
    if ((el = t.closest('[data-inv-paid]'))){
      var card = findById(State.cards, el.getAttribute('data-inv-paid'));
      var key = el.getAttribute('data-key');
      var paid = (card.paidInvoices || []).slice();
      var idx = paid.indexOf(key);
      if (idx >= 0) paid.splice(idx, 1); else paid.push(key);
      await Store.update(k(), 'cards', card.id, {paidInvoices: paid});
      card.paidInvoices = paid;
      renderCards();
      toast(idx >= 0 ? 'Fatura marcada como em aberto.' : 'Fatura marcada como paga.');
      return;
    }
    if ((el = t.closest('[data-card-edit]'))){ editCard(el.getAttribute('data-card-edit')); return; }
    if ((el = t.closest('[data-card-report]'))){ cardReport(el.getAttribute('data-card-report')); return; }
    if ((el = t.closest('[data-adv-group]'))){ advanceInstallments(el.getAttribute('data-adv-group')); return; }
    if ((el = t.closest('[data-voucher-edit]'))){ editVoucher(el.getAttribute('data-voucher-edit')); return; }
    if ((el = t.closest('[data-voucher-del]'))){
      var vd = findById(State.vouchers, el.getAttribute('data-voucher-del'));
      if (!(await confirmAction({title:'Excluir vale?', message:'Excluir o vale “' + vd.name + '”? Os gastos feitos com ele continuam nos seus lançamentos.'}))) return;
      await Store.remove(k(), 'vouchers', vd.id);
      State.vouchers = State.vouchers.filter(function(x){ return x.id !== vd.id; });
      renderAll();
      return;
    }
    if ((el = t.closest('[data-card-del]'))){
      var c = findById(State.cards, el.getAttribute('data-card-del'));
      if (!(await confirmAction({title:'Excluir cartão?', message:'Excluir o cartão “' + c.name + '”? As compras feitas nele continuam nos seus gastos.'}))) return;
      await Store.remove(k(), 'cards', c.id);
      State.cards = State.cards.filter(function(x){ return x.id !== c.id; });
      renderAll();
      return;
    }
    // Conexões
    if ((el = t.closest('[data-conn]'))){
      var conn = el.getAttribute('data-conn');
      if (conn === 'chat') openQuickEntry(false);
      if (conn === 'metas') showTab('metas');
      if (conn === 'wa-remove'){ setPref('waOptin', null); renderConnections(); }
      if (conn === 'install' && installPrompt){
        installPrompt.prompt();
        installPrompt.userChoice.then(function(){ installPrompt = null; if (State.session) renderConnections(); });
      }
      return;
    }
    // Metas
    if ((el = t.closest('[data-goal-filter]'))){ State.goalFilter = el.getAttribute('data-goal-filter'); renderGoals(); return; }
    if ((el = t.closest('[data-goal-edit]'))){ editGoal(el.getAttribute('data-goal-edit')); return; }
    if ((el = t.closest('[data-goal-del]'))){
      var g = findById(State.goals, el.getAttribute('data-goal-del'));
      if (!(await confirmAction({title:'Excluir meta?', message:'Tem certeza que deseja excluir a meta “' + g.name + '”? Ela vai para “Excluídas” e pode ser restaurada.'}))) return;
      g.deletedAt = Date.now();
      await Store.update(k(), 'goals', g.id, {deletedAt: g.deletedAt});
      renderGoals(); renderDashboard();
      return;
    }
    if ((el = t.closest('[data-goal-restore]'))){
      var gr = findById(State.goals, el.getAttribute('data-goal-restore'));
      gr.deletedAt = null;
      await Store.update(k(), 'goals', gr.id, {deletedAt: null});
      renderGoals(); renderDashboard();
      toast('Meta restaurada.');
      return;
    }
    if ((el = t.closest('[data-goal-purge]'))){
      var gp = findById(State.goals, el.getAttribute('data-goal-purge'));
      if (!(await confirmAction({title:'Apagar de vez?', message:'A meta “' + gp.name + '” será apagada permanentemente.'}))) return;
      await Store.remove(k(), 'goals', gp.id);
      State.goals = State.goals.filter(function(x){ return x.id !== gp.id; });
      renderGoals();
      return;
    }
    // Dívidas
    if ((el = t.closest('[data-debt-pay]'))){ payDebt(el.getAttribute('data-debt-pay')); return; }
    if ((el = t.closest('[data-debt-del]'))){
      var d = findById(State.debts, el.getAttribute('data-debt-del'));
      if (!(await confirmAction({title:'Excluir dívida?', message:'Tem certeza que deseja excluir a dívida “' + d.name + '”?'}))) return;
      await Store.remove(k(), 'debts', d.id);
      State.debts = State.debts.filter(function(x){ return x.id !== d.id; });
      renderDebts(); renderDashboard();
      return;
    }
    // A receber
    if ((el = t.closest('[data-recv-get]'))){ receiveReceivable(el.getAttribute('data-recv-get')); return; }
    if ((el = t.closest('[data-recv-charge]'))){ chargeReceivable(el.getAttribute('data-recv-charge')); return; }
    if ((el = t.closest('[data-recv-del]'))){
      var r = findById(State.receivables, el.getAttribute('data-recv-del'));
      if (!(await confirmAction({title:'Excluir?', message:'Tem certeza que deseja excluir o valor a receber de ' + r.person + '?'}))) return;
      await Store.remove(k(), 'receivables', r.id);
      State.receivables = State.receivables.filter(function(x){ return x.id !== r.id; });
      renderReceivables(); renderDashboard();
      return;
    }
  });

  // Guardar valor em uma meta (formulário dentro do card).
  document.addEventListener('submit', function(e){
    if (e.target.id !== 'waOptinForm') return;
    e.preventDefault();
    var phone = e.target.phone.value.trim();
    if (onlyDigits(phone).length < 10){ toast('Informe o número com DDD.'); return; }
    setPref('waOptin', {phone: phone, at: Date.now()});
    renderConnections();
    toast('Combinado! Vamos avisar quando o WhatsApp estiver disponível.');
  });

  document.addEventListener('submit', async function(e){
    var form = e.target.closest('[data-goal-deposit]');
    if (!form) return;
    e.preventDefault();
    var g = findById(State.goals, form.getAttribute('data-goal-deposit'));
    var amount = money(form.amount.value);
    if (!(amount > 0)){ toast('Informe um valor para guardar.'); return; }
    var newAmount = money(Number(g.currentAmount||0) + amount);
    await Store.update(k(), 'goals', g.id, {currentAmount: newAmount});
    g.currentAmount = newAmount;
    renderGoals(); renderStatTiles();
    toast(newAmount >= g.targetAmount ? 'Meta “' + g.name + '” concluída! Parabéns!' : 'Você guardou mais ' + fmtMoney(amount) + ' na meta “' + g.name + '”.');
  });

  document.getElementById('brandHome').addEventListener('click', function(){
    if (State.session) { showView('viewApp'); showTab('dashboard'); } else { showView('viewLanding'); }
  });

  qsa('[data-authtab]').forEach(function(b){ b.addEventListener('click', function(){ showAuthTab(b.getAttribute('data-authtab')); }); });

  document.getElementById('typeToggle').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-type]');
    if (!btn) return;
    qsa('button', document.getElementById('typeToggle')).forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    populateCategorySelect();
    syncTxFormVisibility();
  });
  document.getElementById('txCategory').addEventListener('change', async function(e){
    if (e.target.value !== '__new') return;
    var id = await createCategory(currentTxType());
    populateCategorySelect(id || undefined);
    if (id){ renderBudgets(); }
  });
  document.getElementById('txForOther').addEventListener('change', syncTxFormVisibility);
  // Pagou com vale: já sugere a categoria Alimentação.
  document.getElementById('txPayment').addEventListener('change', function(e){
    if (e.target.value.indexOf('vale') === 0 && currentTxType() === 'expense') document.getElementById('txCategory').value = 'alimentacao';
    syncTxFormVisibility();
  });
  document.getElementById('txAmount').addEventListener('input', populateInstallSelect);
  ['txSearch','txFilterType','txFilterPay'].forEach(function(id){
    document.getElementById(id).addEventListener(id === 'txSearch' ? 'input' : 'change', renderTransactionsTab);
  });
  document.getElementById('manageCatsBtn').addEventListener('click', manageCategories);

  document.getElementById('tabbar').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-tab]');
    if (btn) showTab(btn.getAttribute('data-tab'));
  });

  document.getElementById('fabAdd').addEventListener('click', function(){ openTxModal(); });

  document.getElementById('prevMonth').addEventListener('click', function(){ State.txMonthOffset--; renderTransactionsTab(); });
  document.getElementById('nextMonth').addEventListener('click', function(){ if (State.txMonthOffset < maxTxMonthOffset()){ State.txMonthOffset++; renderTransactionsTab(); } });
  document.getElementById('budgetPrev').addEventListener('click', function(){ State.budgetMonthOffset--; renderBudgets(); });
  document.getElementById('budgetNext').addEventListener('click', function(){ if (State.budgetMonthOffset < 1){ State.budgetMonthOffset++; renderBudgets(); } });
  document.getElementById('budgetNewCat').addEventListener('click', async function(){
    var id = await createCategory('expense');
    if (id){ populateCategorySelect(document.getElementById('txCategory').value); renderBudgets(); var inp = qs('[data-budget-cat="' + id + '"]'); if (inp) inp.focus(); }
  });
  document.getElementById('budgetManageCats').addEventListener('click', manageCategories);
  document.getElementById('barPeriod').addEventListener('change', function(e){ State.barMonths = Number(e.target.value); renderBarChart(); });

  document.getElementById('loginForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errEl = document.getElementById('loginError');
    errEl.textContent = '';
    var emailKey = sanitizeEmailKey(email);
    var wait = lockRemaining(emailKey);
    if (wait){ errEl.textContent = 'Muitas tentativas. Aguarde ' + wait + ' segundos e tente de novo.'; return; }
    try{
      var user = await Store.getUser(emailKey);
      var check = user ? await verifyPassword(user, email, password) : {ok:false};
      // Mesma mensagem para e-mail inexistente e senha errada, para não revelar quem tem conta.
      if (!check.ok){ registerFail(emailKey); errEl.textContent = 'E-mail ou senha incorretos.'; return; }
      clearFails(emailKey);
      if (check.legacy){ await Store.updateUser(emailKey, await makePasswordRecord(password)); }
      State.session = newSession(emailKey, user);
      saveSession(State.session);
      document.getElementById('loginPassword').value = '';
      toast('Bem-vindo de volta, ' + user.name.split(' ')[0] + '!');
      await enterApp();
    } catch(err){ errEl.textContent = 'Não foi possível entrar agora. Tente novamente.'; }
  });

  document.getElementById('signupForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('signupName').value.trim();
    var email = document.getElementById('signupEmail').value.trim();
    var password = document.getElementById('signupPassword').value;
    var errEl = document.getElementById('signupError');
    errEl.textContent = '';
    if (!name){ errEl.textContent = 'Informe seu nome.'; return; }
    if (!validEmail(email)){ errEl.textContent = 'Informe um e-mail válido.'; return; }
    var pwErr = passwordProblem(password);
    if (pwErr){ errEl.textContent = pwErr; return; }
    var emailKey = sanitizeEmailKey(email);
    try{
      if (await Store.getUser(emailKey)){ errEl.textContent = 'Já existe uma conta com esse e-mail. Tente entrar.'; return; }
      var profile = Object.assign({name: name, email: email, createdAt: Date.now()}, await makePasswordRecord(password));
      await Store.createUser(emailKey, profile);
      State.session = newSession(emailKey, profile);
      saveSession(State.session);
      document.getElementById('signupPassword').value = '';
      toast('Conta criada! Bem-vindo(a), ' + name.split(' ')[0] + '.');
      await enterApp();
    } catch(err){ errEl.textContent = 'Não foi possível criar a conta agora. Tente novamente.'; }
  });

  document.getElementById('txForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var type = currentTxType();
    var amount = money(document.getElementById('txAmount').value);
    var category = document.getElementById('txCategory').value;
    var date = document.getElementById('txDate').value || todayKey();
    var desc = document.getElementById('txDesc').value.trim();
    if (!(amount > 0)){ toast('Informe um valor válido.'); return; }
    if (!validDateStr(date)){ toast('Use uma data entre 1900 e 3000.'); return; }
    if (category === '__new'){ toast('Escolha uma categoria.'); return; }
    var tx = {type:type, amount:amount, category:category, categoryLabel: catLabel(category, type), date:date, description:desc, paymentMethod:null, createdAt: Date.now()};
    var forOther = null;
    if (type === 'expense'){
      var pay = document.getElementById('txPayment').value;
      if (pay === 'card:none'){ toast('Cadastre um cartão na aba Cartões primeiro.'); showTab('cartoes'); return; }
      applyPayment(tx, pay);
      if (document.getElementById('txForOther').checked){
        forOther = document.getElementById('txOtherName').value.trim();
        if (!forOther){ toast('Informe quem vai te devolver o valor.'); return; }
      }
    }
    var n = tx.paymentMethod === 'cartao' ? Number(document.getElementById('txInstall').value) || 1 : 1;
    await saveTransactions(expandInstallments(tx, n));
    if (forOther){
      var recv = await Store.add(k(), 'receivables', {person:forOther, kind: tx.paymentMethod === 'cartao' ? 'cartao' : 'combinado', description: desc || catLabel(category, type), totalAmount: amount, receivedAmount: 0, dueDate: null, createdAt: Date.now()});
      State.receivables.push(recv);
      document.getElementById('txForOther').checked = false;
      document.getElementById('txOtherName').value = '';
      syncTxFormVisibility();
    }
    document.getElementById('txAmount').value = '';
    document.getElementById('txDesc').value = '';
    document.getElementById('txInstall').value = '1';
    populateInstallSelect();
    renderAll();
    toast((type === 'expense' ? 'Gasto' : 'Ganho') + ' de ' + fmtMoney(amount) + (n > 1 ? ' em ' + n + 'x' : '') + ' registrado.' + (forOther ? ' ' + forOther + ' foi para “A receber”.' : ''));
  });

  document.getElementById('forecastForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var desc = document.getElementById('fcDesc').value.trim();
    var amount = money(document.getElementById('fcAmount').value);
    var date = document.getElementById('fcDate').value;
    if (!desc || !(amount > 0) || !date){ toast('Preencha descrição, valor e data prevista.'); return; }
    if (!validDateStr(date)){ toast('Use uma data entre 1900 e 3000.'); return; }
    var f = {description: desc, amount: amount, date: date, recurring: document.getElementById('fcRecurring').checked, category: /sal[aá]rio/i.test(desc) ? 'salario' : 'outros_receita', received: {}, createdAt: Date.now()};
    var saved = await Store.add(k(), 'forecasts', f);
    State.forecasts.push(saved);
    e.target.reset();
    document.getElementById('fcDate').value = todayKey();
    renderDashboard();
    toast('Previsão de ' + fmtMoney(amount) + ' adicionada.');
  });

  document.getElementById('cardForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var v = readCardFields(document.getElementById('cardName').value, document.getElementById('cardLimit').value, document.getElementById('cardClosing').value, document.getElementById('cardDue').value);
    if (v.error){ toast(v.error); return; }
    v.paidInvoices = []; v.createdAt = Date.now();
    var saved = await Store.add(k(), 'cards', v);
    State.cards.push(saved);
    e.target.reset();
    renderCards(); populatePaymentSelect();
    toast('Cartão “' + v.name + '” adicionado.');
  });

  document.getElementById('voucherForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('vName').value.trim();
    var amount = money(document.getElementById('vAmount').value);
    var balRaw = document.getElementById('vBalance').value;
    if (!name || !(amount > 0)){ toast('Informe o nome e quanto cai por mês no vale.'); return; }
    var v = {name:name, amount:amount, carryOver: document.getElementById('vCarry').checked, initialBalance: balRaw === '' ? null : money(balRaw), startDate: todayKey(), createdAt: Date.now()};
    var saved = await Store.add(k(), 'vouchers', v);
    State.vouchers.push(saved);
    e.target.reset();
    document.getElementById('vCarry').checked = true;
    renderVouchers(); populatePaymentSelect();
    toast('Vale “' + name + '” adicionado.');
  });

  document.getElementById('goalForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('goalName').value.trim();
    var target = money(document.getElementById('goalTarget').value);
    var date = document.getElementById('goalDate').value;
    var reminder = document.getElementById('goalReminder').value;
    var note = document.getElementById('goalNote').value.trim();
    if (!name || !(target > 0)){ toast('Informe nome e valor alvo da meta.'); return; }
    if (!validDateStr(date) || !validDateStr(reminder)){ toast('Use datas entre os anos de 1900 e 3000.'); return; }
    var goal = {name:name, targetAmount:target, currentAmount:0, targetDate:date||null, reminderDate:reminder||null, note:note, deletedAt:null, createdAt:Date.now()};
    var saved = await Store.add(k(), 'goals', goal);
    State.goals.push(saved);
    e.target.reset();
    State.goalFilter = 'andamento';
    renderGoals(); renderDashboard();
    toast('Meta “' + name + '” criada.');
  });

  document.getElementById('debtForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('debtName').value.trim();
    var total = money(document.getElementById('debtTotal').value);
    var paid = Math.max(0, money(document.getElementById('debtPaid').value || 0));
    var installment = Math.max(0, money(document.getElementById('debtInstallment').value || 0));
    if (!name || !(total > 0)){ toast('Informe nome e valor total da dívida.'); return; }
    if (paid > total){ toast('O valor já pago não pode ser maior que o total.'); return; }
    var debt = {name:name, kind: document.getElementById('debtKind').value, creditor: document.getElementById('debtCreditor').value.trim(), totalAmount:total, paidAmount:paid, monthlyPayment:installment, createdAt:Date.now()};
    var saved = await Store.add(k(), 'debts', debt);
    State.debts.push(saved);
    e.target.reset();
    renderDebts(); renderDashboard();
    toast('Dívida “' + name + '” adicionada.');
  });

  document.getElementById('recvForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var person = document.getElementById('recvPerson').value.trim();
    var total = money(document.getElementById('recvTotal').value);
    var due = document.getElementById('recvDue').value;
    if (!person || !(total > 0)){ toast('Informe quem vai pagar e o valor.'); return; }
    if (!validDateStr(due)){ toast('Use uma data entre 1900 e 3000.'); return; }
    var r = {person:person, kind: document.getElementById('recvKind').value, description: document.getElementById('recvDesc').value.trim(), phone: document.getElementById('recvPhone').value.trim(), totalAmount: total, receivedAmount: 0, dueDate: due || null, createdAt: Date.now()};
    var saved = await Store.add(k(), 'receivables', r);
    State.receivables.push(saved);
    e.target.reset();
    renderReceivables(); renderDashboard();
    toast(person + ' foi adicionado(a) em “A receber”.');
  });

  document.getElementById('debtKind').innerHTML = optionsHtml(DEBT_KINDS, 'banco');
  document.getElementById('recvKind').innerHTML = optionsHtml(RECV_KINDS, 'emprestimo');

  document.getElementById('exportCsvBtn').addEventListener('click', async function(){
    var mb = monthBounds(State.txMonthOffset);
    var tx = txForMonth(mb.key);
    if (!tx.length){ toast('Não há lançamentos neste mês para exportar.'); return; }
    var rows = [['Data','Tipo','Categoria','Descrição','Forma de pagamento','Valor (R$)']];
    tx.forEach(function(t){
      rows.push([t.date, t.type==='income'?'Ganho':'Gasto', catLabel(t.category,t.type,t.categoryLabel), t.description||'', paymentLabel(t) || (t.type==='expense' ? PAYMENT_LABELS.conta : ''), String(t.amount).replace('.',',')]);
    });
    var csv = rows.map(function(r){ return r.map(csvCell).join(';'); }).join('\r\n');
    try{
      await saveFile('grana-leve-' + mb.key + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
      toast('Lançamentos baixados.');
    } catch(err){ toast('Não foi possível baixar o arquivo agora.'); }
  });

  document.getElementById('pdfReportBtn').addEventListener('click', generateMonthlyReport);

  /* ============ Boot ============ */
  async function boot(){
    await Store.init();
    var session = loadSession();
    if (session){
      try{
        var user = await Store.getUser(session.emailKey);
        if (user){
          State.session = session;
          await enterApp();
          return;
        }
      } catch(e){ /* fall through to landing */ }
    }
    renderTopbar();
    showView('viewLanding');
  }

  /* ============ App instalável (PWA) ============ */
  var installPrompt = null;
  function isStandalone(){ return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches; }
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    installPrompt = e;
    if (State.session) renderConnections();
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
  }

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();
