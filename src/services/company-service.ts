import "server-only";
import { brasilApiProvider } from "@/providers/brasil-api-provider";
import { conectaGovProvider } from "@/providers/conecta-gov-provider";
import { createClient } from "@/lib/supabase/server";
import type { BrasilApiCompany, ConectaGovCompany, NormalizedCompanyLookup } from "@/types/providers";

const registrationStatus: Record<string, string> = {
  "1": "Nula", "2": "Ativa", "3": "Suspensa", "4": "Inapta", "8": "Baixada",
};
const companySize: Record<string, string> = {
  "01": "Microempresa", "03": "Empresa de pequeno porte", "05": "Demais empresas",
};

function numberOrNull(value: string | number | null | undefined, divisor = 1) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / divisor : null;
}

function mapBrasilApi(company: BrasilApiCompany): NormalizedCompanyLookup {
  return {
    cnpj: company.cnpj,
    legalName: company.razao_social,
    tradeName: company.nome_fantasia,
    status: company.descricao_situacao_cadastral,
    size: company.descricao_porte,
    legalNature: company.natureza_juridica,
    shareCapital: company.capital_social,
    address: {
      zipCode: company.cep, street: company.logradouro, number: company.numero, complement: company.complemento,
      district: company.bairro, city: company.municipio, state: company.uf,
    },
    primaryActivity: company.cnae_fiscal ? { code: company.cnae_fiscal, description: company.cnae_fiscal_descricao } : null,
    secondaryActivities: company.cnaes_secundarios ?? [],
    source: { source: "BRASIL_API", endpoint: `/cnpj/v1/${company.cnpj}`, externalId: company.cnpj, importedAt: new Date().toISOString() },
    rawData: company,
  };
}

function mapConectaGov(company: ConectaGovCompany): NormalizedCompanyLookup {
  const statusCode = company.situacaoCadastral?.codigo;
  const porteCode = company.porteEmpresa ?? company.porte;
  const cnaeCode = numberOrNull(company.cnaePrincipal?.codigo);
  return {
    cnpj: company.ni,
    legalName: company.nomeEmpresarial,
    tradeName: company.nomeFantasia ?? company.nomefantasia ?? null,
    status: statusCode ? registrationStatus[statusCode] ?? company.situacaoCadastral?.motivo ?? statusCode : null,
    size: porteCode ? companySize[porteCode] ?? porteCode : null,
    legalNature: company.naturezaJuridica?.descricao ?? company.naturezaJuridica?.codigo ?? null,
    shareCapital: numberOrNull(company.capitalSocial, 100),
    address: {
      zipCode: company.endereco?.cep ?? null,
      street: [company.endereco?.tipoLogradouro, company.endereco?.logradouro].filter(Boolean).join(" ") || null,
      number: company.endereco?.numero ?? null,
      complement: company.endereco?.complemento ?? null,
      district: company.endereco?.bairro ?? null,
      city: company.endereco?.municipio?.descricao ?? null,
      state: company.endereco?.uf ?? null,
      ibgeCode: company.endereco?.municipio?.codigo ?? null,
    },
    primaryActivity: cnaeCode === null ? null : { code: cnaeCode, description: company.cnaePrincipal?.descricao ?? null },
    secondaryActivities: company.cnaeSecundarias ?? [],
    source: {
      source: "CNPJ_CONECTA",
      endpoint: `/api-cnpj-empresa/v2/empresa/${company.ni}`,
      externalId: company.ni,
      importedAt: new Date().toISOString(),
    },
    rawData: company,
  };
}

async function fetchCompany(cnpj: string) {
  if (conectaGovProvider.isConfigured()) {
    try {
      return mapConectaGov(await conectaGovProvider.getCompany(cnpj));
    } catch {
      // BrasilAPI mantém o cadastro disponível quando o Conecta estiver instável ou bloquear o IP de saída.
    }
  }
  return mapBrasilApi(await brasilApiProvider.getCompany(cnpj));
}

export async function lookupCompany(cnpj: string) {
  return fetchCompany(cnpj);
}

export async function saveCompany(cnpj: string, tenantId: string) {
  const company = await fetchCompany(cnpj);
  const supabase = await createClient();
  if (!supabase) throw new Error("AUTH_NOT_CONFIGURED");
  const { data: source, error: sourceError } = await supabase.from("sources").select("id").eq("code", company.source.source).single();
  if (sourceError || !source) throw new Error(`Fonte ${company.source.source} não cadastrada.`);
  const importedAt = new Date().toISOString();
  const { data, error } = await supabase.from("companies").upsert({
    tenant_id: tenantId,
    cnpj: company.cnpj,
    legal_name: company.legalName,
    trade_name: company.tradeName,
    registration_status: company.status,
    company_size: company.size,
    legal_nature: company.legalNature,
    share_capital: company.shareCapital,
    zip_code: company.address.zipCode?.replace(/\D/g, "") || null,
    street: company.address.street,
    number: company.address.number,
    complement: company.address.complement,
    district: company.address.district,
    city_name: company.address.city,
    state_code: company.address.state,
    primary_cnae: company.primaryActivity ? String(company.primaryActivity.code) : null,
    raw_data: company.rawData,
    source_id: source.id,
    source_endpoint: company.source.endpoint,
    external_id: company.source.externalId,
    imported_at: importedAt,
    updated_at: importedAt,
  }, { onConflict: "tenant_id,cnpj" }).select("id, cnpj, legal_name").single();
  if (error || !data) throw error ?? new Error("Falha ao salvar empresa.");
  return { id: data.id, cnpj: data.cnpj, legalName: data.legal_name };
}
