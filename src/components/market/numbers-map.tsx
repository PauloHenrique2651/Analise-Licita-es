"use client";

import { useRouter } from "next/navigation";
import { BrazilMap } from "./brazil-map";

/** Mapa do painel em números: clicar em um estado recarrega a página já filtrada por ele. */
export function NumbersMap({ values, selected, hrefFor }: { values: Record<string, number>; selected?: string; hrefFor: Record<string, string> }) {
  const router = useRouter();
  return <BrazilMap selected={selected} values={values} onSelect={(uf) => router.push(hrefFor[uf ?? ""] ?? "/app/numeros")} />;
}
