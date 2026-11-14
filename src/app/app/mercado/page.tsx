import { MarketDashboard } from "@/components/market/market-dashboard";
import { getMarketSummary } from "@/services/market-service";

export const metadata = { title: "Análise de mercado" };
export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const summary = await getMarketSummary();
  return <MarketDashboard initialSummary={summary} />;
}
