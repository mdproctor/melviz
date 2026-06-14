import type { Component } from "./types.js";
import type {
  GridProps,
  ColumnsProps,
  RowsProps,
  StackProps,
  TabsProps,
  PillsProps,
  SidebarProps,
  TreeProps,
  MenuProps,
  AccordionProps,
  CarouselProps,
  AppGridProps,
  PanelProps,
  HtmlProps,
  MarkdownProps,
  TitleProps,
  LazyPageProps,
} from "./component-props.js";
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

export interface ComponentTypeRegistry {
  grid: GridProps;
  columns: ColumnsProps;
  rows: RowsProps;
  stack: StackProps;
  tabs: TabsProps;
  pills: PillsProps;
  sidebar: SidebarProps;
  tree: TreeProps;
  menu: MenuProps;
  accordion: AccordionProps;
  carousel: CarouselProps;
  "app-grid": AppGridProps;
  panel: PanelProps;
  html: HtmlProps;
  markdown: MarkdownProps;
  title: TitleProps;
  page: PageProps;
  "lazy-page": LazyPageProps;
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

export function getProps<T extends keyof ComponentTypeRegistry>(
  component: Component,
  type: T,
): ComponentTypeRegistry[T] {
  if (component.type !== type) {
    throw new Error(`Expected ${type}, got ${component.type}`);
  }
  return component.props as unknown as ComponentTypeRegistry[T];
}

// Layout components
export function isGrid(
  c: Component,
): c is Component & { props: GridProps } {
  return c.type === "grid";
}

export function isColumns(
  c: Component,
): c is Component & { props: ColumnsProps } {
  return c.type === "columns";
}

export function isRows(
  c: Component,
): c is Component & { props: RowsProps } {
  return c.type === "rows";
}

export function isStack(
  c: Component,
): c is Component & { props: StackProps } {
  return c.type === "stack";
}

export function isTabs(
  c: Component,
): c is Component & { props: TabsProps } {
  return c.type === "tabs";
}

export function isPills(
  c: Component,
): c is Component & { props: PillsProps } {
  return c.type === "pills";
}

export function isSidebar(
  c: Component,
): c is Component & { props: SidebarProps } {
  return c.type === "sidebar";
}

export function isTree(
  c: Component,
): c is Component & { props: TreeProps } {
  return c.type === "tree";
}

export function isMenu(
  c: Component,
): c is Component & { props: MenuProps } {
  return c.type === "menu";
}

export function isAccordion(
  c: Component,
): c is Component & { props: AccordionProps } {
  return c.type === "accordion";
}

export function isCarousel(
  c: Component,
): c is Component & { props: CarouselProps } {
  return c.type === "carousel";
}

export function isAppGrid(
  c: Component,
): c is Component & { props: AppGridProps } {
  return c.type === "app-grid";
}

// Wrapper components
export function isPanel(
  c: Component,
): c is Component & { props: PanelProps } {
  return c.type === "panel";
}

// Content components
export function isHtml(
  c: Component,
): c is Component & { props: HtmlProps } {
  return c.type === "html";
}

export function isMarkdown(
  c: Component,
): c is Component & { props: MarkdownProps } {
  return c.type === "markdown";
}

export function isTitle(
  c: Component,
): c is Component & { props: TitleProps } {
  return c.type === "title";
}

// Page components
export function isPage(
  c: Component,
): c is Component & { props: PageProps } {
  return c.type === "page";
}

export function isLazyPage(
  c: Component,
): c is Component & { props: LazyPageProps } {
  return c.type === "lazy-page";
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
