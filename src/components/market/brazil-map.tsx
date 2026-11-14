"use client";

import brazil from "@svg-maps/brazil";

type MapProps = {
  selected?: string;
  values?: Record<string, number>;
  onSelect: (uf: string | undefined) => void;
};

export function BrazilMap({ selected, values = {}, onSelect }: MapProps) {
  const max = Math.max(1, ...Object.values(values));
  const locations = brazil.locations as Array<{ id: string; name: string; path: string }>;
  return (
    <div className="map-wrap">
      <svg className="brazil-map" viewBox={brazil.viewBox} role="group" aria-label="Mapa interativo do Brasil por estado">
        {locations.map((location) => {
          const uf = location.id.toUpperCase();
          const intensity = Math.max(0.12, (values[uf] ?? 0) / max);
          const isSelected = selected === uf;
          return (
            <path
              key={location.id}
              d={location.path}
              className={isSelected ? "selected" : ""}
              style={{ "--state-intensity": intensity } as React.CSSProperties}
              onClick={() => onSelect(isSelected ? undefined : uf)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelect(isSelected ? undefined : uf);
              }}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              aria-label={`${location.name}: ${values[uf] ?? 0} registros analisados`}
            >
              <title>{`${location.name} — ${values[uf] ?? 0} registros analisados`}</title>
            </path>
          );
        })}
      </svg>
      <div className="map-caption"><span>Menor volume</span><i /><span>Maior volume</span></div>
    </div>
  );
}
