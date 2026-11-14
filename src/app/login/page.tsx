import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/auth/login-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/app/mercado");
  }

  return (
    <main className="login-page">
      <section className="login-context" aria-labelledby="login-product-title">
        <div className="login-brand-row">
          <Brand />
          <span>PLATAFORMA DE INTELIGÊNCIA PÚBLICA</span>
        </div>
        <div className="login-copy">
          <p className="eyebrow">DADOS PÚBLICOS · INTELIGÊNCIA COMERCIAL</p>
          <h1 id="login-product-title">Encontre o caminho entre a oportunidade e a decisão.</h1>
          <p>
            Uma visão nacional para pesquisar licitações, comparar o mercado e acompanhar cada processo com origem verificável.
          </p>
          <div className="login-capabilities" aria-label="Jornada da plataforma">
            <div><span>01</span><strong>Pesquisar</strong><small>Processos e itens</small></div>
            <div><span>02</span><strong>Analisar</strong><small>Mercado e preços</small></div>
            <div><span>03</span><strong>Acompanhar</strong><small>Prazos e clientes</small></div>
          </div>
        </div>
        <div className="login-proof" aria-label="Fontes e compromissos da plataforma">
          <span><i />PNCP</span><span><i />COMPRAS.GOV.BR</span><span><i />RASTREABILIDADE</span>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-card">
          <div className="mobile-brand"><Brand /></div>
          <LoginForm configured={Boolean(supabase)} />
          <div className="login-note"><span className="status-dot ready" />Ambiente protegido · dados privados isolados por empresa</div>
        </div>
      </section>
    </main>
  );
}
