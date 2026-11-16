import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { COMPRAS_GOV_API_BASE_URL: "https://compras.test" } }));
const fetchJson = vi.fn();
vi.mock("@/lib/http", () => ({ fetchJson: (...args: unknown[]) => fetchJson(...args) }));

describe("Compras.gov: data final é exclusiva", () => {
  afterEach(() => fetchJson.mockReset());

  it("pede um dia a mais na data final para licitações (um dia = início D, final D+1)", async () => {
    fetchJson.mockResolvedValue({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    const { comprasGovConnector } = await import("./connector");
    await comprasGovConnector.fetchProcurements({ startDate: "2026-11-12", endDate: "2026-11-12", modalityCode: 6, page: 1, pageSize: 50 });
    const url = fetchJson.mock.calls[0][0] as URL;
    expect(url.searchParams.get("dataPublicacaoPncpInicial")).toBe("2026-11-12");
    expect(url.searchParams.get("dataPublicacaoPncpFinal")).toBe("2026-11-13");
  });

  it("vira o mês e o ano corretamente", async () => {
    fetchJson.mockResolvedValue({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    const { comprasGovConnector } = await import("./connector");
    await comprasGovConnector.fetchProcurements({ startDate: "2026-12-31", endDate: "2026-12-31", modalityCode: 6, page: 1, pageSize: 50 });
    expect((fetchJson.mock.calls[0][0] as URL).searchParams.get("dataPublicacaoPncpFinal")).toBe("2027-01-01");
  });

  it("o mesmo vale para resultados", async () => {
    fetchJson.mockResolvedValue({ resultado: [], totalRegistros: 0, totalPaginas: 0, paginasRestantes: 0 });
    const { fetchComprasGovResultPage } = await import("./connector");
    await fetchComprasGovResultPage({ startDate: "2026-11-05", endDate: "2026-11-05", page: 1, pageSize: 10 });
    expect((fetchJson.mock.calls[0][0] as URL).searchParams.get("dataResultadoPncpFinal")).toBe("2026-11-06");
  });
});
