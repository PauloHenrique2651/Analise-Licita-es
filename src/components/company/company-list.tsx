"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCnpj } from "@/utils/cnpj";

export type CompanyRow = { id: string; cnpj: string; legalName: string; tradeName: string | null; state: string | null; city: string | null };

/** Empresas (CNPJs) cadastradas na conta. Cada negócio pode ser ligado a uma delas. */
export function CompanyList({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(company: CompanyRow) {
    if (!window.confirm(`Remover ${company.tradeName || company.legalName}? Os negócios ligados a ela continuam, mas ficam sem empresa.`)) return;
    setPending(company.id); setError(null);
    try {
      const { error: deleteError } = await createClient().from("companies").delete().eq("id", company.id);
      if (deleteError) throw deleteError;
      router.refresh();
    } catch { setError("Não foi possível remover. Só o responsável ou administrador da conta pode remover empresas."); } finally { setPending(null); }
  }

  if (companies.length === 0) return null;
  return <section className="panel" aria-label="Empresas cadastradas">
    <div className="panel-head"><div><p className="panel-title">Empresas cadastradas</p><small>{companies.length} {companies.length === 1 ? "empresa" : "empresas"} nesta conta. Você pode cadastrar mais de uma e ligar cada negócio a uma delas.</small></div></div>
    <div className="company-list" style={{ padding: "0 16px 16px" }}>
      {error && <div className="field-error" role="alert">{error}</div>}
      {companies.map((company) => <article className="company-card" key={company.id}>
        <div><strong><Building2 aria-hidden="true" style={{ width: 14, marginRight: 6, verticalAlign: "-2px" }} />{company.tradeName || company.legalName}</strong>
          <span>{company.legalName} · CNPJ {formatCnpj(company.cnpj)}{company.city && company.state ? ` · ${company.city}/${company.state}` : company.state ? ` · ${company.state}` : ""}</span></div>
        <button type="button" className="icon-button danger" aria-label={`Remover ${company.tradeName || company.legalName}`} disabled={pending === company.id} onClick={() => void remove(company)}><Trash2 aria-hidden="true" /></button>
      </article>)}
    </div>
  </section>;
}
