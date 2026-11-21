# Avisos no celular (Web Push)

O app avisa no celular quando o **salário deveria cair** e **um dia antes** de vencer uma **fatura de cartão** ou uma **conta fixa**.
Os avisos nunca trazem valores em reais ("A fatura do Nubank vence amanhã."). Só funcionam com conta online (Supabase): os lembretes
ficam no servidor, que os dispara na hora.

## Como funciona
1. Em **Perfil → Avisos no celular** a pessoa liga os avisos (o navegador pede permissão depois de um toque).
2. O app guarda o endereço de avisos do aparelho (`push_subscriptions`, pela função `save_push_subscription`) e agenda os lembretes dos
   próximos 10 dias (`push_reminders`, calculados em `js/domain/reminders.js`; a hora local é 9h). A cada abertura do app (e ao voltar
   a ele depois de 20 min) os lembretes são reagendados: uma conta paga tira o aviso dela.
3. A Edge Function `send-push` (`supabase/functions/send-push`), chamada a cada 5 minutos pelo banco, envia os que venceram.
   Lembrete vencido há mais de 24 h não é enviado; aparelho que o serviço de avisos diz que não existe mais (404/410) é apagado.
4. O service worker (`sw.js`) mostra o aviso e, ao tocar, abre o app na tela certa (só rotas do próprio app).

Ao sair da conta o aparelho deixa de receber os avisos dela (a escolha fica guardada para a próxima entrada). Desligar em Perfil apaga
o aparelho e os lembretes pendentes. Excluir a conta apaga tudo (cascata no banco).

## Ligar (uma vez, por quem administra o Supabase)
1. **Migração:** aplique `supabase/migrations/20261115000000_avisos_push.sql` (SQL Editor ou `supabase db push`).
2. **Chaves VAPID** (o par que identifica o seu servidor): `npx web-push generate-vapid-keys`. Guarde a privada só nos segredos.
3. **Segredos da função** (`supabase secrets set ...`):
   ```
   VAPID_PUBLIC_KEY=<chave pública>
   VAPID_PRIVATE_KEY=<chave privada>
   VAPID_SUBJECT=mailto:contato.granaleve@gmail.com
   PUSH_CRON_SECRET=<texto aleatório com 32 caracteres ou mais>
   ```
4. **Publicar a função:** `supabase functions deploy send-push --no-verify-jwt` (quem protege é o `PUSH_CRON_SECRET`).
5. **Agendar a cada 5 minutos** (SQL Editor; precisa das extensões `pg_cron` e `pg_net`; use o mesmo segredo do passo 3):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select vault.create_secret('<o mesmo PUSH_CRON_SECRET>', 'push_cron_secret');
   select cron.schedule('grana-leve-push', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://<REF-DO-PROJETO>.supabase.co/functions/v1/send-push',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret'), 'Content-Type', 'application/json'),
       body := '{}'::jsonb, timeout_milliseconds := 20000);
   $$);
   ```
6. **Chave pública no app:** coloque a chave pública em `VAPID_PUBLIC_KEY` de `js/config.js` e publique. Enquanto estiver vazia, o app diz
   "Os avisos ainda não foram ligados" e não oferece nada.

## Testar
- Ligue os avisos em Perfil e aceite a permissão. Veja o aparelho em `select * from push_subscriptions;`.
- Agende um aviso para agora (troque o `user_id` pelo seu) e espere até 5 minutos, ou chame a função na mão:
  ```sql
  insert into push_reminders (user_id, dedupe_key, kind, fire_at, title, body, url)
  values ('<seu user_id>', 'teste:1', 'bill', now(), 'Teste', 'Aviso de teste do Grana Leve.', './#/inicio');
  ```
  ```
  curl -X POST https://<REF>.supabase.co/functions/v1/send-push -H "Authorization: Bearer <PUSH_CRON_SECRET>"
  ```
  A resposta traz as contagens (`sent`, `stale`, `noDevice`, `retry`, `removedDevices`).

## Cuidados
- **iPhone:** só funciona com o app instalado na tela inicial (iOS 16.4 ou mais novo) e o pedido de permissão vem de um toque.
- **Trocar as chaves VAPID** invalida todos os aparelhos: cada pessoa precisa desligar e ligar de novo.
- **Privacidade (LGPD):** é um uso novo de dados, ligado só por escolha da pessoa. O texto da política (`js/ui/constants.js`) já
  explica que o endereço de avisos e os lembretes (sem valores) ficam na conta e passam pelo serviço do navegador (Google, Apple ou Mozilla).
- **Limites no banco:** 10 aparelhos por pessoa, 200 lembretes pendentes, nada marcado para mais de 45 dias à frente.
- **Não foi testado de ponta a ponta no desenvolvimento:** o envio real depende dos passos acima. O que tem teste automático: as regras do
  banco (`npm run test:db`), a escolha dos lembretes, o tratamento do aviso no service worker e as chamadas ao Supabase.
