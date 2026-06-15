import type { Component } from "./types.js";
import type {
  ComponentTypeRegistry as BaseRegistry,
} from "@casehub/component";
import { getProps as baseGetProps } from "@casehub/component";
import type { PageProps } from "./page-types.js";
import type {
  BarChartProps,
  LineChartProps,
  AreaChartProps,
  PieChartProps,
  ScatterChartProps,
  BubbleChartProps,
  TimeseriesProps,
  TableProps,
  MetricProps,
  MeterProps,
  SelectorProps,
  MapProps,
  IframePluginProps,
} from "./displayer-types.js";

// Re-export all base guards
export {
  isGrid,
  isColumns,
  isRows,
  isStack,
  isTabs,
  isPills,
  isSidebar,
  isTree,
  isMenu,
  isAccordion,
  isCarousel,
  isAppGrid,
  isPanel,
  isHtml,
  isMarkdown,
  isTitle,
  isLazyPage,
} from "@casehub/component";

export interface ComponentTypeRegistry extends BaseRegistry {
  page: PageProps;
  "bar-chart": BarChartProps;
  "line-chart": LineChartProps;
  "area-chart": AreaChartProps;
  "pie-chart": PieChartProps;
  "scatter-chart": ScatterChartProps;
  "bubble-chart": BubbleChartProps;
  timeseries: TimeseriesProps;
  table: TableProps;
  metric: MetricProps;
  meter: MeterProps;
  selector: SelectorProps;
  map: MapProps;
  "iframe-plugin": IframePluginProps;
}

// IMPORTANT: Type assertion to widen the generic constraint.
// baseGetProps only knows about the base ComponentTypeRegistry.
// This cast widens it to include chart/data types.
export const getProps = baseGetProps as <T extends keyof ComponentTypeRegistry>(
  component: Component,
  type: T,
) => ComponentTypeRegistry[T];

// Page components
export function isPage(
  c: Component,
): c is Component & { props: PageProps } {
  return c.type === "page";
}

// Chart components
export function isBarChart(
  c: Component,
): c is Component & { props: BarChartProps } {
  return c.type === "bar-chart";
}

export function isLineChart(
  c: Component,
): c is Component & { props: LineChartProps } {
  return c.type === "line-chart";
}

export function isAreaChart(
  c: Component,
): c is Component & { props: AreaChartProps } {
  return c.type === "area-chart";
}

export function isPieChart(
  c: Component,
): c is Component & { props: PieChartProps } {
  return c.type === "pie-chart";
}

export function isScatterChart(
  c: Component,
): c is Component & { props: ScatterChartProps } {
  return c.type === "scatter-chart";
}

export function isBubbleChart(
  c: Component,
): c is Component & { props: BubbleChartProps } {
  return c.type === "bubble-chart";
}

export function isTimeseries(
  c: Component,
): c is Component & { props: TimeseriesProps } {
  return c.type === "timeseries";
}

// Data components
export function isTable(
  c: Component,
): c is Component & { props: TableProps } {
  return c.type === "table";
}

export function isMetric(
  c: Component,
): c is Component & { props: MetricProps } {
  return c.type === "metric";
}

export function isMeter(
  c: Component,
): c is Component & { props: MeterProps } {
  return c.type === "meter";
}

export function isSelector(
  c: Component,
): c is Component & { props: SelectorProps } {
  return c.type === "selector";
}

export function isMap(
  c: Component,
): c is Component & { props: MapProps } {
  return c.type === "map";
}

// Plugin component
export function isIframePlugin(
  c: Component,
): c is Component & { props: IframePluginProps } {
  return c.type === "iframe-plugin";
}
