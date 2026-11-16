import { describe, expect, it } from "vitest";
import { headKey, nicheFor } from "./product-grouping";

describe("headKey", () => {
  it("agrupa descrições diferentes do mesmo produto", () => {
    const a = headKey("FRALDA DESCARTÁVEL INFANTIL, TAMANHO XG, COM ALTO PODER DE ABSORÇÃO");
    const b = headKey("Fraldas descartáveis infantis tamanho M - pacote com 30 unidades");
    const c = headKey("Descartável fralda infantil: tamanho G");
    expect(a?.key).toBe(c?.key);
    expect(a?.key).toContain("fralda");
    expect(b?.key).not.toBe("");
  });
  it("ignora números, medidas e atributos depois de ':'", () => {
    expect(headKey("BROCA 10 MM PAREDE CURTA")?.key).toBe(headKey("Broca parede curta 8mm")?.key);
    expect(headKey("Arco Ortodôntico Intraoral material: cromo / níquel, formato: retangular")?.key).toBe(headKey("Arco ortodontico intraoral")?.key);
  });
  it("a ordem das palavras não importa", () => {
    expect(headKey("papel sulfite a4")?.key).toBe(headKey("sulfite papel A4")?.key);
  });
  it("não junta produtos diferentes", () => {
    expect(headKey("Caneta esferográfica azul")?.key).not.toBe(headKey("Caneta marca texto")?.key);
  });
  it("começo genérico usa o resto do texto e não junta produtos sem relação", () => {
    const a = headKey("Lote 07. Papel sulfite A4 branco 75g");
    const b = headKey("Lote 12. Detergente neutro 500ml");
    expect(a?.key).toContain("sulfite");
    expect(a?.key).not.toBe(b?.key);
    expect(headKey("Prestação de serviços de dedetização")?.key).toContain("dedetizacao");
    expect(headKey("Lote 07.")).toBeNull();
  });
  it("nome de uma palavra só usa os atributos para não juntar produtos diferentes", () => {
    const vassoura = headKey("CABO: EM MADEIRA, PARA RODO E VASSOURA, COM 1,20M DE COMPRIMENTO");
    const usb = headKey("Cabo: USB tipo C, 2 metros");
    expect(vassoura?.key).not.toBe(usb?.key);
    expect(vassoura?.key).toContain("madeira");
    expect(headKey("Cabo usb tipo c 1m")?.key).toBe(headKey("Cabo: USB tipo C, 2 metros")?.key);
  });
  it("devolve null quando só há ruído", () => {
    expect(headKey("12 mm - 5 kg")).toBeNull();
  });
  it("nome de exibição não grita em maiúsculas", () => {
    expect(headKey("LOCAÇÃO DE VEÍCULOS PADRÃO")?.name).toBe("Locação de veículos padrão");
  });
});

describe("nicheFor", () => {
  it("usa o grupo oficial do catálogo primeiro", () => {
    expect(nicheFor("tela metalica", "EQUIPAMENTOS E ARTIGOS PARA USO MÉDICO, DENTÁRIO E VETERINÁRIO", "material")).toBe("Saúde e hospitalar");
    expect(nicheFor("cadeira", "MOBILIÁRIOS", "material")).toBe("Mobiliário e utensílios");
    expect(nicheFor("x", "INFORMÁTICA - EQUIPAMENTOS, PEÇAS, ACESSÓRIOS E SUPRIMENTOSDE TIC", "material")).toBe("Informática e tecnologia");
  });
  it("classifica pelo texto quando não há catálogo", () => {
    expect(nicheFor("fralda descartavel infantil")).toBe("Saúde e hospitalar");
    expect(nicheFor("arroz tipo 1")).toBe("Alimentos e bebidas");
    expect(nicheFor("toner para impressora")).toBe("Informática e tecnologia");
    expect(nicheFor("detergente neutro")).toBe("Limpeza e higiene");
    expect(nicheFor("locacao de veiculos padrao")).toBe("Locação e transporte");
  });
  it("serviço não vira produto e produto não vira serviço", () => {
    expect(nicheFor("apresentacao artistica banda", null, "servico")).toBe("Eventos, comunicação e publicidade");
    expect(nicheFor("coisa qualquer", null, "servico")).toBe("Serviços gerais");
    expect(nicheFor("show de bola", null, "material")).not.toMatch(/^Serviços|Locação|Eventos/);
  });
  it("sem pista cai em Outros", () => {
    expect(nicheFor("objeto estranho xyz", null, "material")).toBe("Outros");
  });
});
