import type { NormalizedProcurement, NormalizedProcurementItem } from "./types";

export function cleanDigits(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || undefined;
}

export function cleanNationalId(value?: string | null) {
  const identifier = value?.normalize("NFKC").replace(/[^0-9A-Za-z]/g, "").toUpperCase() ?? "";
  return identifier || undefined;
}

export function cleanText(value?: string | null) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || undefined;
}

export function normalizeDescription(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function isoDate(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function buildPncpPublicUrl(cnpj?: string, year?: number, sequence?: number) {
  const cleanCnpj = cleanNationalId(cnpj);
  if (!cleanCnpj || !year || !sequence) return undefined;
  return `https://pncp.gov.br/app/editais/${cleanCnpj}/${year}/${sequence}`;
}

export function buildSearchText(procurement: NormalizedProcurement, items = procurement.items) {
  return [
    procurement.object,
    procurement.description,
    procurement.agencyName,
    procurement.city,
    procurement.state,
    ...items.map((item) => item.description),
  ].filter(Boolean).join(" ").slice(0, 200_000);
}

export function normalizeItems(items: NormalizedProcurementItem[]) {
  const byNumber = new Map<string, NormalizedProcurementItem>();
  for (const item of items) {
    const key = String(item.itemNumber ?? item.externalId ?? normalizeDescription(item.description));
    if (!byNumber.has(key)) byNumber.set(key, item);
  }
  return [...byNumber.values()];
}
