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
