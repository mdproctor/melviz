import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { ColumnSettings } from "@casehub/data/dist/dataset/types.js";
import type { FilterSettings, RefreshSettings } from "./component-props.js";

export interface DataComponentCommon {
  readonly title?: string;
  readonly visible?: boolean;
  readonly width?: string;
  readonly height?: string;
  readonly csvExport?: boolean;
  readonly lookup: DataSetLookup;
  readonly rowCount?: number;
  readonly rowOffset?: number;
  readonly columns?: readonly ColumnSettings[];
  readonly filter?: FilterSettings;
  readonly refresh?: RefreshSettings;
}

export interface ChartSettings {
  readonly resizable?: boolean;
  readonly zoom?: boolean;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly legend?: {
    readonly show?: boolean;
    readonly position?: "top" | "bottom" | "left" | "right";
  };
  readonly margin?: {
    readonly top?: number;
    readonly right?: number;
    readonly bottom?: number;
    readonly left?: number;
  };
  readonly xAxis?: { readonly title?: string; readonly showLabels?: boolean };
  readonly yAxis?: { readonly title?: string; readonly showLabels?: boolean };
  readonly extra?: Readonly<Record<string, unknown>>;
}

export interface BarChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "column" | "column-stacked" | "bar" | "bar-stacked";
}

export interface LineChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "line" | "smooth";
}

export interface AreaChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "area" | "area-stacked";
}

export interface PieChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "pie" | "donut";
}

export interface ScatterChartProps extends DataComponentCommon, ChartSettings {}

export interface BubbleChartProps extends DataComponentCommon, ChartSettings {
  readonly minRadius?: number;
  readonly maxRadius?: number;
}

export interface TimeseriesProps extends DataComponentCommon, ChartSettings {}

export interface TableProps extends DataComponentCommon {
  readonly pageSize?: number;
  readonly sortable?: boolean;
  readonly resizable?: boolean;
}

export interface MetricProps extends DataComponentCommon {
  readonly subtype?: "card" | "card2" | "plain-text" | "quota";
  readonly html?: {
    readonly template?: string;
    readonly javascript?: string;
  };
}

export interface MeterProps extends DataComponentCommon, ChartSettings {
  readonly end?: number;
  readonly warning?: number;
  readonly critical?: number;
}

export interface SelectorProps extends DataComponentCommon {
  readonly subtype?: "dropdown" | "slider" | "labels";
}

export interface MapProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "regions" | "markers";
  readonly colorScheme?: string;
  readonly mapName?: string;
}

export interface IframePluginProps {
  readonly componentId: string;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly lookup?: DataSetLookup;
  readonly title?: string;
  readonly visible?: boolean;
  readonly width?: string;
  readonly height?: string;
  readonly filter?: FilterSettings;
  readonly refresh?: RefreshSettings;
}
