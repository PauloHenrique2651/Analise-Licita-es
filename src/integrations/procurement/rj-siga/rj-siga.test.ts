import { describe, expect, it } from "vitest";
import { csvRecords, parseSemicolonCsv, SemicolonCsvStreamParser } from "./csv";
import { mapRjSigaItem, mapRjSigaProcurement, rjSigaMapperInternals } from "./mapper";

describe("RJ SIGA CSV", () => {
  it("preserva ponto e vírgula e aspas dentro de campos", () => {
    expect(parseSemicolonCsv('A;B\r\n1;"texto; com ""aspas"""\r\n')).toEqual([
      ["A", "B"],
      ["1", 'texto; com "aspas"'],
    ]);
    expect(csvRecords("A;B\n1;2")).toEqual([{ A: "1", B: "2" }]);
  });

  it("mantém aspas quando o CSV chega dividido em blocos", () => {
    const parser = new SemicolonCsvStreamParser();
    expect([...parser.push('A;B\r\n1;"texto"'), ...parser.push('" citado"\r\n'), ...parser.finish()]).toEqual([
      ["A", "B"], ["1", 'texto" citado'],
    ]);
  });

  it("normaliza uma licitação real no formato publicado", () => {
    const record = mapRjSigaProcurement({
      "ID Licitação": "1707",
      "Licitação": "PE 046/11",
      "Unidade": "PCERJ - POLÍCIA CIVIL DO ESTADO DO RIO DE JANEIRO",
      "Objeto": "Aquisição de seladora",
      "Modalidade": "Pregão Eletrônico - Lei 8.666",
      "Data/hora da Publicação": "19/05/2011 15:00:00",
      "Data/Hora Limite de Proposta": "06/06/2011 11:30:00",
      "Data/Hora Abertura de Sessão": "06/06/2011 11:31:00",
      "Status": "Homologado",
      "Valor Total Homologado (R$)": "8.889,99",
      "Valor Total Estimado (R$)": "13556,669",
      "Processos": "E-09/198/1704/2010",
      "Data_extracao": "03/09/2026",
    }, "https://example.test/LICITACOES.CSV");

    expect(record).toMatchObject({
      externalId: "1707",
      source: "RJ_DADOS_ABERTOS_SIGA",
      state: "RJ",
      purchaseYear: 2011,
      estimatedValue: 13556.669,
      homologatedValue: 8889.99,
      processNumber: "E-09/198/1704/2010",
      sourceUpdatedAt: "2026-09-03T03:00:00.000Z",
    });
  });

  it("interpreta datas e números brasileiros sem inventar valores", () => {
    expect(rjSigaMapperInternals.brDate("31/01/2026")).toBe("2026-01-31T03:00:00.000Z");
    expect(rjSigaMapperInternals.brDate("não disponível")).toBeUndefined();
    expect(rjSigaMapperInternals.brNumber("1.234,56")).toBe(1234.56);
    expect(rjSigaMapperInternals.brNumber("")).toBeUndefined();
  });

  it("mapeia item/lote com valor homologado separado do estimado", () => {
    const mapped = mapRjSigaItem({ "ID Licitação": "37308", "Itens/Lotes": "Item: 2", "ID Item": "172907", "Descrição": "SERVIÇO - Código do Item:0326.020.0072", "Quantidade": "3", "Valor total Homologado (R$)": "1.234,56", "situacao_item": "Homologado" });
    expect(mapped).toMatchObject({ procurementExternalId: "37308", item: { itemNumber: 2, materialCode: "0326.020.0072", quantity: 3, homologatedTotalValue: 1234.56 } });
  });
});
