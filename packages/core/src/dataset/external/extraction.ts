import type { Column, ColumnId, ColumnType as ColumnTypeEnum, DataSet } from "../types.js";
import { ColumnType } from "../types.js";
import { DataSetError } from "../errors.js";
import { toTypedDataSet } from "../conversion.js";
import { parseCsv } from "./csv.js";
import { parseMetrics } from "./metrics-parser.js";
import { compileOrCached } from "../../expression/jsonata-bridge.js";
import type {
  FetchResult,
  ExtractionResult,
  PresetRegistry,
  ExternalDataSetDef,
  ExternalColumnDef,
} from "./types.js";

// ---------------------------------------------------------------------------
// ISO 8601 date detection (subset: YYYY-MM-DD with optional time/zone)
// ---------------------------------------------------------------------------

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function looksLikeIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

// ---------------------------------------------------------------------------
// Stage 1: Parse — raw data to structured JS value
// ---------------------------------------------------------------------------

const PROMETHEUS_LINE_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*(?:\{[^}]*\})?\s+[\d.eE+\-NnaI]+/m;

function looksLikePrometheusApi(data: unknown): boolean {
  if (data === null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (obj["status"] !== "success" || typeof obj["data"] !== "object" || obj["data"] === null) return false;
  const inner = obj["data"] as Record<string, unknown>;
  return typeof inner["resultType"] === "string" && Array.isArray(inner["result"]);
}

function looksLikePrometheus(raw: string): boolean {
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    return PROMETHEUS_LINE_RE.test(trimmed);
  }
  return false;
}

function urlExtension(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf(".");
    if (dot === -1) return undefined;
    return pathname.slice(dot).toLowerCase();
  } catch {
    return undefined;
  }
}

function parseRaw(result: FetchResult, def: ExternalDataSetDef): unknown {
  const { data, contentType } = result;

  // Already structured — pass through
  if (typeof data !== "string") return data;

  const raw = data as string;

  // Empty string — nothing to parse
  if (raw.trim() === "") {
    throw new DataSetError("PARSE_FAILED", "Empty input data");
  }

  // Explicit CSV content type
  if (contentType?.startsWith("text/csv") || contentType?.startsWith("application/csv")) {
    const csv = parseCsv(raw);
    return csvToObjects(csv.headers, csv.rows);
  }

  // Explicit JSON content type — parse as JSON directly
  if (contentType?.startsWith("application/json")) {
    return JSON.parse(raw) as unknown;
  }

  // Prometheus: URL ending in /metrics OR text/plain with metric-shaped lines
  if (def.url !== undefined && /metrics$/.test(def.url)) {
    return parseMetrics(raw);
  }
  if (contentType?.startsWith("text/plain") && looksLikePrometheus(raw)) {
    return parseMetrics(raw);
  }

  // URL file extension hint (tiebreaker when content type is missing/generic)
  const ext = urlExtension(def.url);
  if (ext === ".csv") {
    const csv = parseCsv(raw);
    return csvToObjects(csv.headers, csv.rows);
  }
  if (ext === ".tsv") {
    const csv = parseCsv(raw, { delimiter: "\t" });
    return csvToObjects(csv.headers, csv.rows);
  }

  // Try JSON first (fix common hand-authored JSON quirks from YAML content)
  try {
    const cleaned = raw.replace(/,\s*([\]}])/g, "$1"); // trailing commas
    try {
      return JSON.parse(cleaned) as unknown;
    } catch {
      return JSON.parse(cleaned.replace(/'/g, '"')) as unknown;
    }
  } catch {
    // Fallback: try CSV
    try {
      const csv = parseCsv(raw);
      if (csv.headers.length === 0 && csv.rows.length === 0) {
        throw new DataSetError("PARSE_FAILED", "No data could be parsed from input");
      }
      return csvToObjects(csv.headers, csv.rows);
    } catch (e) {
      if (e instanceof DataSetError) throw e;
      throw new DataSetError("PARSE_FAILED", "Failed to parse input as JSON or CSV", e);
    }
  }
}

/** Convert CSV parse result into array of objects (Shape B). */
function csvToObjects(
  headers: string[],
  rows: string[][],
): Record<string, string>[] {
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i];
      if (key !== undefined) {
        obj[key] = row[i] ?? "";
      }
    }
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Stage 2: Navigate / Extract
// ---------------------------------------------------------------------------

