import {
  BarChart3, Building2, CalendarClock, CalendarDays, CircleDollarSign, FileSearch, Gavel, Heart, Landmark,
  LayoutDashboard, Map, MapPinned, MessageSquareText, PackageSearch, ReceiptText, Scale, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Swords, Target, Users, Workflow, type LucideIcon,
} from "lucide-react";

export interface NavItem { label: string; href: string; icon: LucideIcon; description: string }
export interface NavGroup { label: string; items: NavItem[] }

/** Navegação principal (menu superior no desktop e gaveta no celular). */
export const NAV_GROUPS: NavGroup[] = [
  { label: "Oportunidades", items: [
    { label: "Hoje", href: "/app/hoje", icon: CalendarClock, description: "Publicadas hoje, abertas e encerrando em 24 h" },
    { label: "Licitações", href: "/app/licitacoes", icon: Gavel, description: "Busca com UF, valor, disputa e ME/EPP" },
    { label: "Pesquisa global", href: "/app/pesquisa", icon: Search, description: "Produto, órgão, CNPJ ou número do processo" },
    { label: "Alertas", href: "/app/alertas", icon: Target, description: "Filtros salvos para acompanhar todo dia" },
    { label: "Favoritos", href: "/app/favoritos", icon: Heart, description: "Licitações e consultas marcadas pelo time" },
    { label: "Órgãos", href: "/app/orgaos", icon: Landmark, description: "Quem compra, quanto e com que frequência" },
  ]},
  { label: "Negócios", items: [
    { label: "Minhas oportunidades", href: "/app/oportunidades", icon: FileSearch, description: "Licitações que sua empresa decidiu acompanhar" },
    { label: "Funil", href: "/app/funil", icon: Workflow, description: "Etapas da identificação ao contrato" },
    { label: "Checklist", href: "/app/checklist", icon: ShieldCheck, description: "Pendências e documentos de cada processo" },
    { label: "Agenda", href: "/app/agenda", icon: CalendarDays, description: "Prazos de proposta, abertura e disputa" },
    { label: "Portal do cliente", href: "/app/clientes", icon: MessageSquareText, description: "Links temporários, chat e pedidos de documento" },
  ]},
  { label: "Análise", items: [
    { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, description: "Visão consolidada dos indicadores" },
    { label: "Mercado", href: "/app/mercado", icon: BarChart3, description: "Volume, evolução e mapa das compras públicas" },
    { label: "Produtos", href: "/app/produtos", icon: PackageSearch, description: "Demanda e preço por produto" },
    { label: "Preços", href: "/app/precos", icon: CircleDollarSign, description: "Histórico de preços vencedores" },
    { label: "Preços por região", href: "/app/precos-regionais", icon: MapPinned, description: "Preço por estado, município e unidade" },
    { label: "Empresas", href: "/app/empresas", icon: Building2, description: "Desempenho e atuação de fornecedores" },
    { label: "Concorrentes", href: "/app/concorrentes", icon: Users, description: "Vitórias, valores e estados de cada rival" },
    { label: "Estados", href: "/app/estados", icon: Map, description: "Distribuição geográfica do mercado" },
  ]},
  { label: "Disputa", items: [
    { label: "Copiloto de disputa", href: "/app/disputa", icon: Swords, description: "Piso, próximo lance e a hora de parar" },
  ]},
  { label: "Jurídico", items: [
    { label: "Peças jurídicas", href: "/app/juridico", icon: Scale, description: "Impugnação, esclarecimento e recursos" },
  ]},
];

/** Itens da empresa e da administração (menu da conta). */
export const ACCOUNT_LINKS: NavItem[] = [
  { label: "Minha empresa", href: "/app/minha-empresa", icon: Building2, description: "Dados e configurações da empresa" },
  { label: "Cadastro por CNPJ", href: "/app/cadastro", icon: SlidersHorizontal, description: "Importar dados oficiais da empresa" },
  { label: "Emissão fiscal", href: "/app/fiscal", icon: ReceiptText, description: "Autorizações e fila de emissão" },
  { label: "Administração", href: "/app/admin", icon: Settings2, description: "Sincronização e saúde das fontes" },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
