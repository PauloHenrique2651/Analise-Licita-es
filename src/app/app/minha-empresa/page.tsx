import { CompanyList, type CompanyRow } from "@/components/company/company-list";
import { CompanyRegistration } from "@/components/company/company-registration";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MyCompanyPage() {
  const supabase = await createClient();
  const { data } = supabase ? await supabase.from("companies").select("id,cnpj,legal_name,trade_name,state_code,city_name").order("legal_name").limit(50) : { data: [] };
  const companies: CompanyRow[] = (data ?? []).map((row) => ({ id: row.id, cnpj: String(row.cnpj), legalName: row.legal_name, tradeName: row.trade_name ?? null, state: row.state_code ?? null, city: row.city_name ?? null }));
  return <><header className="page-header"><div><p className="eyebrow">EMPRESA</p><h1>Minha empresa</h1><p>Consulte e mantenha o perfil cadastral usado nas análises e oportunidades do seu time.</p></div></header><CompanyList companies={companies} /><section className="panel"><div className="panel-head"><div><p className="panel-title">Identificação empresarial</p><small>Informe o CNPJ para consultar, validar e salvar os dados da empresa.</small></div></div><CompanyRegistration /></section></>;
}
