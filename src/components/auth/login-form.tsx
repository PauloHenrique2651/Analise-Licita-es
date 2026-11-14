"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup" | "recover";

const modeCopy: Record<AuthMode, { eyebrow: string; title: string; description: string }> = {
  login: { eyebrow: "ACESSO SEGURO", title: "Bem-vindo ao Nexo.", description: "Acesse sua central de inteligência em compras públicas." },
  signup: { eyebrow: "PRIMEIRO ACESSO", title: "Crie seu espaço de trabalho.", description: "Cadastre sua empresa e comece a acompanhar oportunidades." },
  recover: { eyebrow: "RECUPERAR ACESSO", title: "Vamos redefinir sua senha.", description: "Enviaremos um link seguro para o e-mail da sua conta." },
};

function friendlyAuthError(reason: unknown, mode: AuthMode) {
  const raw = reason instanceof Error ? reason.message.toLowerCase() : "";
  if (raw.includes("already registered") || raw.includes("already been registered")) return "Este e-mail já possui uma conta. Entre ou recupere sua senha.";
  if (raw.includes("rate limit")) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  if (raw.includes("as senhas") || raw.includes("confirme")) return reason instanceof Error ? reason.message : "Revise os dados informados.";
  if (raw.includes("password")) return "A senha não atende aos requisitos de segurança.";
  if (mode === "signup") return "Não foi possível criar sua conta agora. Revise os dados e tente novamente.";
  if (mode === "recover") return "Não foi possível enviar o link agora. Aguarde um instante e tente novamente.";
  return reason instanceof Error ? reason.message : "Não foi possível entrar. Confira o e-mail e a senha.";
}

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const copy = modeCopy[mode];
  const [sent, setSent] = useState<{ email: string; kind: "signup" | "recover" } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    if (!sent || cooldown > 0) return;
    setResendNote(null); setCooldown(60);
    try {
      const client = createClient();
      const { error: resendError } = sent.kind === "signup"
        ? await client.auth.resend({ type: "signup", email: sent.email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/hoje` } })
        : await client.auth.resetPasswordForEmail(sent.email, { redirectTo: `${window.location.origin}/auth/callback?next=/atualizar-senha` });
      setResendNote(resendError ? "Não foi possível reenviar agora. Aguarde um minuto e tente de novo." : "E-mail reenviado. Pode levar alguns instantes.");
    } catch { setResendNote("Não foi possível reenviar agora. Aguarde um minuto e tente de novo."); }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode); setError(null); setMessage(null); setShowPassword(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setMessage(null);
    if (!configured) return setError("O acesso está temporariamente indisponível. Atualize a página e tente novamente.");
    const form = new FormData(event.currentTarget);
    const normalizedEmail = String(form.get("email") ?? "").trim().toLowerCase();
    setEmail(normalizedEmail); setLoading(true);
    try {
      if (mode === "recover") {
        const { error: recoverError } = await createClient().auth.resetPasswordForEmail(normalizedEmail, { redirectTo: `${window.location.origin}/auth/callback?next=/atualizar-senha` });
        if (recoverError) throw recoverError;
        setSent({ email: normalizedEmail, kind: "recover" }); setCooldown(60);
        return;
      }
      const password = String(form.get("password") ?? "");
      if (mode === "login") {
        const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: normalizedEmail, password }) });
        const payload = await response.json() as { message?: string };
        if (!response.ok) throw new Error(payload.message ?? "Não foi possível entrar.");
        router.replace("/app/mercado"); router.refresh(); return;
      }
      const fullName = String(form.get("fullName") ?? "").trim();
      const companyName = String(form.get("companyName") ?? "").trim();
      const confirmation = String(form.get("passwordConfirmation") ?? "");
      if (password !== confirmation) throw new Error("As senhas não coincidem.");
      if (!form.get("consent")) throw new Error("Confirme a criação do ambiente da sua empresa.");
      const { data: authData, error: authError } = await createClient().auth.signUp({
        email: normalizedEmail, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/hoje`, data: { company_name: companyName, display_name: fullName } },
      });
      if (authError) throw authError;
      if (authData.session) { router.replace("/app/hoje"); router.refresh(); }
      else { setSent({ email: normalizedEmail, kind: "signup" }); setCooldown(60); }
    } catch (reason) { setError(friendlyAuthError(reason, mode)); }
    finally { setLoading(false); }
  }

  if (sent) {
    return (
      <div className="auth-flow auth-sent" role="status" aria-live="polite">
        <div className="auth-sent-icon"><Mail aria-hidden="true" /></div>
        <h1>{sent.kind === "signup" ? "Confirme seu e-mail" : "Verifique seu e-mail"}</h1>
        <p className="muted">{sent.kind === "signup" ? "Enviamos um link de confirmação para" : "Se esse endereço estiver cadastrado, enviamos um link para criar uma nova senha:"}</p>
        <p className="auth-sent-email">{sent.email}</p>
        <ol className="auth-sent-steps">
          <li>Abra o e-mail do Nexo Público.</li>
          <li>Clique no botão do e-mail.</li>
          <li>{sent.kind === "signup" ? "Pronto: você entra direto na plataforma." : "Defina sua nova senha."}</li>
        </ol>
        <p className="muted auth-sent-hint">Não chegou? Confira o spam ou a aba Promoções.</p>
        {resendNote && <div className="form-success" role="status"><Check aria-hidden="true" />{resendNote}</div>}
        <button className="button full" type="button" onClick={() => void resend()} disabled={cooldown > 0}>{cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar e-mail"}</button>
        <button className="button ghost full auth-back" type="button" onClick={() => { setSent(null); changeMode("login"); }}><ArrowLeft aria-hidden="true" />Voltar para entrar</button>
      </div>
    );
  }

  return (
    <div className="auth-flow">
      <div className="auth-mode-head" aria-live="polite">
        <div className="login-card-head"><p className="eyebrow">{copy.eyebrow}</p><span className="login-edition">NEXO / 01</span></div>
        <h1 id="login-title">{copy.title}</h1><p className="muted">{copy.description}</p>
      </div>
      <div className="auth-progress" aria-label="Etapas de acesso">
        <span className="active"><i>1</i> Identificação</span>
        <span className={mode === "signup" ? "active" : ""}><i>2</i> Empresa</span>
        <span><i><ShieldCheck aria-hidden="true" /></i> Ambiente protegido</span>
      </div>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {mode === "signup" && <div className="auth-fields-row">
          <div className="field"><label htmlFor="full-name">Seu nome</label><input id="full-name" name="fullName" autoComplete="name" minLength={3} maxLength={120} required placeholder="Nome completo" /></div>
          <div className="field"><label htmlFor="company-name">Empresa</label><input id="company-name" name="companyName" autoComplete="organization" minLength={2} maxLength={160} required placeholder="Razão social ou nome fantasia" /></div>
        </div>}
        <div className="field"><label htmlFor="email">E-mail profissional</label><div className="input-with-icon"><Mail aria-hidden="true" /><input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com.br" /></div></div>
        {mode !== "recover" && <div className="field">
          <label htmlFor="password">Senha</label>
          <div className="password-field input-with-icon"><KeyRound aria-hidden="true" /><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 12 : 6} maxLength={128} required aria-describedby={mode === "signup" ? "password-hint" : undefined} /><button type="button" className="icon-button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>
          {mode === "signup" && <small id="password-hint">Use 12 ou mais caracteres; uma frase longa funciona muito bem.</small>}
        </div>}
        {mode === "signup" && <>
          <div className="field"><label htmlFor="password-confirmation">Confirme a senha</label><input id="password-confirmation" name="passwordConfirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} maxLength={128} required /></div>
          <label className="checkbox-label consent-line"><input type="checkbox" name="consent" required />Confirmo a criação do ambiente da minha empresa e o uso dos dados informados para este acesso.</label>
        </>}
        {mode === "login" && <div className="form-row"><label className="checkbox-label"><input type="checkbox" name="remember" defaultChecked /> Lembrar acesso</label><button className="text-button compact" type="button" onClick={() => changeMode("recover")}>Esqueci minha senha</button></div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        {message && <div className="form-success" role="status"><Check aria-hidden="true" />{message}</div>}
        <button className="button primary full" disabled={loading} type="submit">
          {loading ? <LoaderCircle className="spin" aria-hidden="true" /> : mode === "signup" ? <UserPlus aria-hidden="true" /> : mode === "recover" ? <Mail aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          {loading ? "Aguarde…" : mode === "signup" ? "Criar minha conta" : mode === "recover" ? "Enviar link de recuperação" : "Entrar na plataforma"}
        </button>
        {mode === "login" ? <button className="button tertiary full" disabled={loading} type="button" onClick={() => changeMode("signup")}>Criar primeiro acesso</button> : <button className="button ghost full auth-back" disabled={loading} type="button" onClick={() => changeMode("login")}><ArrowLeft aria-hidden="true" />Voltar para entrar</button>}
      </form>
    </div>
  );
}
