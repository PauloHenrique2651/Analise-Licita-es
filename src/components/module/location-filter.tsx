"use client";

import { useEffect, useState } from "react";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
type City = { ibge: string; name: string };

/** Estado + município (código IBGE). O município só carrega depois de escolher o estado. */
export function LocationFilter({ initialUf = "", initialCity = "" }: { initialUf?: string; initialCity?: string }) {
  const [uf, setUf] = useState(UFS.includes(initialUf.toUpperCase()) ? initialUf.toUpperCase() : "");
  const [city, setCity] = useState(initialCity);
  const [loaded, setLoaded] = useState<{ uf: string; cities: City[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uf) return;
    let cancelled = false;
    fetch(`/api/cities?uf=${uf}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("falha")))
      .then((payload: { data: City[] }) => { if (!cancelled) { setLoaded({ uf, cities: payload.data }); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [uf]);

  const cities = loaded && loaded.uf === uf ? loaded.cities : [];
  const loading = Boolean(uf) && !failed && !(loaded && loaded.uf === uf);
  return <>
    <select name="uf" aria-label="Estado" value={uf} onChange={(event) => { setUf(event.target.value); setCity(""); setFailed(false); }}>
      <option value="">Todos os estados</option>
      {UFS.map((code) => <option key={code} value={code}>{code}</option>)}
    </select>
    <select name="municipio" aria-label="Município" value={city} onChange={(event) => setCity(event.target.value)} disabled={!uf || loading}>
      <option value="">{!uf ? "Município (escolha o estado)" : loading ? "Carregando municípios…" : failed ? "Não foi possível carregar" : "Todos os municípios"}</option>
      {cities.map((item) => <option key={item.ibge} value={item.ibge}>{item.name}</option>)}
    </select>
  </>;
}
