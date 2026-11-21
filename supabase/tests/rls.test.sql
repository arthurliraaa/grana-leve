-- Testes das regras de segurança (RLS), do estudo e do painel de administração.
-- Rodam como pessoas diferentes trocando o papel e o "usuário logado" (request.jwt.claim.sub).
-- Uso: npm run test:db
\set ON_ERROR_STOP 0
\set QUIET 1
set client_min_messages = notice;

create schema t;
grant usage on schema t to anon, authenticated;
create function t.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond then raise notice '  ✓ %', msg; else raise notice '  ✗ %', msg; end if;
end $$;
-- Executa um comando e diz se ele falhou (true) — para testar o que deve ser proibido.
create function t.fails(cmd text) returns boolean language plpgsql as $$
begin
  execute cmd;
  return false;
exception when others then
  return true;
end $$;
create function t.section(title text) returns void language plpgsql as $$
begin raise notice '## %', title; end $$;
grant execute on all functions in schema t to anon, authenticated;

-- Três pessoas: A participa do estudo, B não participa, C será a administradora.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@teste.com', '{"name":"Ana","research":{"consent":true,"version":"1","ageRange":"18-24","uf":"PR"}}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@teste.com', '{"name":"Bruno","research":{"consent":false,"version":"1"}}'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@teste.com', '{"name":"Carla"}');
update public.profiles set role = 'admin' where id = 'cccccccc-0000-0000-0000-000000000003';

