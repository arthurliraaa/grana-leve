-- 1) Configurações que acompanham a pessoa entre aparelhos (calculadora do salário, regras dos avisos): nova coleção "settings"
--    nos dados do app (um documento só, com id 'prefs').
-- 2) Avisos programáveis: o lembrete agendado pode ser do tipo 'custom' (criado pela pessoa) ou 'statement' (importar o extrato).
-- Rode no SQL Editor do Supabase (uma vez). Não apaga nem altera dados existentes.
alter table public.user_data drop constraint if exists user_data_collection_check;
alter table public.user_data add constraint user_data_collection_check check (collection in ('transactions', 'budgets', 'goals', 'debts', 'cards', 'receivables',
  'forecasts', 'categories', 'vouchers', 'accounts', 'transfers', 'bills', 'settings'));

alter table public.push_reminders drop constraint if exists push_reminders_kind_check;
alter table public.push_reminders add constraint push_reminders_kind_check check (kind in ('salary', 'invoice', 'bill', 'custom', 'statement'));
