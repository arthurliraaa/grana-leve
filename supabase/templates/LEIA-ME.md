# Modelos de e-mail do Supabase

Os e-mails de confirmação de cadastro e de nova senha usam estes modelos. Eles ficam
configurados no painel do Supabase, não no código.

| Modelo no Supabase (Authentication → Email Templates) | Assunto (Subject) | Corpo (Message body) |
|---|---|---|
| **Confirm signup** | `Confirme seu e-mail no Grana Leve` | `confirmar-cadastro.html` |
| **Reset password** | `Crie uma nova senha no Grana Leve` | `nova-senha.html` |

Para cada um: abra o modelo, troque o assunto, apague o corpo, cole o conteúdo inteiro do
arquivo e clique em **Save**.

## Por que o link aponta para o próprio app

O modelo padrão do Supabase leva primeiro a um endereço do Supabase, que gasta o token no
primeiro acesso. Pré-visualizações de link (Gmail, Outlook, antivírus) abrem o link antes da
pessoa e deixam o token expirado (`otp_expired`).

Nestes modelos, o link leva direto ao Grana Leve com `token_hash`. O app confirma o token só
quando a página abre de verdade (`verifyOtp`), mostra uma mensagem clara se o link estiver
vencido e oferece um novo link.

`{{ .RedirectTo }}` é o endereço que o app manda no cadastro e no pedido de senha (o
próprio site). Ele precisa estar em **Authentication → URL Configuration → Redirect URLs**:
`http://localhost:5500/**` para testar e o endereço do Vercel com `/**`.
