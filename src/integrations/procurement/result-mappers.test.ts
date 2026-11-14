import { describe, expect, it } from "vitest";
import { mapComprasGovResult } from "./compras-gov/mapper";
import { comprasGovResultSchema } from "./compras-gov/schemas";
import { mapPncpResult } from "./pncp/mapper";
import { pncpResultSchema } from "./pncp/schemas";

describe("normalização de resultados homologados", () => {
  it("preserva fornecedor, valores e situação do PNCP", () => {
    const dto = pncpResultSchema.parse({
      numeroItem: 4,
      sequencialResultado: 1,
      quantidadeHomologada: 20,
      valorUnitarioHomologado: 12.5,
      valorTotalHomologado: 250,
      niFornecedor: "12.345.678/0001-90",
      nomeRazaoSocialFornecedor: "Fornecedor Brasil Ltda",
      situacaoCompraItemResultadoId: 1,
      situacaoCompraItemResultadoNome: "Informado",
      dataResultado: "2026-09-03",
    });
    expect(mapPncpResult(dto, "12345678000190-1-000004/2026", "https://pncp.test/resultados")).toMatchObject({
      itemNumber: 4,
      supplierDocument: "12345678000190",
      supplierName: "Fornecedor Brasil Ltda",
      unitValue: 12.5,
      totalValue: 250,
      winner: true,
    });
  });

  it("não considera resultado cancelado como vitória", () => {
    const dto = comprasGovResultSchema.parse({
      idCompraItem: "item-1",
      idCompra: "compra-1",
      idContratacaoPNCP: "12345678000190-1-000004/2026",
      numeroItemPncp: 1,
      sequencialResultado: 2,
      niFornecedor: "12345678000190",
      nomeRazaoSocialFornecedor: "Fornecedor Brasil Ltda",
      situacaoCompraItemResultadoId: 2,
      situacaoCompraItemResultadoNome: "Cancelado",
      dataCancelamentoPncp: "2026-09-04T10:00:00Z",
    });
    expect(mapComprasGovResult(dto, "https://compras.test/resultados")).toMatchObject({
      itemNumber: 1,
      statusCode: 2,
      winner: false,
    });
  });

  it("aceita identificador nacional alfanumérico publicado pela fonte", () => {
    const dto = pncpResultSchema.parse({
      numeroItem: 1,
      sequencialResultado: 1,
      niFornecedor: "12.ABC.678/0001-90",
      nomeRazaoSocialFornecedor: "Fornecedor Futuro",
      situacaoCompraItemResultadoId: 1,
    });
    expect(mapPncpResult(dto, "controle", "https://pncp.test/resultados").supplierDocument).toBe("12ABC678000190");
  });
});
