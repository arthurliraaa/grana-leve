-- Rode UMA vez no SQL Editor do Supabase, depois de criar sua conta no app.
-- Troque o e-mail abaixo pelo e-mail da conta que vai administrar.
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'SEU-EMAIL@exemplo.com');

-- Confere: deve aparecer uma linha com role = admin.
select p.name, u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
