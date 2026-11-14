import { Activity, AlertTriangle, CheckCircle2, Database } from "lucide-react";
import { SyncButton } from "@/components/admin/sync-button";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { createClient } from "@/lib/supabase/server";
import { procurementPortalRegistry } from "@/integrations/procurement/portals/registry";

export const dynamic = "force-dynamic";

const integrations = [
  { name: "PNCP", description: "Contratações, itens, resultados e documentos", ready: true, note: "Fonte nacional prioritária · atualização contínua" },
  { name: "Compras.gov.br", description: "Contratações, itens, CATMAT, CATSER e preços", ready: true, note: "Fonte nacional redundante · atualização contínua" },
  { name: "Compras RJ", description: "Licitações estaduais, valores, prazos e situação", ready: true, note: "Fonte estadual oficial · verificação diária" },
  { name: "Dados cadastrais", description: "CNPJ, endereço e situação empresarial", ready: true, note: "Consulta segura com redundância automática" },
  { name: "Localidades", description: "Estados, municípios e regiões brasileiras", ready: true, note: "Base territorial oficial · atualização diária" },
  { name: "Inscrição estadual", description: "Inscrição estadual e situação cadastral", ready: false, note: "Disponível após ativação contratual" },
] as const;

export default async function AdminPage() {
  const secondaryPortals = procurementPortalRegistry.filter((portal) => portal.connector === null);
  const supabase = await createClient();
  const [importsResult, procurements, items, companies, organizations, products, suppliers, results, prices] = supabase ? await Promise.all([
    supabase.from("imports").select("id, endpoint, started_at, finished_at, status, processed_count, error_count, sources(name)").order("started_at", { ascending: false }).limit(10),
    supabase.from("procurements").select("*", { count: "exact", head: true }),
    supabase.from("procurement_items").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("organizations").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("suppliers").select("*", { count: "exact", head: true }),
    supabase.from("results").select("*", { count: "exact", head: true }),
    supabase.from("price_records").select("*", { count: "exact", head: true }),
  ]) : [{ data: [] }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];
  const stats = [
    ["Processos", procurements.count ?? 0], ["Itens", items.count ?? 0], ["Empresas", companies.count ?? 0],
    ["Órgãos", organizations.count ?? 0], ["Produtos", products.count ?? 0], ["Concorrentes", suppliers.count ?? 0],
    ["Resultados", results.count ?? 0], ["Preços", prices.count ?? 0],
  ] as const;

  return (
    <>
      <RealtimeRefresh />
      <header className="page-header">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h1>Fontes e atualização</h1>
          <p>Cobertura das fontes oficiais, histórico de atualização e volume da base.</p>
        </div>
        <SyncButton />
      </header>

      <section className="integration-grid">
        {integrations.map((integration) => (
          <article className="panel integration-card" key={integration.name}>
            <div className="integration-head">
              <div className="integration-icon">
                {integration.ready ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              </div>
              <span className={integration.ready ? "status-badge" : "status-badge warning"}>
                {integration.ready ? "Pronto" : "Atenção"}
              </span>
            </div>
            <h2>{integration.name}</h2>
            <p>{integration.description}</p>
            <small>{integration.note}</small>
          </article>
        ))}
      </section>

      <section className="admin-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Últimas sincronizações</p>
              <small>Histórico das rotinas automáticas de atualização</small>
            </div>
          </div>
          {(importsResult.data ?? []).length === 0 ? <div className="empty-inline tall"><Activity aria-hidden="true" /><span>Nenhuma execução registrada.</span></div> : <div className="sync-list">{(importsResult.data ?? []).map((run) => {
            const source = Array.isArray(run.sources) ? run.sources[0] : run.sources;
            return <article key={run.id}><span className={`status-dot ${run.status === "succeeded" ? "ready" : ""}`} /><div><strong>{source?.name ?? "Fonte externa"}</strong><small>{new Date(run.started_at).toLocaleString("pt-BR")} · {run.processed_count} processados · {run.error_count} erros</small></div><span className={run.status === "succeeded" ? "status-badge" : "status-badge warning"}>{run.status}</span></article>;
          })}</div>}
        </article>
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-title">Base de dados</p>
              <small>Contagem por entidade</small>
            </div>
          </div>
          <div className="base-stats">
            {stats.map(([item, count]) => (
              <div key={item}>
                <Database aria-hidden="true" />
                <span>{item}</span>
                <strong>{Intl.NumberFormat("pt-BR").format(count)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel portal-registry-panel">
        <div className="panel-head">
          <div>
            <p className="panel-title">Registro de portais complementares</p>
            <small>Novos portais entram na cobertura quando disponibilizam acesso oficial e documentado.</small>
          </div>
        </div>
        <div className="portal-registry-list">
          {secondaryPortals.map((portal) => <article key={portal.code}><div><strong>{portal.name}</strong><small>{portal.url}</small></div><span className={portal.status === "DADOS ABERTOS OFICIAIS" ? "status-badge" : "status-badge warning"}>{portal.status}</span></article>)}
        </div>
      </section>
    </>
  );
}
