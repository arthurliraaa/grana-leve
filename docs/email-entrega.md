# E-mail que não chega (Hotmail/Outlook e outros)

O código do app não trata provedores de forma diferente: qualquer e-mail válido pede o link do mesmo
jeito. Quando só o Hotmail/Outlook não recebe, o motivo está no **envio** (remetente e autenticação),
que fica no painel do Supabase e do Brevo, fora do repositório.

## O que costuma causar
1. **Remetente `@gmail.com` mandado por outro serviço** (Brevo, Supabase). O Gmail não autoriza esses
   serviços (SPF/DKIM não batem), e o Microsoft (Hotmail/Outlook/Live) manda para o Lixo Eletrônico ou
   recusa. O Brevo também pede domínio próprio autenticado para enviar em volume.
2. **E-mail padrão do Supabase** (sem SMTP próprio): remetente compartilhado, limite baixo de envios por
   hora e entrega ruim em Hotmail/Outlook.
3. Link de confirmação que o Outlook "abre antes" (pré-visualização): já tratado nos modelos
   (`supabase/templates/LEIA-ME.md`).

## Como conferir (quem tem acesso ao painel)
1. **Supabase → Authentication → Logs**: ao criar uma conta com Hotmail, o envio aparece como
   `sent` ou como erro? Erro = problema do SMTP; `sent` = o provedor recebeu e o Microsoft barrou.
2. **Supabase → Authentication → SMTP Settings**: está com SMTP próprio ligado? Qual remetente?
3. **Brevo → Logs de transacional**: procure o envio ao Hotmail (entregue, adiado, bloqueado ou spam).
4. Teste com uma conta Outlook/Hotmail real e olhe também **Lixo Eletrônico** e a aba **Outros**.
   Teste os outros provedores (Gmail, Yahoo, iCloud, e-mail de faculdade) para comparar.

## Correção recomendada
- Comprar um **domínio próprio** (ex.: `granaleve.app`) e autenticá-lo no Brevo (SPF, DKIM e DMARC).
- Ligar **Custom SMTP** no Supabase com um remetente desse domínio (ex.: `nao-responder@seu-dominio`).
- Trocar o remetente das funções de e-mail do banco (`contato.granaleve@gmail.com`) pelo do domínio.
- Reenviar a confirmação para quem não recebeu (botão "Reenviar" no login).

## O que o app já faz
- A janela "Enviamos um link" mostra dica de onde olhar conforme o provedor (Outlook/Hotmail,
  Yahoo, iCloud).
- O cadastro sugere corrigir domínios digitados errados (`hotmal.com` → `hotmail.com`).
