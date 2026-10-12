-- E-mail de boas-vindas para quem cria a conta pelo Google (quem usa e-mail e senha já recebe o
-- e-mail de confirmação do Supabase) e o aviso para a equipe passa a dizer como a pessoa entrou.
-- Rode no SQL Editor do Supabase (uma vez). Precisa de pg_net e da chave brevo_api_key no Vault
-- (veja 20261013000000_aviso_novo_cadastro.sql); sem isso, nada quebra: só não sai o e-mail.

-- Manda um e-mail para uma pessoa pelo Brevo. Nunca levanta erro.
create or replace function public.user_email(p_to text, p_subject text, p_text text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  if p_to is null or p_to = '' then return false; end if;
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
        'to', jsonb_build_array(jsonb_build_object('email', p_to)),
        'replyTo', jsonb_build_object('email', 'contato.granaleve@gmail.com'),
        'subject', p_subject,
        'textContent', p_text),
      jsonb_build_object('api-key', v_key, 'content-type', 'application/json', 'accept', 'application/json');
    return true;
  exception when others then return false;
  end;
end;
$$;

create or replace function public.signup_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_total bigint; v_provider text; v_how text; v_first text;
begin
  begin
    select u.email::text, coalesce(u.raw_app_meta_data ->> 'provider', 'email') into v_email, v_provider from auth.users u where u.id = new.id;
    select count(*) into v_total from public.profiles;
    v_how := case v_provider when 'google' then 'Google' when 'email' then 'e-mail e senha' else v_provider end;
    perform public.admin_email('[Grana Leve] Nova conta: ' || coalesce(nullif(new.name, ''), coalesce(v_email, '?')),
      'Uma conta nova foi criada no Grana Leve.' || E'\n\nNome: ' || coalesce(nullif(new.name, ''), '(sem nome)') ||
      E'\nE-mail: ' || coalesce(v_email, '?') ||
      E'\nEntrou com: ' || v_how ||
      E'\nQuando: ' || to_char(new.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') ||
      E'\nTotal de contas: ' || v_total ||
      case when v_provider = 'email' then E'\n\nA pessoa ainda precisa confirmar o e-mail para entrar.' else E'\n\nA conta já está ativa (e-mail verificado pelo Google).' end, v_email);
    -- Boas-vindas só para quem não recebe o e-mail de confirmação.
    if v_provider <> 'email' then
      v_first := split_part(coalesce(nullif(new.name, ''), ''), ' ', 1);
      perform public.user_email(v_email, 'Bem-vindo(a) ao Grana Leve',
        'Olá' || case when v_first <> '' then ', ' || v_first else '' end || '!' || E'\n\n' ||
        'Sua conta no Grana Leve foi criada com o ' || v_how || '. Já pode usar: https://grana-leve.vercel.app' || E'\n\n' ||
        'Para começar: cadastre seus bancos e cartões em "Contas e cartões" e anote o primeiro gasto no botão +.' || E'\n' ||
        'Dúvidas ou sugestões? Responda este e-mail ou use "Ajuda e sugestões" dentro do app.' || E'\n\n' ||
        'Se não foi você, avise respondendo este e-mail.');
    end if;
  exception when others then null;   -- o aviso nunca impede o cadastro
  end;
  return new;
end;
$$;

revoke execute on function public.user_email(text, text, text), public.signup_email() from public, anon, authenticated;
