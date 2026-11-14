"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [complete, setComplete] = useState(false);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("passwordConfirmation") ?? "");
    if (password.length < 12) return setError("Use uma senha com pelo menos 12 caracteres.");
    if (password !== confirmation) return setError("As senhas não coincidem.");
    setPending(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (updateError) setError("Este link expirou ou já foi utilizado. Solicite uma nova recuperação.");
    else { setComplete(true); window.setTimeout(() => router.replace("/app/mercado"), 1200); }
  }

  return <main className="login-page single-login"><section className="login-panel" aria-labelledby="password-title"><div className="login-card password-reset-card">
    <Brand /><div className="reset-security-mark"><ShieldCheck aria-hidden="true" /></div><p className="eyebrow update-eyebrow">PROTEÇÃO DA CONTA</p><h1 id="password-title">Defina uma nova senha</h1><p className="muted">Crie uma senha exclusiva para proteger os dados da sua empresa.</p>
    {complete ? <div className="password-complete" role="status"><Check aria-hidden="true" /><div><strong>Senha atualizada</strong><span>Redirecionando para sua central de inteligência…</span></div></div> : <form className="login-form" onSubmit={updatePassword}>
      <div className="field"><label htmlFor="new-password">Nova senha</label><div className="password-field input-with-icon"><KeyRound aria-hidden="true" /><input id="new-password" name="password" type={showPassword ? "text" : "password"} minLength={12} maxLength={128} autoComplete="new-password" required aria-describedby="new-password-hint" /><button className="icon-button" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div><small id="new-password-hint">Use 12 ou mais caracteres e evite reutilizar senhas.</small></div>
      <div className="field"><label htmlFor="password-confirmation">Confirme a nova senha</label><input id="password-confirmation" name="passwordConfirmation" type={showPassword ? "text" : "password"} minLength={12} maxLength={128} autoComplete="new-password" required /></div>
      {error && <div className="form-error" role="alert">{error}</div>}<button className="button primary full" disabled={pending}>{pending ? <LoaderCircle className="spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{pending ? "Atualizando…" : "Salvar nova senha"}</button><Link className="button ghost full" href="/login">Voltar para entrar</Link>
    </form>}
  </div></section></main>;
}
