(function(){
  "use strict";

  /* ============ Constants ============ */
  var EXPENSE_CATS = [
    {id:'moradia', label:'Moradia', color:'var(--cat-1)'},
    {id:'alimentacao', label:'Alimentação', color:'var(--cat-2)'},
    {id:'transporte', label:'Transporte', color:'var(--cat-3)'},
    {id:'lazer', label:'Lazer', color:'var(--cat-4)'},
    {id:'saude', label:'Saúde', color:'var(--cat-5)'},
    {id:'educacao', label:'Educação', color:'var(--cat-6)'},
    {id:'compras', label:'Compras', color:'var(--cat-7)'},
    {id:'outros', label:'Outros', color:'var(--cat-8)'}
  ];
  var INCOME_CATS = [
    {id:'salario', label:'Salário'},
    {id:'freelance', label:'Freelance / Extra'},
    {id:'presente', label:'Presente / Ajuda'},
    {id:'outros_receita', label:'Outros'}
  ];
  var TIPS = [
    {tag:'Planejamento mensal', title:'Monte seu mês em 15 minutos',
     text:'Antes do dia 5, liste sua renda e separe em três blocos: essencial (moradia, contas, transporte), desejado (lazer, compras) e futuro (poupança, dívidas). Uma referência comum é 50/30/20 — ajuste à sua realidade, mas trate a poupança como parcela fixa, não como o que sobra no fim do mês.'},
    {tag:'Organização de gastos', title:'Registre na hora, não depois',
     text:'Na nossa pesquisa, 26 em cada 48 pessoas disseram esquecer de anotar gastos — o hábito quebra quando a gente deixa para depois. Anote a despesa assim que ela acontece, mesmo só com valor e categoria; ajustar detalhes depois é fácil, lembrar o gasto no fim da semana não é.'},
    {tag:'Cartão de crédito', title:'O limite do cartão não é renda',
     text:'O limite é crédito, não dinheiro seu — vira dívida se a fatura não for paga integralmente. Antes de parcelar, pergunte: eu compraria isso à vista? Se a resposta for não, o parcelamento provavelmente está cobrindo uma compra que não cabia no orçamento.'},
    {tag:'Como economizar', title:'Pague-se primeiro',
     text:'Assim que a renda entra, separe o valor da meta antes de gastar com qualquer outra coisa, mesmo que seja pouco. Poupar o que sobra raramente funciona porque quase sempre sobra pouco; poupar primeiro inverte essa lógica.'},
    {tag:'Sair das dívidas', title:'Ataque a dívida mais cara primeiro',
     text:'Liste as dívidas com a taxa de juros de cada uma. Pague o mínimo de todas, mas destine qualquer valor extra para quitar antes a de juros mais alto — geralmente o cartão de crédito. Isso reduz o total pago em juros mais rápido do que quitar primeiro a de menor valor.'}
  ];

  var currencyFmt = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
  var monthNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  function fmtMoney(v){ return currencyFmt.format(v || 0); }
  function catLabel(id, type){
    var list = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    for (var i=0;i<list.length;i++){ if (list[i].id === id) return list[i].label; }
    return id;
  }
  function catColor(id){
    for (var i=0;i<EXPENSE_CATS.length;i++){ if (EXPENSE_CATS[i].id === id) return EXPENSE_CATS[i].color; }
    return 'var(--text-muted)';
  }
  function resolveVar(cssVarExpr, el){
    var m = /var\((--[a-z0-9-]+)\)/.exec(cssVarExpr);
    if (!m) return cssVarExpr;
    return getComputedStyle(el || document.documentElement).getPropertyValue(m[1]).trim();
  }
  function uid(){ return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function toDateKey(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
  function monthKeyOf(dateStr){ return (dateStr || '').slice(0,7); }
  function escapeHtml(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function csvCell(s){ s = String(s == null ? '' : s); if (/[;"\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"'; return s; }

  async function sha256Hex(str){
    var enc = new TextEncoder().encode(str);
    var buf = await crypto.subtle.digest('SHA-256', enc);
    var arr = Array.from(new Uint8Array(buf));
    return arr.map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }
  async function hashPassword(email, password){ return sha256Hex('granaleve::' + email.toLowerCase() + '::' + password); }
  function sanitizeEmailKey(email){
    return String(email).trim().toLowerCase().replace(/[^a-z0-9_.~:@+-]/g, '_');
  }

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
      try{ localStorage.setItem(this.LOCAL_KEY, JSON.stringify(data)); } catch(e){ /* ignore */ }
    },
    _ensureUserLocal(data, key){
      if (!data.users[key]) data.users[key] = {profile:null, transactions:[], budgets:{}, goals:[], debts:[]};
      return data.users[key];
    },

    async getUser(emailKey){
      if (this.mode === 'cloud'){
        var snap = await this.db.doc('users/' + emailKey).get();
        return snap.exists ? snap.data() : null;
      }
      var data = this._readLocal();
      var u = data.users[emailKey];
      return (u && u.profile) ? u.profile : null;
    },
    async createUser(emailKey, profile){
      if (this.mode === 'cloud'){
        await this.db.doc('users/' + emailKey).set(profile);
        return;
      }
      var data = this._readLocal();
      this._ensureUserLocal(data, emailKey).profile = profile;
      this._writeLocal(data);
    },

    async listTransactions(emailKey){
      if (this.mode === 'cloud'){
        var q = await this.db.doc('users/' + emailKey).collection('transactions').get();
        return q.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      }
      var data = this._readLocal();
      return (this._ensureUserLocal(data, emailKey).transactions || []).slice();
    },
    async addTransaction(emailKey, tx){
      if (this.mode === 'cloud'){
        var ref = await this.db.doc('users/' + emailKey).collection('transactions').add(tx);
        return Object.assign({id: ref.id}, tx);
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      var withId = Object.assign({id: uid()}, tx);
      u.transactions.push(withId);
      this._writeLocal(data);
      return withId;
    },
    async deleteTransaction(emailKey, id){
      if (this.mode === 'cloud'){
        await this.db.doc('users/' + emailKey).collection('transactions').doc(id).delete();
        return;
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      u.transactions = u.transactions.filter(function(t){ return t.id !== id; });
      this._writeLocal(data);
    },

    async listBudgets(emailKey){
      if (this.mode === 'cloud'){
        var q = await this.db.doc('users/' + emailKey).collection('budgets').get();
        var out = {};
        q.docs.forEach(function(d){ out[d.id] = d.data().limit; });
        return out;
      }
      var data = this._readLocal();
      return Object.assign({}, this._ensureUserLocal(data, emailKey).budgets || {});
    },
    async setBudget(emailKey, categoryId, limit){
      if (this.mode === 'cloud'){
        await this.db.doc('users/' + emailKey).collection('budgets').doc(categoryId).set({limit: limit});
        return;
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      u.budgets[categoryId] = limit;
      this._writeLocal(data);
    },

    async listGoals(emailKey){
      if (this.mode === 'cloud'){
        var q = await this.db.doc('users/' + emailKey).collection('goals').get();
        return q.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      }
      var data = this._readLocal();
      return (this._ensureUserLocal(data, emailKey).goals || []).slice();
    },
    async addGoal(emailKey, goal){
      if (this.mode === 'cloud'){
        var ref = await this.db.doc('users/' + emailKey).collection('goals').add(goal);
        return Object.assign({id: ref.id}, goal);
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      var withId = Object.assign({id: uid()}, goal);
      u.goals.push(withId);
      this._writeLocal(data);
      return withId;
    },
    async updateGoal(emailKey, id, partial){
      if (this.mode === 'cloud'){
        await this.db.doc('users/' + emailKey).collection('goals').doc(id).update(partial);
        return;
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      u.goals = u.goals.map(function(g){ return g.id === id ? Object.assign({}, g, partial) : g; });
      this._writeLocal(data);
    },
    async deleteGoal(emailKey, id){
      if (this.mode === 'cloud'){
        await this.db.doc('users/' + emailKey).collection('goals').doc(id).delete();
        return;
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      u.goals = u.goals.filter(function(g){ return g.id !== id; });
      this._writeLocal(data);
    },

    async listDebts(emailKey){
      if (this.mode === 'cloud'){
        var q = await this.db.doc('users/' + emailKey).collection('debts').get();
        return q.docs.map(function(d){ return Object.assign({id:d.id}, d.data()); });
      }
      var data = this._readLocal();
      return (this._ensureUserLocal(data, emailKey).debts || []).slice();
    },
    async addDebt(emailKey, debt){
      if (this.mode === 'cloud'){
        var ref = await this.db.doc('users/' + emailKey).collection('debts').add(debt);
        return Object.assign({id: ref.id}, debt);
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      var withId = Object.assign({id: uid()}, debt);
      u.debts.push(withId);
      this._writeLocal(data);
      return withId;
    },
    async updateDebt(emailKey, id, partial){
      if (this.mode === 'cloud'){
        await this.db.doc('users/' + emailKey).collection('debts').doc(id).update(partial);
        return;
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      u.debts = u.debts.map(function(d){ return d.id === id ? Object.assign({}, d, partial) : d; });
      this._writeLocal(data);
    },
    async deleteDebt(emailKey, id){
      if (this.mode === 'cloud'){
        await this.db.doc('users/' + emailKey).collection('debts').doc(id).delete();
        return;
      }
      var data = this._readLocal();
      var u = this._ensureUserLocal(data, emailKey);
      u.debts = u.debts.filter(function(d){ return d.id !== id; });
      this._writeLocal(data);
    }
  };

  /* ============ App state ============ */
  var State = {
    session: null,        // {emailKey, name, email}
    transactions: [],
    budgets: {},
    goals: [],
    debts: [],
    txMonthOffset: 0,
    activeTab: 'dashboard',
    authTab: 'login'
  };

  var SESSION_KEY = 'granaleve_session_v1';

  function saveSession(s){ try{ localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch(e){} }
  function loadSession(){ try{ var r = localStorage.getItem(SESSION_KEY); return r ? JSON.parse(r) : null; } catch(e){ return null; } }
  function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); } catch(e){} }

  function monthBounds(offset){
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    var key = d.getFullYear() + '-' + pad2(d.getMonth()+1);
    var label = monthNames[d.getMonth()] + ' de ' + d.getFullYear();
    return {key: key, label: label, date: d};
  }

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
      var dotClass = Store.mode === 'cloud' ? 'cloud' : 'local';
      var dotLabel = Store.mode === 'cloud' ? 'Sincronizado' : 'Salvo neste navegador';
      wrap.innerHTML =
        '<span class="sync-badge" title="' + (Store.mode==='cloud' ? 'Seus dados estão salvos na nuvem deste artefato.' : 'Você não está conectado ao banco de dados agora — os dados ficam salvos apenas neste navegador.') + '">' +
          '<span class="sync-dot ' + dotClass + '"></span>' + dotLabel +
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

  function populateCategorySelect(){
    var sel = document.getElementById('txCategory');
    var type = qs('#typeToggle button.active').getAttribute('data-type');
    var list = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    sel.innerHTML = list.map(function(c){ return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('');
  }

  async function loadAllData(){
    var k = State.session.emailKey;
    var res = await Promise.all([
      Store.listTransactions(k), Store.listBudgets(k), Store.listGoals(k), Store.listDebts(k)
    ]);
    State.transactions = res[0].sort(function(a,b){ return (b.date||'').localeCompare(a.date||'') || (b.createdAt||0)-(a.createdAt||0); });
    State.budgets = res[1];
    State.goals = res[2];
    State.debts = res[3];
  }

  function txForMonth(key){
    return State.transactions.filter(function(t){ return monthKeyOf(t.date) === key; });
  }

  function monthTotals(key){
    var tx = txForMonth(key);
    var income = tx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
    var expense = tx.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
    return {income: income, expense: expense, saldo: income-expense};
  }

  function expenseCategoryTotals(key){
    var tx = txForMonth(key).filter(function(t){ return t.type==='expense'; });
    var out = {};
    tx.forEach(function(t){ out[t.category] = (out[t.category]||0) + Number(t.amount||0); });
    return out;
  }

  function pctDelta(cur, prev){
    if (!prev && !cur) return null;
    if (!prev) return null; // new spending, no baseline
    return ((cur-prev)/prev)*100;
  }

  function deltaBadge(cur, prev, downIsGood){
    var pct = pctDelta(cur, prev);
    if (pct === null){
      if (!cur && !prev) return '<span class="cmp-delta neutral">—</span>';
      return '<span class="cmp-delta neutral">novo</span>';
    }
    var up = pct >= 0;
    var arrow = up ? '▲' : '▼';
    var isGood = downIsGood ? !up : up;
    var cls = Math.abs(pct) < 1 ? 'neutral' : (isGood ? 'good' : 'critical');
    return '<span class="cmp-delta ' + cls + '">' + arrow + ' ' + Math.abs(Math.round(pct)) + '%</span>';
  }

  function renderComparison(){
    var cur = monthBounds(0), prev = monthBounds(-1);
    document.getElementById('comparisonMonthsLabel').textContent = cur.label + ' vs ' + prev.label;
    var curT = monthTotals(cur.key), prevT = monthTotals(prev.key);
    var curCats = expenseCategoryTotals(cur.key), prevCats = expenseCategoryTotals(prev.key);

    var summary = document.getElementById('comparisonSummary');
    summary.innerHTML =
      '<div class="tile tile-sm"><span class="tile-lbl">Receita</span><span class="tile-val tabular">'+fmtMoney(curT.income)+'</span>'+deltaBadge(curT.income, prevT.income, false)+'</div>' +
      '<div class="tile tile-sm"><span class="tile-lbl">Despesa</span><span class="tile-val tabular">'+fmtMoney(curT.expense)+'</span>'+deltaBadge(curT.expense, prevT.expense, true)+'</div>' +
      '<div class="tile tile-sm"><span class="tile-lbl">Saldo</span><span class="tile-val tabular">'+fmtMoney(curT.saldo)+'</span>'+deltaBadge(curT.saldo, prevT.saldo, false)+'</div>';

    var cats = EXPENSE_CATS.map(function(c){
      return {id:c.id, label:c.label, color:c.color, cur: curCats[c.id]||0, prev: prevCats[c.id]||0};
    }).filter(function(c){ return c.cur>0 || c.prev>0; });

    if (!cats.length){
      document.getElementById('comparisonList').innerHTML = '<p class="chart-empty">Ainda não há gastos suficientes para comparar os dois meses.</p>';
      return;
    }
    var list = document.getElementById('comparisonList');
    var rows = '<div class="cmp-row cmp-head"><span>Categoria</span><span class="tabular">'+cur.label.slice(0,3)+'</span><span class="tabular">'+prev.label.slice(0,3)+'</span><span>Variação</span></div>';
    rows += cats.map(function(c){
      return '<div class="cmp-row"><span class="cmp-cat"><span class="legend-swatch" style="background:'+resolveVar(c.color, list)+'"></span>'+c.label+'</span>' +
        '<span class="tabular">'+fmtMoney(c.cur)+'</span><span class="tabular">'+fmtMoney(c.prev)+'</span>' + deltaBadge(c.cur, c.prev, true) + '</div>';
    }).join('');
    list.innerHTML = rows;
  }

  function renderDashboard(){
    var cur = monthBounds(0);
    document.getElementById('monthLabel').textContent = 'Painel de ' + cur.label;
    var monthTx = txForMonth(cur.key);
    var income = monthTx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
    var expense = monthTx.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
    var saldo = income - expense;
    var savedInGoals = State.goals.reduce(function(s,g){ return s+Number(g.currentAmount||0); },0);
    var debtRemaining = State.debts.reduce(function(s,d){ return s + Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0)); },0);

    var saldoEl = document.getElementById('statSaldo');
    saldoEl.textContent = fmtMoney(saldo);
    saldoEl.className = 'tile-val tabular ' + (saldo < 0 ? 'neg' : 'pos');
    document.getElementById('statGastos').textContent = fmtMoney(expense);
    document.getElementById('statMetas').textContent = fmtMoney(savedInGoals);
    document.getElementById('statDividas').textContent = fmtMoney(debtRemaining);

    renderDonut(monthTx);
    renderBarChart();
    renderComparison();
    renderRecentTx();
  }

  function renderDonut(monthTx){
    var wrap = document.getElementById('donutWrap');
    var byCat = {};
    monthTx.filter(function(t){ return t.type==='expense'; }).forEach(function(t){
      byCat[t.category] = (byCat[t.category]||0) + Number(t.amount||0);
    });
    var entries = EXPENSE_CATS.map(function(c){ return {id:c.id, label:c.label, color:c.color, value: byCat[c.id]||0}; }).filter(function(e){ return e.value>0; });
    var total = entries.reduce(function(s,e){ return s+e.value; },0);

    if (!total){
      wrap.innerHTML = '<p class="chart-empty">Sem despesas registradas neste mês ainda.</p>';
      return;
    }
    var size = 220, r = 80, cx = size/2, cy = size/2, circumference = 2*Math.PI*r;
    var cum = 0;
    var circles = entries.map(function(e){
      var frac = e.value/total;
      var dash = frac*circumference;
      var offset = -cum*circumference;
      cum += frac;
      var color = resolveVar(e.color, wrap);
      return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+color+'" stroke-width="26" ' +
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

    var table = '<details class="table-toggle"><summary>Ver como tabela</summary><table class="data-table"><thead><tr><th>Categoria</th><th>Valor</th><th>%</th></tr></thead><tbody>' +
      entries.map(function(e){ return '<tr><td>'+escapeHtml(e.label)+'</td><td class="tabular">'+fmtMoney(e.value)+'</td><td class="tabular">'+Math.round(100*e.value/total)+'%</td></tr>'; }).join('') +
      '</tbody></table></details>';

    wrap.innerHTML = svg + legend + table;
    wrap.style.position = 'relative';
    var tip = null;
    qsa('.donut-seg', wrap).forEach(function(seg){
      seg.addEventListener('mouseenter', function(e){ tip = showChartTip(wrap, e.clientX, e.clientY, seg.getAttribute('data-label') + ': ' + seg.getAttribute('data-value')); });
      seg.addEventListener('mousemove', function(e){ if (tip) positionTip(wrap, tip, e.clientX, e.clientY); });
      seg.addEventListener('mouseleave', function(){ if (tip){ tip.remove(); tip = null; } });
      seg.addEventListener('focus', function(){ tip = showChartTip(wrap, null, null, seg.getAttribute('data-label') + ': ' + seg.getAttribute('data-value'), seg); });
      seg.addEventListener('blur', function(){ if (tip){ tip.remove(); tip = null; } });
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
    var months = [];
    for (var i=5;i>=0;i--){ months.push(monthBounds(-i)); }
    var data = months.map(function(m){
      var tx = txForMonth(m.key);
      var inc = tx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
      var exp = tx.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
      return {label: m.label.slice(0,3), inc:inc, exp:exp};
    });
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
      var x1 = gx + groupW/2 - barW - 2, x2 = gx + groupW/2 + 2;
      return '<rect class="bar-seg" data-label="Receita · '+months[idx].label+'" data-value="'+fmtMoney(d.inc)+'" x="'+x1+'" y="'+(padT+plotH-hInc)+'" width="'+barW+'" height="'+Math.max(hInc,1)+'" rx="3" fill="'+incColor+'" tabindex="0"></rect>' +
        '<rect class="bar-seg" data-label="Despesa · '+months[idx].label+'" data-value="'+fmtMoney(d.exp)+'" x="'+x2+'" y="'+(padT+plotH-hExp)+'" width="'+barW+'" height="'+Math.max(hExp,1)+'" rx="3" fill="'+expColor+'" tabindex="0"></rect>' +
        '<text x="'+(gx+groupW/2)+'" y="'+(H-4)+'" text-anchor="middle" font-size="9">'+d.label+'</text>';
    }).join('');

    var svg = '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="220" role="img" aria-label="Receitas e despesas dos últimos 6 meses">' +
      grid +
      '<line x1="'+padL+'" y1="'+(padT+plotH)+'" x2="'+(W-padR)+'" y2="'+(padT+plotH)+'" stroke="var(--baseline)" stroke-width="1"></line>' +
      bars + '</svg>';

    var legend = '<div class="legend">' +
      '<span class="legend-item"><span class="legend-swatch" style="background:'+incColor+'"></span>Receita</span>' +
      '<span class="legend-item"><span class="legend-swatch" style="background:'+expColor+'"></span>Despesa</span>' +
      '</div>';

    var table = '<details class="table-toggle"><summary>Ver como tabela</summary><table class="data-table"><thead><tr><th>Mês</th><th>Receita</th><th>Despesa</th></tr></thead><tbody>' +
      data.map(function(d,idx){ return '<tr><td>'+months[idx].label+'</td><td class="tabular">'+fmtMoney(d.inc)+'</td><td class="tabular">'+fmtMoney(d.exp)+'</td></tr>'; }).join('') +
      '</tbody></table></details>';

    wrap.innerHTML = svg + legend + table;
    wrap.style.position = 'relative';
    var tip = null;
    qsa('.bar-seg', wrap).forEach(function(seg){
      seg.addEventListener('mouseenter', function(e){ tip = showChartTip(wrap, e.clientX, e.clientY, seg.getAttribute('data-label') + ': ' + seg.getAttribute('data-value')); });
      seg.addEventListener('mousemove', function(e){ if (tip) positionTip(wrap, tip, e.clientX, e.clientY); });
      seg.addEventListener('mouseleave', function(){ if (tip){ tip.remove(); tip = null; } });
      seg.addEventListener('focus', function(){ tip = showChartTip(wrap, null, null, seg.getAttribute('data-label') + ': ' + seg.getAttribute('data-value'), seg); });
      seg.addEventListener('blur', function(){ if (tip){ tip.remove(); tip = null; } });
    });
  }

  function renderRecentTx(){
    var list = document.getElementById('recentTxList');
    var recent = State.transactions.slice(0,5);
    if (!recent.length){ list.innerHTML = '<p class="empty-state">Nenhum lançamento ainda. Toque no botão “+” para começar.</p>'; return; }
    list.innerHTML = recent.map(txRowHtml).join('');
  }

  function txRowHtml(t){
    var isExpense = t.type === 'expense';
    var dot = isExpense ? catColor(t.category) : 'var(--good)';
    var sign = isExpense ? '-' : '+';
    return '<div class="tx-row" data-id="'+t.id+'">' +
      '<span class="tx-cat-dot" style="background:'+dot+'"></span>' +
      '<div class="tx-main"><div class="tx-desc">'+escapeHtml(t.description || catLabel(t.category, t.type))+'</div>' +
      '<div class="tx-meta">'+catLabel(t.category, t.type) + ' · ' + formatDateBr(t.date)+'</div></div>' +
      '<span class="tx-amount ' + t.type + ' tabular">' + sign + ' ' + fmtMoney(t.amount) + '</span>' +
      '<button class="tx-del" data-del-tx="'+t.id+'" aria-label="Excluir lançamento" title="Excluir">×</button>' +
      '</div>';
  }
  function formatDateBr(iso){
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1];
  }

  function renderTransactionsTab(){
    var mb = monthBounds(State.txMonthOffset);
    document.getElementById('txMonthLabel').textContent = mb.label;
    var tx = txForMonth(mb.key);
    var income = tx.filter(function(t){ return t.type==='income'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
    var expense = tx.filter(function(t){ return t.type==='expense'; }).reduce(function(s,t){ return s+Number(t.amount||0); },0);
    document.getElementById('txSummary').textContent = tx.length + ' lançamento(s) · receitas ' + fmtMoney(income) + ' · despesas ' + fmtMoney(expense);
    var list = document.getElementById('txList');
    if (!tx.length){ list.innerHTML = '<p class="empty-state">Nenhum lançamento neste mês.</p>'; return; }
    list.innerHTML = tx.map(txRowHtml).join('');
  }

  function statusForPct(pct){
    if (pct >= 1) return 'critical';
    if (pct >= 0.8) return 'warning';
    return 'good';
  }
  var statusLabel = {good:'sob controle', warning:'quase no limite', critical:'estourou'};

  function renderBudgets(){
    var mb = monthBounds(0);
    document.getElementById('budgetMonthLabel').textContent = mb.label;
    var monthTx = txForMonth(mb.key).filter(function(t){ return t.type==='expense'; });
    var spentByCat = {};
    monthTx.forEach(function(t){ spentByCat[t.category] = (spentByCat[t.category]||0) + Number(t.amount||0); });

    var list = document.getElementById('budgetList');
    list.innerHTML = EXPENSE_CATS.map(function(c){
      var limit = Number(State.budgets[c.id] || 0);
      var spent = spentByCat[c.id] || 0;
      var pct = limit > 0 ? Math.min(1.4, spent/limit) : 0;
      var status = limit > 0 ? statusForPct(spent/limit) : 'good';
      var barColor = status === 'critical' ? 'var(--critical)' : status === 'warning' ? 'var(--warning)' : 'var(--good)';
      return '<div class="budget-row">' +
        '<div class="budget-top">' +
          '<span class="budget-cat"><span class="legend-swatch" style="background:'+resolveVar(c.color, list)+'"></span>'+c.label+'</span>' +
          '<input class="budget-limit-input tabular" type="number" min="0" step="10" data-budget-cat="'+c.id+'" value="'+(limit||'')+'" placeholder="Sem limite">' +
        '</div>' +
        (limit > 0 ?
          '<div class="progress"><span style="width:'+Math.min(100,pct*100)+'%; background:'+barColor+'"></span></div>' +
          '<div class="budget-top"><span class="budget-figs tabular">'+fmtMoney(spent)+' de '+fmtMoney(limit)+'</span><span class="status-pill '+status+'">'+statusLabel[status]+'</span></div>'
          : (spent > 0 ? '<span class="budget-figs tabular">Gasto no mês: '+fmtMoney(spent)+' (defina um limite acima)</span>' : '')
        ) +
        '</div>';
    }).join('');

    qsa('[data-budget-cat]', list).forEach(function(input){
      input.addEventListener('change', async function(){
        var cat = input.getAttribute('data-budget-cat');
        var val = Number(input.value || 0);
        await Store.setBudget(State.session.emailKey, cat, val);
        State.budgets[cat] = val;
        renderBudgets();
        toast('Orçamento de ' + catLabel(cat,'expense') + ' atualizado.');
      });
    });
  }

  function renderGoals(){
    var grid = document.getElementById('goalGrid');
    if (!State.goals.length){ grid.innerHTML = '<p class="empty-state">Nenhuma meta ainda. Que tal criar a primeira acima?</p>'; return; }
    grid.innerHTML = State.goals.map(function(g){
      var pct = g.targetAmount > 0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0;
      var done = pct >= 1;
      return '<div class="goal-card">' +
        '<h4>'+escapeHtml(g.name)+'</h4>' +
        '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--brand)"></span></div>' +
        '<div class="goal-figs"><span class="tabular">'+fmtMoney(g.currentAmount||0)+' de '+fmtMoney(g.targetAmount)+'</span><span>'+Math.round(pct*100)+'%</span></div>' +
        (g.targetDate ? '<span class="tx-meta">Prazo: '+formatDateBr(g.targetDate)+'</span>' : '') +
        '<div class="card-actions">' +
          (done ? '<span class="status-pill good">meta concluída</span>' : '<button class="btn btn-ghost btn-sm" data-goal-add="'+g.id+'">+ R$50</button>') +
          '<button class="btn btn-danger btn-sm" data-goal-del="'+g.id+'">Excluir</button>' +
        '</div></div>';
    }).join('');

    qsa('[data-goal-add]', grid).forEach(function(btn){
      btn.addEventListener('click', async function(){
        var id = btn.getAttribute('data-goal-add');
        var g = State.goals.find(function(x){ return x.id===id; });
        var newAmount = Number(g.currentAmount||0) + 50;
        await Store.updateGoal(State.session.emailKey, id, {currentAmount: newAmount});
        g.currentAmount = newAmount;
        renderGoals();
        toast('Você guardou mais R$ 50,00 na meta “' + g.name + '”.');
      });
    });
    qsa('[data-goal-del]', grid).forEach(function(btn){
      btn.addEventListener('click', async function(){
        var id = btn.getAttribute('data-goal-del');
        await Store.deleteGoal(State.session.emailKey, id);
        State.goals = State.goals.filter(function(g){ return g.id!==id; });
        renderGoals();
      });
    });
  }

  function renderDebts(){
    var grid = document.getElementById('debtGrid');
    if (!State.debts.length){ grid.innerHTML = '<p class="empty-state">Nenhuma dívida cadastrada. Se você não tem dívidas, ótimo — pode pular esta seção.</p>'; return; }
    grid.innerHTML = State.debts.map(function(d){
      var remaining = Math.max(0, Number(d.totalAmount||0) - Number(d.paidAmount||0));
      var pct = d.totalAmount > 0 ? Math.min(1, Number(d.paidAmount||0)/Number(d.totalAmount)) : 0;
      var done = remaining <= 0;
      return '<div class="debt-card">' +
        '<h4>'+escapeHtml(d.name)+'</h4>' +
        '<div class="progress"><span style="width:'+(pct*100)+'%; background:var(--good)"></span></div>' +
        '<div class="debt-figs"><span class="tabular">Pago: '+fmtMoney(d.paidAmount||0)+'</span><span class="tabular">Falta: '+fmtMoney(remaining)+'</span></div>' +
        (d.monthlyPayment ? '<span class="tx-meta">Parcela mensal: '+fmtMoney(d.monthlyPayment)+'</span>' : '') +
        '<div class="card-actions">' +
          (done ? '<span class="status-pill good">quitada</span>' : '<button class="btn btn-ghost btn-sm" data-debt-pay="'+d.id+'">Registrar parcela</button>') +
          '<button class="btn btn-danger btn-sm" data-debt-del="'+d.id+'">Excluir</button>' +
        '</div></div>';
    }).join('');

    qsa('[data-debt-pay]', grid).forEach(function(btn){
      btn.addEventListener('click', async function(){
        var id = btn.getAttribute('data-debt-pay');
        var d = State.debts.find(function(x){ return x.id===id; });
        var amount = Number(d.monthlyPayment) > 0 ? Number(d.monthlyPayment) : Math.max(0, Number(d.totalAmount)-Number(d.paidAmount));
        var newPaid = Math.min(Number(d.totalAmount), Number(d.paidAmount||0) + amount);
        await Store.updateDebt(State.session.emailKey, id, {paidAmount: newPaid});
        d.paidAmount = newPaid;
        renderDebts();
        toast('Pagamento registrado em “' + d.name + '”.');
      });
    });
    qsa('[data-debt-del]', grid).forEach(function(btn){
      btn.addEventListener('click', async function(){
        var id = btn.getAttribute('data-debt-del');
        await Store.deleteDebt(State.session.emailKey, id);
        State.debts = State.debts.filter(function(d){ return d.id!==id; });
        renderDebts();
      });
    });
  }

  function renderTips(){
    var grid = document.getElementById('tipsGrid');
    grid.innerHTML = TIPS.map(function(t){
      return '<div class="tip-card"><span class="tip-tag">'+escapeHtml(t.tag)+'</span><h4>'+escapeHtml(t.title)+'</h4><p>'+escapeHtml(t.text)+'</p></div>';
    }).join('');
  }

  function renderAll(){
    document.getElementById('greeting').textContent = 'Olá, ' + State.session.name.split(' ')[0];
    renderTopbar();
    renderDashboard();
    renderTransactionsTab();
    renderBudgets();
    renderGoals();
    renderDebts();
    renderTips();
  }

  /* ============ Tabs / navigation ============ */
  function showTab(name){
    State.activeTab = name;
    qsa('#tabbar button').forEach(function(b){ b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    ['dashboard','lancamentos','orcamento','metas','dividas','aprenda'].forEach(function(t){
      document.getElementById('tab-' + t).hidden = (t !== name);
    });
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
    document.getElementById('txDate').value = toDateKey(new Date());
    populateCategorySelect();
    renderAll();
    showTab('dashboard');
  }

  function logout(){
    clearSession();
    State.session = null;
    showView('viewLanding');
    renderTopbar();
  }

  /* ============ Event wiring ============ */
  document.addEventListener('click', function(e){
    var actionEl = e.target.closest('[data-action]');
    if (actionEl){
      var action = actionEl.getAttribute('data-action');
      if (action === 'go-login'){ showView('viewAuth'); showAuthTab('login'); }
      if (action === 'go-signup'){ showView('viewAuth'); showAuthTab('signup'); }
      if (action === 'go-tab-lancamentos'){ showTab('lancamentos'); }
    }
    var delTx = e.target.closest('[data-del-tx]');
    if (delTx){
      var id = delTx.getAttribute('data-del-tx');
      Store.deleteTransaction(State.session.emailKey, id).then(function(){
        State.transactions = State.transactions.filter(function(t){ return t.id !== id; });
        renderDashboard(); renderTransactionsTab();
        toast('Lançamento excluído.');
      });
    }
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
  });

  document.getElementById('tabbar').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-tab]');
    if (btn) showTab(btn.getAttribute('data-tab'));
  });

  document.getElementById('fabAdd').addEventListener('click', function(){
    showTab('lancamentos');
    document.getElementById('txAmount').focus();
  });

  document.getElementById('prevMonth').addEventListener('click', function(){ State.txMonthOffset--; renderTransactionsTab(); });
  document.getElementById('nextMonth').addEventListener('click', function(){ if (State.txMonthOffset < 0){ State.txMonthOffset++; renderTransactionsTab(); } });

  document.getElementById('loginForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errEl = document.getElementById('loginError');
    errEl.textContent = '';
    var emailKey = sanitizeEmailKey(email);
    try{
      var user = await Store.getUser(emailKey);
      if (!user){ errEl.textContent = 'Não encontramos uma conta com esse e-mail.'; return; }
      var hash = await hashPassword(email, password);
      if (hash !== user.passwordHash){ errEl.textContent = 'Senha incorreta.'; return; }
      State.session = {emailKey: emailKey, name: user.name, email: user.email};
      saveSession(State.session);
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
    if (!name || !email || password.length < 4){ errEl.textContent = 'Preencha nome, e-mail e uma senha com pelo menos 4 caracteres.'; return; }
    var emailKey = sanitizeEmailKey(email);
    try{
      var existing = await Store.getUser(emailKey);
      if (existing){ errEl.textContent = 'Já existe uma conta com esse e-mail. Tente entrar.'; return; }
      var hash = await hashPassword(email, password);
      var profile = {name: name, email: email, passwordHash: hash, createdAt: Date.now()};
      await Store.createUser(emailKey, profile);
      State.session = {emailKey: emailKey, name: name, email: email};
      saveSession(State.session);
      toast('Conta criada! Bem-vindo(a), ' + name.split(' ')[0] + '.');
      await enterApp();
    } catch(err){ errEl.textContent = 'Não foi possível criar a conta agora. Tente novamente.'; }
  });

  document.getElementById('txForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var type = qs('#typeToggle button.active').getAttribute('data-type');
    var amount = Number(document.getElementById('txAmount').value);
    var category = document.getElementById('txCategory').value;
    var date = document.getElementById('txDate').value || toDateKey(new Date());
    var desc = document.getElementById('txDesc').value.trim();
    if (!amount || amount <= 0){ toast('Informe um valor válido.'); return; }
    var tx = {type:type, amount:amount, category:category, date:date, description:desc, createdAt: Date.now()};
    var saved = await Store.addTransaction(State.session.emailKey, tx);
    State.transactions.unshift(saved);
    document.getElementById('txAmount').value = '';
    document.getElementById('txDesc').value = '';
    renderDashboard();
    renderTransactionsTab();
    renderBudgets();
    toast((type === 'expense' ? 'Despesa' : 'Receita') + ' de ' + fmtMoney(amount) + ' registrada.');
  });

  document.getElementById('goalForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('goalName').value.trim();
    var target = Number(document.getElementById('goalTarget').value);
    var date = document.getElementById('goalDate').value;
    if (!name || !target || target <= 0){ toast('Informe nome e valor alvo da meta.'); return; }
    var goal = {name:name, targetAmount:target, currentAmount:0, targetDate:date||null, createdAt:Date.now()};
    var saved = await Store.addGoal(State.session.emailKey, goal);
    State.goals.push(saved);
    e.target.reset();
    renderGoals();
    renderDashboard();
    toast('Meta “' + name + '” criada.');
  });

  document.getElementById('debtForm').addEventListener('submit', async function(e){
    e.preventDefault();
    var name = document.getElementById('debtName').value.trim();
    var total = Number(document.getElementById('debtTotal').value);
    var paid = Number(document.getElementById('debtPaid').value || 0);
    var installment = Number(document.getElementById('debtInstallment').value || 0);
    if (!name || !total || total <= 0){ toast('Informe nome e valor total da dívida.'); return; }
    var debt = {name:name, totalAmount:total, paidAmount:paid, monthlyPayment:installment, createdAt:Date.now()};
    var saved = await Store.addDebt(State.session.emailKey, debt);
    State.debts.push(saved);
    e.target.reset();
    renderDebts();
    renderDashboard();
    toast('Dívida “' + name + '” adicionada.');
  });

  document.getElementById('exportCsvBtn').addEventListener('click', async function(){
    var mb = monthBounds(State.txMonthOffset);
    var tx = txForMonth(mb.key);
    if (!tx.length){ toast('Não há lançamentos neste mês para exportar.'); return; }
    var rows = [['Data','Tipo','Categoria','Descrição','Valor (R$)']];
    tx.forEach(function(t){
      rows.push([t.date, t.type==='income'?'Receita':'Despesa', catLabel(t.category,t.type), t.description||'', String(t.amount).replace('.',',')]);
    });
    var csv = rows.map(function(r){ return r.map(csvCell).join(';'); }).join('\r\n');
    try{
      await saveFile('grana-leve-' + mb.key + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
      toast('Relatório baixado.');
    } catch(err){ toast('Não foi possível baixar o relatório agora.'); }
  });

  function pct1(n){ return (Math.round(n*10)/10).toString().replace('.',','); }

  async function generateMonthlyReport(){
    if (!window.jspdf || !window.jspdf.jsPDF){ toast('Não foi possível carregar o gerador de PDF agora.'); return; }
    var btn = document.getElementById('pdfReportBtn');
    var originalLabel = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gerando...';
    try{
      var cur = monthBounds(0), prev = monthBounds(-1);
      var curT = monthTotals(cur.key), prevT = monthTotals(prev.key);
      var curCats = expenseCategoryTotals(cur.key), prevCats = expenseCategoryTotals(prev.key);
      var catsWithData = EXPENSE_CATS.map(function(c){ return {label:c.label, cur:curCats[c.id]||0, prev:prevCats[c.id]||0}; })
        .filter(function(c){ return c.cur>0 || c.prev>0; })
        .sort(function(a,b){ return b.cur-a.cur; });

      var doc = new window.jspdf.jsPDF({unit:'pt', format:'a4'});
      var pageW = doc.internal.pageSize.getWidth();
      var marginX = 48, y = 56;
      var lineColor = [225,224,217];

      doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(20,20,20);
      doc.text('Grana Leve — Relatório mensal', marginX, y);
      y += 20;
      doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85);
      doc.text(cur.label.charAt(0).toUpperCase()+cur.label.slice(1) + '  ·  ' + (State.session ? State.session.name : ''), marginX, y);
      y += 6;
      doc.setDrawColor.apply(doc, lineColor); doc.line(marginX, y+8, pageW-marginX, y+8);
      y += 30;

      function sectionTitle(t){
        doc.setFont('helvetica','bold'); doc.setFontSize(12.5); doc.setTextColor(20,20,20);
        doc.text(t, marginX, y); y += 16;
      }
      function tableHeader(cols, widths){
        doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(110,108,100);
        var x = marginX;
        cols.forEach(function(c,i){ doc.text(c, x, y); x += widths[i]; });
        y += 8;
        doc.setDrawColor.apply(doc, lineColor); doc.line(marginX, y, pageW-marginX, y);
        y += 14;
      }
      function tableRow(cells, widths, opts){
        opts = opts || {};
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(10.5);
        doc.setTextColor(opts.color ? opts.color[0] : 30, opts.color ? opts.color[1] : 30, opts.color ? opts.color[2] : 28);
        var x = marginX;
        cells.forEach(function(c,i){ doc.text(String(c), x, y); x += widths[i]; });
        y += 17;
        if (y > 760){ doc.addPage(); y = 56; }
      }
      function deltaText(cur, prev){
        var d = pctDelta(cur, prev);
        if (d === null) return (cur>0 && prev===0) ? 'novo' : '—';
        return (d>=0?'+':'') + pct1(d) + '%';
      }

      sectionTitle('Resumo do mês');
      tableHeader(['', 'Este mês', 'Mês anterior', 'Variação'], [140,130,130,80]);
      tableRow(['Receitas', fmtMoney(curT.income), fmtMoney(prevT.income), deltaText(curT.income, prevT.income)], [140,130,130,80]);
      tableRow(['Despesas', fmtMoney(curT.expense), fmtMoney(prevT.expense), deltaText(curT.expense, prevT.expense)], [140,130,130,80]);
      tableRow(['Saldo', fmtMoney(curT.saldo), fmtMoney(prevT.saldo), deltaText(curT.saldo, prevT.saldo)], [140,130,130,80], {bold:true});
      y += 12;

      sectionTitle('Gastos por categoria');
      if (!catsWithData.length){
        doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85);
        doc.text('Nenhuma despesa registrada neste mês.', marginX, y); y += 20;
      } else {
        tableHeader(['Categoria', 'Este mês', 'Mês anterior', 'Variação'], [160,120,120,80]);
        catsWithData.forEach(function(c){
          tableRow([c.label, fmtMoney(c.cur), fmtMoney(c.prev), deltaText(c.cur, c.prev)], [160,120,120,80]);
        });
      }
      y += 12;

      sectionTitle('Metas de economia');
      if (!State.goals.length){
        doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85);
        doc.text('Nenhuma meta cadastrada.', marginX, y); y += 20;
      } else {
        tableHeader(['Meta', 'Guardado', 'Objetivo', 'Progresso'], [180,110,110,80]);
        State.goals.forEach(function(g){
          var p = g.targetAmount>0 ? Math.min(1, Number(g.currentAmount||0)/Number(g.targetAmount)) : 0;
          tableRow([g.name, fmtMoney(g.currentAmount||0), fmtMoney(g.targetAmount), Math.round(p*100)+'%'], [180,110,110,80]);
        });
      }
      y += 12;

      sectionTitle('Dívidas');
      if (!State.debts.length){
        doc.setFont('helvetica','normal'); doc.setFontSize(10.5); doc.setTextColor(90,90,85);
        doc.text('Nenhuma dívida cadastrada.', marginX, y); y += 20;
      } else {
        tableHeader(['Dívida', 'Pago', 'Falta', 'Total'], [180,110,110,80]);
        State.debts.forEach(function(d){
          var remaining = Math.max(0, Number(d.totalAmount||0)-Number(d.paidAmount||0));
          tableRow([d.name, fmtMoney(d.paidAmount||0), fmtMoney(remaining), fmtMoney(d.totalAmount)], [180,110,110,80]);
        });
      }

      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(140,138,130);
      doc.text('Gerado pelo Grana Leve em ' + new Date().toLocaleDateString('pt-BR'), marginX, 800);

      var blob = doc.output('blob');
      await saveFile('grana-leve-relatorio-' + cur.key + '.pdf', blob, 'application/pdf');
      toast('Relatório em PDF baixado.');
    } catch(err){
      toast('Não foi possível gerar o relatório agora.');
    } finally {
      btn.disabled = false; btn.textContent = originalLabel;
    }
  }
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

  if (document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', boot); } else { boot(); }
})();
