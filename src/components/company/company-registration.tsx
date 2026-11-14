"use client";

import { useState } from "react";
import { Building2, Check, LoaderCircle, Search } from "lucide-react";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/utils/cnpj";

type CompanyResult = {
  cnpj: string; legalName: string; tradeName: string | null; status: string | null; size: string | null;
  legalNature: string | null; address: { street: string | null; number: string | null; city: string | null; state: string | null; zipCode: string | null };
  primaryActivity: { code: number; description: string | null } | null;
};

export function CompanyRegistration() {
  const [cnpj, setCnpj] = useState("");
  const [result, setResult] = useState<CompanyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault(); setError(null); setResult(null); setSaved(false);
    if (!isValidCnpj(cnpj)) { setError("Informe um CNPJ válido, incluindo os dígitos verificadores."); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/companies/lookup?cnpj=${normalizeCnpj(cnpj)}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message);
      setResult(payload.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível consultar o CNPJ."); }
    finally { setLoading(false); }
  }

  async function save() {
    if (!result) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnpj: result.cnpj }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível salvar.");
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a empresa.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <form className="cnpj-lookup" onSubmit={lookup}><div className="field"><label htmlFor="cnpj">CNPJ</label><div className="lookup-row"><input id="cnpj" inputMode="numeric" autoComplete="off" value={cnpj} onChange={(event) => setCnpj(event.target.value)} placeholder="00.000.000/0000-00" aria-describedby={error ? "cnpj-error" : undefined} /><button className="button primary" disabled={loading}>{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Search aria-hidden="true" />}{loading ? "Consultando…" : "Consultar"}</button></div>{error && <p className="field-error" id="cnpj-error" role="alert">{error}</p>}<small>Consulta cadastral segura em fontes oficiais e complementares. Confira os dados antes de salvar.</small></div></form>
    {result && <section className="company-result" aria-live="polite"><div className="result-head"><div className="company-icon"><Building2 aria-hidden="true" /></div><div><p className="eyebrow">DADOS ENCONTRADOS</p><h2>{result.legalName}</h2><p>{result.tradeName || "Nome fantasia não disponível na fonte"}</p></div><span className="status-badge"><Check aria-hidden="true" />{result.status || "Situação não disponível"}</span></div><div className="detail-grid"><div><small>CNPJ</small><strong>{formatCnpj(result.cnpj)}</strong></div><div><small>Porte</small><strong>{result.size || "Não disponível"}</strong></div><div><small>Natureza jurídica</small><strong>{result.legalNature || "Não disponível"}</strong></div><div><small>Atividade principal</small><strong>{result.primaryActivity?.description || "Não disponível"}</strong></div><div className="span-2"><small>Endereço</small><strong>{[result.address.street, result.address.number, result.address.city, result.address.state].filter(Boolean).join(", ") || "Não disponível"}</strong></div></div><div className="result-actions"><p>{saved ? "Empresa salva no tenant ativo." : "Confira os dados antes de salvar no tenant."}</p><button className="button primary" disabled={saving || saved} onClick={save} type="button">{saving ? <LoaderCircle className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{saving ? "Salvando…" : saved ? "Empresa salva" : "Salvar empresa"}</button></div></section>}
  </>;
}
