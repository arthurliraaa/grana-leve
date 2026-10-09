-- A própria pessoa apaga a conta (direito previsto na LGPD): perfil, dados e estudo vão junto.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_code uuid;
begin
  if auth.uid() is null then raise exception 'Entre na conta para excluí-la.' using errcode = '42501'; end if;
  select p.research_code into v_code from public.profiles p where p.id = auth.uid();
  delete from public.study_participants sp where sp.code = v_code;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
