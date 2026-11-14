"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const DETAIL_PARAM = "detalhe";

/** Link para a licitação: clique normal abre o painel lateral (?detalhe=id); Ctrl/Cmd/meio abre a página completa. */
export function DetailLink({ procurementId, className, children, ariaLabel }: { procurementId: string; className?: string; children: React.ReactNode; ariaLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set(DETAIL_PARAM, procurementId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return <Link href={`/app/licitacoes/${procurementId}`} className={className} onClick={onClick} aria-label={ariaLabel}>{children}</Link>;
}
