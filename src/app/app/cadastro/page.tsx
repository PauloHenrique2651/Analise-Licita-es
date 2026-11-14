import { CompanyRegistration } from "@/components/company/company-registration";

export const metadata = { title: "Cadastrar empresa" };
export default function CompanyRegistrationPage() {
  return <><header className="page-header"><div><p className="eyebrow">EMPRESA</p><h1>Cadastrar empresa</h1><p>Informe o CNPJ para preencher os dados cadastrais pela fonte oficial disponível.</p></div></header><CompanyRegistration /></>;
}
