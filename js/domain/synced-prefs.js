/*
 * Regra de qual lado vale quando uma preferência existe neste aparelho e na conta (js/ui/synced-prefs.js cuida de gravar e enviar).
 * Vale o mais recente, item por item. Nada é apagado: conta vazia não limpa o aparelho e aparelho sem o item não limpa a conta.
 * doc: {values: {nome: valor}, at: {nome: instante}} ou null. prefs: as preferências locais. stamps: {nome: instante} locais.
 * Devolve {apply: [{name, value, at}] (traz da conta), stamp: [{name, at}] (só marca a hora local), push: true se há algo para enviar}.
 */
export function planPull(doc, prefs, stamps, now, names){
  var out = {apply: [], stamp: [], push: false}, values = (doc && doc.values) || {}, at = (doc && doc.at) || {};
  names.forEach(function(name){
    var remoteAt = Number(at[name]) || 0, localAt = Number((stamps || {})[name]) || 0;
    var hasRemote = values[name] !== undefined, hasLocal = (prefs || {})[name] !== undefined;
    if (hasRemote && remoteAt > localAt){ out.apply.push({name: name, value: values[name], at: remoteAt}); return; }
    if (hasLocal && (!hasRemote || localAt > remoteAt)){
      if (!localAt) out.stamp.push({name: name, at: now});   // já existia antes de haver sincronização: conta como novo e sobe
      out.push = true;
    }
  });
  return out;
}
