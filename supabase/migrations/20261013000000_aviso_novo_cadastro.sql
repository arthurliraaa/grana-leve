-- Aviso por e-mail para o Grana Leve a cada conta nova, e envio de e-mail num lugar só
-- (usado também por Ajuda e sugestões). Rode no SQL Editor do Supabase (uma vez).
-- Não apaga nem altera dados existentes.
--
-- Para o e-mail funcionar (sem isso, nada quebra: só não chega e-mail), no SQL Editor:
--   create extension if not exists pg_net;
--   select vault.create_secret('SUA_CHAVE_DE_API_DO_BREVO', 'brevo_api_key');
-- (chave de API do Brevo em "SMTP & API → API Keys" — não é a senha SMTP; o remetente
-- contato.granaleve@gmail.com precisa estar verificado em "Senders, Domains & Dedicated IPs").

-- Manda um e-mail para contato.granaleve@gmail.com pelo Brevo. Devolve false se não deu para
-- pedir o envio (pg_net desligado, sem chave ou erro). Nunca levanta erro: quem chama segue normal.
create or replace function public.admin_email(p_subject text, p_text text, p_reply_to text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then return false; end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into v_key using 'brevo_api_key';
  exception when others then return false;
  end;
  if v_key is null or v_key = '' then return false; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)' using
      'https://api.brevo.com/v3/smtp/email',
      jsonb_build_object(
        'sender', jsonb_build_object('name', 'Grana Leve', 'email', 'contato.granaleve@gmail.com'),
        'to', jsonb_build_array(jsonb_build_object('email', 'contato.granaleve@gmail.com')),
        'replyTo', jsonb_build_object('email', coalesce(nullif(p_reply_to, ''), 'contato.granaleve@gmail.com')),
        'subject', p_subject,
        'textContent', p_text),
      jsonb_build_object('api-key', v_key, 'content-type', 'application/json', 'accept', 'application/json');
    return true;
  exception when others then return false;
  end;
end;
$$;

-- Ajuda e sugestões: mesma mensagem de antes, agora pelo admin_email.
create or replace function public.feedback_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_from text; v_label text;
begin
  select u.email::text into v_from from auth.users u where u.id = new.user_id;
  v_label := case new.kind when 'ajuda' then 'Pedido de ajuda' when 'melhoria' then 'Sugestão de melhoria' else 'Problema relatado' end;
  if public.admin_email('[Grana Leve] ' || v_label || ' #' || new.id,
      v_label || E'\nDe: ' || coalesce(v_from, '?') || E'\nTela: ' || new.page || E'\n\n' || new.message, v_from) then
    update public.feedback set emailed = true where id = new.id;
  end if;
  return new;
end;
$$;

-- Conta nova: o perfil nasce junto com a conta (handle_new_user), antes da confirmação do e-mail.
create or replace function public.signup_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_total bigint;
begin
  begin
    select u.email::text into v_email from auth.users u where u.id = new.id;
    select count(*) into v_total from public.profiles;
    perform public.admin_email('[Grana Leve] Nova conta: ' || coalesce(nullif(new.name, ''), coalesce(v_email, '?')),
      'Uma conta nova foi criada no Grana Leve.' || E'\n\nNome: ' || coalesce(nullif(new.name, ''), '(sem nome)') ||
      E'\nE-mail: ' || coalesce(v_email, '?') ||
      E'\nQuando: ' || to_char(new.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
      E'\nTotal de contas: ' || v_total ||
      E'\n\nA pessoa ainda precisa confirmar o e-mail para entrar.', v_email);
  exception when others then null;   -- o aviso nunca impede o cadastro
  end;
  return new;
end;
$$;
drop trigger if exists signup_email on public.profiles;
create trigger signup_email after insert on public.profiles for each row execute function public.signup_email();

revoke execute on function public.admin_email(text, text, text), public.signup_email() from public, anon, authenticated;
