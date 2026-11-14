import "server-only";
import { env } from "@/lib/env";
import { csvRecords, SemicolonCsvStreamParser } from "./csv";
import { mapRjSigaItem, mapRjSigaProcurement } from "./mapper";

export type RjSigaSnapshot = {
  etag?: string;
  lastModified?: string;
  contentLength?: number;
};

async function request(url: string, method: "GET" | "HEAD", timeoutMs: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: method === "HEAD" ? "*/*" : "text/csv,application/octet-stream;q=0.9,*/*;q=0.1",
          "User-Agent": "NexoPublico/0.1 (contato: paulohenrique.cardoso2651@gmail.com)",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`RJ SIGA respondeu com HTTP ${response.status}.`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function getSnapshot(url: string): Promise<RjSigaSnapshot> {
  const response = await request(url, "HEAD", 20_000);
  const length = Number(response.headers.get("content-length"));
  return {
    etag: response.headers.get("etag") ?? undefined,
    lastModified: response.headers.get("last-modified") ?? undefined,
    contentLength: Number.isFinite(length) ? length : undefined,
  };
}

export function getRjSigaSnapshot() { return getSnapshot(env.RJ_SIGA_PROCUREMENTS_URL); }
export function getRjSigaItemsSnapshot() { return getSnapshot(env.RJ_SIGA_ITEMS_URL); }

export async function fetchRjSigaProcurements() {
  const response = await request(env.RJ_SIGA_PROCUREMENTS_URL, "GET", 90_000);
  const buffer = await response.arrayBuffer();
  const content = new TextDecoder("windows-1252").decode(buffer);
  const rows = csvRecords(content);
  if (!rows.length || !("ID Licitação" in rows[0])) {
    throw new Error("O CSV de licitações do RJ mudou de estrutura: cabeçalho obrigatório ausente.");
  }
  return rows.map((row) => mapRjSigaProcurement(row, env.RJ_SIGA_PROCUREMENTS_URL)).filter((row) => row !== null);
}

export async function* streamRjSigaItems() {
  const response = await request(env.RJ_SIGA_ITEMS_URL, "GET", 300_000);
  if (!response.body) throw new Error("A fonte RJ/SIGA não retornou o fluxo de itens.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("windows-1252");
  const parser = new SemicolonCsvStreamParser();
  let headers: string[] | undefined;

  const consume = function* (rows: string[][]) {
    for (const values of rows) {
      if (!headers) {
        headers = values.map((header) => header.replace(/^\uFEFF/, "").trim());
        if (!headers.includes("ID Licitação") || !headers.includes("Descrição")) throw new Error("O CSV de itens do RJ mudou de estrutura.");
        continue;
      }
      const raw = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
      const mapped = mapRjSigaItem(raw);
      if (mapped) yield mapped;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    yield* consume(parser.push(decoder.decode(value, { stream: true })));
  }
  yield* consume(parser.push(decoder.decode()));
  yield* consume(parser.finish());
}
