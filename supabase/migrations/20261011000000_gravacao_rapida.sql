-- Gravação mais rápida: editar registros com uma ida só ao servidor.
-- patch_docs junta as mudanças no próprio banco (doc || mudança), então não sobrescreve o que
-- outro aparelho tenha mudado em outros campos. Roda com as permissões de quem chama (RLS vale).
-- Rode no SQL Editor do Supabase (uma vez). Enquanto não rodar, o app usa o jeito antigo.
create or replace function public.patch_docs(p_collection text, p_items jsonb) returns void
language sql security invoker set search_path = '' as $$
  update public.user_data u
     set doc = u.doc || (i.value -> 'patch'), updated_at = now()
    from jsonb_array_elements(p_items) i
   where u.user_id = auth.uid() and u.collection = p_collection and u.id = i.value ->> 'id';
$$;
revoke execute on function public.patch_docs(text, jsonb) from public, anon;
grant execute on function public.patch_docs(text, jsonb) to authenticated;
