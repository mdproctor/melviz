# Page Model & DSL Design

Covers issue #8. Designs the complete page model — the TypeScript types that represent a composable page tree, a builder DSL as the primary authoring API, and a YAML parser for backwards compatibility.

**Architectural decisions made during brainstorming:**
- **Pure HTML/TypeScript/vanilla** — no React. Web Components for all UI elements. Iframes only for 3rd-party plugins.
- **Model-first (Approach A)** — TypeScript interfaces define the model. Zod schemas validate at the boundary, constrained with `z.ZodType<T>` to prevent divergence. The model has no Zod dependency.
- **TypeScript DSL as primary authoring format** — YAML preserved as a secondary input format for backwards compatibility with existing dashboards.
- **Fully typed displayer settings (Option C)** — each displayer type gets its own typed props. `Record<string, unknown>` escape hatch only for iframe-isolated 3rd-party plugins, plus `extra` passthrough on chart types for ECharts native options.
- **Slot-based component tree** (inspired by [Puck](https://github.com/puckeditor/puck)) — recursive composition via named slots. "Anything inside anything."
- **Coordinate grid layout** (inspired by [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)) — `{x, y, w, h}` placement with row/column spanning for panel layout.
- **casehub naming** — all new packages use `@casehub/*`. The git repo stays `melviz` for now.

**Design direction (noted, not in scope for #8):**
- The core component primitives (`Component`, `GridItem`, slots, access, style) are designed to be extractable into a shared `@casehub/ui` package that other casehub web UIs can compose over. The data-component types (displayer props, dataset integration) are domain-specific and depend on `@casehub/data`.
- A DnD visual builder is planned (pure TS, no framework), operating over the same model. The builder generates the model; the model is the source of truth.

---

## 1. Package Architecture

| Package | Runtime | Role |
|---------|---------|------|
| `@casehub/ui` | TS | Component model, layout primitives, DSL, YAML parser |
| `@casehub/data` | TS (browser/Node) | Data engine — datasets, ops, expressions, extraction, lookup |
| `@casehub/data-jvm` | JVM (Quarkus) | Data engine — same semantics, server-side, handles large datasets |
| `@casehub/data-relay` | JVM (Quarkus) | HTTP proxy — CORS/auth/caching, no data processing |
| `@casehub/viz` | TS | Chart/table/metric Web Components (`<casehub-bar-chart>`, etc.) |

`@casehub/data` is the existing `packages/core/` codebase (issues #4–#7). `@casehub/data-jvm` is the existing Java data pipeline in the GWT core. `@casehub/ui` is this issue (#8). `@casehub/viz` replaces the current React `components/` directory with Web Components. `@casehub/data-relay` is future (Quarkus HTTP proxy).

Two data engines share the same model and operation semantics. The TS engine works standalone (browser-side processing, direct fetch). When a JVM backend is available, the client can delegate to `@casehub/data-jvm` for large datasets or server-side auth. `@casehub/data-relay` is a separate concern — it proxies HTTP requests but does no data processing.

### Dependency graph

```
@casehub/ui/model/types.ts           → (no deps, pure TS — extractable)
@casehub/ui/model/component-props.ts → (no deps, pure TS — extractable)
@casehub/ui/model/displayer-types.ts → @casehub/data
@casehub/ui/model/page-types.ts      → @casehub/data
@casehub/ui/dsl                     → @casehub/ui/model, @casehub/data
@casehub/ui/parser                  → @casehub/ui/model, @casehub/data, zod
@casehub/viz                        → @casehub/ui/model, @casehub/data, echarts
@casehub/data                       → jsonata, zod
```

**The split:** `types.ts` contains `Component`, `GridItem`, `GridPlacement`, `AccessControl`, `PermissionContext`, `ALLOW_ALL` — the generic component primitives with zero external dependencies. These are the types extractable into a shared casehub-ui framework. `page-types.ts` contains `PageProps`, `PageSettings`, `ViewState`, `Site`, `DataComponentDefaults`, `LookupDefaults`, `DataSetDefaults` — all of which reference `@casehub/data` types (`ColumnId`, `DataSetId`, `ExternalDataSetDef`, `DataSetOp`). `displayer-types.ts` contains `DataComponentCommon`, `ChartSettings`, `BarChartProps`, etc. — also depends on `@casehub/data`.

---

## 2. Page Model — everything is a page

There is no `Dashboard` type. The root is a page. Child pages are pages. The entire model is recursive composition of `Component` — pages are components with `type: "page"`.

### Site — the runtime handle

The model is `Component`. The runtime wraps the root page in a `Site` — the entry point for navigation, dataset resolution, and state management.

```typescript
interface Site {
  readonly root: Component;
  page(path: string): Component | null;
  dataset(id: DataSetId, fromPage?: string): ExternalDataSetDef | null;
  readonly state: ViewState;
}

function loadSite(source: string | Component): Site;
```

`Site` is NOT a model type — it's a runtime handle. The model stays clean (everything is `Component`). The `Site` provides:
- **`page(path)`** — navigate by path (e.g. `"Overview/Sales"`)
- **`dataset(id, fromPage?)`** — resolve a dataset by walking up the page tree. `fromPage` specifies the starting page (defaults to `state.currentPage`). Explicit parameter makes the method pure and testable — callers can resolve from any page without navigating there first.
- **`state`** — the current `ViewState` (navigation position, filters, layout overrides)

`loadSite()` accepts either a YAML string (parsed via `parsePage()`) or a pre-built `Component` (from the DSL). Both produce the same `Site`.

### Page path construction rules

- Path = page name segments joined by `/`. e.g. a page named "Sales" inside a page named "Overview" has path `"Overview/Sales"`.
- The root page's name is NOT included in the path — it's implicit. `page("App", page("Overview", ...))` → path is `"Overview"`, not `"App/Overview"`.
- Page names MUST NOT contain `/` — it's the path separator. The DSL builder validates this at construction time.
- Duplicate page names at the same nesting level are a construction error — the DSL builder throws. Different levels may reuse names (`"Detail"` under `"Sales"` and `"Detail"` under `"Costs"` are both valid — paths `"Sales/Detail"` and `"Costs/Detail"` are unambiguous).

A page can carry **datasets**, **settings**, and **properties** that scope to its subtree. The root page's settings are "global" by virtue of being at the root, not by being a different type. A nested page can provide its own datasets and settings that override or extend the parent's — cascading down like CSS.

### Page props

```typescript
interface PageProps {
  readonly name?: string;
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Readonly<Record<string, string>>;
}

interface PageSettings {
  readonly mode?: "light" | "dark";
  readonly allowUrlProperties?: boolean;
  readonly dataComponentDefaults?: DataComponentDefaults;
  readonly datasetDefaults?: DataSetDefaults;
}
```

### Lazy pages

A lazy page is a component — `{ type: "lazy-page" }`. It fits "everything is a Component" — no union type needed. The runtime recognizes `type: "lazy-page"` and fetches the content on navigation. Once fetched, the runtime produces a new tree with the lazy-page node replaced by the fetched page content (the model is immutable — no mutation).

```typescript
// A lazy page IS a component
{ type: "lazy-page",
  props: { name: "Admin", href: "/pages/admin.json" },
  access: { roles: ["admin"] }
}
```

This means `Component.slots` holds `Component[]` uniformly — lazy pages appear naturally alongside inline pages in any slot. No `PageChild` or `PageEntry` union type.

### Defaults and merge semantics

```typescript
interface DataComponentDefaults {
  readonly lookup?: LookupDefaults;
  readonly chart?: Partial<ChartSettings>;
}

interface LookupDefaults {
  readonly dataSetId?: DataSetId;
  readonly operations?: readonly DataSetOp[];
  readonly rowCount?: number;
  readonly rowOffset?: number;
}

interface DataSetDefaults {
  readonly url?: string;
  readonly content?: string;
  readonly method?: HttpMethod;
  readonly headers?: Readonly<Record<string, string>>;
  readonly columns?: readonly ExternalColumnDef[];
  readonly cacheEnabled?: boolean;
  readonly refreshTime?: string;
}
```

**Why not `Partial<DataSetLookup>` and `Partial<ExternalDataSetDef>`:** `Partial<T>` says "all fields optional" without specifying what's inheritable or how merging works. `LookupDefaults` explicitly models what can be inherited — it includes `rowCount` and `rowOffset` (display-level pagination constraints from YAML's lookup section) which are NOT fields on `DataSetLookup` (they live in `LookupOptions` at the service layer). `DataSetDefaults` excludes fields that don't make sense as defaults (`uuid`, `join`, `accumulate`).

**Merge semantics — cascading, shallow, per-field, own-wins:**
1. Settings cascade from parent page to child pages. A child page inherits its parent's datasets, settings, and properties unless it provides its own.
2. For each field, if the child page has its own value, use it. Otherwise, inherit from the nearest ancestor that provides it.
3. Nested objects (`operations`, `headers`, `columns`) are replaced entirely, not deep-merged. If a child page provides its own `operations`, the parent's operations are discarded — not concatenated.
4. `rowCount` and `rowOffset` from `LookupDefaults` are extracted during desugaring and placed on the data component props (see §5), not passed into `DataSetLookup`.
5. Dataset resolution walks up the page tree: `lookup.dataSetId` resolves against the nearest ancestor page that defines a dataset with that `uuid`.

---

## 3. Component Model

One type for everything — charts, tables, markdown, layout containers, navigation. Nesting is via named slots. Grid layout uses `items` for positioned children.

```typescript
interface Component {
  readonly type: string;
  readonly id?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly style?: Readonly<Record<string, string>>;
  readonly access?: AccessControl;
  readonly slots?: Readonly<Record<string, readonly Component[]>>;
  readonly items?: readonly GridItem[];
}

interface AccessControl {
  readonly roles?: readonly string[];       // any match grants access
  readonly permissions?: readonly string[]; // all must match
}
```

**`id`:** Optional stable identifier for referencing a component across sessions. Required for: layout override persistence (DnD builder saves grid positions by component ID), deep linking to specific components, filter group membership by ID, collapsed panel state, scroll position state. Most components don't need one. Authors provide explicit IDs for components they want to reference in view state or deep links.

**Deterministic ID generation for grid items:** Both the DSL and the YAML parser auto-generate IDs for components inside grids (needed for layout persistence). Algorithm: grids without explicit IDs get tree-path-based IDs (`grid_0`, `grid_1`, etc.) derived from depth-first traversal order. Grid items get `${gridId}_${x}_${y}`. Nested grids: `grid_0_item_0_0_grid_0` (parent grid, parent item position, child grid index). IDs are stable across rebuilds (same input → same IDs), unique across the tree, and deterministic (no randomness). Explicit `id` values always override generated ones.

**`access`:** Declarative access annotation for conditional rendering (UX) and server-side page filtering (security). See §8a for the full access and loading architecture. On pages, the server uses `access` to decide whether to include the page in the payload. On non-page components, the client uses `access` for UX-level conditional rendering (hiding UI elements — not security, since the data is already on the client).

**`style`:** CSS/layout overrides applied to the component's container element. Separate from `props` (component-specific configuration). Maps directly to the element's `style` attribute in the Web Component render path. This is the equivalent of the Java `LayoutComponent.properties` / YAML `properties` field, which existing dashboards use pervasively for margins, widths, backgrounds, text alignment, etc.

**`slots` vs `items`:** Most components use `slots` (named content regions). The `grid` component uses `items` (positioned children with `{x, y, w, h}` placement). These are mutually exclusive — a component has either `slots` or `items`, never both. The distinction exists because grid placement is not a slot concept; it carries layout metadata that slots don't need.

**Recursive composition:** a slot can contain any component, including layout components with their own slots. This is the "anything inside anything" model.

**Examples:**

A page:
```typescript
{ type: "page", props: { name: "Sales" }, slots: {
    content: [
      { type: "bar-chart", props: { ... } },
      { type: "table", props: { ... } },
    ]
  }
}
```

A column layout:
```typescript
{ type: "columns", props: { distribution: [1, 2] }, slots: {
    "col-0": [{ type: "bar-chart", props: { ... } }],
    "col-1": [{ type: "table", props: { ... } }],
  }
}
```

Tabs with nested content:
```typescript
{ type: "tabs", slots: {
    "Sales": [{ type: "bar-chart", props: { ... } }],
    "Costs": [{ type: "line-chart", props: { ... } }],
  }
}
```

**Maps to Web Components directly** — the slot concept aligns with the native `<slot>` element in Shadow DOM:
```html
<casehub-columns distribution="1,2">
  <casehub-bar-chart slot="col-0" ...></casehub-bar-chart>
  <casehub-table slot="col-1" ...></casehub-table>
</casehub-columns>
```

### 3.1. Component Type Safety

`Component.props` is `Record<string, unknown>` — the typed props information from builder functions is erased at the model level. This is an intentional tradeoff: a homogeneous `Component` type enables recursive composition without generic type parameters infecting the tree. But the read path (renderers, serializers, DnD builder) needs type-safe access.

**Type guard functions** narrow `Component` to its typed form after a runtime check on `component.type`:

```typescript
function isBarChart(c: Component): c is Component & { props: BarChartProps } {
  return c.type === "bar-chart";
}

function isTable(c: Component): c is Component & { props: TableProps } {
  return c.type === "table";
}
```

**Component type registry** maps type strings to their props interfaces. Complete — every component type has a named props interface, even trivial ones:

```typescript
// Layout props
interface GridProps { readonly columns: number; }
interface ColumnsProps { readonly distribution: readonly number[]; }
interface RowsProps {}
interface StackProps {}

// Navigation props (config is in slots, not props — these are empty or minimal)
interface TabsProps {}
interface PillsProps {}
interface SidebarProps {}
interface TreeProps {}
interface MenuProps {}
interface AccordionProps {}
interface CarouselProps {}
interface AppGridProps {}
interface PanelProps { readonly title: string; }

// Content props
interface HtmlProps { readonly content: string; }
interface MarkdownProps { readonly content: string; }
interface TitleProps { readonly text: string; readonly size?: string; }

// Page props
interface LazyPageProps { readonly name: string; readonly href: string; }

// Full registry
interface ComponentTypeRegistry {
  // Layout
  "grid": GridProps;
  "columns": ColumnsProps;
  "rows": RowsProps;
  "stack": StackProps;
  // Navigation
  "tabs": TabsProps;
  "pills": PillsProps;
  "sidebar": SidebarProps;
  "tree": TreeProps;
  "menu": MenuProps;
  "accordion": AccordionProps;
  "carousel": CarouselProps;
  "app-grid": AppGridProps;
  "panel": PanelProps;
  // Content
  "html": HtmlProps;
  "markdown": MarkdownProps;
  "title": TitleProps;
  // Pages
  "page": PageProps;
  "lazy-page": LazyPageProps;
  // Data components
  "bar-chart": BarChartProps;
  "line-chart": LineChartProps;
  "area-chart": AreaChartProps;
  "pie-chart": PieChartProps;
  "scatter-chart": ScatterChartProps;
  "bubble-chart": BubbleChartProps;
  "timeseries": TimeseriesProps;
  "table": TableProps;
  "metric": MetricProps;
  "meter": MeterProps;
  "selector": SelectorProps;
  "map": MapProps;
  // External
  "iframe-plugin": IframePluginProps;
}

function getProps<T extends keyof ComponentTypeRegistry>(
  component: Component,
  type: T,
): ComponentTypeRegistry[T] {
  if (component.type !== type) {
    throw new Error(`Expected ${type}, got ${component.type}`);
  }
  return component.props as ComponentTypeRegistry[T];
}
```

Every renderer is type-safe — no `as` casts needed for any component type.

---

## 4. Grid Layout

For 2D panel placement with row/column spanning. Inspired by [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)'s coordinate model.

```typescript
interface GridPlacement {
  readonly x: number;      // column position (grid units)
  readonly y: number;      // row position (grid units)
  readonly w: number;      // column span
  readonly h: number;      // row span
}

interface GridItem {
  readonly placement: GridPlacement;
  readonly component: Component;
}
```

Placement is a **wrapper**, not a prop — the chart doesn't know where it sits on the grid. The grid owns placement. The DnD builder manipulates `GridItem.placement` when dragging/resizing.

A grid is a component type. Its children are `GridItem`s, not raw components:

```typescript
{ type: "grid", props: { columns: 12 },
  items: [
    { placement: { x: 0, y: 0, w: 8, h: 2 },
      component: { type: "bar-chart", props: { ... } } },
    { placement: { x: 8, y: 0, w: 4, h: 1 },
      component: { type: "metric", props: { ... } } },
    { placement: { x: 8, y: 1, w: 4, h: 1 },
      component: { type: "metric", props: { ... } } },
  ]
}
```

Grids nest — a grid item's component can be another grid, enabling recursive 2D layout.

**Rendering:** CSS Grid. `columns: 12` maps to `grid-template-columns: repeat(12, 1fr)`. Each item maps to `grid-column: x+1 / span w; grid-row: y+1 / span h`.

**Component type categories:**

| Category | Types | Children |
|----------|-------|----------|
| Layout | `grid`, `columns`, `rows`, `stack` | Slots or GridItems |
| Navigation | `tabs`, `pills`, `sidebar`, `tree`, `menu`, `accordion`, `carousel`, `app-grid`, `panel` | Named content slots |
| Content | `html`, `markdown`, `title` | None (leaf) |
| Data component | `bar-chart`, `line-chart`, `pie-chart`, `scatter-chart`, `table`, `metric`, `selector`, `meter`, `map`, `timeseries`, `bubble-chart` | None (leaf) |
| External | `iframe-plugin` | None (leaf, iframe-isolated) |
| Lazy | `lazy-page` | None until resolved; replaced with page content on fetch |

**Navigation components are interchangeable views over page subtrees.** All navigation components share the same slot contract — named slots containing page content. Swapping `tabs(...)` for `sidebar(...)` or `app-grid(...)` changes the visual navigation without changing the page tree. This works at any nesting level — the root can use `sidebar` while a nested section uses `tabs`, each independently chosen.

| Navigation type | Visual treatment | Typical use |
|----------------|-----------------|-------------|
| `tabs` | Horizontal tab bar | Inline section switching |
| `pills` | Horizontal pill/chip buttons | Compact section switching |
| `sidebar` | Vertical icon + label list | App-level navigation |
| `tree` | Expandable tree view | Deep hierarchies |
| `menu` | Horizontal menu bar | Top-level navigation |
| `accordion` | Vertically stacked, one open at a time | Dense content areas |
| `carousel` | Sliding panels, one visible at a time | Sequential content |
| `app-grid` | Icon grid overlay | Root-level app/workspace switching |
| `panel` | Collapsible titled panel | Single child, show/hide |

**Page is a Panel with navigation superpowers.** Both are titled, collapsible containers that hold children. A page adds: dataset/settings scoping, URL addressability, lazy loading, navigation registration, and filter boundary. In the model both are `Component` — the `type` string (`"page"` vs `"panel"`) tells the runtime what capabilities to activate. Promoting a panel to a page (add datasets, make navigable) or demoting a page to a panel (strip navigation, inline content) requires changing only the `type` and props, not the structure.

The `@casehub/ui` framework defines the slot contract. Each `<casehub-tabs>`, `<casehub-sidebar>`, `<casehub-app-grid>` etc. is a Web Component with different visual rendering over the same data. New navigation styles are added by registering new component types — no model changes needed.

---

## 5. Data Component Settings (typed per chart type)

Each data component type gets its own typed props interface. Common settings shared via composition.

### Common types

```typescript
interface DataComponentCommon {
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

interface RefreshSettings {
  readonly interval?: number;
  readonly showStaleIndicator?: boolean;
}

interface ChartSettings {
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
  readonly xAxis?: {
    readonly title?: string;
    readonly showLabels?: boolean;
  };
  readonly yAxis?: {
    readonly title?: string;
    readonly showLabels?: boolean;
  };
  readonly extra?: Readonly<Record<string, unknown>>;
}
```

**`rowCount` / `rowOffset`:** Display-level pagination. These are NOT part of `DataSetLookup` (which is a pure query definition). They live in `LookupOptions` at the service layer. The YAML format puts them inside the `lookup:` section for authoring convenience, but the parser extracts them into data component props during desugaring. At runtime, the renderer passes them as `LookupOptions` when calling `DataSetManager.lookup()`.

**`refresh`:** Polling configuration for real-time use cases (Prometheus, time series). The `interval` controls how often the data component re-queries the dataset manager. Distinct from `ExternalDataSetDef.refreshTime` which controls how often the dataset re-fetches from its external source.

**`csvExport`:** Whether the component allows data export. Platform feature, not chart-specific.

**`xAxis` / `yAxis`:** Axis configuration is fundamental — every chart type uses these. Typed here rather than pushed to `extra` because they're the most common chart configuration after title and legend.

**`extra` on `ChartSettings`:** ECharts native option passthrough. The typed fields cover common cases with compile-time safety. `extra` covers the long tail — ECharts has hundreds of options (custom color palettes, toolbox configuration, advanced axis formatting, data zoom, etc.) that the typed surface can't exhaust. This maps to the Java `extraConfiguration` JSON blob that existing dashboards use for theming and advanced ECharts features.

### ColumnSettings — canonical type

The data layer (`@casehub/data`) already defines `ColumnSettings` in `types.ts`. The spec's data component column settings are the same concept — per-column display configuration. Rather than create a second `ColumnSettings` with different field names, the data layer's type is canonical. **Breaking change:** rename the data layer's fields to the cleaner names:

```typescript
// @casehub/data types.ts — CHANGED field names
interface ColumnSettings {
  readonly id: ColumnId;              // was: columnId
  readonly name?: string;             // was: columnName (and make optional)
  readonly expression?: string;       // was: valueExpression
  readonly pattern?: string;          // was: valuePattern
  readonly empty?: string;            // was: emptyTemplate
}
```

One type, one name, one set of field names across both packages. The migration in the data layer is mechanical — rename fields, update all call sites. This also updates `Column.settings` in the data layer which references `ColumnSettings`.

### Per-type props

```typescript
interface BarChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "column" | "column-stacked" | "bar" | "bar-stacked";
}

interface LineChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "line" | "smooth";
}

interface AreaChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "area" | "area-stacked";
}

interface PieChartProps extends DataComponentCommon, ChartSettings {
  readonly subtype?: "pie" | "donut";
}

interface ScatterChartProps extends DataComponentCommon, ChartSettings {}

interface BubbleChartProps extends DataComponentCommon, ChartSettings {
  readonly minRadius?: number;
  readonly maxRadius?: number;
}

interface TimeseriesProps extends DataComponentCommon, ChartSettings {}

interface TableProps extends DataComponentCommon {
  readonly pageSize?: number;
  readonly sortable?: boolean;
  readonly resizable?: boolean;
}

interface MetricProps extends DataComponentCommon {
  readonly subtype?: "card" | "card2" | "plain-text" | "quota";
  readonly html?: {
    readonly template?: string;
    readonly javascript?: string;
  };
}

interface MeterProps extends DataComponentCommon, ChartSettings {
  readonly end?: number;
  readonly warning?: number;
  readonly critical?: number;
}

interface SelectorProps extends DataComponentCommon {
  readonly subtype?: "dropdown" | "slider" | "labels";
}

interface MapProps extends DataComponentCommon {
  readonly subtype?: "regions" | "markers";
  readonly colorScheme?: string;
}

interface IframePluginProps {
  readonly componentId: string;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly lookup?: DataSetLookup;          // optional — not all plugins need data
  readonly title?: string;
  readonly visible?: boolean;
  readonly width?: string;
  readonly height?: string;
  readonly filter?: FilterSettings;
  readonly refresh?: RefreshSettings;       // host-side: controls when to re-query and push fresh data
}
```

### Design decisions

- **Subtypes are string unions on specific props types.** `BarChartProps.subtype` only accepts bar-related subtypes. The old Java `DisplayerSubType` enum allowed nonsensical combinations (`DONUT` on a bar chart). The typed model prevents this.
- **Metric subtypes map to built-in templates.** Java `METRIC_CARD`, `METRIC_CARD2`, `METRIC_PLAIN_TEXT`, `METRIC_QUOTA` are built-in HTML/JS templates. The `subtype` field selects these. Custom templates via `html.template` override the subtype.
- **`lookup` is required on all data components.** Every data component needs data.
- **`BubbleChartProps` adds radius config.** `minRadius` and `maxRadius` distinguish bubble from scatter — bubble's defining feature is the third sizing dimension.
- **`MapProps` adds `colorScheme`.** The only themed feature on maps — without it, map theming falls to `extra`.
- **`IframePluginProps` does NOT extend `DataComponentCommon`** — it's its own type. `lookup` is optional because some iframe plugins are pure forms or UI widgets with no data dependency (e.g. uniforms). The `settings` escape hatch passes arbitrary config to 3rd-party components.
- **Content components (`html`, `markdown`, `title`) are NOT data components** — they have no `lookup`. They're `{ type: "html", props: { content: "..." } }`.

---

## 6. Cross-Filtering & Drill-Down

### The model

```typescript
interface FilterSettings {
  readonly enabled?: boolean;          // default true — participates in filtering
  readonly notification?: boolean;     // emits filter events on user interaction
  readonly listening?: boolean;        // reacts to filter events from others
  readonly selfApply?: boolean;        // apply own filter to self (default false)
  readonly group?: string;             // filter group ID — scoped channel
  readonly drillDown?: DrillDown;
}

interface DrillDown {
  readonly target: string;             // target page name or component ID
  readonly parameters?: Readonly<Record<string, string>>;  // column → target parameter
}
```

### How scoping works

**Default: page-scoped broadcast.** No `group` means all `notification: true` emitters broadcast to all `listening: true` receivers on the same page. Simple, intuitive, matches the existing Java behavior.

**Groups: channel-scoped.** A component with `group: "region"` only exchanges filter events with other `group: "region"` components. Multiple independent filter channels on the same page.

**Ungrouped receivers hear everything.** A `listening: true` component without a `group` receives events from both grouped and ungrouped emitters. Groups narrow scope; they don't isolate.

**Direction is implicit.** `notification: true` = emitter, `listening: true` = receiver. A component with both is bidirectional.

### Examples

Simple page broadcast:
```typescript
selector({ ..., filter: { notification: true } })
barChart({ ..., filter: { listening: true } })
```

Grouped (independent channels):
```typescript
selector({ ..., filter: { notification: true, group: "region" } })
barChart({ ..., filter: { listening: true, group: "region" } })
table({ ..., filter: { listening: true } })  // ungrouped — hears ALL events
```

Drill-down (click → navigate with context):
```typescript
barChart({
  ...,
  filter: {
    notification: true,
    drillDown: { target: "Region Detail", parameters: { region: "region" } },
  },
})
```

### Design rationale

Informed by analysis of [Grafana](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/), [Tableau](https://help.tableau.com/current/pro/desktop/en-us/actions_filter.htm), [Power BI](https://learn.microsoft.com/en-us/power-bi/guidance/relationships-bidirectional-filtering), [Databricks](https://docs.databricks.com/aws/en/dashboards/filters), and [CanvasXpress](https://www.canvasxpress.org/docs/broadcast.html).

---

## 7. Dataset Integration

Components reference data via `DataSetLookup` (designed in issue #5):

```typescript
interface DataComponentCommon {
  readonly lookup: DataSetLookup;  // { dataSetId, operations }
}
```

**Resolution:** `lookup.dataSetId` resolves by walking up the page tree — the nearest ancestor page that defines a dataset with that `uuid` wins. Not found in any ancestor → `DataSetError("UNKNOWN_PROVIDER")`. No implicit dataset creation.

---

## 8. Property Substitution

Three distinct substitution mechanisms exist. The parser and runtime must distinguish them.

### 1. Page property substitution (parse-time)

The root page's `properties` defines string variables replaced throughout the page tree **before** component parsing:

```yaml
properties:
  name: World
pages:
  - components:
      - html: "<h1>Hello ${name}</h1>"
```

In the DSL, properties are unnecessary — TypeScript template literals provide the same capability natively.

**`allowUrlProperties`** — when true, query parameters override properties at runtime (`?name=Mundo`). Only applies in CLIENT mode.

### 2. Metric template substitution (render-time)

Metric components use `${value}`, `${title}`, and `${this}` as data-bound variables resolved at render time from the current dataset row.

**Parser rule:** Property substitution skips the `html.template` and `html.javascript` fields of `MetricProps`. The substitution context is determined by field path.

### 3. Server user-context substitution (server-enforced)

`DataAccessPolicy.rowFilter` uses `${user.*}` variables (e.g. `${user.tenantId}`) resolved by `@casehub/data-jvm` against the authenticated principal's attributes. The server defines the `${user.*}` namespace — available attributes depend on the auth integration (OIDC claims, LDAP attributes, custom user properties). The TS data engine never evaluates these expressions.

---

## 8a. Access Control & Page Loading Architecture

Three distinct access concerns, each enforced at a different layer:

### 1. Page-level access (server-enforced, real security)

Pages can be inline (content in the payload) or lazy (`type: "lazy-page"` — content fetched on navigation). Lazy pages enable server-enforced access control — the server decides per-request whether the user can see the page content.

**Invisible omission:** Restricted pages are simply absent from the navigation. The user never sees tabs, tree entries, or menu items for pages they can't access.

**Direct URL access:** When a user navigates directly to a restricted page (bookmark, shared link), the server returns 403 (not 404). The client shows "access denied" — the page is real, the user just can't see it.

| Provider | How it filters |
|----------|---------------|
| **Static web server** (nginx, CDN) | Each page is a separate file behind path-based ACL rules. The manifest lists all pages; the client fetches each and silently drops 403s from navigation. |
| **`@casehub/data-jvm`** (Quarkus) | The server reads the full page tree, evaluates `access` annotations against the user's roles/permissions, and returns a personalized payload with only the authorized pages. |
| **Hybrid** | The manifest comes from the JVM (pre-filtered). Page content is served from static files or the JVM. Both enforce access. |

**Recursive filtering:** The server walks the component tree and prunes access-denied subtrees.

### 2. Conditional rendering (client-side, UX only — not security)

Components can declare `access` annotations for UX-level visibility. The client evaluates these against a `PermissionContext` and hides components that don't match. This is NOT security — the data is already on the client.

```typescript
interface PermissionContext {
  hasRole(role: string): boolean;
  hasPermission(permission: string): boolean;
}

const ALLOW_ALL: PermissionContext = {
  hasRole: () => true,
  hasPermission: () => true,
};
```

### 3. Row-level data filtering (server-enforced, real security)

```typescript
interface DataAccessPolicy {
  readonly rowFilter?: string;
  readonly excludeColumns?: readonly ColumnId[];
}
```

Added to `ExternalDataSetDef`. Enforcement by `@casehub/data-jvm` only. The TS data engine ignores it.

| What | Declared in | Enforced by | Security? |
|------|------------|-------------|-----------|
| Page visibility | `Component.access` | Server (JVM or web server ACL) | Yes |
| Component visibility | `Component.access` | Client (PermissionContext) | No (UX) |
| Row-level data | `ExternalDataSetDef.dataAccess` | `@casehub/data-jvm` | Yes |

---

## 8b. View State & Persistence

The model describes what a page tree IS. View state captures what the user HAS DONE. They compose: `Page (model) + ViewState (interaction) → rendered view`.

### ViewState

```typescript
interface ViewState {
  readonly currentPage?: string;
  readonly expandedNodes?: readonly string[];
  readonly activeFilters?: Readonly<Record<ColumnId, readonly string[]>>;
  readonly drillDownPath?: readonly DrillDownStep[];
  readonly layoutOverrides?: readonly LayoutOverride[];
  readonly collapsedPanels?: readonly string[];
  readonly scrollPositions?: Readonly<Record<string, number>>;
}

interface DrillDownStep {
  readonly source: string;
  readonly column: string;
  readonly value: string;
  readonly targetPage: string;
}

interface LayoutOverride {
  readonly componentId: string;     // references Component.id
  readonly placement: GridPlacement;
}
```

**`activeFilters` key semantics:** The key is `ColumnId` — the column being filtered. When two selectors filter the same column, their values merge (union). A selector emitting `{ columnId: "region", values: ["North"] }` and another emitting `{ columnId: "region", values: ["South"] }` produce `activeFilters: { region: ["North", "South"] }`. Different columns are independent entries.

**`componentId` references:** `LayoutOverride.componentId`, `collapsedPanels`, `expandedNodes`, and `scrollPositions` keys all reference `Component.id`. Components without an `id` cannot be referenced in view state. `expandedNodes` contains the `Component.id` values of expanded tree/accordion nodes — nodes without an `id` cannot persist their expanded state.

### Client-side storage (layered)

| State type | Storage | Lifetime |
|-----------|---------|----------|
| Current page, filters, drill-down | `sessionStorage` | Dies with the tab |
| Layout overrides, expanded nodes, collapsed panels | `localStorage` | Survives browser restart |
| Cached page payloads, dataset results | `IndexedDB` | Survives restart, enables offline |

### Server-side state sync (optional, cross-device)

**Conflict resolution — URL wins, then local, then server:**
1. URL state (highest priority — explicit intent from a shared link)
2. `localStorage` / `sessionStorage` (local is fresher than server)
3. Server state (cross-device fallback)
4. Default state (clean start)

### Deep linking (shareable URLs)

| In the URL | Not in the URL |
|------------|----------------|
| Current page path | Layout overrides (personal preference) |
| Active filter selections | Expanded tree nodes (personal preference) |
| Drill-down position | Collapsed panels (personal preference) |
| Sort column + direction | Scroll positions (ephemeral) |
| Page parameters (data keys, actions) | |

**URL format:**
```
#/page/Overview/Sales?filter=region:North|South,year:2024&drill=product:Widget&sort=revenue:DESC
```

**Multi-value filter encoding:** Pipe-separated within a key. `region:North|South` means `activeFilters: { region: ["North", "South"] }`. Commas separate different filter keys.

**Data-keyed pages:** URL parameters override page properties via `${param}` substitution. This is the primary mechanism for email-driven workflows:
```
#/page/CaseReview?caseId=12345&action=approve
```

```typescript
interface DeepLink {
  readonly page: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly filters?: Readonly<Record<string, readonly string[]>>;
  readonly drillDown?: readonly DrillDownStep[];
  readonly sort?: { readonly column: string; readonly order: "ASC" | "DESC" };
}

function serializeToUrl(state: Partial<ViewState>): string;
function parseFromUrl(hash: string): DeepLink;
```

### Tiny URLs (optional cache layer)

The full-state URL is always the canonical form. For email workflows, an optional URL shortening cache maps a short token to the full URL:

```
Full URL:  https://app.example.com/#/page/CaseReview?caseId=12345&action=approve
Tiny URL:  https://app.example.com/v/abc123
```

```typescript
interface TinyUrlService {
  create(fullUrl: string, options?: { expiry?: Date; access?: AccessControl }): Promise<string>;
  resolve(token: string): Promise<string | null>;
}
```

---

## 9. TypeScript DSL

Builder functions that construct the model types. Primary authoring API.

### Branded type handling

The data layer uses branded types (`ColumnId`, `DataSetId`). The DSL accepts plain strings and brands internally — callers write `lookup("sales")` not `lookup("sales" as DataSetId)`.

### Pages (the only entry point)

```typescript
function page(name: string, ...args: [...Component[], PageOptions?]): Component;

interface PageOptions {
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Record<string, string>;
}
```

There is no `dashboard()` or `app()` function. The root IS a page.

### Layout

```typescript
function grid(columns: number, ...items: GridItem[]): Component;
function at(x: number, y: number, w: number, h: number, component: Component): GridItem;

function columns(distribution: number[], ...slotContents: Component[][]): Component;
function rows(...children: Component[]): Component;
function stack(...children: Component[]): Component;
```

**`columns()` validation:** throws if `distribution.length !== slotContents.length`.

### Navigation / Composition

All navigation builders share the same slot contract — interchangeable views over page subtrees.

```typescript
function tabs(...entries: [string, ...Component[]][]): Component;
function pills(...entries: [string, ...Component[]][]): Component;
function sidebar(...entries: [string, ...Component[]][]): Component;
function tree(...entries: [string, ...Component[]][]): Component;
function menu(...entries: [string, ...Component[]][]): Component;
function accordion(...entries: [string, ...Component[]][]): Component;
function carousel(...entries: [string, ...Component[]][]): Component;
function appGrid(...entries: [string, ...Component[]][]): Component;

function panel(title: string, ...children: Component[]): Component;
```

### Component decorators

Immutable transforms — return a new Component with the field set. Composable with any builder output.

```typescript
function withId(id: string, component: Component): Component;
function withAccess(access: AccessControl, component: Component): Component;
function withStyle(style: Record<string, string>, component: Component): Component;

// Usage:
withId("revenue-chart", barChart({ title: "Revenue", lookup: ... }))
withAccess({ roles: ["admin"] }, panel("Admin Controls", ...))
withStyle({ margin: "10px" }, html("<h1>Title</h1>"))
```

### Content

```typescript
function html(content: string): Component;
function markdown(content: string): Component;
function title(text: string, size?: string): Component;
```

### Data components

```typescript
function barChart(props: BarChartProps): Component;
function lineChart(props: LineChartProps): Component;
function areaChart(props: AreaChartProps): Component;
function pieChart(props: PieChartProps): Component;
function scatterChart(props: ScatterChartProps): Component;
function bubbleChart(props: BubbleChartProps): Component;
function timeseries(props: TimeseriesProps): Component;
function table(props: TableProps): Component;
function metric(props: MetricProps): Component;
function meter(props: MeterProps): Component;
function selector(props: SelectorProps): Component;
function mapChart(props: MapProps): Component;
function iframePlugin(props: IframePluginProps): Component;
```

### Lookup helpers

```typescript
function lookup(dataSetId: string, ...ops: DataSetOp[]): DataSetLookup;
function groupBy(source: string | null, ...resultColumns: ResultColumn[]): GroupOp;
function groupByCalendar(source: string, unit: FixedCalendarUnit, ...resultColumns: ResultColumn[]): GroupOp;
function filterBy(column: string, fn: CoreFunctionType, ...args: readonly (string | number | Date)[]): FilterOp;
// Date args serialized as ISO 8601 UTC (Date.toISOString()). Number args via String(n).
// These formats are compatible with the filter resolution pipeline's string→typed parsing.
function and(...filters: FilterOp[]): FilterOp;
function or(...filters: FilterOp[]): FilterOp;
function not(filter: FilterOp): FilterOp;
function sortBy(column: string, order?: "ASCENDING" | "DESCENDING"): SortOp;
function col(source: string): ResultColumn;
function sum(source: string): ResultColumn;
function avg(source: string): ResultColumn;
function count(source: string): ResultColumn;
function min(source: string): ResultColumn;
function max(source: string): ResultColumn;
function distinct(source: string): ResultColumn;
function join(source: string, separator?: string): ResultColumn;
```

---

## 10. YAML Parser (backwards compatibility)

All 45+ existing example dashboards continue to work unchanged.

### Entry point

```typescript
export function parsePage(raw: unknown): Component;
```

### Pipeline

```
YAML string → js-yaml → property substitution (skip metric template fields)
  → Zod validation → desugaring → Component (root page)
```

### Desugaring rules

| YAML shorthand | Model equivalent |
|---|---|
| `pages[].components: [...]` | `grid(12, at(0, y++, 12, 1, component))` |
| `pages[].rows[].columns[].span: 6` | `at(x, y, 6, 1, ...)` |
| `html: "<h1>Hi</h1>"` | `{ type: "html", props: { content: "..." } }` |
| `markdown: "# Hi"` | `{ type: "markdown", props: { content: "..." } }` |
| `title: "Hi"` | `{ type: "title", props: { text: "..." } }` |
| `screen: "PageName"` | `{ type: "page-ref", props: { name: "..." } }` (transient — see below) |
| `panel: "PageName"` | `{ type: "panel", props: { name: "..." } }` |
| `div: "divId"` | `{ type: "slot-target", props: { id: "..." } }` (transient — see below) |
| `displayer.type: BARCHART` | `{ type: "bar-chart", props: { ... } }` |
| `type: TABS` | `{ type: "tabs", props: { ... } }` |
| `type: EXTERNAL` + `componentId` | `{ type: "iframe-plugin", props: { componentId: "...", settings: {...} } }` |
| `displayer.component: echarts` | `{ type: "iframe-plugin", props: { componentId: "echarts", settings: {...} } }` |
| `properties: { margin: 10px }` | `style: { margin: "10px" }` on the component |
| `lookup.rowCount: 10` | `rowCount: 10` on the data component props (extracted from lookup) |
| `displayer.html.html: "..."` | `html.template: "..."` (field rename) |
| `displayer.html.javascript: "..."` | `html.javascript: "..."` (passthrough) |

### Navigation component desugaring (navGroupId + targetDivId)

The parser resolves `navGroupId` + `targetDivId` + `NavTree` into direct slot composition:

1. Find each component with a `navGroupId` property
2. Look up the `navGroupId` in the `navTree` (if present) to find child page names
3. For each child page name, find the corresponding page in `pages` and extract its content
4. Map each child into a named slot on the navigation component (tab label → slot name)
5. Remove the `div` placeholder component
6. If no `navTree` is present, or the `navGroupId` is not found, fall back to using page names from the `pages` array that match the group ID

**Transient parser types:** `page-ref` and `slot-target` are intermediate component types produced during desugaring and consumed by `nav-desugar.ts`. They NEVER appear in the output of `parsePage()`. If a `page-ref` cannot be resolved (no matching page found), `parsePage()` throws. These types are not in the component type categories table or the `ComponentTypeRegistry` — they are internal to the parser.

**Grid item ID generation:** The parser generates deterministic IDs for grid items using the same algorithm as the DSL (see §3). YAML-parsed pages get stable component IDs, enabling layout persistence for imported dashboards.

---

## 11. File Organization

```
packages/
├── casehub-ui/                         # @casehub/ui
│   └── src/
│       ├── model/
│       │   ├── types.ts                # Component, GridItem, GridPlacement, AccessControl,
│       │   │                           #   PermissionContext, ALLOW_ALL
│       │   │                           #   (ZERO external deps — extractable)
│       │   ├── page-types.ts           # PageProps, PageSettings, ViewState, Site,
│       │   │                           #   DataComponentDefaults, LookupDefaults, DataSetDefaults
│       │   │                           #   (depends on @casehub/data)
│       │   ├── component-props.ts      # GridProps, ColumnsProps, RowsProps, StackProps,
│       │   │                           #   TabsProps, PanelProps, HtmlProps, MarkdownProps,
│       │   │                           #   TitleProps, LazyPageProps, FilterSettings,
│       │   │                           #   DrillDown, RefreshSettings
│       │   │                           #   (ZERO external deps)
│       │   ├── displayer-types.ts      # DataComponentCommon, ChartSettings, RefreshSettings,
│       │   │                           #   BarChartProps, LineChartProps, ScatterChartProps,
│       │   │                           #   BubbleChartProps, TableProps, MetricProps, MeterProps,
│       │   │                           #   SelectorProps, MapProps, IframePluginProps
│       │   │                           #   (depends on @casehub/data)
│       │   ├── type-guards.ts          # isBarChart(), isTable(), isHtml(), isGrid(), ...,
│       │   │                           #   ComponentTypeRegistry (complete — all types), getProps()
│       │   └── index.ts
│       │
│       ├── dsl/
│       │   ├── builders.ts             # page(), grid(), at(), columns(),
│       │   │                           #   tabs(), panel(), carousel(), barChart(), etc.
│       │   ├── lookup-helpers.ts       # lookup(), groupBy(), groupByCalendar(),
│       │   │                           #   filterBy(), and(), or(), not(), sortBy(),
│       │   │                           #   col(), sum(), avg(), count(), etc.
│       │   └── index.ts
│       │
│       ├── parser/
│       │   ├── page-parser.ts          # parsePage()
│       │   ├── page-schema.ts          # Zod schemas
│       │   ├── component-desugar.ts    # YAML shorthand → Component transforms
│       │   ├── displayer-desugar.ts    # flat settings map → typed props
│       │   ├── nav-desugar.ts          # navGroupId + targetDivId → slot composition
│       │   ├── property-substitution.ts
│       │   └── index.ts
│       │
│       └── index.ts
│
├── casehub-data/                       # @casehub/data (existing packages/core/)
│   └── src/
│       ├── dataset/
│       │   └── external/
│       └── expression/
│
├── casehub-viz/                        # @casehub/viz (replaces React components/)
│   └── src/
│       ├── bar-chart.ts               # <casehub-bar-chart>
│       ├── line-chart.ts, pie-chart.ts, scatter-chart.ts, bubble-chart.ts
│       ├── table.ts, metric.ts, meter.ts, selector.ts, map.ts
│       ├── timeseries.ts
│       └── index.ts
```

---

## 12. Relationship to Java GWT Core

This design is a **superset** of the Java RuntimeModel, not a 1:1 port.

**Preserved:**
- Root page → child pages → components hierarchy
- Dataset definitions with lookup/filter/group/sort
- Global settings with displayer/dataset defaults and merge semantics
- Cross-filtering with notification/listening and page scope
- Property substitution with `${name}`
- All component types (bar, line, area, pie, scatter, table, metric, meter, selector, map, timeseries, bubble, html, markdown, title, tabs, carousel, panel, screen)
- `extraConfiguration` passthrough for ECharts native options (as `ChartSettings.extra`)
- Metric subtypes (card, card2, plain-text, quota) as built-in templates

**Modernized:**
- `dragTypeName` Java class names → clean string type IDs (`"bar-chart"`, `"tabs"`)
- Flat `Map<String, String>` settings → typed props per data component type
- Bootstrap 12-column `span` → CSS Grid coordinate placement with `{x, y, w, h}`
- Fixed Row/Column hierarchy → slot-based recursive component tree
- React iframe components → Web Components with Shadow DOM
- YAML-only authoring → TypeScript DSL as primary, YAML as secondary
- `LayoutComponentPart` / CSS parts → standard Web Component `::part()` selectors
- `navGroupId` + `targetDivId` indirection → direct slot composition
- `ColumnSettings` field names → cleaner `id`, `name`, `expression`, `pattern`, `empty`
- `DisplayerCommon` → `DataComponentCommon` (domain-neutral naming)

**Dropped:**
- `dragTypeName` (replaced by clean type strings)
- `LayoutComponentPart` (replaced by Web Component `::part()`)
- `DisplayerSubType` as a shared enum (replaced by per-type `subtype` unions)
- `DisplayerType.PIE_3D` (3D rendering is a CSS/WebGL concern, not a chart subtype; use `extra` if needed)
- `DataSetLookup.metadata` (zero consumers — removed per YAGNI, issue #5)
- `RuntimeModel.lastModified` (storage metadata, not model)

---

## 13. Testing Strategy

### Model types
- Immutability: all returned objects are frozen
- Type guards: `isBarChart()` correctly narrows, rejects wrong types
- ComponentTypeRegistry: `getProps()` returns typed props, throws on mismatch
- Component.id: deterministic IDs generated for grid items

### DSL builders
- Each builder: correct `type`, `id`, `props`, `style`, and `slots` structure
- `grid()` + `at()`: placement validation (no overlaps, within column bounds), deterministic ID generation
- `columns()`: throws on distribution/slot-contents length mismatch
- `page()`: name validation (no `/` in names), duplicate name detection at same level
- Filter combinators: `and(filterBy(...), or(filterBy(...), filterBy(...)))` produces correct expression tree
- `groupBy(null, sum("revenue"))` produces `groupingKey: null`
- Branded types: `lookup("sales")` produces `DataSetId`

### YAML parser
- **All 45+ existing example dashboards parse without error**
- Property substitution: `${name}` replaced; metric template `${value}`, `${title}`, `${this}` NOT replaced
- Desugaring: `components` shorthand → grid, `rows`/`columns`/`span` → grid placements
- `html.html` → `html.template` rename
- External component desugaring: both `type: EXTERNAL` and `displayer.component:` syntaxes
- Navigation desugaring: `navGroupId` + `targetDivId` + navTree → resolved into named slots
- `rowCount`/`rowOffset` in lookup YAML → extracted to data component props
- `extraConfiguration` → `ChartSettings.extra`
- Global merge: cascading, shallow, per-field, own-wins

### Access control & page loading
- `ALLOW_ALL` PermissionContext: all checks return true
- `lazy-page` component: fetched on navigation, replaced with page content
- Recursive filtering: tabs with 3 tabs, 1 restricted → 2 tabs in output
- Direct URL to restricted page → 403, not 404

### View state
- `activeFilters` keyed by ColumnId, multi-selector merge produces union
- `layoutOverrides` references Component.id
- Deep link round-trip: serialize → parse → same state
- Multi-value filter URL encoding: `region:North|South`

### ColumnSettings migration (`@casehub/data`)
- Renamed fields compile and pass all existing tests

---

## 14. Deferred Concerns

- **DnD visual builder** — pure TS implementation operating over this model
- **Web Component implementations** (`@casehub/viz`)
- **`@casehub/ui` extraction** — extracting `types.ts` (zero-dep core) into a shared package
- **Responsive layouts** — breakpoint-aware grid configurations
- **Workspace layout primitives** — `split()` (resizable panes) for IDE-like layouts
- **JSON Schema generation** — from Zod schemas
- **`@casehub/data-relay`** — Quarkus server-side HTTP proxy
- **Component registration / manifest** — how `@casehub/viz` registers component types with `@casehub/ui`
- **Undo/redo** — model diffing for the DnD builder's edit history
- **Theming** — CSS custom properties for dark/light mode and brand customization
