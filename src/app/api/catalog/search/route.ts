import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface CatalogSearchItem {
  kind: "material" | "servico";
  code: string;
  description: string;
  pdm_name: string | null;
  class_name: string | null;
  active: boolean;
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  const kindParam = request.nextUrl.searchParams.get("kind");
  const kind = kindParam === "material" || kindParam === "servico" ? kindParam : null;
  if (query.length < 2) return NextResponse.json({ data: [] });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sessão necessária." }, { status: 401 });

  const { data, error } = await supabase.rpc("search_catalog_items", { p_query: query, p_kind: kind, p_limit: 12 });
  if (error) return NextResponse.json({ message: "Falha ao consultar o catálogo." }, { status: 500 });
  return NextResponse.json({ data: (data ?? []) as CatalogSearchItem[] }, { headers: { "Cache-Control": "private, max-age=300" } });
}
