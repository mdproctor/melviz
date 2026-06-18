import type { ColumnId, ColumnType, DataSetId, TypedDataSet } from "../types.js";

export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
}

export interface ExternalColumnDef {
  readonly id: ColumnId;
  readonly name?: string;
  readonly type: ColumnType;
}

export interface ExternalDataSetDef {
  readonly uuid: DataSetId;
  readonly name?: string;

  readonly url?: string;
  readonly content?: string;
  readonly join?: readonly DataSetId[];

  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
  readonly form?: Readonly<Record<string, string>>;
  readonly body?: string;

  readonly dataPath?: string;
  readonly type?: string;
  readonly expression?: string;

  readonly columns?: readonly ExternalColumnDef[];

  readonly cacheEnabled?: boolean;
  readonly cacheMaxRows?: number;
  readonly refreshTime?: string;
  readonly accumulate?: boolean;
}

export interface DataRequest {
  readonly url: string;
  readonly method: HttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
  readonly form?: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface FetchResult {
  readonly data: unknown;
  readonly contentType?: string;
}

export interface MelvizDataMessage {
  readonly type: "melviz-dataset";
  readonly dataSetId: string;
  readonly data: unknown;
  readonly contentType?: string;
}

export interface ExtractionPreset {
  readonly id: string;
  readonly expression: string;
}

export interface PresetRegistry {
  get(id: string): ExtractionPreset | undefined;
  has(id: string): boolean;
}

export interface DataProvider {
  fetch(request: DataRequest): Promise<FetchResult>;
}

export interface DataProviderConfig {
  readonly defaultProvider?: "browser" | "server-relay";
  readonly corsProxy?: {
    readonly url: string;
    readonly enabled: boolean;
  };
  readonly serverRelay?: {
    readonly endpoint: string;
  };
}

export interface ExtractionResult {
  readonly dataset: TypedDataSet;
  readonly inferredColumns: boolean;
}

export interface ResolveResult {
  readonly dataset: TypedDataSet;
  readonly inferredColumns: boolean;
  readonly source: "url" | "content" | "join";
}

const TIME_UNITS: Record<string, number> = {
  millisecond: 1,
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000,
  quarter: 7_776_000_000,
  year: 31_536_000_000,
};

export function parseRefreshTime(str: string): number {
  const match = str.match(/^(\d+)(\w+)$/);
  if (!match) return 10_000;
  const multiplier = TIME_UNITS[match[2]!];
  return multiplier !== undefined ? parseInt(match[1]!, 10) * multiplier : 10_000;
}
