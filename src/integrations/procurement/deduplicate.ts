import { createHash } from "node:crypto";
import { cleanNationalId, cleanText, normalizeDescription } from "./normalize";
import type { NormalizedProcurement } from "./types";

export type DeduplicationKeys = {
  canonical: string;
  pncpId?: string;
  sourceExternal: string;
  agencyPurchaseYear?: string;
  process?: string;
  agencyNotice?: string;
};

function keyPart(value?: string | number) {
  return value === undefined ? undefined : normalizeDescription(String(value));
}

export function getDeduplicationKeys(procurement: NormalizedProcurement): DeduplicationKeys {
  const pncpId = cleanText(procurement.pncpId);
  const agencyCnpj = cleanNationalId(procurement.agencyCnpj);
  const purchase = keyPart(procurement.purchaseNumber);
  const year = procurement.purchaseYear ?? procurement.publishedAt?.slice(0, 4);
  const process = keyPart(procurement.processNumber);
  const notice = keyPart(procurement.noticeNumber);
  const sourceExternal = `source:${procurement.source.toLowerCase()}:${procurement.externalId}`;
  const agencyPurchaseYear = agencyCnpj && purchase && year
    ? `purchase:${agencyCnpj}:${purchase}:${year}`
    : undefined;
  const processKey = process ? `process:${agencyCnpj ?? "unknown"}:${process}` : undefined;
  const agencyNotice = agencyCnpj && notice ? `notice:${agencyCnpj}:${notice}` : undefined;
  const fallback = createHash("sha256")
    .update([agencyCnpj, procurement.state, normalizeDescription(procurement.object), procurement.publishedAt?.slice(0, 10)].join("|"))
    .digest("hex")
    .slice(0, 32);

  return {
    canonical: pncpId ? `pncp:${pncpId}` : agencyPurchaseYear ?? processKey ?? agencyNotice ?? sourceExternal ?? `hash:${fallback}`,
    pncpId,
    sourceExternal,
    agencyPurchaseYear,
    process: processKey,
    agencyNotice,
  };
}
