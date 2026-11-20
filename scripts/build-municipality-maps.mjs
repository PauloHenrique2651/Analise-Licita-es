// Gera public/maps/municipios/{UF}.json (caminhos SVG por município) a partir da malha do IBGE.
// Uso: node scripts/build-municipality-maps.mjs   (precisa de internet; o resultado é versionado)
import { writeFileSync, mkdirSync } from "node:fs";

const UFS = { AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17 };
mkdirSync("public/maps/municipios", { recursive: true });

for (const [uf, code] of Object.entries(UFS)) {
  const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${code}?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima`;
  const geo = await (await fetch(url)).json();
  const rings = (geometry) => geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
  for (const feature of geo.features) for (const ring of rings(feature.geometry)) for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  const cos = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const scale = 1000 / ((maxLon - minLon) * cos);
  const height = Math.round((maxLat - minLat) * scale);
  const cities = geo.features.map((feature) => {
    let d = "";
    for (const ring of rings(feature.geometry)) {
      let last = "";
      ring.forEach(([lon, lat], index) => {
        const point = `${((lon - minLon) * cos * scale).toFixed(1)} ${((maxLat - lat) * scale).toFixed(1)}`;
        if (point === last) return;
        last = point;
        d += `${index === 0 ? "M" : "L"}${point}`;
      });
      d += "Z";
    }
    return { id: feature.properties.codarea, d };
  });
  writeFileSync(`public/maps/municipios/${uf}.json`, JSON.stringify({ viewBox: `0 0 1000 ${height}`, cities }));
  console.log(uf, cities.length, "municípios");
}
