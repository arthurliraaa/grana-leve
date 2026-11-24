-- 1) Configurações que acompanham a pessoa entre aparelhos (calculadora do salário, regras dos avisos): nova coleção "settings"
--    nos dados do app (um documento só, com id 'prefs').
-- 2) Avisos programáveis: o lembrete agendado pode ser do tipo 'custom' (criado pela pessoa) ou 'statement' (importar o extrato).
-- Rode no SQL Editor do Supabase (uma vez). Não apaga nem altera dados existentes.
alter table public.user_data drop constraint if exists user_data_collection_check;
alter table public.user_data add constraint user_data_collection_check check (collection in ('transactions', 'budgets', 'goals', 'debts', 'cards', 'receivables',
  'forecasts', 'categories', 'vouchers', 'accounts', 'transfers', 'bills', 'settings'));

-- Só mexe nos lembretes se a tabela já existe (ela vem da migração 20261115000000_avisos_push.sql). Se você ainda não rodou aquela,
-- rode-a depois: ela já cria a tabela aceitando todos os tipos, então não precisa repetir esta.
do $$
begin
  if to_regclass('public.push_reminders') is not null then
    alter table public.push_reminders drop constraint if exists push_reminders_kind_check;
    alter table public.push_reminders add constraint push_reminders_kind_check check (kind in ('salary', 'invoice', 'bill', 'custom', 'statement'));
  end if;
end $$;
