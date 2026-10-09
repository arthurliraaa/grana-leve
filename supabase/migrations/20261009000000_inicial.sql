-- =====================================================================
-- Grana Leve: esquema inicial do banco (Supabase / PostgreSQL)
--
-- Princípios:
--   * Cada pessoa só lê e grava os próprios dados (Row Level Security em todas as tabelas).
--   * O administrador NÃO lê dados financeiros de ninguém: o painel usa funções que
--     devolvem só números agregados, a lista de contas (e-mail e datas) e o estudo anônimo.
--   * O estudo é ligado a um código aleatório (research_code), não à conta, e só recebe
--     dados de quem aceitou a versão atual do termo.
-- =====================================================================

-- ---------- Perfil ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  role text not null default 'user' check (role in ('user', 'admin')),
  blocked boolean not null default false,
  -- Consentimento da pesquisa: {consent, version, at, ageRange, uf} (ver js/domain/research.js)
  research jsonb,
  research_code uuid not null default gen_random_uuid() unique,
  schema_version int not null default 2,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil de cada conta. role e blocked só mudam pelas funções de administração.';

-- ---------- Dados do app (um documento por registro, como no app) ----------
create table public.user_data (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection text not null check (collection in ('transactions', 'budgets', 'goals', 'debts', 'cards', 'receivables',
    'forecasts', 'categories', 'vouchers', 'accounts', 'transfers')),
  id text not null check (char_length(id) between 1 and 120),
  doc jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 32768),
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);
comment on table public.user_data is 'Lançamentos, contas, cartões, metas etc. Só a própria pessoa acessa.';

-- ---------- Estudo (anônimo) ----------
create table public.study_participants (
  code uuid primary key,
  term_version text not null,
  consented_at timestamptz not null default now(),
  age_range text check (age_range in ('', '18-24', '25-34', '35-44', '45-59', '60+')),
  uf text check (uf = '' or uf ~ '^[A-Z]{2}$')
);
create table public.study_events (
  id bigint generated always as identity primary key,
  code uuid not null references public.study_participants(code) on delete cascade,
  -- Ex.: 'abriu:limites', 'usou:chat', 'corrigiu:chat'. Nunca valores nem textos digitados.
  event text not null check (event ~ '^[a-z]+:[a-z_]{1,40}$'),
  field text check (field in ('category', 'date', 'amount', 'payment', 'type', 'description')),
  at timestamptz not null default now()
);
create index study_events_at on public.study_events (at);

-- ---------- Conteúdos editáveis (aba Aprenda) ----------
create table public.content (
  id text primary key check (char_length(id) between 1 and 60),
  kind text not null check (kind in ('tip', 'tip_grow')),
  position int not null default 0,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- =====================================================================
-- Funções auxiliares
-- =====================================================================
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not blocked);
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and not blocked);
$$;

-- Código do estudo da pessoa logada, só se ela participa (usado na regra de inserção de eventos).
create or replace function public.my_study_code() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.research_code from public.profiles p
  join public.study_participants sp on sp.code = p.research_code
  where p.id = auth.uid() and not p.blocked;
$$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito à administração.' using errcode = '42501';
  end if;
end;
$$;

-- Ao criar a conta (Supabase Auth), cria o perfil com o nome e o consentimento enviados no cadastro.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := new.raw_user_meta_data -> 'research';
begin
  insert into public.profiles (id, name, research)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 60), r);
  if r is not null and (r ->> 'consent')::boolean is true then
    insert into public.study_participants (code, term_version, age_range, uf)
    select p.research_code, r ->> 'version', coalesce(r ->> 'ageRange', ''), coalesce(r ->> 'uf', '')
    from public.profiles p where p.id = new.id;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.user_data enable row level security;
alter table public.study_participants enable row level security;
alter table public.study_events enable row level security;
alter table public.content enable row level security;

-- Perfil: a pessoa lê o próprio; só pode mudar o nome (role, blocked e research têm funções próprias).
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and not blocked) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (name, schema_version) on public.profiles to authenticated;

-- Dados do app: só os próprios, e conta bloqueada não lê nem grava.
create policy user_data_own on public.user_data for all to authenticated
  using (user_id = auth.uid() and public.is_active())
  with check (user_id = auth.uid() and public.is_active());

-- Estudo: participante só registra eventos com o próprio código, e só se aceitou o termo.
-- Ninguém lê eventos direto; o painel usa funções que agregam.
create policy study_events_insert_own on public.study_events for insert to authenticated
  with check (code = public.my_study_code());

-- Conteúdos: todo mundo lê; só admin grava (pela função admin_save_content).
create policy content_read on public.content for select to anon, authenticated using (true);

revoke all on public.profiles, public.user_data, public.study_participants from anon;
revoke all on public.study_participants from authenticated;
revoke all on public.study_events from anon;
revoke select, update, delete on public.study_events from authenticated;
grant insert (code, event, field) on public.study_events to authenticated;
revoke insert, update, delete on public.content from anon, authenticated;

