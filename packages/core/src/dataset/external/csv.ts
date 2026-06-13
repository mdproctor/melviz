export interface CsvParseOptions {
  readonly delimiter?: string;
  readonly hasHeader?: boolean;
  readonly quote?: string;
}

export interface CsvParseResult {
  readonly headers: string[];
  readonly rows: string[][];
}

export function parseCsv(raw: string, options?: CsvParseOptions): CsvParseResult {
  const delimiter = options?.delimiter ?? ",";
  const hasHeader = options?.hasHeader ?? true;
  const quote = options?.quote ?? '"';

  const allRows = parseRows(raw, delimiter, quote);

  if (hasHeader) {
    const headerRow = allRows[0] ?? [];
    const dataRows = allRows.slice(1);
    return { headers: headerRow, rows: dataRows };
  }

  const maxCols = allRows.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = Array.from({ length: maxCols }, (_, i) => `Column ${i}`);
  return { headers, rows: allRows };
}

function parseRows(raw: string, delimiter: string, quote: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = raw.length;

  while (i < len) {
    // Skip empty lines
    if (raw[i] === "\n") {
      i++;
      continue;
    }
    if (raw[i] === "\r" && i + 1 < len && raw[i + 1] === "\n") {
      i += 2;
      continue;
    }

    const { fields, nextIndex } = parseRow(raw, i, delimiter, quote);
    rows.push(fields);
    i = nextIndex;
  }

  return rows;
}

function parseRow(
  raw: string,
  start: number,
  delimiter: string,
  quote: string,
): { fields: string[]; nextIndex: number } {
  const fields: string[] = [];
  let i = start;
  const len = raw.length;

  while (true) {
    const { value, nextIndex } = parseField(raw, i, delimiter, quote);
    fields.push(value);
    i = nextIndex;

    if (i >= len) {
      break;
    }

    if (raw[i] === delimiter) {
      i += delimiter.length;
      // If delimiter is at end of input or immediately before a line ending,
      // we still need to capture the empty field after it
      if (i >= len || raw[i] === "\n" || (raw[i] === "\r" && i + 1 < len && raw[i + 1] === "\n")) {
        fields.push("");
        break;
      }
      continue;
    }

    // Line ending — consume it and stop
    if (raw[i] === "\r" && i + 1 < len && raw[i + 1] === "\n") {
      i += 2;
    } else if (raw[i] === "\n") {
      i++;
    }
    break;
  }

  return { fields, nextIndex: i };
}

function parseField(
  raw: string,
  start: number,
  delimiter: string,
  quote: string,
): { value: string; nextIndex: number } {
  const len = raw.length;

  if (start >= len) {
    return { value: "", nextIndex: start };
  }

  // Quoted field
  if (raw[start] === quote) {
    let i = start + 1;
    let value = "";

    while (i < len) {
      if (raw[i] === quote) {
        // Escaped quote (doubled)
        if (i + 1 < len && raw[i + 1] === quote) {
          value += quote;
          i += 2;
        } else {
          // End of quoted field
          i++;
          return { value, nextIndex: i };
        }
      } else {
        value += raw[i]!;
        i++;
      }
    }

    // Unterminated quote — return what we have
    return { value, nextIndex: i };
  }

  // Unquoted field — read until delimiter or line ending
  let i = start;
  let value = "";

  while (i < len) {
    if (raw.startsWith(delimiter, i)) {
      break;
    }
    if (raw[i] === "\n" || raw[i] === "\r") {
      break;
    }
    value += raw[i]!;
    i++;
  }

  return { value, nextIndex: i };
}
