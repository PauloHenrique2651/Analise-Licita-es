"use client";

import { useEffect, useState } from "react";
import type { CityHeat, CityMetric } from "@/services/market-service";

type Geometry = { viewBox: string; cities: Array<{ id: string; d: string }> };
const cache = new Map<string, Geometry>();

export const CITY_METRICS: Record<CityMetric, { label: string; unit: string; format: (value: number) => string }> = {
  value: { label: "Valor", unit: "em valor de licitações", format: (value) => Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(value) },
  procurements: { label: "Licitações", unit: "em volume de licitações", format: (value) => `${Intl.NumberFormat("pt-BR").format(value)} licitações` },
  items: { label: "Itens", unit: "em quantidade de itens", format: (value) => `${Intl.NumberFormat("pt-BR").format(value)} itens` },
};

const valueOf = (city: CityHeat, metric: CityMetric) => metric === "value" ? city.value : metric === "items" ? city.items : city.procurements;

/** Mapa de calor dos municípios de um estado: o município que mais consome fica mais forte. */
export function MunicipalityMap({ uf, data, metric, selected, onSelect }: { uf: string; data: CityHeat[]; metric: CityMetric; selected?: string[]; onSelect: (ibge: string | undefined) => void }) {
  const [loaded, setLoaded] = useState<{ uf: string; geometry: Geometry } | null>(null);
  const [failedUf, setFailedUf] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has(uf)) return;
    const controller = new AbortController();
    fetch(`/maps/municipios/${uf}.json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("falha")))
      .then((payload: Geometry) => { cache.set(uf, payload); setLoaded({ uf, geometry: payload }); })
      .catch((error: Error) => { if (error.name !== "AbortError") setFailedUf(uf); });
    return () => controller.abort();
  }, [uf]);

  const geometry = cache.get(uf) ?? (loaded?.uf === uf ? loaded.geometry : null);
  const failed = failedUf === uf && !geometry;

  if (failed) return <div className="map-wrap"><p className="muted">Não foi possível carregar o mapa dos municípios. Use a lista de municípios acima.</p></div>;
  if (!geometry) return <div className="map-wrap"><p className="muted">Carregando municípios…</p></div>;

  const byId = new Map(data.map((city) => [city.ibge, city]));
  const max = Math.max(1, ...data.map((city) => valueOf(city, metric)));
  const { format, unit } = CITY_METRICS[metric];
  return (
    <div className="map-wrap">
      <svg className="brazil-map municipality-map" viewBox={geometry.viewBox} role="group" aria-label={`Mapa dos municípios de ${uf}`}>
        {geometry.cities.map((shape) => {
          const city = byId.get(shape.id);
          const value = city ? valueOf(city, metric) : 0;
          const isSelected = selected?.includes(shape.id) ?? false;
          // Raiz quadrada: sem ela a capital apaga todos os outros municípios
          const intensity = value > 0 ? Math.max(0.16, Math.sqrt(value / max)) : 0.04;
          return (
            <path key={shape.id} d={shape.d} className={isSelected ? "selected" : ""} style={{ "--state-intensity": intensity } as React.CSSProperties}
              onClick={() => onSelect(shape.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(shape.id); } }}
              tabIndex={0} role="button" aria-pressed={isSelected} aria-label={`${city?.name ?? shape.id}: ${format(value)}`}>
              <title>{`${city?.name ?? shape.id} — ${format(value)}`}</title>
            </path>
          );
        })}
      </svg>
      <div className="map-caption"><span>Menos {unit}</span><i /><span>Mais {unit}</span></div>
    </div>
  );
}
