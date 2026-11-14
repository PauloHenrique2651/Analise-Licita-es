import { describe, expect, it } from "vitest";
import { getDeduplicationKeys } from "./deduplicate";
import { normalizeDescription, normalizeItems } from "./normalize";
import type { NormalizedProcurement } from "./types";

function procurement(overrides: Partial<NormalizedProcurement> = {}): NormalizedProcurement {
  return {
    externalId: "compra-1",
    source: "PNCP",
    sourcePortalName: "PNCP",
    sourceEndpoint: "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao",
    object: "Aquisição de EPIs",
    items: [],
    rawData: {},
    ...overrides,
  };
}

describe("normalização de licitações", () => {
  it("prioriza o identificador PNCP na deduplicação entre fontes", () => {
    const pncp = getDeduplicationKeys(procurement({ pncpId: "12345678901234-1-000001/2026" }));
    const compras = getDeduplicationKeys(procurement({ source: "COMPRAS_GOV", externalId: "outro-id", pncpId: "12345678901234-1-000001/2026" }));
    expect(pncp.canonical).toBe(compras.canonical);
  });

  it("usa órgão, número e ano quando o PNCP não existe", () => {
    const keys = getDeduplicationKeys(procurement({ agencyCnpj: "12.345.678/0001-90", purchaseNumber: "90021", purchaseYear: 2026 }));
    expect(keys.canonical).toBe("purchase:12345678000190:90021:2026");
  });

  it("normaliza acentos e remove itens repetidos", () => {
    expect(normalizeDescription("  Luva Nitrílica — CA  123 ")).toBe("luva nitrilica ca 123");
    expect(normalizeItems([
      { itemNumber: 1, description: "Luva", rawData: {} },
      { itemNumber: 1, description: "Luva duplicada", rawData: {} },
    ])).toHaveLength(1);
  });
});
