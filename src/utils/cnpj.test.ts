import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "./cnpj";

describe("CNPJ", () => {
  it("normaliza e formata", () => {
    expect(normalizeCnpj("19.131.243/0001-97")).toBe("19131243000197");
    expect(formatCnpj("19131243000197")).toBe("19.131.243/0001-97");
  });

  it("valida dígitos verificadores", () => {
    expect(isValidCnpj("19.131.243/0001-97")).toBe(true);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
    expect(isValidCnpj("19.131.243/0001-98")).toBe(false);
  });
});
