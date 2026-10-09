-- Verificação do projeto (só leitura: não altera nada). Rode no SQL Editor do Supabase.
-- Cada linha mostra uma conferência e se ela passou.
with checks(ordem, verificacao, ok, detalhe) as (
  select 1, 'Tabelas criadas',
    (select count(*) from pg_tables where schemaname = 'public' and tablename in ('profiles','user_data','study_participants','study_events','content')) = 5,
    (select string_agg(tablename, ', ' order by tablename) from pg_tables where schemaname = 'public')
  union all
  select 2, 'RLS ligado em todas as tabelas',
    not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
    coalesce((select 'sem RLS: ' || string_agg(tablename, ', ') from pg_tables where schemaname = 'public' and not rowsecurity), 'todas com RLS')
  union all
  select 3, 'Regras de acesso (policies)',
    (select count(*) from pg_policies where schemaname = 'public') >= 5,
    (select count(*) || ' regras' from pg_policies where schemaname = 'public')
  union all
  select 4, 'Funções do app e do painel',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
      ('is_admin','is_active','my_study_code','study_join','study_withdraw','admin_metrics','admin_list_accounts','admin_set_blocked',
       'admin_delete_account','admin_export_study','admin_save_content','admin_delete_content','delete_my_account','handle_new_user')) = 14,
    (select count(*) || ' de 14' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in
      ('is_admin','is_active','my_study_code','study_join','study_withdraw','admin_metrics','admin_list_accounts','admin_set_blocked',
       'admin_delete_account','admin_export_study','admin_save_content','admin_delete_content','delete_my_account','handle_new_user'))
  union all
  select 5, 'Gatilho que cria o perfil no cadastro',
    exists (select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal), 'on_auth_user_created'
  union all
  select 6, 'Toda conta tem perfil',
    (select count(*) from auth.users) = (select count(*) from public.profiles),
    (select count(*) from auth.users) || ' conta(s), ' || (select count(*) from public.profiles) || ' perfil(is)'
  union all
  select 7, 'Existe exatamente um admin',
    (select count(*) from public.profiles where role = 'admin') = 1,
    coalesce((select string_agg(u.email, ', ') from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin'), 'nenhum')
  union all
  select 8, 'Admin com e-mail confirmado e não bloqueado',
    exists (select 1 from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin' and u.email_confirmed_at is not null and not p.blocked),
    coalesce((select 'confirmado em ' || to_char(u.email_confirmed_at, 'DD/MM/YYYY HH24:MI') from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin' limit 1), '—')
  union all
  select 9, 'Estudo coerente com o consentimento',
    not exists (select 1 from public.profiles p where (p.research ->> 'consent')::boolean is true
                and not exists (select 1 from public.study_participants sp where sp.code = p.research_code)),
    (select count(*) from public.study_participants) || ' participante(s)'
  union all
  select 10, 'Visitante não executa funções do painel',
    not has_function_privilege('anon', 'public.admin_metrics()', 'execute')
    and not has_function_privilege('anon', 'public.delete_my_account()', 'execute'), 'anon sem acesso'
  union all
  select 11, 'Conta comum não muda o próprio papel',
    not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
    and not has_column_privilege('authenticated', 'public.profiles', 'blocked', 'update'), 'role e blocked protegidos'
)
select case when ok then '✅' else '❌' end as status, verificacao, detalhe from checks order by ordem;
