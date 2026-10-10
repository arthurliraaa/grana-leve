-- Contas fixas e recorrentes: nova coleção "bills" nos dados do app.
-- Rode no SQL Editor do Supabase (uma vez). Não apaga nem altera dados existentes.
alter table public.user_data drop constraint if exists user_data_collection_check;
alter table public.user_data add constraint user_data_collection_check check (collection in ('transactions', 'budgets', 'goals', 'debts', 'cards', 'receivables',
  'forecasts', 'categories', 'vouchers', 'accounts', 'transfers', 'bills'));
