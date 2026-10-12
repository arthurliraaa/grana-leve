import {test} from 'node:test';
import assert from 'node:assert/strict';
import {annualRate, investmentLabel, parseSgs, REFERENCE_INDEXES} from '../../js/domain/investments.js';

const idx = {cdi: 13.65, selic: 13.75, ipca: 4.58};

test('taxa ao ano por tipo de aplicação', () => {
  assert.equal(annualRate({type: 'cdb', pct: 110}, idx), 15.02, 'CDB 110% do CDI');
  assert.equal(annualRate({type: 'caixinha'}, idx), 13.65, 'caixinha sem % informado: 100% do CDI');
  assert.equal(annualRate({type: 'lci', pct: 90}, idx), 12.29);
  assert.equal(annualRate({type: 'selic'}, idx), 13.75);
  assert.equal(annualRate({type: 'ipca', spread: 6}, idx), 10.85, '(1,0458 × 1,06) − 1');
  assert.equal(annualRate({type: 'fixa', rate: 12}, idx), 12);
  assert.equal(annualRate({type: 'nenhum'}, idx), 0);
  assert.equal(annualRate(null, idx), null);
  assert.equal(annualRate({type: ''}, idx), null);
});

test('poupança segue a regra oficial', () => {
  assert.equal(annualRate({type: 'poupanca'}, idx), 6.17, 'Selic acima de 8,5%: 0,5% ao mês');
  assert.equal(annualRate({type: 'poupanca'}, {cdi: 7, selic: 7, ipca: 4}), 4.9, 'Selic até 8,5%: 70% da Selic');
});

test('nomes curtos e leitura da API do Banco Central', () => {
  assert.equal(investmentLabel({type: 'cdb', pct: 110}), 'CDB 110% do CDI');
  assert.equal(investmentLabel({type: 'ipca', spread: 6.5}), 'Tesouro IPCA+ 6,5%');
  assert.equal(investmentLabel({type: 'poupanca'}), 'Poupança');
  assert.deepEqual(parseSgs([{data: '08/10/2026', valor: '13.65'}]), {value: 13.65, date: '2026-10-08'});
  assert.equal(parseSgs([]), null);
  assert.equal(parseSgs([{data: 'x', valor: 'abc'}]), null);
  assert.ok(REFERENCE_INDEXES.reference && REFERENCE_INDEXES.cdi > 0);
});

test('busca no Banco Central: guarda por um dia e, sem internet, usa o guardado', async () => {
  const mem = new Map();
  globalThis.localStorage = {getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v))};
  let calls = 0, online = true;
  globalThis.fetch = async (url) => {
    calls++;
    if (!online) throw new Error('Failed to fetch');
    const serie = /sgs\.(\d+)/.exec(url)[1];
    const valor = {4389: '13.65', 432: '13.75', 13522: '4.58'}[serie];
    return {ok: true, json: async () => [{data: '08/10/2026', valor}]};
  };
  const {fetchIndexes} = await import('../../js/data/rates.js');
  const a = await fetchIndexes();
  assert.deepEqual([a.cdi, a.selic, a.ipca, a.date], [13.65, 13.75, 4.58, '2026-10-08']);
  assert.equal(calls, 3);
  await fetchIndexes();
  assert.equal(calls, 3, 'no mesmo dia, não busca de novo');
  online = false;
  const b = await fetchIndexes(true);
  assert.equal(b.cdi, 13.65, 'sem internet: usa o último guardado');
  mem.clear();
  const c = await fetchIndexes(true);
  assert.ok(c.reference, 'sem nada guardado: valores de referência');
});