select t.section('Cadastro cria o perfil e registra o estudo');
select t.ok((select count(*) from public.profiles) = 3, 'um perfil para cada conta');
select t.ok((select name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Ana', 'nome vem do cadastro');
select t.ok((select count(*) from public.study_participants) = 1, 'só quem aceitou entra no estudo');
select t.ok((select age_range || '/' || uf from public.study_participants) = '18-24/PR', 'faixa etária e UF do participante');

-- ---------- Como Ana ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.section('Ana: dados próprios');
insert into public.user_data (collection, id, doc) values ('transactions', 't1', '{"type":"expense","amount":30}');
select t.ok((select count(*) from public.user_data) = 1, 'Ana grava e lê o próprio lançamento');
select t.ok((select user_id from public.user_data where id = 't1') = auth.uid(), 'user_id preenchido sozinho');
select t.ok(t.fails($$insert into public.user_data (user_id, collection, id, doc) values ('bbbbbbbb-0000-0000-0000-000000000002', 'transactions', 'x', '{}')$$), 'não grava em nome de outra pessoa');
select t.ok(t.fails($$insert into public.user_data (collection, id, doc) values ('senhas', 'x', '{}')$$), 'coleção desconhecida é recusada');
insert into public.user_data (collection, id, doc) values ('bills', 'b1', '{"name":"Luz","amount":120}');
select t.ok(true, 'contas fixas (bills) são aceitas depois da migração');
select t.ok(t.fails($$update public.profiles set role = 'admin' where id = auth.uid()$$), 'não vira admin sozinha');
select t.ok(t.fails($$update public.profiles set blocked = false where id = auth.uid()$$), 'não mexe no próprio bloqueio');
update public.profiles set name = 'Ana Lima' where id = auth.uid();
select t.ok((select name from public.profiles where id = auth.uid()) = 'Ana Lima', 'pode trocar o próprio nome');
select t.ok((select count(*) from public.profiles) = 1, 'só enxerga o próprio perfil');
select t.ok(t.fails($$select public.admin_metrics()$$), 'não acessa as métricas do painel');
select t.ok(t.fails($$select * from public.admin_list_accounts()$$), 'não acessa a lista de contas');
select t.ok(t.fails($$select public.admin_delete_account('bbbbbbbb-0000-0000-0000-000000000002')$$), 'não exclui contas');
select t.section('Ana: estudo');
insert into public.study_events (code, event) values (public.my_study_code(), 'usou:chat');
insert into public.study_events (code, event, field) values (public.my_study_code(), 'corrigiu:chat', 'category');
select t.ok(t.fails($$select * from public.study_events$$), 'não lê os eventos do estudo (nem os próprios)');
select t.ok(t.fails($$insert into public.study_events (code, event) values (public.my_study_code(), 'Gastei 30 no mercado')$$), 'evento com texto livre é recusado');
select t.ok(t.fails($$insert into public.study_events (code, event, field) values (public.my_study_code(), 'corrigiu:chat', 'valor digitado')$$), 'campo fora da lista é recusado');
select t.ok(t.fails($$insert into public.study_events (code, event) values (gen_random_uuid(), 'usou:chat')$$), 'não registra com outro código');

-- ---------- Como Bruno ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select t.section('Bruno: isolamento e estudo');
select t.ok((select count(*) from public.user_data) = 0, 'Bruno não vê os dados da Ana');
update public.user_data set doc = '{"hack":true}' where id = 't1';
delete from public.user_data where id = 't1';
select t.ok(public.my_study_code() is null, 'Bruno não participa do estudo');
select t.ok(t.fails($$insert into public.study_events (code, event) values ((select research_code from public.profiles where id = auth.uid()), 'usou:chat')$$), 'quem não aceitou não registra eventos');
select t.ok((select public.study_join('1', '25-34', 'SP') ->> 'consent') = 'true', 'Bruno decide participar');
insert into public.study_events (code, event) values (public.my_study_code(), 'abriu:limites');
select t.ok(public.my_study_code() is not null, 'agora registra eventos');

-- ---------- Sem login ----------
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select t.section('Sem login');
select t.ok(t.fails($$select * from public.user_data$$), 'visitante não lê dados (permissão negada)');
select t.ok(t.fails($$select * from public.profiles$$), 'visitante não lê perfis (permissão negada)');
select t.ok(t.fails($$select public.study_join('1')$$), 'visitante não entra no estudo');

-- ---------- Como Carla (admin) ----------
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select t.section('Carla (admin): painel');
select t.ok((select count(*) from public.user_data) = 0, 'admin NÃO lê dados financeiros de ninguém');
select t.ok((select (doc ->> 'amount')::int from public.user_data where id = 't1') is null, 'nem o lançamento da Ana');
select t.ok((public.admin_metrics() ->> 'accounts')::int = 3, 'métricas: 3 contas');
select t.ok((public.admin_metrics() ->> 'participants')::int = 2, 'métricas: 2 participantes');
select t.ok((public.admin_metrics() -> 'chat_corrections' ->> 'category')::int = 1, 'métricas: correções do chat por campo');
select t.ok((public.admin_metrics() -> 'ufs' ->> 'SP')::int = 1, 'métricas: participantes por UF');
select t.ok((select count(*) from public.admin_list_accounts()) = 3, 'lista as 3 contas');
select t.ok((select email from public.admin_list_accounts() where name = 'Bruno') = 'b@teste.com', 'lista mostra o e-mail');
select t.ok((select count(*) from public.admin_export_study()) = 3, 'exporta os 3 eventos do estudo');
select t.ok(not exists (select 1 from public.admin_export_study() e where e.participante in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002')), 'exportação usa código aleatório, não o id da conta');
select t.ok(t.fails($$select public.admin_set_blocked(auth.uid(), true)$$), 'admin não bloqueia a si mesma');
select public.admin_set_blocked('aaaaaaaa-0000-0000-0000-000000000001', true);
select public.admin_save_content('tip-1', 'tip', 1, '{"title":"Pague-se primeiro","text":"..."}');

select t.section('Conta bloqueada');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.ok((select count(*) from public.user_data) = 0, 'bloqueada não lê os dados');
select t.ok(t.fails($$insert into public.user_data (collection, id, doc) values ('transactions', 't2', '{}')$$), 'bloqueada não grava');
select t.ok(public.my_study_code() is null, 'bloqueada não registra no estudo');

select t.section('Conteúdos');
select t.ok((select count(*) from public.content) = 1, 'qualquer conta lê os conteúdos');
select t.ok(t.fails($$insert into public.content (id, kind, data) values ('x', 'tip', '{}')$$), 'conta comum não grava conteúdo');
select t.ok(t.fails($$select public.admin_save_content('x', 'tip', 1, '{}')$$), 'conta comum não usa a função de conteúdo');
reset role;
set role anon;
select t.ok((select count(*) from public.content) = 1, 'visitante lê os conteúdos');

select t.section('Sair do estudo e excluir conta');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select public.admin_set_blocked('aaaaaaaa-0000-0000-0000-000000000001', false);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.study_withdraw();
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select t.ok((public.admin_metrics() ->> 'participants')::int = 1, 'sair do estudo remove a participante');
select t.ok((select count(*) from public.admin_export_study()) = 1, 'e apaga os eventos dela (fica só o do Bruno)');
select t.ok(not (select participating from public.admin_list_accounts() where name = 'Ana Lima'), 'lista mostra que ela não participa mais');
select public.admin_delete_account('bbbbbbbb-0000-0000-0000-000000000002');
select t.ok((select count(*) from public.admin_list_accounts()) = 2, 'conta excluída a pedido sai da lista');
select t.ok((public.admin_metrics() ->> 'participants')::int = 0, 'e sai do estudo junto');
select t.ok(t.fails($$select public.admin_delete_account(auth.uid())$$), 'admin não exclui a própria conta por aqui');
reset role;
select t.ok((select count(*) from public.user_data where user_id = 'bbbbbbbb-0000-0000-0000-000000000002') = 0, 'dados da conta excluída foram apagados');
select t.ok((select count(*) from public.user_data where id = 't1') = 1, 'lançamento da Ana continua intacto (Bruno não conseguiu apagar)');

select t.section('Excluir a própria conta');
insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000004', 'd@teste.com', '{"name":"Davi","research":{"consent":true,"version":"2"}}');
set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false);
insert into public.user_data (collection, id, doc) values ('transactions', 'd1', '{}');
insert into public.study_events (code, event) values (public.my_study_code(), 'usou:chat');
select public.delete_my_account();
reset role;
select t.ok(not exists (select 1 from auth.users where id = 'dddddddd-0000-0000-0000-000000000004'), 'a conta some');
select t.ok(not exists (select 1 from public.user_data where user_id = 'dddddddd-0000-0000-0000-000000000004'), 'os dados somem junto');
select t.ok((select count(*) from public.study_events e where not exists (select 1 from public.study_participants sp where sp.code = e.code)) = 0 and (select count(*) from public.study_participants) = 0, 'e o estudo dela também');
set role anon;
select t.ok(t.fails($$select public.delete_my_account()$$), 'visitante não chama a função');
reset role;

select t.section('Limites contra abuso');
insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-000000000005', 'e@teste.com', '{"name":"Eva","research":{"consent":true,"version":"2"}}');
insert into public.user_data (user_id, collection, id, doc)
  select 'eeeeeeee-0000-0000-0000-000000000005', 'transactions', 'x' || g, '{}' from generate_series(1, 20000) g;
set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
select t.ok(t.fails($$insert into public.user_data (collection, id, doc) values ('transactions', 'novo', '{}')$$), 'registro novo acima de 20 mil é recusado');
insert into public.user_data (collection, id, doc) values ('transactions', 'x1', '{"amount":5}')
  on conflict (user_id, collection, id) do update set doc = excluded.doc;
select t.ok((select doc ->> 'amount' from public.user_data where user_id = 'eeeeeeee-0000-0000-0000-000000000005' and id = 'x1') = '5', 'editar um registro existente continua funcionando no limite');
reset role;
insert into public.study_events (code, event)
  select (select research_code from public.profiles where id = 'eeeeeeee-0000-0000-0000-000000000005'), 'usou:chat' from generate_series(1, 300);
set role authenticated;
select t.ok(t.fails($$insert into public.study_events (code, event) values (public.my_study_code(), 'usou:chat')$$), 'mais de 300 eventos do estudo em 24h é recusado');
reset role;

select t.section('Edição em uma ida só (patch_docs)');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.user_data (collection, id, doc) values ('transactions', 'p1', '{"amount":10,"category":"lazer","note":"a"}'), ('transactions', 'p2', '{"amount":20}');
select public.patch_docs('transactions', '[{"id":"p1","patch":{"category":"compras"}},{"id":"p2","patch":{"amount":25}}]');
select t.ok((select doc from public.user_data where id = 'p1' and user_id = auth.uid()) = '{"amount":10,"category":"compras","note":"a"}'::jsonb, 'junta só os campos mudados (o resto do registro fica)');
select t.ok((select doc ->> 'amount' from public.user_data where id = 'p2' and user_id = auth.uid()) = '25', 'vários registros numa chamada');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select public.patch_docs('transactions', '[{"id":"p1","patch":{"category":"hackeado"}}]');
reset role;
select t.ok((select doc ->> 'category' from public.user_data where id = 'p1' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'compras', 'não altera registro de outra pessoa');
set role anon;
select t.ok(t.fails($$select public.patch_docs('transactions', '[]')$$), 'visitante não chama a função');
reset role;

select t.section('Ajuda e sugestões');
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.feedback (kind, message, page) values ('melhoria', 'Queria um gráfico por semana', 'inicio');
select t.ok((select count(*) from public.feedback) = 1 and (select user_id from public.feedback) = auth.uid(), 'envia mensagem (fica com o próprio usuário)');
select t.ok(t.fails($$insert into public.feedback (user_id, kind, message) values ('eeeeeeee-0000-0000-0000-000000000005', 'ajuda', 'em nome de outro')$$), 'não envia em nome de outra pessoa');
select t.ok(t.fails($$insert into public.feedback (kind, message, status) values ('ajuda', 'já resolvido?', 'resolvido')$$), 'não escolhe a própria situação');
select t.ok(t.fails($$update public.feedback set message = 'mudei'$$) or (select message from public.feedback limit 1) <> 'mudei', 'não edita depois de enviar');
select t.ok(t.fails($$select * from public.admin_list_feedback()$$), 'não lista as mensagens dos outros');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
select t.ok((select count(*) from public.feedback) = 0, 'outra pessoa não vê a mensagem');
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select t.ok((select count(*) from public.admin_list_feedback()) = 1 and (select email from public.admin_list_feedback()) = 'a@teste.com', 'admin lista as mensagens com o e-mail para responder');
select public.admin_set_feedback_status((select id from public.admin_list_feedback()), 'resolvido');
select t.ok((select status from public.admin_list_feedback()) = 'resolvido', 'admin muda a situação');
reset role;

select t.section('Cobrança compartilhada');
set role authenticated;
-- Ana cobra Eva (Carla é outra pessoa)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
create temp table sc as select public.shared_charge_save(null, 'segredo-1234567890ab', 'Ana', 'Eva', 'TV', 1200, 0, 12, 100, '2026-10-05', 'ana@pix') as id;
grant select on sc to authenticated;
select t.ok((select creditor_id from public.shared_charges where id = (select id from sc)) = auth.uid(), 'Ana cria a cobrança');
select t.ok(t.fails($$insert into public.shared_charges (token, total) values ('xxxxxxxxxxxxxxxxxxxx', 10)$$), 'ninguém grava direto na tabela');
select t.ok(t.fails($$select public.shared_charge_accept((select id from sc), 'segredo-1234567890ab')$$), 'quem cobra não aceita a própria cobrança');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
select t.ok((select count(*) from public.shared_charges) = 0, 'Eva não vê antes de aceitar');
select t.ok(t.fails($$select public.shared_charge_accept((select id from sc), 'segredo-errado-0000000')$$), 'segredo errado é recusado');
select t.ok(t.fails($$select public.shared_charge_accept((select id from sc), null)$$), 'sem segredo é recusado');
select t.ok((public.shared_charge_accept((select id from sc), 'segredo-1234567890ab') ->> 'total')::numeric = 1200, 'Eva aceita com o segredo do link');
select t.ok(not (public.shared_charge_accept((select id from sc), 'segredo-1234567890ab') ? 'token'), 'a resposta não devolve o segredo');
select t.ok((select count(*) from public.shared_charges) = 1, 'depois de aceitar, Eva vê a cobrança');
select t.ok(t.fails($$select public.shared_charge_save((select id from sc), 'x', 'B', 'B', 'x', 1, 0, null, null, null, '')$$), 'quem deve não altera os valores');
create temp table ev as select public.shared_charge_event((select id from sc), 'paid', 100, '2026-10-10', null) ->> 'id' as id;
grant select on ev to authenticated;
select t.ok((select received from public.shared_charges) = 0, 'aviso de pagamento fica pendente (não muda o recebido)');
select t.ok(t.fails($$select public.shared_charge_event((select id from sc), 'received', 50, null, null)$$), 'quem deve não registra recebimento');
select t.ok(t.fails($$select public.shared_charge_event((select id from sc), 'confirm', null, null, (select id from ev))$$), 'quem deve não confirma o próprio aviso');
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
select t.ok((select count(*) from public.shared_charges) = 0, 'outra pessoa não vê');
select t.ok(t.fails($$select public.shared_charge_accept((select id from sc), 'segredo-1234567890ab')$$), 'já aceita: outra conta não pega para si');
select t.ok(t.fails($$select public.shared_charge_event((select id from sc), 'paid', 10, null, null)$$), 'outra pessoa não registra nada');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select public.shared_charge_event((select id from sc), 'confirm', null, null, (select id from ev));
select t.ok((select received from public.shared_charges) = 100, 'Ana confirma: o recebido sobe');
select t.ok(t.fails($$select public.shared_charge_event((select id from sc), 'confirm', null, null, (select id from ev))$$), 'não confirma duas vezes');
select public.shared_charge_event((select id from sc), 'received', 2000, '2026-10-11', null);
select t.ok((select received from public.shared_charges) = 1200, 'recebimento nunca passa do total');
select public.shared_charge_event((select id from sc), 'unreceived', 1100, '2026-10-11', null);
select t.ok((select received from public.shared_charges) = 100, 'desfazer recebimento devolve o valor');
select public.shared_charge_save((select id from sc), 'ignorado', 'Ana', 'Eva', 'TV 55', 1300, 100, 13, 100, '2026-10-05', 'ana@pix');
select t.ok((select total || '/' || description || '/' || token from public.shared_charges) = '1300.00/TV 55/segredo-1234567890ab', 'Ana atualiza os valores (o segredo não muda)');
select t.ok((select events -> -1 ->> 'kind' from public.shared_charges) = 'update', 'atualização vira novidade para quem deve');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
create temp table ev2 as select public.shared_charge_event((select id from sc), 'paid', 50, null, null) ->> 'id' as id;
grant select on ev2 to authenticated;
select public.shared_charge_event((select id from sc), 'cancel', null, null, (select id from ev2));
select t.ok((select e ->> 'status' from public.shared_charges, jsonb_array_elements(events) e where e ->> 'id' = (select id from ev2)) = 'cancelled', 'quem deve desfaz o próprio aviso');
select public.shared_charge_seen((select id from sc));
select t.ok((select debtor_seen_at is not null from public.shared_charges), 'marca novidades como vistas');
select public.shared_charge_leave((select id from sc));
select t.ok((select count(*) from public.shared_charges) = 0, 'quem deve pode sair da cobrança');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.ok((select debtor_id is null from public.shared_charges), 'para quem cobra, a cobrança volta a esperar alguém aceitar');
select public.shared_charge_leave((select id from sc));
select t.ok((select count(*) from public.shared_charges) = 0, 'quem cobra apaga a cobrança');
reset role;
set role anon;
select t.ok(t.fails($$select public.shared_charge_save(null, 'segredo-1234567890ab', 'x', 'y', 'z', 10, 0, null, null, null, '')$$), 'visitante não cria cobrança');
reset role;

-- ---------- Avisos no celular (push) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.section('Avisos push: aparelhos');
select public.save_push_subscription('https://push.exemplo.com/abc1', 'chave-p256dh', 'chave-auth');
select t.ok((select count(*) from public.push_subscriptions) = 1, 'Ana liga os avisos em um aparelho');
select t.ok(t.fails($$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.exemplo.com/direto', 'a', 'b')$$), 'não grava aparelho direto na tabela (só pela função)');
select t.ok(t.fails($$select public.save_push_subscription('http://inseguro.exemplo.com/x', 'a', 'b')$$), 'endereço que não é https é recusado');
select t.ok(t.fails($$update public.push_subscriptions set user_id = 'eeeeeeee-0000-0000-0000-000000000005'$$), 'não passa o aparelho para outra pessoa à mão');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
select t.ok((select count(*) from public.push_subscriptions) = 0, 'Edu não enxerga o aparelho da Ana');
delete from public.push_subscriptions;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.ok((select count(*) from public.push_subscriptions) = 1, 'Edu não apaga o aparelho da Ana');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
select public.save_push_subscription('https://push.exemplo.com/abc1', 'chave-nova', 'auth-nova');
select t.ok((select count(*) from public.push_subscriptions) = 1, 'o mesmo navegador numa conta nova muda de dono');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.ok((select count(*) from public.push_subscriptions) = 0, 'e a conta antiga deixa de receber nele');
do $$ begin for i in 1..12 loop perform public.save_push_subscription('https://push.exemplo.com/lote' || i, 'k', 'a'); end loop; end $$;
select t.ok((select count(*) from public.push_subscriptions) = 10, 'no máximo 10 aparelhos por pessoa');
reset role;
set role anon;
select t.ok(t.fails($$select public.save_push_subscription('https://push.exemplo.com/anon', 'a', 'b')$$), 'visitante não liga avisos');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.section('Avisos push: lembretes');
insert into public.push_reminders (dedupe_key, kind, fire_at, title, body, url) values ('invoice:c1:2026-12', 'invoice', now() + interval '2 days', 'Grana Leve', 'A fatura do Nubank vence amanhã.', './#/contas');
select t.ok((select count(*) from public.push_reminders) = 1, 'Ana agenda um lembrete');
select t.ok((select user_id = auth.uid() from public.push_reminders), 'user_id preenchido sozinho');
select t.ok(t.fails($$insert into public.push_reminders (dedupe_key, kind, fire_at, title, body) values ('invoice:c1:2026-12', 'invoice', now() + interval '3 days', 'x', 'y')$$), 'a mesma chave não repete');
select t.ok(t.fails($$insert into public.push_reminders (dedupe_key, kind, fire_at, title, body, url) values ('k2', 'bill', now() + interval '1 day', 'x', 'y', 'https://golpe.exemplo.com')$$), 'endereço de fora do app é recusado');
select t.ok(t.fails($$insert into public.push_reminders (dedupe_key, kind, fire_at, title, body) values ('k3', 'golpe', now() + interval '1 day', 'x', 'y')$$), 'tipo desconhecido é recusado');
select t.ok(t.fails($$insert into public.push_reminders (dedupe_key, kind, fire_at, title, body) values ('k4', 'bill', now() + interval '90 days', 'x', 'y')$$), 'lembrete a mais de 45 dias é recusado');
select t.ok(t.fails($$insert into public.push_reminders (dedupe_key, kind, fire_at, title, body) values ('k5', 'bill', now() + interval '1 day', repeat('a', 81), 'y')$$), 'título longo demais é recusado');
select t.ok(t.fails($$insert into public.push_reminders (user_id, dedupe_key, kind, fire_at, title, body) values ('eeeeeeee-0000-0000-0000-000000000005', 'k6', 'bill', now() + interval '1 day', 'x', 'y')$$), 'não agenda em nome de outra pessoa');
insert into public.push_reminders (dedupe_key, kind, fire_at, title, body) values ('invoice:c1:2026-12', 'invoice', now() + interval '2 days', 'Novo texto', 'Corpo')
  on conflict (user_id, dedupe_key) do update set title = excluded.title, fire_at = excluded.fire_at;
select t.ok((select title from public.push_reminders where dedupe_key = 'invoice:c1:2026-12') = 'Novo texto', 'o app atualiza o próprio lembrete (upsert pela chave)');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
select t.ok((select count(*) from public.push_reminders) = 0, 'Edu não enxerga os lembretes da Ana');
update public.push_reminders set title = 'hackeado';
delete from public.push_reminders;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select t.ok((select title from public.push_reminders) = 'Novo texto', 'Edu não altera nem apaga os lembretes da Ana');
insert into public.push_reminders (dedupe_key, kind, fire_at, title, body) select 'lote' || g, 'bill', now() + interval '1 day', 't', 'b' from generate_series(1, 199) g;
select t.ok((select count(*) from public.push_reminders where sent_at is null) = 200, 'chega a 200 lembretes pendentes');
select t.ok(t.fails($$insert into public.push_reminders (dedupe_key, kind, fire_at, title, body) values ('lote-extra', 'bill', now() + interval '1 day', 't', 'b')$$), 'o 201º lembrete pendente é recusado');
delete from public.push_reminders where dedupe_key like 'lote%';
select t.ok((select count(*) from public.push_reminders) = 1, 'a pessoa apaga os próprios lembretes');
reset role;
select t.section('Avisos push: conta excluída');
select t.ok((select count(*) from public.push_subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 10, 'antes de excluir: 10 aparelhos da Ana');
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select t.ok((select count(*) from public.push_subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0 and (select count(*) from public.push_reminders where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0, 'ao excluir a conta, aparelhos e lembretes somem junto');
