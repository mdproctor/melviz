import type {
  Component,
  GridItem,
  GridPlacement,
  AccessControl,
} from "../model/types.js";
import type {
  HtmlProps,
  MarkdownProps,
  TitleProps,
  PanelProps,
  GridProps,
  ColumnsProps,
} from "../model/component-props.js";
import type { PageProps, PageSettings } from "../model/page-types.js";
import type { ExternalDataSetDef } from "@casehub/data/dist/dataset/external/types.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
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
} from "../model/displayer-types.js";

// Grid ID counter — scoped per page tree via resetGridCounter()
let gridCounter = 0;

export function resetGridCounter(): void {
  gridCounter = 0;
}

export interface PageOptions {
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Record<string, string>;
}

function isPageOptions(arg: unknown): arg is PageOptions {
  if (typeof arg !== "object" || arg === null) return false;
  const obj = arg as Record<string, unknown>;
  // PageOptions has no 'type' property (Components always do)
  if ("type" in obj) return false;
  // Must have at least one of the PageOptions fields
  return "datasets" in obj || "settings" in obj || "properties" in obj;
}

function freeze<T>(obj: T): T {
  return Object.freeze(obj);
}

export function page(
  name: string,
  ...args: (Component | PageOptions)[]
): Component {
  // Validate name
  if (name.includes("/")) {
    throw new Error(`Page name cannot contain '/': ${name}`);
  }

  // Split args into children and options
  const children: Component[] = [];
  let options: PageOptions | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (i === args.length - 1 && isPageOptions(arg)) {
      options = arg;
    } else {
      children.push(arg as Component);
    }
  }

  // Validate no duplicate child page names at same level
  const childPages = children.filter((c) => c.type === "page");
  const pageNames = new Set<string>();
  for (const child of childPages) {
    const childName = (child.props as PageProps)?.name;
    if (childName) {
      if (pageNames.has(childName)) {
        throw new Error(`Duplicate child page name: ${childName}`);
      }
      pageNames.add(childName);
    }
  }

  const props: PageProps = {
    name,
    ...(options?.datasets && { datasets: options.datasets }),
    ...(options?.settings && { settings: options.settings }),
    ...(options?.properties && { properties: options.properties }),
  };

  return freeze({
    type: "page",
    props: props as unknown as Record<string, unknown>,
    slots: { content: children },
  });
}

export function grid(columns: number, ...items: GridItem[]): Component {
  const gridId = `grid_${gridCounter++}`;

  // Assign IDs to items if they don't have one
  const itemsWithIds = items.map((item) => {
    if (item.component.id) {
      return item;
    }
    const { x, y } = item.placement;
    const id = `${gridId}_${x}_${y}`;
    return {
      ...item,
      component: { ...item.component, id },
    };
  });

  const props: GridProps = { columns };

  return freeze({
    type: "grid",
    id: gridId,
    props: props as unknown as Record<string, unknown>,
    items: itemsWithIds,
  });
}

export function at(
  x: number,
  y: number,
  w: number,
  h: number,
  component: Component
): GridItem {
  return freeze({
    placement: freeze({ x, y, w, h }),
    component,
  });
}

export function columns(
  distribution: number[],
  ...slotContents: Component[][]
): Component {
  if (distribution.length !== slotContents.length) {
    throw new Error(
      `Distribution length (${distribution.length}) must match slotContents length (${slotContents.length})`
    );
  }

  const slots: Record<string, readonly Component[]> = {};
  for (let i = 0; i < slotContents.length; i++) {
    slots[`col-${i}`] = slotContents[i]!;
  }

  const props: ColumnsProps = { distribution };

  return freeze({
    type: "columns",
    props: props as unknown as Record<string, unknown>,
    slots: freeze(slots),
  });
}

export function rows(...children: Component[]): Component {
  return freeze({
    type: "rows",
    slots: { content: children },
  });
}

export function stack(...children: Component[]): Component {
  // Alias for rows
  return rows(...children);
}

