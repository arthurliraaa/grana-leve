-- Ajuda e sugestões + cobranças compartilhadas entre contas.
-- Rode no SQL Editor do Supabase (uma vez). Não apaga nem altera dados existentes.

-- =====================================================================
-- 1) Ajuda e sugestões
-- A mensagem fica guardada aqui (o painel de administração lista) e, se o envio por e-mail estiver
-- configurado, vai também para o e-mail do Grana Leve. Para ligar o e-mail (opcional), no SQL Editor:
--   create extension if not exists pg_net;                      -- se ainda não estiver ligada
--   select vault.create_secret('SUA_CHAVE_DE_API_DO_BREVO', 'brevo_api_key');
-- (chave de API do Brevo, em "SMTP & API → API Keys"; o remetente precisa estar verificado no Brevo).
-- Sem isso, nada quebra: as mensagens só ficam no painel.
-- =====================================================================
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  kind text not null check (kind in ('ajuda', 'melhoria', 'problema')),
  message text not null check (char_length(message) between 5 and 2000),
  page text not null default '' check (char_length(page) <= 60),
  status text not null default 'novo' check (status in ('novo', 'lido', 'resolvido')),
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.feedback is 'Pedidos de ajuda e sugestões enviados pelo app. Só quem enviou e a administração veem.';
alter table public.feedback enable row level security;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = auth.uid() and public.is_active() and status = 'novo' and not emailed);
drop policy if exists feedback_select_own on public.feedback;
create policy feedback_select_own on public.feedback for select to authenticated using (user_id = auth.uid());
revoke update, delete on public.feedback from anon, authenticated;

-- Até 20 mensagens por conta a cada 24 horas.
create or replace function public.limit_feedback() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Você já enviou muitas mensagens hoje. Tente amanhã.' using errcode = 'P0001', hint = 'limite_feedback';
  end if;
  return new;
end;
$$;
drop trigger if exists feedback_limit on public.feedback;
create trigger feedback_limit before insert on public.feedback for each row execute function public.limit_feedback();

-- Envio por e-mail (Brevo), só se pg_net e a chave no Vault existirem. Qualquer falha é ignorada:
-- a mensagem continua salva e aparece no painel.
create or replace function public.feedback_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_key text; v_from text; v_label text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return new; end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_key using 'brevo_api_key';
  exception when others then return new;
  end;
  if v_key is null or v_key = '' then return new; end if;
  select u.email::text into v_from from auth.users u where u.id = new.user_id;
  v_label := case new.kind when 'ajuda' then 'Pedido de ajuda' when 'melhoria' then 'Sugestão de melhoria' else 'Problema relatado' end;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)' using
      'https://api.brevo.com/v3/smtp/email',
      jsonb_build_object(
        'sender', jsonb_build_object('name', 'Grana Leve', 'email', 'contato.granaleve@gmail.com'),
        'to', jsonb_build_array(jsonb_build_object('email', 'contato.granaleve@gmail.com')),
        'replyTo', jsonb_build_object('email', coalesce(v_from, 'contato.granaleve@gmail.com')),
        'subject', '[Grana Leve] ' || v_label || ' #' || new.id,
        'textContent', v_label || E'\nDe: ' || coalesce(v_from, '?') || E'\nTela: ' || new.page || E'\n\n' || new.message),
      jsonb_build_object('api-key', v_key, 'content-type', 'application/json', 'accept', 'application/json');
    update public.feedback set emailed = true where id = new.id;
  exception when others then null;
  end;
  return new;
end;
$$;
drop trigger if exists feedback_email on public.feedback;
create trigger feedback_email after insert on public.feedback for each row execute function public.feedback_email();

-- Painel: lista com o e-mail de quem enviou (para responder) e mudar a situação.
create or replace function public.admin_list_feedback()
returns table (id bigint, email text, name text, kind text, message text, page text, status text, emailed boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
    select f.id, u.email::text, p.name, f.kind, f.message, f.page, f.status, f.emailed, f.created_at
    from public.feedback f left join auth.users u on u.id = f.user_id left join public.profiles p on p.id = f.user_id
    order by f.created_at desc limit 500;
end;
$$;
create or replace function public.admin_set_feedback_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  if p_status not in ('novo', 'lido', 'resolvido') then raise exception 'Situação inválida.' using errcode = '22023'; end if;
  update public.feedback set status = p_status where id = p_id;
end;
$$;

-- =====================================================================
-- 2) Cobranças compartilhadas (“Me devem” de uma conta = “Eu devo” da outra)
-- Quem cobra cria; quem deve aceita pelo link (que leva o id e um segredo). Daí em diante:
--   * quem deve avisa “paguei” (fica pendente até quem cobra confirmar ou dizer que não recebeu);
--   * quem cobra registra o que recebeu, confirma ou recusa avisos e pode atualizar valores.
-- Cada lado vê as novidades do outro no próximo login (events + *_seen_at).
-- Ninguém grava direto na tabela: tudo passa pelas funções abaixo, que conferem quem é quem.
-- =====================================================================
create table if not exists public.shared_charges (
  id uuid primary key default gen_random_uuid(),
  creditor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debtor_id uuid references auth.users(id) on delete set null,
  token text not null check (char_length(token) between 16 and 64),
  creditor_name text not null default '' check (char_length(creditor_name) <= 60),
  debtor_label text not null default '' check (char_length(debtor_label) <= 60),
  description text not null default '' check (char_length(description) <= 80),
  total numeric(12, 2) not null check (total > 0 and total <= 99999999),
  received numeric(12, 2) not null default 0 check (received >= 0),
  installments int check (installments is null or installments between 2 and 120),
  installment_amount numeric(12, 2) check (installment_amount is null or installment_amount > 0),
  due_date date,
  pix text not null default '' check (char_length(pix) <= 77),
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array' and jsonb_array_length(events) <= 500),
  creditor_seen_at timestamptz not null default now(),
  debtor_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (received <= total)
);
comment on table public.shared_charges is 'Cobrança entre duas contas. Só quem cobra e quem aceitou veem; gravação só pelas funções shared_charge_*.';
create index if not exists shared_charges_creditor on public.shared_charges (creditor_id);
create index if not exists shared_charges_debtor on public.shared_charges (debtor_id);
alter table public.shared_charges enable row level security;
drop policy if exists shared_charges_select on public.shared_charges;
create policy shared_charges_select on public.shared_charges for select to authenticated
  using (auth.uid() = creditor_id or auth.uid() = debtor_id);
