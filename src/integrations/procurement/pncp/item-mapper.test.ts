import { describe, expect, it } from "vitest";
import { mapPncpItem } from "./mapper";
import { pncpItemSchema } from "./schemas";

describe("mapPncpItem", () => {
  it("usa catalogoCodigoItem como código CATMAT do material", () => {
    const item = pncpItemSchema.parse({ numeroItem: 1, materialOuServico: "M", descricao: "Papel A4", catalogoCodigoItem: "218747", itemClassificacaoCatalogo: "1" });
    const mapped = mapPncpItem(item, "123-1-000001/2026");
    expect(mapped.materialCode).toBe("218747");
    expect(mapped.serviceCode).toBeUndefined();
  });

  it("aceita código numérico para serviços", () => {
    const item = pncpItemSchema.parse({ numeroItem: 2, materialOuServico: "S", descricao: "Limpeza predial", catalogoCodigoItem: 15750 });
    expect(mapPncpItem(item, "123-1-000001/2026").serviceCode).toBe("15750");
  });
});