// Helper for navigation components
function navComponent(
  type: string,
  entries: [string, ...Component[]][]
): Component {
  const slots: Record<string, readonly Component[]> = {};
  for (const [label, ...components] of entries) {
    slots[label] = components;
  }

  return freeze({
    type,
    slots: freeze(slots),
  });
}

export function tabs(...entries: [string, ...Component[]][]): Component {
  return navComponent("tabs", entries);
}

export function pills(...entries: [string, ...Component[]][]): Component {
  return navComponent("pills", entries);
}

export function sidebar(...entries: [string, ...Component[]][]): Component {
  return navComponent("sidebar", entries);
}

export function tree(...entries: [string, ...Component[]][]): Component {
  return navComponent("tree", entries);
}

export function menu(...entries: [string, ...Component[]][]): Component {
  return navComponent("menu", entries);
}

export function accordion(...entries: [string, ...Component[]][]): Component {
  return navComponent("accordion", entries);
}

export function carousel(...entries: [string, ...Component[]][]): Component {
  return navComponent("carousel", entries);
}

export function appGrid(...entries: [string, ...Component[]][]): Component {
  return navComponent("app-grid", entries);
}

export function panel(title: string, ...children: Component[]): Component {
  const props: PanelProps = { title };

  return freeze({
    type: "panel",
    props: props as unknown as Record<string, unknown>,
    slots: { content: children },
  });
}

export function html(content: string): Component {
  const props: HtmlProps = { content };

  return freeze({
    type: "html",
    props: props as unknown as Record<string, unknown>,
  });
}

export function markdown(content: string): Component {
  const props: MarkdownProps = { content };

  return freeze({
    type: "markdown",
    props: props as unknown as Record<string, unknown>,
  });
}

export function title(text: string, size?: string): Component {
  const props: TitleProps = {
    text,
    ...(size !== undefined && { size }),
  };

  return freeze({
    type: "title",
    props: props as unknown as Record<string, unknown>,
  });
}

export function withId(id: string, component: Component): Component {
  return freeze({
    ...component,
    id,
  });
}

export function withAccess(
  access: AccessControl,
  component: Component
): Component {
  return freeze({
    ...component,
    access,
  });
}

export function withStyle(
  style: Record<string, string>,
  component: Component
): Component {
  return freeze({
    ...component,
    style: freeze(style),
  });
}

// Data component builders
export function barChart(props: BarChartProps): Component {
  return freeze({
    type: "bar-chart",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function lineChart(props: LineChartProps): Component {
  return freeze({
    type: "line-chart",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function areaChart(props: AreaChartProps): Component {
  return freeze({
    type: "area-chart",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function pieChart(props: PieChartProps): Component {
  return freeze({
    type: "pie-chart",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function scatterChart(props: ScatterChartProps): Component {
  return freeze({
    type: "scatter-chart",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function bubbleChart(props: BubbleChartProps): Component {
  return freeze({
    type: "bubble-chart",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function timeseries(props: TimeseriesProps): Component {
  return freeze({
    type: "timeseries",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function table(props: TableProps): Component {
  return freeze({
    type: "table",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function metric(props: MetricProps): Component {
  return freeze({
    type: "metric",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function meter(props: MeterProps): Component {
  return freeze({
    type: "meter",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function selector(props: SelectorProps): Component {
  return freeze({
    type: "selector",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function mapChart(props: MapProps): Component {
  return freeze({
    type: "map",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

export function iframePlugin(props: IframePluginProps): Component {
  return freeze({
    type: "iframe-plugin",
    props: { ...props } as unknown as Record<string, unknown>,
  });
}

// Dataset helpers

export function dataset(
  id: string,
  url: string,
  overrides?: Partial<Omit<ExternalDataSetDef, "uuid" | "url" | "content" | "join">>,
): ExternalDataSetDef {
  return Object.freeze({
    uuid: id as DataSetId,
    url,
    ...overrides,
  });
}

export function inlineDataset(
  id: string,
  content: string,
  overrides?: Partial<Omit<ExternalDataSetDef, "uuid" | "url" | "content" | "join">>,
): ExternalDataSetDef {
  return Object.freeze({
    uuid: id as DataSetId,
    content,
    ...overrides,
  });
}
