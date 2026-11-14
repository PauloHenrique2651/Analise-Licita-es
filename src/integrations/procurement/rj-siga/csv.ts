export function parseSemicolonCsv(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ";" && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  return rows;
}

export function csvRecords(content: string) {
  const [headers, ...rows] = parseSemicolonCsv(content);
  if (!headers) return [];
  const cleanHeaders = headers.map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.map((values) => Object.fromEntries(cleanHeaders.map((header, index) => [header, values[index]?.trim() ?? ""])));
}

export class SemicolonCsvStreamParser {
  private row: string[] = [];
  private field = "";
  private quoted = false;
  private pendingQuote = false;

  push(content: string) {
    const rows: string[][] = [];
    let index = 0;
    if (this.pendingQuote) {
      if (content[0] === '"') {
        this.field += '"';
        index = 1;
      } else {
        this.quoted = false;
      }
      this.pendingQuote = false;
    }

    for (; index < content.length; index += 1) {
      const character = content[index];
      if (character === '"') {
        if (!this.quoted) this.quoted = true;
        else if (index + 1 === content.length) this.pendingQuote = true;
        else if (content[index + 1] === '"') {
          this.field += '"';
          index += 1;
        } else this.quoted = false;
      } else if (character === ";" && !this.quoted) {
        this.row.push(this.field);
        this.field = "";
      } else if ((character === "\n" || character === "\r") && !this.quoted) {
        if (character === "\r" && content[index + 1] === "\n") index += 1;
        this.row.push(this.field);
        if (this.row.some((value) => value.length > 0)) rows.push(this.row);
        this.row = [];
        this.field = "";
      } else this.field += character;
    }
    return rows;
  }

  finish() {
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.quoted = false;
    }
    if (this.field.length === 0 && this.row.length === 0) return [];
    this.row.push(this.field);
    const result = this.row.some((value) => value.length > 0) ? [this.row] : [];
    this.row = [];
    this.field = "";
    return result;
  }
}