-- =====================================================================
-- Estudo: participar e sair (a própria pessoa)
-- =====================================================================
create or replace function public.study_join(p_version text, p_age text default '', p_uf text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  rec jsonb;
begin
  select * into me from public.profiles where id = auth.uid() and not blocked;
  if not found then raise exception 'Conta não encontrada.' using errcode = '42501'; end if;
  rec := jsonb_build_object('consent', true, 'version', p_version, 'at', to_jsonb(now()), 'ageRange', coalesce(p_age, ''), 'uf', coalesce(p_uf, ''));
  update public.profiles set research = rec where id = me.id;
  insert into public.study_participants (code, term_version, age_range, uf)
  values (me.research_code, p_version, coalesce(p_age, ''), coalesce(p_uf, ''))
  on conflict (code) do update set term_version = excluded.term_version, consented_at = now(), age_range = excluded.age_range, uf = excluded.uf;
  return rec;
end;
$$;

-- Sair apaga tudo o que o estudo tem ligado ao código e troca o código (um retorno futuro começa do zero).
create or replace function public.study_withdraw() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  rec jsonb;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'Conta não encontrada.' using errcode = '42501'; end if;
  delete from public.study_participants where code = me.research_code;  -- apaga os eventos em cascata
  rec := jsonb_build_object('consent', false, 'version', coalesce(me.research ->> 'version', ''), 'at', to_jsonb(now()));
  update public.profiles set research = rec, research_code = gen_random_uuid() where id = me.id;
  return rec;
end;
$$;

-- =====================================================================
-- Painel de administração (todas verificam is_admin no servidor)
-- =====================================================================

-- Métricas agregadas: nenhuma linha identifica uma pessoa.
create or replace function public.admin_metrics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'accounts', (select count(*) from public.profiles),
    'accounts_new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'active_7d', (select count(distinct user_id) from public.user_data where updated_at > now() - interval '7 days'),
    'blocked', (select count(*) from public.profiles where blocked),
    'participants', (select count(*) from public.study_participants),
    'events_30d', coalesce((select jsonb_object_agg(event, n) from (
        select event, count(*) n from public.study_events where at > now() - interval '30 days' group by event) e), '{}'::jsonb),
    'chat_corrections', coalesce((select jsonb_object_agg(field, n) from (
        select field, count(*) n from public.study_events where event = 'corrigiu:chat' and field is not null group by field) c), '{}'::jsonb),
    'chat_saves', (select count(*) from public.study_events where event = 'salvou:chat'),
    'age_ranges', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(nullif(age_range, ''), 'não informado') k, count(*) n from public.study_participants group by 1) a), '{}'::jsonb),
    'ufs', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(nullif(uf, ''), 'não informado') k, count(*) n from public.study_participants group by 1) u), '{}'::jsonb)
  );
end;
$$;

-- Lista de contas: só e-mail, nome, datas e situação. Nunca os dados financeiros.
create or replace function public.admin_list_accounts()
returns table (id uuid, email text, name text, role text, blocked boolean, participating boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select p.id, u.email::text, p.name, p.role, p.blocked,
      exists (select 1 from public.study_participants sp where sp.code = p.research_code),
      p.created_at, u.last_sign_in_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

create or replace function public.admin_set_blocked(p_user uuid, p_blocked boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if p_user = auth.uid() then raise exception 'Você não pode bloquear a própria conta.' using errcode = '22023'; end if;
  update public.profiles set blocked = p_blocked where id = p_user;
end;
$$;

-- Exclusão a pedido da pessoa: apaga a conta e, em cascata, perfil, dados e estudo.
create or replace function public.admin_delete_account(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_code uuid;
begin
  perform public.require_admin();
  if p_user = auth.uid() then raise exception 'Você não pode excluir a própria conta por aqui.' using errcode = '22023'; end if;
  select p.research_code into v_code from public.profiles p where p.id = p_user;
  delete from public.study_participants sp where sp.code = v_code;
  delete from auth.users where id = p_user;
end;
$$;

-- Exportação do estudo (CSV no painel): código aleatório, evento, campo, data, faixa etária e UF.
create or replace function public.admin_export_study()
returns table (participante uuid, evento text, campo text, quando timestamptz, faixa_etaria text, uf text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select e.code, e.event, e.field, e.at, sp.age_range, sp.uf
    from public.study_events e join public.study_participants sp on sp.code = e.code
    order by e.at;
end;
$$;

create or replace function public.admin_save_content(p_id text, p_kind text, p_position int, p_data jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  insert into public.content (id, kind, position, data, updated_at, updated_by)
  values (p_id, p_kind, p_position, p_data, now(), auth.uid())
  on conflict (id) do update set kind = excluded.kind, position = excluded.position, data = excluded.data, updated_at = now(), updated_by = auth.uid();
end;
$$;

create or replace function public.admin_delete_content(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  delete from public.content where id = p_id;
end;
$$;

-- Quem pode chamar cada função.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(), public.is_active(), public.my_study_code(), public.study_join(text, text, text), public.study_withdraw(),
  public.admin_metrics(), public.admin_list_accounts(), public.admin_set_blocked(uuid, boolean),
  public.admin_delete_account(uuid), public.admin_export_study(), public.admin_save_content(text, text, int, jsonb),
  public.admin_delete_content(text) to authenticated;
