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
