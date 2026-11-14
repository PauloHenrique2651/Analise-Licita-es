# E-mails de acesso (marca Nexo Público)

Os e-mails de confirmação e recuperação saem do Supabase Auth. Para não aparecerem com a marca do Supabase:

1. **Modelos** — Supabase > Authentication > Email Templates:
   - *Confirm signup*: assunto `Confirme seu e-mail no Nexo Público`, corpo = `confirm-signup.html`.
   - *Reset password*: assunto `Crie uma nova senha no Nexo Público`, corpo = `recovery.html`.
2. **Remetente** — Supabase > Authentication > SMTP Settings: ative *Custom SMTP* com um provedor (Resend, Brevo, SES…) e use o nome `Nexo Público` e um e-mail do seu domínio. Sem SMTP próprio o Supabase envia como `noreply@mail.app.supabase.io`, com limite baixo de envios por hora.
3. **Redirecionamento** — Authentication > URL Configuration: *Site URL* = domínio da Vercel; *Redirect URLs* inclui `/auth/callback`.
