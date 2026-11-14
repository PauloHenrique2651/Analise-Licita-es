import { z } from "zod";
import { cleanText, normalizeDescription } from "../normalize";
import type { NormalizedProcurement, NormalizedProcurementItem } from "../types";

const rowSchema = z.record(z.string(), z.string());

function normalizedKeys(row: Record<string, string>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeDescription(key), value]));
}

function brDate(value?: string) {
  if (!value) return undefined;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!match) return undefined;
  const [, day, month, year, hour = "00", minute = "00", second = "00"] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function brNumber(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function mapRjSigaProcurement(raw: Record<string, string>, endpoint: string): NormalizedProcurement | null {
  const validated = rowSchema.parse(raw);
  const row = normalizedKeys(validated);
  const externalId = cleanText(row["id licitacao"]);
  const object = cleanText(row.objeto);
  if (!externalId || !object) return null;

  const publishedAt = brDate(row["data hora da publicacao"]);
  const extractionDate = brDate(row["data extracao"]);
  const purchaseNumber = cleanText(row.licitacao);
  const processNumber = cleanText(row.processos);
  const agencyName = cleanText(row.unidade);

  return {
    externalId,
    source: "RJ_DADOS_ABERTOS_SIGA",
    sourcePortalName: "RJ Dados Abertos / SIGA",
    sourceUrl: `https://www.compras.rj.gov.br/EditaisLicitacoes/detalhar.action?idLic=${encodeURIComponent(externalId)}`,
    sourceEndpoint: endpoint,
    purchaseNumber,
    purchaseYear: publishedAt ? Number(publishedAt.slice(0, 4)) : undefined,
    processNumber,
    noticeNumber: purchaseNumber,
    object,
    description: object,
    modality: cleanText(row.modalidade),
    status: cleanText(row.status),
    agencyName,
    unitName: agencyName,
    state: "RJ",
    publishedAt,
    proposalEndAt: brDate(row["data hora limite de proposta"]),
    openingAt: brDate(row["data hora abertura de sessao"]),
    sourceUpdatedAt: extractionDate,
    estimatedValue: brNumber(row["valor total estimado r"]),
    homologatedValue: brNumber(row["valor total homologado r"]),
    items: [],
    rawData: validated,
  };
}

export const rjSigaMapperInternals = { brDate, brNumber };

export function mapRjSigaItem(raw: Record<string, string>) {
  const validated = rowSchema.parse(raw);
  const row = normalizedKeys(validated);
  const procurementExternalId = cleanText(row["id licitacao"]);
  const description = cleanText(row.descricao);
  const itemLabel = cleanText(row["itens lotes"]);
  const itemNumber = itemLabel ? Number(itemLabel.match(/\d+/)?.[0]) : undefined;
  if (!procurementExternalId || !description || !Number.isInteger(itemNumber)) return null;
  const itemId = cleanText(row["id item"]);
  const catalogCode = description.match(/C[oó]digo do Item:\s*([\d.]+)/i)?.[1];
  const homologatedTotalValue = brNumber(row["valor total homologado r"]);
  const item: NormalizedProcurementItem = {
    externalId: `${procurementExternalId}:${itemId ?? itemNumber}:${itemNumber}`,
    itemNumber,
    description,
    materialCode: catalogCode ?? itemId,
    quantity: brNumber(row.quantidade),
    status: cleanText(row["situacao item"]),
    homologatedTotalValue,
    rawData: validated,
  };
  return { procurementExternalId, item };
}