async function navigateAndExtract(
  data: unknown,
  def: ExternalDataSetDef,
  presetRegistry: PresetRegistry,
): Promise<unknown> {
  let current = data;

  // 2a. dataPath — dot-separated property navigation
  if (def.dataPath !== undefined) {
    const segments = def.dataPath.split(".");
    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== "object") {
        throw new DataSetError(
          "EXTRACTION_ERROR",
          `Cannot navigate path "${def.dataPath}": segment "${segment}" does not exist`,
        );
      }
      const next = (current as Record<string, unknown>)[segment];
      if (next === undefined) {
        throw new DataSetError(
          "EXTRACTION_ERROR",
          `Path "${def.dataPath}" not found: segment "${segment}" does not exist`,
        );
      }
      current = next;
    }
  }

  // 2b. type — preset lookup + JSONata evaluation
  if (def.type !== undefined) {
    const preset = presetRegistry.get(def.type);
    if (!preset) {
      throw new DataSetError("UNKNOWN_PRESET", `No preset found for type "${def.type}"`);
    }
    try {
      const compiled = compileOrCached(preset.expression);
      current = await compiled.evaluate(current);
    } catch (e) {
      if (e instanceof DataSetError) throw e;
      throw new DataSetError(
        "EXTRACTION_ERROR",
        `Preset "${def.type}" evaluation failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
  }

  // 2b-auto. Auto-detect Prometheus API response when no type was specified.
  // Matches {status: "success", data: {resultType: "...", result: [...]}}
  if (def.type === undefined && looksLikePrometheusApi(current)) {
    const preset = presetRegistry.get("prometheus");
    if (preset) {
      try {
        const compiled = compileOrCached(preset.expression);
        current = await compiled.evaluate(current);
      } catch { /* fall through to normal extraction */ }
    }
  }

  // 2c. expression — custom JSONata
  // Skip when content + accumulate + expression: expression is a refresh generator,
  // not a transform. The content provides the seed; expression generates on refresh.
  if (def.expression !== undefined && !(def.content !== undefined && def.accumulate)) {
    try {
      const compiled = compileOrCached(def.expression);
      current = await compiled.evaluate(current);
    } catch (e) {
      if (e instanceof DataSetError) throw e;
      throw new DataSetError(
        "EXTRACTION_ERROR",
        `Expression evaluation failed: ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
  }

  return current;
}

// ---------------------------------------------------------------------------
// Stage 3: Tabulate — recognized shape to DataSet wire format
// ---------------------------------------------------------------------------

interface ShapeAData {
  columns: readonly { id: string; type: string; name?: string }[];
  values: readonly (readonly unknown[])[];
}

function isShapeA(data: unknown): data is ShapeAData {
  if (data === null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj["columns"]) && Array.isArray(obj["values"]);
}

function isArrayOfObjects(data: unknown): data is Record<string, unknown>[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  return first !== null && typeof first === "object" && !Array.isArray(first);
}

function isArrayOfArrays(data: unknown): data is unknown[][] {
  if (!Array.isArray(data) || data.length === 0) return false;
  return Array.isArray(data[0]);
}

function valueToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function classifyValue(val: unknown): ColumnTypeEnum {
  if (val === null || val === undefined) return ColumnType.LABEL;
  if (typeof val === "number") return ColumnType.NUMBER;
  if (typeof val === "string") {
    if (looksLikeIsoDate(val)) return ColumnType.DATE;
    const n = Number(val);
    if (!Number.isNaN(n) && val.trim() !== "") return ColumnType.NUMBER;
  }
  return ColumnType.LABEL;
}

function inferColumnType(values: unknown[]): ColumnTypeEnum {
  let numbers = 0;
  let dates = 0;
  let labels = 0;
  let total = 0;

  for (const val of values) {
    if (val === null || val === undefined) continue;
    total++;
    const t = classifyValue(val);
    if (t === ColumnType.NUMBER) numbers++;
    else if (t === ColumnType.DATE) dates++;
    else labels++;
  }

  if (total === 0) return ColumnType.LABEL;

  // Unanimous or strong majority (all non-null values agree) → that type
  if (numbers === total) return ColumnType.NUMBER;
  if (dates === total) return ColumnType.DATE;

  // Any disagreement → LABEL (safe fallback for mixed data)
  if (labels > 0) return ColumnType.LABEL;
  if (numbers > 0 && dates > 0) return ColumnType.LABEL;

  return ColumnType.LABEL;
}

function mapTypeString(type: string): ColumnTypeEnum {
  switch (type.toLowerCase()) {
    case "number":
      return ColumnType.NUMBER;
    case "date":
      return ColumnType.DATE;
    case "text":
      return ColumnType.TEXT;
    case "label":
    default:
      return ColumnType.LABEL;
  }
}

function tabulateShapeA(data: ShapeAData): { columns: Column[]; rows: (string | null)[][] } {
  const columns: Column[] = data.columns.map((c) => ({
    id: c.id as ColumnId,
    name: c.name ?? c.id,
    type: mapTypeString(c.type),
  }));

  // JSONata auto-unwraps single-element arrays. If values is a flat array
  // of primitives (not an array of arrays), wrap it as a single row.
  let valueRows: readonly (readonly unknown[])[];
  if (data.values.length > 0 && !Array.isArray(data.values[0])) {
    valueRows = [data.values];
  } else {
    valueRows = data.values as readonly (readonly unknown[])[];
  }

  const rows: (string | null)[][] = valueRows.map((row) =>
    Array.from({ length: columns.length }, (_, i) => valueToString(row[i])),
  );

  return { columns, rows };
}

function tabulateShapeB(data: Record<string, unknown>[]): { columns: Column[]; rows: (string | null)[][] } {
  const first = data[0]!;
  const keys = Object.keys(first);

  // Sample values per column for type inference
  const columns: Column[] = keys.map((key) => {
    const values = data.map((obj) => obj[key]);
    return {
      id: key as ColumnId,
      name: key,
      type: inferColumnType(values),
    };
  });

  const rows: (string | null)[][] = data.map((obj) =>
    keys.map((key) => valueToString(obj[key])),
  );

  return { columns, rows };
}

function tabulateShapeC(data: unknown[][]): { columns: Column[]; rows: (string | null)[][] } {
  const maxCols = data.reduce((max, row) => Math.max(max, row.length), 0);

  // Sample values per column for type inference
  const columns: Column[] = Array.from({ length: maxCols }, (_, i) => {
    const values = data.map((row) => row[i]);
    return {
      id: `Column ${i}` as ColumnId,
      name: `Column ${i}`,
      type: inferColumnType(values),
    };
  });

  const rows: (string | null)[][] = data.map((row) =>
    Array.from({ length: maxCols }, (_, i) => valueToString(row[i])),
  );

  return { columns, rows };
}

function tabulate(
  data: unknown,
  explicitColumns: readonly ExternalColumnDef[] | undefined,
): { dataset: DataSet; inferredColumns: boolean } {
  let columns: Column[];
  let rows: (string | null)[][];
  let inferred: boolean;

  if (isShapeA(data)) {
    const result = tabulateShapeA(data);
    columns = result.columns;
    rows = result.rows;
    inferred = true;
  } else if (isArrayOfObjects(data)) {
    const result = tabulateShapeB(data);
    columns = result.columns;
    rows = result.rows;
    inferred = true;
  } else if (isArrayOfArrays(data)) {
    const result = tabulateShapeC(data);
    columns = result.columns;
    rows = result.rows;
    inferred = true;
  } else if (Array.isArray(data) && data.length === 0) {
    throw new DataSetError("EMPTY_RESULT", "Extraction produced no data (empty array)");
  } else if (Array.isArray(data) && data.every(v => typeof v !== "object" || v === null)) {
    // Shape D: flat array of primitives → single row with auto-generated columns
    columns = data.map((_, i) => ({
      id: `Column ${i}` as ColumnId,
      name: `Column ${i}`,
      type: inferColumnType([data[i]]),
    }));
    rows = [data.map(v => valueToString(v))];
    inferred = true;
  } else {
    throw new DataSetError("EXTRACTION_ERROR", "Unrecognized data shape");
  }

  // Apply explicit column definitions if provided
  if (explicitColumns !== undefined && explicitColumns.length > 0) {
    columns = explicitColumns
      .filter((c): c is ExternalColumnDef => c != null && typeof c === "object" && c.id !== undefined)
      .map((c) => ({
        id: c.id,
        name: c.name ?? c.id,
        type: typeof c.type === "string" ? mapTypeString(c.type) : (c.type ?? inferColumnType([])),
      }));
    inferred = false;
  }

  // Check empty result (zero rows AND zero columns)
  if (rows.length === 0 && columns.length === 0) {
    throw new DataSetError("EMPTY_RESULT", "Extraction produced no data");
  }

  return { dataset: { columns, data: rows }, inferredColumns: inferred };
}

// ---------------------------------------------------------------------------
// Stage 4: Convert — DataSet wire format to TypedDataSet
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractDataSet(
  result: FetchResult,
  def: ExternalDataSetDef,
  presetRegistry: PresetRegistry,
): Promise<ExtractionResult> {
  // Stage 1: Parse
  const parsed = parseRaw(result, def);

  // Stage 2: Navigate / Extract
  const extracted = await navigateAndExtract(parsed, def, presetRegistry);

  // Stage 3: Tabulate
  let { dataset: wireDataSet, inferredColumns } = tabulate(extracted, def.columns);

  // Prometheus column naming: when columns were inferred from Prometheus data
  // and there are exactly 3 auto-named columns, use metric/labels/value.
  // Detect by URL pattern OR by checking if the raw data was Prometheus-shaped.
  const PROMETHEUS_COL_NAMES = ["metric", "labels", "value"];
  const isPrometheus = (def.url !== undefined && /metrics$/.test(def.url))
    || (typeof result.data === "string" && looksLikePrometheus(result.data as string));
  if (
    inferredColumns &&
    wireDataSet.columns.length === 3 &&
    wireDataSet.columns[0]?.id === "Column 0" &&
    isPrometheus
  ) {
    const renamedCols = wireDataSet.columns.map((c, i) =>
      i < 3 ? { ...c, id: PROMETHEUS_COL_NAMES[i]! as ColumnId, name: PROMETHEUS_COL_NAMES[i]! } : c,
    );
    wireDataSet = { ...wireDataSet, columns: renamedCols };
  }

  // Stage 4: Convert to TypedDataSet
  const dataset = toTypedDataSet(wireDataSet);

  return { dataset, inferredColumns };
}
