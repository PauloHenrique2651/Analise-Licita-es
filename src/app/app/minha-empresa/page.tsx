import { CompanyRegistration } from "@/components/company/company-registration";

export const dynamic = "force-dynamic";

export default function MyCompanyPage() {
  return <><header className="page-header"><div><p className="eyebrow">EMPRESA</p><h1>Minha empresa</h1><p>Consulte e mantenha o perfil cadastral usado nas análises e oportunidades do seu time.</p></div></header><section className="panel"><div className="panel-head"><div><p className="panel-title">Identificação empresarial</p><small>Informe o CNPJ para consultar, validar e salvar os dados da empresa.</small></div></div><CompanyRegistration /></section></>;
}
