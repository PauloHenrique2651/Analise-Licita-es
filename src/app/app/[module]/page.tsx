import { notFound } from "next/navigation";
import { EmptyModule } from "@/components/module/empty-module";
import { DataModule } from "@/components/module/data-module";
import { getAnalysisTable } from "@/services/analysis-service";

const modules: Record<string, { title: string; description: string; search?: string; label?: string }> = {
  dashboard: { title: "Dashboard executivo", description: "Visão consolidada dos indicadores do mercado analisado." },
  produtos: { title: "Inteligência de produtos", description: "Demanda, volume, frequência, preços e crescimento por produto.", search: "Descrição, CATMAT, CATSER, categoria, marca ou fabricante" },
  empresas: { title: "Análise de empresas", description: "Histórico de vencedores, atuação geográfica e desempenho por fornecedor.", search: "CNPJ, razão social ou nome fantasia" },
  concorrentes: { title: "Mapa da concorrência", description: "Compare empresas por produtos, estados, órgãos, marcas e evolução.", search: "Pesquise uma empresa concorrente" },
  precos: { title: "Inteligência de preços", description: "Mínimo, máximo, média, mediana e evolução dos preços vencedores.", search: "Produto, CATMAT ou CATSER" },
  orgaos: { title: "Inteligência de compradores", description: "Órgãos, recorrência, categorias e fornecedores vencedores.", search: "Nome, CNPJ ou unidade compradora" },
  estados: { title: "Mercado por estado", description: "Distribuição geográfica do valor, volume e concorrência." },
  licitacoes: { title: "Licitações", description: "Processos abertos, encerrados, desertos, fracassados e homologados.", search: "Objeto, número do processo, órgão ou produto", label: "OPORTUNIDADES" },
  pesquisa: { title: "Pesquisa global", description: "Identificação assistida de produtos, empresas, órgãos e processos.", search: "Papel A4, CNPJ, CATMAT ou Pregão 90021", label: "OPORTUNIDADES" },
  alertas: { title: "Alertas", description: "Monitore novos processos, produtos, órgãos, concorrentes e preços.", label: "OPORTUNIDADES" },
  favoritos: { title: "Favoritos", description: "Consultas, empresas, produtos e licitações salvos pelo seu time.", label: "OPORTUNIDADES" },
  oportunidades: { title: "Minhas oportunidades", description: "Oportunidades qualificadas com indicadores e origem dos dados.", label: "GESTÃO" },
  funil: { title: "Funil comercial", description: "Acompanhe cada processo da identificação à homologação.", label: "GESTÃO" },
  checklist: { title: "Checklist", description: "Pendências, documentos e marcos de cada processo.", label: "GESTÃO" },
  "minha-empresa": { title: "Minha empresa", description: "Dados cadastrais, perfil comercial e configurações do tenant.", label: "EMPRESA" },
};

const connectedModules = new Set(["produtos", "empresas", "concorrentes", "precos", "orgaos", "estados", "licitacoes", "pesquisa"]);

type ModuleSearchParams = { q?: string; uf?: string; city?: string; agency?: string; cnpj?: string; modality?: string; portal?: string; status?: string; from?: string; to?: string; proposalUntil?: string; minValue?: string; maxValue?: string; page?: string; dispute?: string; meEpp?: string; kind?: string; open?: string };

const MEEPP_VALUES = new Set(["exclusiva", "com_beneficio", "sem"]);

export default async function ModulePage({ params, searchParams }: { params: Promise<{ module: string }>; searchParams: Promise<ModuleSearchParams> }) {
  const { module } = await params;
  const definition = modules[module];
  if (!definition) notFound();
  if (connectedModules.has(module)) {
    const values = await searchParams;
    const { q = "" } = values;
    const filters = {
      state: values.uf,
      city: values.city,
      agency: values.agency,
      agencyCnpj: values.cnpj,
      modality: values.modality,
      portal: values.portal,
      status: values.status,
      publishedFrom: values.from,
      publishedTo: values.to,
      proposalUntil: values.proposalUntil,
      minValue: values.minValue ? Number(values.minValue) : undefined,
      maxValue: values.maxValue ? Number(values.maxValue) : undefined,
      disputeMode: values.dispute?.trim() ? values.dispute.trim().slice(0, 40) : undefined,
      meEpp: values.meEpp && MEEPP_VALUES.has(values.meEpp) ? values.meEpp as "exclusiva" | "com_beneficio" | "sem" : undefined,
      itemKind: values.kind === "material" || values.kind === "servico" ? (values.kind as "material" | "servico") : undefined,
      openOnly: values.open === "1",
    };
    const table = await getAnalysisTable(module, q, filters);
    const currentPage = Math.max(1, Number.parseInt(values.page ?? "1", 10) || 1);
    return <DataModule {...definition} query={q} table={table} filters={values} showProcurementFilters={module === "licitacoes" || module === "pesquisa"} showProductFilters={module === "produtos"} currentPage={currentPage} />;
  }
  return <EmptyModule {...definition} />;
}
