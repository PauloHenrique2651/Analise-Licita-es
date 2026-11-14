export type PortalRegistryEntry = {
  code: string;
  name: string;
  url: string;
  status: "API PÚBLICA OFICIAL" | "API PARA PARCEIROS" | "DADOS ABERTOS OFICIAIS" | "SOMENTE CONSULTA WEB" | "SEM API PÚBLICA CONFIRMADA";
  priority: number;
  connector: "PNCP" | "COMPRAS_GOV" | "RJ_DADOS_ABERTOS_SIGA" | null;
};

export const procurementPortalRegistry: readonly PortalRegistryEntry[] = [
  { code: "PNCP", name: "Portal Nacional de Contratações Públicas", url: "https://pncp.gov.br/", status: "API PÚBLICA OFICIAL", priority: 10, connector: "PNCP" },
  { code: "COMPRAS_GOV", name: "Compras.gov.br", url: "https://dadosabertos.compras.gov.br/", status: "API PÚBLICA OFICIAL", priority: 20, connector: "COMPRAS_GOV" },
  { code: "RJ_DADOS_ABERTOS_SIGA", name: "RJ Dados Abertos / SIGA", url: "https://dadosabertos.rj.gov.br/", status: "DADOS ABERTOS OFICIAIS", priority: 30, connector: "RJ_DADOS_ABERTOS_SIGA" },
  { code: "PORTAL_COMPRAS_PUBLICAS", name: "Portal de Compras Públicas", url: "https://www.portaldecompraspublicas.com.br/", status: "API PARA PARCEIROS", priority: 300, connector: null },
  { code: "BLL_COMPRAS", name: "BLL Compras", url: "https://bll.org.br/", status: "API PARA PARCEIROS", priority: 310, connector: null },
  { code: "BNC_COMPRAS", name: "BNC Compras", url: "https://bnccompras.com/", status: "SEM API PÚBLICA CONFIRMADA", priority: 320, connector: null },
  { code: "LICITANET", name: "LICITANET", url: "https://licitanet.com.br/", status: "SEM API PÚBLICA CONFIRMADA", priority: 330, connector: null },
  { code: "BBMNET", name: "BBMNET", url: "https://www.bbmnet.com.br/", status: "API PARA PARCEIROS", priority: 340, connector: null },
  { code: "LICITACOES_E", name: "Licitações-e / Banco do Brasil", url: "https://licitacoes-e2.bb.com.br/", status: "API PARA PARCEIROS", priority: 350, connector: null },
  { code: "COMPRASNET_GO", name: "Comprasnet Goiás", url: "https://www.comprasnet.go.gov.br/", status: "SEM API PÚBLICA CONFIRMADA", priority: 360, connector: null },
  { code: "COMPRAS_MG", name: "Compras MG", url: "https://www.compras.mg.gov.br/", status: "SEM API PÚBLICA CONFIRMADA", priority: 370, connector: null },
  { code: "COMPRAS_SC", name: "Portal de Compras SC / WebLIC / e-LIC", url: "https://compras.sc.gov.br/", status: "SOMENTE CONSULTA WEB", priority: 375, connector: null },
  { code: "COMPRAS_DF", name: "Portal de Compras DF", url: "https://portal.compras.df.gov.br/", status: "SOMENTE CONSULTA WEB", priority: 376, connector: null },
  { code: "PE_INTEGRADO", name: "PE Integrado", url: "https://www.peintegrado.pe.gov.br/", status: "SOMENTE CONSULTA WEB", priority: 380, connector: null },
  { code: "COMPRAS_RS", name: "Compras RS", url: "https://www.compras.rs.gov.br/", status: "SEM API PÚBLICA CONFIRMADA", priority: 390, connector: null },
  { code: "COMPRAS_BR_SIGA", name: "ComprasBR / SIGA", url: "https://www.comprasbr.com.br/", status: "SEM API PÚBLICA CONFIRMADA", priority: 395, connector: null },
  { code: "LICITAR_DIGITAL", name: "Licitar Digital", url: "https://www.licitardigital.com.br/", status: "SEM API PÚBLICA CONFIRMADA", priority: 400, connector: null },
  { code: "COE_RS", name: "COE-RS", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 500, connector: null },
  { code: "SCPI", name: "SCPI", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 501, connector: null },
  { code: "COMPRA_ABERTA", name: "Compra Aberta", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 502, connector: null },
  { code: "BR_CONECTADO", name: "BR Conectado", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 503, connector: null },
  { code: "BOLSANET", name: "Bolsanet", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 504, connector: null },
  { code: "PREGAO_NET", name: "PregãoNET", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 505, connector: null },
  { code: "VA_SISTEMAS", name: "VA Sistemas", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 506, connector: null },
  { code: "LICITA_MAIS_BRASIL", name: "Licita Mais Brasil", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 507, connector: null },
  { code: "SELCORP", name: "Selcorp", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 508, connector: null },
  { code: "M2A_COMPRAS", name: "M2A Compras", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 509, connector: null },
  { code: "SMAR_PE", name: "SMAR PE", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 510, connector: null },
  { code: "EKRONOS", name: "eKronos", url: "https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras", status: "SEM API PÚBLICA CONFIRMADA", priority: 511, connector: null },
] as const;
