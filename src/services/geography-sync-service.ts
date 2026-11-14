import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ibgeProvider } from "@/providers/ibge-provider";

export async function syncIbgeGeography() {
  const [states, municipalities] = await Promise.all([ibgeProvider.getStates(), ibgeProvider.getMunicipalities()]);
  const client = createAdminClient();
  const stateRows = states.map((state) => ({ code: state.sigla, name: state.nome, region: state.regiao.nome, ibge_code: String(state.id) }));
  const { error: stateError } = await client.from("states").upsert(stateRows, { onConflict: "code" });
  if (stateError) throw stateError;

  let processed = 0;
  for (let index = 0; index < municipalities.length; index += 500) {
    const rows = municipalities.slice(index, index + 500).map((city) => ({
      ibge_code: String(city.id),
      state_code: city["regiao-imediata"]["regiao-intermediaria"].UF.sigla,
      name: city.nome,
    }));
    const { error } = await client.from("cities").upsert(rows, { onConflict: "ibge_code" });
    if (error) throw error;
    processed += rows.length;
  }
  return { states: stateRows.length, municipalities: processed, source: "IBGE" as const };
}
