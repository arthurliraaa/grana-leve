-- Avisos no celular (Web Push): quem ligou os avisos tem uma ou mais inscrições (uma por aparelho) e uma lista de lembretes
-- agendados (o app grava; o servidor só dispara os que venceram). Nada aqui guarda valores em reais: os textos são genéricos
-- ("A fatura do Nubank vence amanhã").
--   * push_subscriptions: o endereço que o navegador entrega + as chaves para cifrar a mensagem. Só a própria pessoa lê e apaga;
--     quem grava é a função save_push_subscription (que cuida de aparelho trocado de dono e do limite de aparelhos).
--   * push_reminders: o app grava e atualiza os próprios lembretes (dedupe_key evita repetir). O envio é feito pela Edge Function
--     send-push (supabase/functions/send-push) com a chave de serviço, chamada a cada poucos minutos (ver docs/avisos-push.md).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 1 and 200),
  auth text not null check (char_length(auth) between 1 and 100),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
comment on table public.push_subscriptions is 'Aparelhos com avisos ligados. Leitura e exclusão só pela própria pessoa; gravação pela função save_push_subscription.';
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke insert, update on public.push_subscriptions from anon, authenticated;

-- Grava (ou atualiza) o aparelho da pessoa logada. Se o mesmo navegador passou de uma conta para outra, o aparelho muda de dono.
-- No máximo 10 aparelhos por pessoa: o mais antigo sai.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Entre na conta para ligar os avisos.' using errcode = '42501'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (auth.uid(), p_endpoint, p_p256dh, p_auth)
    on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, last_seen_at = now();
  delete from public.push_subscriptions s where s.user_id = auth.uid() and s.id in (
    select id from public.push_subscriptions where user_id = auth.uid() order by last_seen_at desc offset 10);
end;
$$;
revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create table if not exists public.push_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 120),
  kind text not null check (kind in ('salary', 'invoice', 'bill')),
  fire_at timestamptz not null,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 160),
  url text not null default './#/inicio' check (url ~ '^\./#/[a-z-]{1,30}$'),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
comment on table public.push_reminders is 'Lembretes agendados pelo app para a própria pessoa. sent_at preenchido = já enviado (ou vencido demais para enviar).';
create index if not exists push_reminders_due on public.push_reminders (fire_at) where sent_at is null;
alter table public.push_reminders enable row level security;
drop policy if exists push_reminders_own on public.push_reminders;
create policy push_reminders_own on public.push_reminders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No máximo 200 lembretes pendentes por pessoa e nada marcado para o futuro distante: o app agenda só os próximos dias.
create or replace function public.push_reminders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.fire_at > now() + interval '45 days' then raise exception 'Lembrete longe demais no futuro.' using errcode = '22023'; end if;
  if tg_op = 'INSERT' and (select count(*) from public.push_reminders r where r.user_id = new.user_id and r.sent_at is null) >= 200 then
    raise exception 'Lembretes demais agendados.' using errcode = '54000';
  end if;
  return new;
end;
$$;
drop trigger if exists push_reminders_guard on public.push_reminders;
create trigger push_reminders_guard before insert or update of fire_at on public.push_reminders for each row execute function public.push_reminders_guard();
