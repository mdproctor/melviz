import type { Component, GridPlacement } from "./types.js";
import type { FilterSettings, RefreshSettings } from "./component-props.js";
import type {
  DataSetId,
  ColumnId,
  ColumnType,
} from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { DataSetOp } from "@casehub/data/dist/dataset/ops.js";
import type {
  ExternalDataSetDef,
  ExternalColumnDef,
  HttpMethod,
} from "@casehub/data/dist/dataset/external/types.js";
import type { ChartSettings } from "./displayer-types.js";

export interface PageProps {
  readonly name?: string;
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Readonly<Record<string, string>>;
}

export interface PageSettings {
  readonly mode?: "light" | "dark";
  readonly allowUrlProperties?: boolean;
  readonly dataComponentDefaults?: DataComponentDefaults;
  readonly datasetDefaults?: DataSetDefaults;
}

export interface DataComponentDefaults {
  readonly lookup?: LookupDefaults;
  readonly chart?: Partial<ChartSettings>;
}

export interface LookupDefaults {
  readonly dataSetId?: DataSetId;
  readonly operations?: readonly DataSetOp[];
  readonly rowCount?: number;
  readonly rowOffset?: number;
}

export interface DataSetDefaults {
  readonly url?: string;
  readonly content?: string;
  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly columns?: readonly ExternalColumnDef[];
  readonly cacheEnabled?: boolean;
  readonly refreshTime?: string;
}

export interface ViewState {
  readonly currentPage?: string;
  readonly expandedNodes?: readonly string[];
  readonly activeFilters?: Readonly<Record<string, readonly string[]>>;
  readonly drillDownPath?: readonly DrillDownStep[];
  readonly layoutOverrides?: readonly LayoutOverride[];
  readonly collapsedPanels?: readonly string[];
  readonly scrollPositions?: Readonly<Record<string, number>>;
}

export interface DrillDownStep {
  readonly source: string;
  readonly column: string;
  readonly value: string;
  readonly targetPage: string;
}

export interface LayoutOverride {
  readonly componentId: string;
  readonly placement: GridPlacement;
}

export interface DeepLink {
  readonly page: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly filters?: Readonly<Record<string, readonly string[]>>;
  readonly drillDown?: readonly DrillDownStep[];
  readonly sort?: { readonly column: string; readonly order: "ASC" | "DESC" };
}

export interface Site {
  readonly root: Component;
  page(path: string): Component | null;
  dataset(id: DataSetId, fromPage?: string): ExternalDataSetDef | null;
  readonly state: ViewState;
}
