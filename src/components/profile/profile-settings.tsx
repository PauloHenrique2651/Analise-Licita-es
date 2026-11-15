"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ProfileSettingsProps = { initialName: string; email: string };

export function ProfileSettings({ initialName, email }: ProfileSettingsProps) {
  const [name, setName] = useState(initialName);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPasswords, setShowPasswords] = useState(false);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = name.trim();
    if (displayName.length < 3) return setProfileMessage("Informe seu nome completo com pelo menos 3 caracteres.");
    setSavingProfile(true); setProfileMessage(null);
    const client = createClient();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) { setSavingProfile(false); return setProfileMessage("Sua sessão expirou. Entre novamente para continuar."); }
    const [{ error: authError }, { error: profileError }] = await Promise.all([
      client.auth.updateUser({ data: { ...user.user_metadata, display_name: displayName } }),
      client.from("users").update({ display_name: displayName }).eq("id", user.id),
    ]);
    setSavingProfile(false);
    setProfileMessage(authError || profileError ? "Não foi possível salvar suas alterações agora. Tente novamente." : "Perfil atualizado com sucesso.");
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordError(null); setPasswordMessage(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password.length < 8) return setPasswordError("Use uma senha com pelo menos 8 caracteres.");
    if (password !== confirmation) return setPasswordError("As senhas não coincidem.");
    setSavingPassword(true);
    const { error } = await createClient().auth.updateUser({ password });
    setSavingPassword(false);
    if (error) return setPasswordError("Não foi possível atualizar a senha agora. Tente novamente.");
    event.currentTarget.reset(); setPasswordMessage("Senha atualizada com sucesso.");
  }

  return <div className="profile-layout">
    <section className="panel profile-card"><div className="profile-card-head"><span className="profile-large-avatar"><UserRound aria-hidden="true" /></span><div><p className="eyebrow">DADOS DE ACESSO</p><h2>Meu perfil</h2><p>Estas informações identificam sua conta dentro da empresa.</p></div></div><form className="profile-form" onSubmit={saveProfile}><div className="field"><label htmlFor="profile-name">Nome de exibição</label><input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={3} maxLength={120} required /></div><div className="field"><label htmlFor="profile-email">E-mail de acesso</label><input id="profile-email" value={email} type="email" readOnly aria-describedby="profile-email-hint" /><small id="profile-email-hint">O e-mail é gerenciado pelo fluxo de recuperação de acesso.</small></div>{profileMessage && <div className={profileMessage.includes("sucesso") ? "form-success" : "form-error"} role="status">{profileMessage.includes("sucesso") && <Check aria-hidden="true" />}{profileMessage}</div>}<button className="button primary" disabled={savingProfile}>{savingProfile ? <LoaderCircle className="spin" aria-hidden="true" /> : <Save aria-hidden="true" />}{savingProfile ? "Salvando…" : "Salvar perfil"}</button></form></section>
    <section className="panel profile-card"><div className="profile-card-head"><span className="profile-large-avatar security"><ShieldCheck aria-hidden="true" /></span><div><p className="eyebrow">SEGURANÇA</p><h2>Alterar senha</h2><p>Use uma senha única para proteger o ambiente da sua empresa.</p></div></div><form className="profile-form" onSubmit={changePassword}><div className="field"><label htmlFor="profile-password">Nova senha</label><div className="password-field"><input id="profile-password" name="password" type={showPasswords ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} required /><button className="icon-button" type="button" onClick={() => setShowPasswords((value) => !value)} aria-label={showPasswords ? "Ocultar senha" : "Mostrar senha"}>{showPasswords ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div><small>Use 8 ou mais caracteres.</small></div><div className="field"><label htmlFor="profile-confirmation">Confirme a nova senha</label><input id="profile-confirmation" name="confirmation" type={showPasswords ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} required /></div>{passwordError && <div className="form-error" role="alert">{passwordError}</div>}{passwordMessage && <div className="form-success" role="status"><Check aria-hidden="true" />{passwordMessage}</div>}<button className="button" disabled={savingPassword}>{savingPassword ? <LoaderCircle className="spin" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}{savingPassword ? "Atualizando…" : "Atualizar senha"}</button></form></section>
  </div>;
}