revoke insert, update, delete on public.shared_charges from anon, authenticated;

-- Evento no histórico: {id, by: 'creditor'|'debtor', kind, amount, date, at, status}.
create or replace function public.shared_event(p_by text, p_kind text, p_amount numeric, p_date date, p_status text)
returns jsonb language sql volatile set search_path = '' as $$
  select jsonb_build_object('id', gen_random_uuid()::text, 'by', p_by, 'kind', p_kind, 'amount', p_amount,
    'date', p_date, 'at', now(), 'status', p_status);
$$;

-- Criar (p_id nulo) ou atualizar (só quem cobra) a cobrança.
create or replace function public.shared_charge_save(p_id uuid, p_token text, p_creditor_name text, p_debtor_label text,
  p_description text, p_total numeric, p_received numeric, p_installments int, p_installment_amount numeric, p_due_date date, p_pix text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_row public.shared_charges;
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  if p_id is null then
    if (select count(*) from public.shared_charges where creditor_id = auth.uid()) >= 300 then
      raise exception 'Limite de cobranças compartilhadas atingido.' using errcode = 'P0001';
    end if;
    insert into public.shared_charges (creditor_id, token, creditor_name, debtor_label, description, total, received,
      installments, installment_amount, due_date, pix)
    values (auth.uid(), p_token, coalesce(p_creditor_name, ''), coalesce(p_debtor_label, ''), coalesce(p_description, ''),
      p_total, least(coalesce(p_received, 0), p_total), p_installments, p_installment_amount, p_due_date, coalesce(p_pix, ''))
    returning id into v_id;
    return v_id;
  end if;
  select * into v_row from public.shared_charges where id = p_id for update;
  if v_row.id is null or v_row.creditor_id <> auth.uid() then raise exception 'Cobrança não encontrada.' using errcode = '42501'; end if;
  update public.shared_charges set creditor_name = coalesce(p_creditor_name, ''), debtor_label = coalesce(p_debtor_label, ''),
    description = coalesce(p_description, ''), total = p_total, received = least(coalesce(p_received, 0), p_total),
    installments = p_installments, installment_amount = p_installment_amount, due_date = p_due_date, pix = coalesce(p_pix, ''),
    events = case when v_row.debtor_id is not null and (v_row.total, v_row.received, coalesce(v_row.installments, 0), coalesce(v_row.installment_amount, 0))
        is distinct from (p_total, least(coalesce(p_received, 0), p_total), coalesce(p_installments, 0), coalesce(p_installment_amount, 0))
      then events || public.shared_event('creditor', 'update', p_total, current_date, 'done') else events end,
    updated_at = now()
  where id = p_id;
  return p_id;
end;
$$;

-- Aceitar pelo link: liga a cobrança à conta de quem abriu (se o segredo confere).
create or replace function public.shared_charge_accept(p_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row public.shared_charges;
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into v_row from public.shared_charges where id = p_id for update;
  if v_row.id is null or v_row.token is distinct from p_token then raise exception 'Cobrança não encontrada.' using errcode = '42501'; end if;
  if v_row.creditor_id = auth.uid() then raise exception 'Esta cobrança é sua: envie o link para quem deve.' using errcode = '22023', hint = 'propria'; end if;
  if v_row.debtor_id is not null and v_row.debtor_id <> auth.uid() then
    raise exception 'Esta cobrança já foi aceita por outra conta.' using errcode = '22023', hint = 'outra_conta';
  end if;
  if v_row.debtor_id is null then
    update public.shared_charges set debtor_id = auth.uid(), debtor_seen_at = now(),
      events = events || public.shared_event('debtor', 'accepted', null, current_date, 'done'), updated_at = now()
    where id = p_id returning * into v_row;
  end if;
  return to_jsonb(v_row) - 'token';
end;
$$;

-- Avisos e registros:
--   quem deve:   'paid' (avisa que pagou; fica pendente), 'cancel' (desfaz um aviso pendente: p_ref)
--   quem cobra:  'received' (recebeu), 'unreceived' (desfez um recebimento), 'confirm' / 'reject' (aviso p_ref)
create or replace function public.shared_charge_event(p_id uuid, p_kind text, p_amount numeric, p_date date, p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.shared_charges; v_side text; v_ev jsonb; v_amount numeric; v_status text;
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Entre na sua conta.' using errcode = '42501'; end if;
  select * into v_row from public.shared_charges where id = p_id for update;
  if v_row.id is null or auth.uid() not in (v_row.creditor_id, coalesce(v_row.debtor_id, '00000000-0000-0000-0000-000000000000'::uuid)) then
    raise exception 'Cobrança não encontrada.' using errcode = '42501';
  end if;
  v_side := case when auth.uid() = v_row.creditor_id then 'creditor' else 'debtor' end;
  if p_kind in ('paid', 'received', 'unreceived') and not (p_amount > 0 and p_amount <= 99999999) then
    raise exception 'Valor inválido.' using errcode = '22023';
  end if;

  if v_side = 'debtor' and p_kind = 'paid' then
    v_ev := public.shared_event('debtor', 'paid', p_amount, coalesce(p_date, current_date), 'pending');
    update public.shared_charges set events = events || v_ev, updated_at = now() where id = p_id;
    return v_ev;
  elsif v_side = 'creditor' and p_kind = 'received' then
    v_ev := public.shared_event('creditor', 'received', p_amount, coalesce(p_date, current_date), 'done');
    update public.shared_charges set received = least(total, received + p_amount), events = events || v_ev, updated_at = now() where id = p_id;
    return v_ev;
  elsif v_side = 'creditor' and p_kind = 'unreceived' then
    v_ev := public.shared_event('creditor', 'unreceived', p_amount, coalesce(p_date, current_date), 'done');
    update public.shared_charges set received = greatest(0, received - p_amount), events = events || v_ev, updated_at = now() where id = p_id;
    return v_ev;
  elsif (v_side = 'creditor' and p_kind in ('confirm', 'reject')) or (v_side = 'debtor' and p_kind = 'cancel') then
    select (e->>'amount')::numeric into v_amount from jsonb_array_elements(v_row.events) e
      where e->>'id' = p_ref and e->>'kind' = 'paid' and e->>'status' = 'pending';
    if v_amount is null then raise exception 'Aviso não encontrado ou já resolvido.' using errcode = '22023'; end if;
    v_status := case p_kind when 'confirm' then 'confirmed' when 'reject' then 'rejected' else 'cancelled' end;
    update public.shared_charges set
      received = case when p_kind = 'confirm' then least(total, received + v_amount) else received end,
      events = (select jsonb_agg(case when e->>'id' = p_ref then e || jsonb_build_object('status', v_status, 'decided_at', now()) else e end order by n)
                from jsonb_array_elements(v_row.events) with ordinality x(e, n)),
      updated_at = now()
    where id = p_id;
    return jsonb_build_object('id', p_ref, 'status', v_status, 'amount', v_amount);
  end if;
  raise exception 'Ação inválida.' using errcode = '22023';
end;
$$;

-- Marca as novidades como vistas (do lado de quem chamou).
create or replace function public.shared_charge_seen(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.shared_charges set
    creditor_seen_at = case when creditor_id = auth.uid() then now() else creditor_seen_at end,
    debtor_seen_at = case when debtor_id = auth.uid() then now() else debtor_seen_at end
  where id = p_id and auth.uid() in (creditor_id, debtor_id);
end;
$$;

-- Quem cobra apaga a cobrança; quem deve sai dela (o link pode ser aceito de novo por quem tiver).
create or replace function public.shared_charge_leave(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.shared_charges where id = p_id and creditor_id = auth.uid();
  update public.shared_charges set debtor_id = null,
    events = events || public.shared_event('debtor', 'left', null, current_date, 'done'), updated_at = now()
  where id = p_id and debtor_id = auth.uid();
end;
$$;

revoke execute on function public.limit_feedback(), public.feedback_email(), public.shared_event(text, text, numeric, date, text) from public, anon, authenticated;
revoke execute on function public.admin_list_feedback(), public.admin_set_feedback_status(bigint, text),
  public.shared_charge_save(uuid, text, text, text, text, numeric, numeric, int, numeric, date, text),
  public.shared_charge_accept(uuid, text), public.shared_charge_event(uuid, text, numeric, date, text),
  public.shared_charge_seen(uuid), public.shared_charge_leave(uuid) from public, anon;
grant execute on function public.admin_list_feedback(), public.admin_set_feedback_status(bigint, text),
  public.shared_charge_save(uuid, text, text, text, text, numeric, numeric, int, numeric, date, text),
  public.shared_charge_accept(uuid, text), public.shared_charge_event(uuid, text, numeric, date, text),
  public.shared_charge_seen(uuid), public.shared_charge_leave(uuid) to authenticated;
