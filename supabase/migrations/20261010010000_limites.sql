-- Limites contra abuso: ninguém usando o app de verdade chega perto deles, mas um script
-- mal-intencionado não consegue encher o banco do plano grátis nem os eventos do estudo.
-- Rode no SQL Editor do Supabase (uma vez). Não apaga nem altera dados existentes.

-- Até 20 mil registros por conta (lançamentos, contas, metas…). Editar um registro que já
-- existe nunca é bloqueado; só criar um novo além do limite.
create or replace function public.limit_user_data() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.user_data where user_id = new.user_id and collection = new.collection and id = new.id) then
    return new;
  end if;
  if (select count(*) from public.user_data where user_id = new.user_id) >= 20000 then
    raise exception 'Limite de 20 mil registros por conta atingido.' using errcode = 'P0001', hint = 'limite_registros';
  end if;
  return new;
end;
$$;
drop trigger if exists user_data_limit on public.user_data;
create trigger user_data_limit before insert on public.user_data
  for each row execute function public.limit_user_data();

-- Estudo: até 300 eventos por participante a cada 24 horas (o app registra bem menos).
create index if not exists study_events_code_at on public.study_events (code, at);
create or replace function public.limit_study_events() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.study_events where code = new.code and at > now() - interval '24 hours') >= 300 then
    raise exception 'Limite de eventos do estudo atingido.' using errcode = 'P0001', hint = 'limite_eventos';
  end if;
  return new;
end;
$$;
drop trigger if exists study_events_limit on public.study_events;
create trigger study_events_limit before insert on public.study_events
  for each row execute function public.limit_study_events();

revoke execute on function public.limit_user_data(), public.limit_study_events() from public, anon, authenticated;
