# Dashboard Model & DSL Design

Covers issue #8. Designs the complete dashboard model — the TypeScript types that represent a dashboard, a builder DSL as the primary authoring API, and a YAML parser for backwards compatibility.

**Architectural decisions made during brainstorming:**
- **Pure HTML/TypeScript/vanilla** — no React. Web Components for all UI elements. Iframes only for 3rd-party plugins.
- **Model-first (Approach A)** — TypeScript interfaces define the model. Zod schemas validate at the boundary, constrained with `z.ZodType<T>` to prevent divergence. The model has no Zod dependency.
- **TypeScript DSL as primary authoring format** — YAML preserved as a secondary input format for backwards compatibility with existing dashboards.
- **Fully typed displayer settings (Option C)** — each displayer type gets its own typed props. `Record<string, unknown>` escape hatch only for iframe-isolated 3rd-party plugins, plus `extra` passthrough on chart types for ECharts native options.
- **Slot-based component tree** (inspired by [Puck](https://github.com/puckeditor/puck)) — recursive composition via named slots. "Anything inside anything."
- **Coordinate grid layout** (inspired by [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)) — `{x, y, w, h}` placement with row/column spanning for dashboard panel layout.
- **casehub naming** — all new packages use `@casehub/*`. The git repo stays `melviz` for now.

**Design direction (noted, not in scope for #8):**
- The component model and layout primitives are designed to be extractable into a shared `@casehub/ui` package that other casehub web UIs can compose over. The chart/data layer is dashboard-specific; the layout infrastructure is general-purpose.
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
@casehub/viz    →  @casehub/ui/model, @casehub/data, echarts
@casehub/ui/dsl    →  @casehub/ui/model, @casehub/data
@casehub/ui/parser →  @casehub/ui/model, @casehub/data, zod
@casehub/ui/model  →  (no deps, pure TS)
@casehub/data      →  jsonata, zod
```

`@casehub/ui/model` is the zero-dependency core — the types that could be extracted into a shared casehub-ui framework. The DSL and parser subpaths depend on `@casehub/data` because they construct `DataSetLookup`, `FilterOp`, `GroupOp`, and `SortOp` objects. This dependency is intentional — the DSL is a dashboard authoring tool, not a generic layout builder.

---

## 2. Page Model — everything is a page

There is no `Dashboard` type. The root is a page. Child pages are pages. The entire model is recursive composition of `Component` — pages are components with `type: "page"`.

### Site — the runtime handle

The model is `Component`. The runtime wraps the root page in a `Site` — the entry point for navigation, dataset resolution, and state management.

```typescript
interface Site {
  readonly root: Component;
  page(path: string): Component | null;
  dataset(id: DataSetId): ExternalDataSetDef | null;
  readonly state: ViewState;
}

function loadSite(source: string | Component): Site;
```

`Site` is NOT a model type — it's a runtime handle. The model stays clean (everything is `Component`). The `Site` provides:
- **`page(path)`** — navigate by path (e.g. `"Overview/Sales"`)
- **`dataset(id)`** — resolve a dataset by walking up the page tree from the current page
- **`state`** — the current `ViewState` (navigation position, filters, layout overrides)

`loadSite()` accepts either a YAML string (parsed via `parsePage()`) or a pre-built `Component` (from the DSL). Both produce the same `Site`.

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

A page's children can be inline (content in the payload) or lazy (content fetched on navigation). Lazy pages enable server-enforced access control — see §8a.

```typescript
type PageChild =
  | Component                            // inline — content included in payload
  | LazyPage;                            // lazy — content fetched on navigation

interface LazyPage {
  readonly name: string;
  readonly href: string;                 // URL to fetch page content from
  readonly access?: AccessControl;       // server uses this to filter; client never sees denied pages
}
```

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

One type for everything in a dashboard — charts, tables, markdown, layout containers, navigation. Nesting is via named slots. Grid layout uses `items` for positioned children.

```typescript
interface Component {
  readonly type: string;
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

// One per component type
```

**Component type registry** maps type strings to their props interfaces, enabling generic narrowing:

```typescript
interface ComponentTypeRegistry {
  "bar-chart": BarChartProps;
  "line-chart": LineChartProps;
  "table": TableProps;
  "metric": MetricProps;
  // ... all component types
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

Renderers use the registry to dispatch without `as` casts:

```typescript
function render(component: Component): void {
  if (isBarChart(component)) {
    renderBarChart(component.props); // props is BarChartProps here
  } else if (isTable(component)) {
    renderTable(component.props);    // props is TableProps here
  }
  // ...
}
```

---

## 4. Grid Layout

For 2D dashboard panel placement with row/column spanning. Inspired by [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)'s coordinate model.

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
| Navigation | `tabs`, `pills`, `sidebar`, `tree`, `menu`, `accordion`, `app-grid`, `panel` | Named content slots |
| Content | `html`, `markdown`, `title` | None (leaf) |
| Displayer | `bar-chart`, `line-chart`, `pie-chart`, `scatter-chart`, `table`, `metric`, `selector`, `meter`, `map`, `timeseries`, `bubble-chart` | None (leaf) |
| External | `iframe-plugin` | None (leaf, iframe-isolated) |

**Navigation components are interchangeable views over page subtrees.** All navigation components share the same slot contract — named slots containing page content. Swapping `tabs(...)` for `sidebar(...)` or `app-grid(...)` changes the visual navigation without changing the page tree. This works at any nesting level — the root can use `sidebar` while a nested section uses `tabs`, each independently chosen.

| Navigation type | Visual treatment | Typical use |
|----------------|-----------------|-------------|
| `tabs` | Horizontal tab bar | Inline section switching |
| `pills` | Horizontal pill/chip buttons | Compact section switching |
| `sidebar` | Vertical icon + label list | App-level navigation |
| `tree` | Expandable tree view | Deep hierarchies |
| `menu` | Horizontal menu bar | Top-level navigation |
| `accordion` | Vertically stacked, one open at a time | Dense content areas |
| `app-grid` | Icon grid overlay | Root-level app/workspace switching |
| `panel` | Collapsible titled panel | Single child, show/hide |

The `@casehub/ui` framework defines the slot contract. Each `<casehub-tabs>`, `<casehub-sidebar>`, `<casehub-app-grid>` etc. is a Web Component with different visual rendering over the same data. New navigation styles are added by registering new component types — no model changes needed.

---

## 5. Displayer Settings (typed per chart type)

Each displayer type gets its own typed props interface. Common settings shared via composition.

### Common types

```typescript
interface DisplayerCommon {
  readonly title?: string;
  readonly visible?: boolean;
  readonly width?: string;
  readonly height?: string;
  readonly lookup: DataSetLookup;
  readonly rowCount?: number;         // display-level: max rows to render
  readonly rowOffset?: number;        // display-level: skip N rows before rendering
  readonly columns?: readonly ColumnSettings[];
  readonly filter?: FilterSettings;
  readonly refresh?: RefreshSettings;
}

interface RefreshSettings {
  readonly interval?: number;         // seconds between re-queries
  readonly staleData?: boolean;       // show stale indicator when data is old
}

interface ChartSettings {
  readonly resizable?: boolean;
  readonly zoom?: boolean;
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
  readonly extra?: Readonly<Record<string, unknown>>;
}
```

**`rowCount` / `rowOffset`:** Display-level pagination. These are NOT part of `DataSetLookup` (which is a pure query definition). They live in `LookupOptions` at the service layer. The YAML format puts them inside the `lookup:` section for authoring convenience, but the parser extracts them into displayer props during desugaring. At runtime, the renderer passes them as `LookupOptions` when calling `DataSetManager.lookup()`.

**`refresh`:** Polling configuration for real-time dashboards (Prometheus, time series). The `interval` controls how often the displayer re-queries the dataset manager. Distinct from `ExternalDataSetDef.refreshTime` which controls how often the dataset re-fetches from its external source.

**`extra` on `ChartSettings`:** ECharts native option passthrough. The typed fields (`resizable`, `zoom`, `legend`, `margin`) cover common cases with compile-time safety. `extra` covers the long tail — ECharts has hundreds of options (custom color palettes, toolbox configuration, axis formatting, data zoom, etc.) that the typed surface can't exhaust. This maps to the Java `extraConfiguration` JSON blob that existing dashboards use for theming and advanced ECharts features.

### ColumnSettings — canonical type

The data layer (`@casehub/data`) already defines `ColumnSettings` in `types.ts`. The spec's displayer column settings are the same concept — per-column display configuration. Rather than create a second `ColumnSettings` with different field names, the data layer's type is canonical. **Breaking change:** rename the data layer's fields to the cleaner names:

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
interface BarChartProps extends DisplayerCommon, ChartSettings {
  readonly subtype?: "column" | "column-stacked" | "bar" | "bar-stacked";
}

interface LineChartProps extends DisplayerCommon, ChartSettings {
  readonly subtype?: "line" | "smooth";
}

interface AreaChartProps extends DisplayerCommon, ChartSettings {
  readonly subtype?: "area" | "area-stacked";
}

interface PieChartProps extends DisplayerCommon, ChartSettings {
  readonly subtype?: "pie" | "donut";
}

interface ScatterChartProps extends DisplayerCommon, ChartSettings {}

interface BubbleChartProps extends DisplayerCommon, ChartSettings {}

interface TimeseriesProps extends DisplayerCommon, ChartSettings {}

interface TableProps extends DisplayerCommon {
  readonly pageSize?: number;
  readonly sortable?: boolean;
  readonly resizable?: boolean;
}

interface MetricProps extends DisplayerCommon {
  readonly html?: {
    readonly template?: string;
    readonly javascript?: string;
  };
}

interface MeterProps extends DisplayerCommon, ChartSettings {
  readonly end?: number;
  readonly warning?: number;
  readonly critical?: number;
}

interface SelectorProps extends DisplayerCommon {
  readonly subtype?: "dropdown" | "slider" | "labels";
}

interface MapProps extends DisplayerCommon {
  readonly subtype?: "regions" | "markers";
}

interface IframePluginProps extends DisplayerCommon {
  readonly componentId: string;
  readonly settings?: Readonly<Record<string, unknown>>;
}
```

### Design decisions

- **Subtypes are string unions on specific props types.** `BarChartProps.subtype` only accepts bar-related subtypes. The old Java `DisplayerSubType` enum allowed nonsensical combinations (`DONUT` on a bar chart). The typed model prevents this.
- **`lookup` is required on all displayers.** Every displayer needs data.
- **`ScatterChartProps` added.** Java `DisplayerType.SCATTERCHART` is preserved. Scatter shows (x, y) data points; bubble adds a third sizing dimension. They are distinct chart types.
- **`IframePluginProps` has the escape hatch** — `settings: Record<string, unknown>` for arbitrary 3rd-party component config. All casehub-owned components are fully typed plus `extra` on chart types.
- **Content components (`html`, `markdown`, `title`) are NOT displayers** — they have no `lookup`. They're `{ type: "html", props: { content: "..." } }`.

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
// Region channel
selector({ ..., filter: { notification: true, group: "region" } })
barChart({ ..., filter: { listening: true, group: "region" } })

// Time channel (independent of region)
selector({ ..., filter: { notification: true, group: "time" } })
lineChart({ ..., filter: { listening: true, group: "time" } })

// Ungrouped — hears ALL events
table({ ..., filter: { listening: true } })
```

Drill-down (click → navigate with context):
```typescript
barChart({
  ...,
  filter: {
    notification: true,
    drillDown: {
      target: "Region Detail",
      parameters: { region: "region" },
    },
  },
})
```

### Design rationale

Informed by analysis of [Grafana](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/), [Tableau](https://help.tableau.com/current/pro/desktop/en-us/actions_filter.htm), [Power BI](https://learn.microsoft.com/en-us/power-bi/guidance/relationships-bidirectional-filtering), [Databricks](https://docs.databricks.com/aws/en/dashboards/filters), and [CanvasXpress](https://www.canvasxpress.org/docs/broadcast.html):

- Page-scoped broadcast is the industry default. Every major tool starts here.
- Filter groups/channels are essential for non-trivial dashboards ([CanvasXpress `broadcastGroup`](https://www.canvasxpress.org/docs/broadcast.html), [Tableau targeted filter actions](https://help.tableau.com/current/pro/desktop/en-us/actions_filter.htm)).
- [Power BI warns extensively](https://learn.microsoft.com/en-us/power-bi/guidance/relationships-bidirectional-filtering) about implicit bidirectional filtering — the notification/listening model makes direction explicit.
- Drill-down is navigation, not filtering ([Grafana inter-dashboard links](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/), [Tableau dashboard actions](https://help.tableau.com/current/pro/desktop/en-us/actions_filter.htm)). They compose but are independently useful.

---

## 7. Dataset Integration

Components reference data via `DataSetLookup` (designed in issue #5):

```typescript
interface DisplayerCommon {
  readonly lookup: DataSetLookup;  // { dataSetId, operations }
}
```

**Global lookup defaults:** `global.displayer.lookup` is merged into every displayer's lookup per the shallow, per-field, own-wins semantics defined in §2. `rowCount` and `rowOffset` from `LookupDefaults` are extracted into displayer props, not passed through to `DataSetLookup`.

**Global dataset defaults:** `global.dataset` fields merge into every dataset definition. Individual datasets override.

**Resolution:** `lookup.dataSetId` resolves by walking up the page tree — the nearest ancestor page that defines a dataset with that `uuid` wins. Not found in any ancestor → `DataSetError("UNKNOWN_PROVIDER")`. No implicit dataset creation.

---

## 8. Property Substitution

Two distinct substitution mechanisms exist with the same `${...}` syntax. The parser must distinguish them.

### Dashboard property substitution (parse-time)

The root page's `properties` defines string variables replaced throughout the page tree **before** component parsing:

```yaml
properties:
  name: World
pages:
  - components:
      - html: "<h1>Hello ${name}</h1>"
```

In the DSL, properties are unnecessary — TypeScript template literals provide the same capability natively:
```typescript
const name = "World";
page("Hello", html(`<h1>Hello ${name}</h1>`))
```

**`allowUrlProperties`** — when true, query parameters override properties at runtime (`?name=Mundo`). Only applies in CLIENT mode. Preserved for backwards compatibility.

### Metric template substitution (render-time)

Metric components use `${value}`, `${title}`, and `${this}` as data-bound variables resolved at render time from the current dataset row:

```yaml
displayer:
  type: METRIC
  html:
    html: >-
      <div>${value}</div>
      <span id="${this}">${title}</span>
    javascript: >-
      ${this}.style.color = "red";
```

These are NOT dashboard properties. They are replaced by the metric renderer, not the YAML parser.

**Parser rule:** Property substitution skips the `html.template` and `html.javascript` fields of `MetricProps`. The substitution context is determined by field path — `metric.html.template` and `metric.html.javascript` contain render-time variables; all other string fields contain parse-time variables.

---

## 8a. Access Control & Page Loading Architecture

Three distinct access concerns, each enforced at a different layer:

### 1. Page-level access (server-enforced, real security)

Pages can be **inline** (content in the dashboard payload) or **lazy** (content fetched on navigation). Lazy pages enable server-enforced access control — the server decides per-request whether the user can see the page content.

```typescript
type PageEntry =
  | Component        // inline — always in the payload
  | LazyPage;        // lazy — fetched on demand, server checks access

interface LazyPage {
  readonly name: string;
  readonly href: string;
  readonly access?: AccessControl;
}
```

**Invisible omission:** Restricted pages are not blocked with a 403 — they're simply absent from the navigation. The user never sees tabs, tree entries, or menu items for pages they can't access. The navigation structure itself is access-controlled.

**How this works:**

The full dashboard definition on disk (YAML or TS) contains ALL pages, including restricted ones with `access` annotations. When the dashboard is served, the provider filters the page list based on the user's context:

| Provider | How it filters |
|----------|---------------|
| **Static web server** (nginx, CDN) | Each page is a separate file behind path-based ACL rules. The manifest lists all pages; the client fetches each and silently drops 403s from navigation. |
| **`@casehub/data-jvm`** (Quarkus) | The server reads the full dashboard, evaluates `access` annotations against the user's roles/permissions, and returns a personalized payload with only the authorized pages. |
| **Hybrid** | The manifest comes from the JVM (pre-filtered). Page content is served from static files or the JVM. Both enforce access. |

**Recursive filtering:** A page can contain nested pages (via tabs, panels, etc.). If a nested page has `access: { roles: ["admin"] }` and the user isn't admin, that tab/panel entry is omitted from the parent page's slots. The filtering is recursive — the server walks the component tree and prunes access-denied subtrees.

**Static file layout for lazy pages:**
```
/dashboard/
  manifest.json          # page list with names, hrefs, access annotations
  pages/
    overview.json        # public page content
    admin.json           # restricted page content (web server ACL)
    reports/
      sales.json         # restricted sub-page
      operations.json    # restricted sub-page
```

The client fetches `manifest.json` first, then lazily loads page content as the user navigates. For static deployments, the web server's ACL rules control access. For JVM deployments, the manifest itself is pre-filtered.

### 2. Conditional rendering (client-side, UX only — not security)

Components can declare `access` annotations for UX-level visibility. The client evaluates these against a `PermissionContext` and hides components that don't match. This is NOT security — the data is already on the client. It's UX: "don't show the admin control panel to non-admins."

```typescript
// On any Component
{ type: "panel", props: { title: "Admin Controls" },
  access: { roles: ["admin"] },
  slots: { content: [...] }
}
```

```typescript
// Runtime interface
interface PermissionContext {
  hasRole(role: string): boolean;
  hasPermission(permission: string): boolean;
}

const ALLOW_ALL: PermissionContext = {
  hasRole: () => true,
  hasPermission: () => true,
};
```

The renderer checks `access` before rendering. No `access` field = visible to everyone. `ALLOW_ALL` is the default — zero friction until real auth is wired in.

### 3. Row-level data filtering (server-enforced, real security)

Datasets can declare row-level access policies. Enforcement is server-side only (`@casehub/data-jvm`). The TS data engine in the browser ignores these — client-side row filtering provides no security.

```typescript
interface DataAccessPolicy {
  readonly rowFilter?: string;           // server-side filter expression
                                         // e.g. "tenant_id = ${user.tenantId}"
  readonly excludeColumns?: readonly string[];  // columns omitted for certain roles
}
```

Added to `ExternalDataSetDef`:

```typescript
interface ExternalDataSetDef {
  // ... existing fields
  readonly dataAccess?: DataAccessPolicy;
}
```

The `DataAccessPolicy` is a declaration in the model — "this dataset has row-level security." The `@casehub/data-jvm` engine reads it and applies the filter before returning results. The `@casehub/data` TS engine ignores it entirely. The `${user.tenantId}` syntax is resolved by the server against the authenticated user's context — a third substitution mechanism distinct from dashboard properties (parse-time) and metric templates (render-time).

### Design principle

The model is the single source of truth for what a dashboard describes — including its security posture. But enforcement is always server-side for real security. Client-side `access` checks are UX convenience only. This separation is explicit in the architecture:

| What | Declared in | Enforced by | Security? |
|------|------------|-------------|-----------|
| Page visibility | `PageEntry.access` | Server (JVM or web server ACL) | Yes |
| Component visibility | `Component.access` | Client (PermissionContext) | No (UX) |
| Row-level data | `ExternalDataSetDef.dataAccess` | `@casehub/data-jvm` | Yes |

---

## 8b. View State & Persistence

The model describes what a page tree IS. View state captures what the user HAS DONE — current navigation, filter selections, layout changes. They compose: `Page (model) + ViewState (interaction) → rendered view`.

### ViewState

```typescript
interface ViewState {
  readonly currentPage?: string;
  readonly expandedNodes?: readonly string[];
  readonly activeFilters?: Readonly<Record<string, readonly string[]>>;
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
  readonly componentId: string;
  readonly placement: GridPlacement;
}
```

### Client-side storage (layered)

| State type | Storage | Lifetime |
|-----------|---------|----------|
| Current page, filters, drill-down | `sessionStorage` | Dies with the tab |
| Layout overrides, expanded nodes, collapsed panels | `localStorage` | Survives browser restart |
| Cached page payloads, dataset results | `IndexedDB` | Survives restart, enables offline |

```typescript
interface StateStore {
  save(pageId: string, state: ViewState): void;
  load(pageId: string): ViewState | null;
  clear(pageId: string): void;
}
```

**Offline support:** When the network is unavailable, the runtime serves page definitions and dataset results from IndexedDB cache. The user sees stale data with a "last updated N minutes ago" indicator. When connectivity returns, fresh data replaces the cache.

### Server-side state sync (optional, cross-device)

When `@casehub/data-jvm` or `@casehub/data-relay` is available, state can round-trip to the server for cross-device continuity:

```typescript
interface RemoteStateSync {
  push(pageId: string, userId: string, state: ViewState): Promise<void>;
  pull(pageId: string, userId: string): Promise<ViewState | null>;
}
```

**Conflict resolution — URL wins, then local, then server:**
1. URL state (highest priority — explicit intent from a shared link)
2. `localStorage` / `sessionStorage` (local is fresher than server)
3. Server state (cross-device fallback)
4. Default state (clean start)

Server sync is fire-and-forget on save — debounced, non-blocking. The user never waits for a server round-trip to navigate.

### Deep linking (shareable URLs)

Not all state belongs in a URL. The URL encodes **navigation intent** — what the link sharer wants the recipient to see:

| In the URL | Not in the URL |
|------------|----------------|
| Current page path | Layout overrides (too large, personal preference) |
| Active filter selections | Expanded tree nodes (personal preference) |
| Drill-down position | Collapsed panels (personal preference) |
| Sort column + direction | Scroll positions (ephemeral) |
| Page parameters (data keys, actions) | |

```
#/page/Overview/Sales?filter=region:North,year:2024&drill=product:Widget&sort=revenue:DESC
```

**Data-keyed pages:** URL parameters override page properties via `${param}` substitution. This is the primary mechanism for email-driven workflows — an email links to a specific page keyed to specific data:

```
#/page/CaseReview?caseId=12345&action=approve&status=pending
```

The page uses `${caseId}` in dataset URLs, filter expressions, and conditional rendering. The URL carries the full intent — which page, which record, what action.

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

**URL is authoritative when present.** Opening a link overrides localStorage for current page and filters. Local-only state (layout, expanded nodes) is preserved from storage — the link controls navigation, not preferences.

**Generating shareable links:** A "share" action serializes the current navigation state to a URL. The recipient lands at the same page with the same filters and drill-down, but their own layout preferences.

### Tiny URLs (optional cache layer)

The full-state URL is always the canonical form — self-contained, works without a server. For email workflows where URL length or readability matters, an optional URL shortening cache maps a short token to the full URL:

```
Full URL (canonical, always works):
https://app.example.com/#/page/CaseReview?caseId=12345&action=approve&filter=status:pending

Tiny URL (optional, redirects to full URL):
https://app.example.com/v/abc123
```

The tiny URL service is a key→URL mapping with optional expiry and access checks. It stores the full URL, not a separate state object — no special model needed. On resolution, it 302-redirects to the full URL. The full URL remains the source of truth.

```typescript
// Server-side API (@casehub/data-relay or @casehub/data-jvm)
interface TinyUrlService {
  create(fullUrl: string, options?: {
    expiry?: Date;
    access?: AccessControl;
  }): Promise<string>;  // returns token

  resolve(token: string): Promise<string | null>;
  // Returns full URL, or null if expired / access denied
}
```

Benefits for email workflows:
- Short URLs (~60 chars) survive all email clients
- Expiry for time-sensitive links (approval requests)
- Access checks before redirect (server validates user before revealing the full URL)
- Click-through tracking (optional)

---

## 9. TypeScript DSL

Builder functions that construct the model types. Primary authoring API.

### Branded type handling

The data layer uses branded types (`ColumnId`, `DataSetId`) for compile-time safety. The DSL accepts plain strings and brands internally — callers write `lookup("sales")` not `lookup("sales" as DataSetId)`. The branding is an internal safety mechanism, not a user-facing API concern.

### Pages (the only entry point)

```typescript
function page(
  name: string,
  ...args: [...Component[], PageOptions?]
): Component;

interface PageOptions {
  readonly datasets?: readonly ExternalDataSetDef[];
  readonly settings?: PageSettings;
  readonly properties?: Record<string, string>;
}
```

There is no `dashboard()` or `app()` function. The root IS a page. A page with child pages, datasets, and settings — that's the entire model. `page()` accepts an optional `PageOptions` as the last argument (detected by type, same pattern as before).

### Layout

```typescript
function grid(columns: number, ...items: GridItem[]): Component;
function at(x: number, y: number, w: number, h: number, component: Component): GridItem;

function columns(distribution: number[], ...slotContents: Component[][]): Component;
function rows(...children: Component[]): Component;
function stack(...children: Component[]): Component;  // alias for rows
```

**`columns()` validation:** throws if `distribution.length !== slotContents.length`. The positional mapping from array index to slot name (`col-0`, `col-1`, ...) is a fixed convention — the same convention the Web Component uses for its `<slot name="col-N">` elements. Named parameters would add verbosity for zero safety gain since the validation catches mismatches at construction time.

### Navigation / Composition

All navigation builders share the same slot contract — interchangeable views over page subtrees.

```typescript
// Named-slot navigation (entries = [label, ...children])
function tabs(...entries: [string, ...Component[]][]): Component;
function pills(...entries: [string, ...Component[]][]): Component;
function sidebar(...entries: [string, ...Component[]][]): Component;
function tree(...entries: [string, ...Component[]][]): Component;
function menu(...entries: [string, ...Component[]][]): Component;
function accordion(...entries: [string, ...Component[]][]): Component;
function appGrid(...entries: [string, ...Component[]][]): Component;

// Single-child wrappers
function panel(title: string, ...children: Component[]): Component;
```

### Content

```typescript
function html(content: string): Component;
function markdown(content: string): Component;
function title(text: string, size?: string): Component;
```

### Displayers

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

### Dataset helpers

```typescript
function dataset(def: ExternalDataSetDef): ExternalDataSetDef;
function inlineDataset(uuid: string, content: unknown[],
  columns: ExternalColumnDef[]): ExternalDataSetDef;
```

### Lookup helpers

```typescript
function lookup(dataSetId: string, ...ops: DataSetOp[]): DataSetLookup;
// Accepts plain string, brands to DataSetId internally.

function groupBy(
  source: string | null,
  ...resultColumns: ResultColumn[]
): GroupOp;
// source: null → whole-dataset aggregation (groupingKey: null).
// GroupingKey defaults when source is non-null:
//   strategy: { mode: "distinct" }
//   maxIntervals: 15
//   emptyIntervals: false
//   ascendingOrder: true

function groupByCalendar(
  source: string,
  unit: FixedCalendarUnit,
  ...resultColumns: ResultColumn[]
): GroupOp;
// Convenience for fixedCalendar strategy.

function filterBy(
  column: string,
  fn: CoreFunctionType,
  ...args: readonly (string | number | Date)[]
): FilterOp;
// Uses CoreFunctionType, not bare string. Accepts Date for date columns.

function and(...filters: FilterOp[]): FilterOp;
function or(...filters: FilterOp[]): FilterOp;
function not(filter: FilterOp): FilterOp;
// Boolean combinators. filterBy() produces leaf expressions;
// and/or/not compose them into trees.

function sortBy(column: string,
  order?: "ASCENDING" | "DESCENDING"): SortOp;

// Result column helpers — return existing ResultColumn type from @casehub/data
function col(source: string): ResultColumn;      // key/select column
function sum(source: string): ResultColumn;       // SUM aggregate
function avg(source: string): ResultColumn;       // AVERAGE aggregate
function count(source: string): ResultColumn;     // COUNT aggregate
function min(source: string): ResultColumn;       // MIN aggregate
function max(source: string): ResultColumn;       // MAX aggregate
function distinct(source: string): ResultColumn;  // DISTINCT aggregate
function join(source: string, separator?: string): ResultColumn;  // JOIN aggregate
```

**`ResultColumn`** is the existing type from `@casehub/data` (`group.ts`). No new `ResultColumnDef` type. The `col()` helper infers `kind` from context: if the `source` matches the `groupBy` source, it's a `"key"` column; otherwise it's a `"select"` column. This inference happens inside `groupBy()` after all result columns are collected.

### Complete example

```typescript
// The root is a page. It carries datasets and settings for its subtree.
const salesApp = page("Sales",
  {
    datasets: [
      inlineDataset("sales", [
        ["North", "Widget", 50000, "2024-01-15"],
        ["South", "Gadget", 45000, "2024-02-20"],
      ], [
        { id: "region", type: ColumnType.LABEL },
        { id: "product", type: ColumnType.LABEL },
        { id: "revenue", type: ColumnType.NUMBER },
        { id: "date", type: ColumnType.DATE },
      ]),
    ],
    settings: { mode: "dark" },
  },
  // Child pages — navigation style chosen by the wrapper
  tabs(
    ["Overview",
      page("Overview",
        grid(12,
          at(0, 0, 4, 1, selector({
            subtype: "labels",
            lookup: lookup("sales", groupBy("region", col("region"))),
            filter: { notification: true, group: "region" },
          })),
          at(4, 0, 8, 2, barChart({
            title: "Revenue by Product",
            lookup: lookup("sales", groupBy("product", col("product"), sum("revenue"))),
            filter: { listening: true, group: "region" },
          })),
          at(0, 1, 4, 1, metric({
            title: "Total Revenue",
            lookup: lookup("sales", groupBy(null, sum("revenue"))),
            filter: { listening: true, group: "region" },
          })),
          at(0, 2, 12, 2, table({
            pageSize: 10,
            lookup: lookup("sales"),
            filter: { listening: true },
          })),
        ),
      ),
    ],
    ["Detail",
      page("Detail",
        columns([1, 1],
          [lineChart({
            title: "Trend",
            lookup: lookup("sales", groupBy("date", col("date"), sum("revenue"))),
          })],
          [pieChart({
            title: "By Region",
            subtype: "donut",
            lookup: lookup("sales", groupBy("region", col("region"), sum("revenue"))),
          })],
        ),
      ),
    ],
  ),
);

// Same page tree, different navigation — swap tabs() for sidebar()
// and the entire UX changes. No structural changes to the pages.
```

---

## 10. YAML Parser (backwards compatibility)

Zod schemas validate YAML input and produce the same model types. All 45+ existing example dashboards continue to work unchanged.

### Entry point

```typescript
export function parsePage(raw: unknown): Component;
```

### Pipeline

```
YAML string
  → js-yaml parse (raw object)
  → property substitution (${name} replacement, skipping metric template fields)
  → Zod schema validation
  → desugaring transforms (YAML shortcuts → Component tree)
  → Component (root page)
```

### Desugaring rules

| YAML shorthand | Model equivalent |
|---|---|
| `pages[].components: [...]` | `grid(12, at(0, y++, 12, 1, component))` — full-width stack |
| `pages[].rows[].columns[].span: 6` | `at(x, y, 6, 1, ...)` — span converted to grid placement |
| `html: "<h1>Hi</h1>"` | `{ type: "html", props: { content: "..." } }` |
| `markdown: "# Hi"` | `{ type: "markdown", props: { content: "..." } }` |
| `title: "Hi"` | `{ type: "title", props: { text: "..." } }` |
| `screen: "PageName"` | `{ type: "page-ref", props: { name: "..." } }` |
| `panel: "PageName"` | `{ type: "panel", props: { name: "..." } }` |
| `div: "divId"` | `{ type: "slot-target", props: { id: "..." } }` |
| `displayer.type: BARCHART` | `{ type: "bar-chart", props: { ... } }` |
| `type: TABS` | `{ type: "tabs", props: { ... } }` |
| `properties: { margin: 10px }` | `style: { margin: "10px" }` on the component |
| `lookup.rowCount: 10` | `rowCount: 10` on the displayer props (extracted from lookup) |

### Displayer settings desugaring

The flat dot-notation map (`chart.width: 100`, `general.title: "Foo"`) is unflattened into typed props. Known keys map to typed fields. `extraConfiguration` JSON string is parsed into the `extra` field on `ChartSettings`. Unknown keys on `iframe-plugin` type go to `settings` escape hatch. Unknown keys on casehub-owned displayer types are rejected (parse error).

### Navigation component desugaring (navGroupId + targetDivId)

The existing YAML format uses `navGroupId` + `targetDivId` + `NavTree` for indirect page composition:

```yaml
- type: TABS
  properties:
    navGroupId: Metrics
    targetDivId: Metrics_Div
- div: Metrics_Div

navTree:
  root_items:
    - type: GROUP
      id: Metrics
      children:
        - page: CPU Usage
        - page: Memory
```

The parser resolves this into direct slot composition:

1. Find each component with a `navGroupId` property
2. Look up the `navGroupId` in the `navTree` (if present) to find child page names
3. For each child page name, find the corresponding page in `pages` and extract its content
4. Map each child into a named slot on the navigation component (tab label → slot name)
5. Remove the `div` placeholder component — it's no longer needed (the content is inlined)
6. If no `navTree` is present, or the `navGroupId` is not found, fall back to using page names from the `pages` array that match the group ID

This is non-trivial semantic resolution but it's a parse-time concern — the model has no concept of `navGroupId` or `targetDivId`. The output is the same slot-based `tabs` component the DSL produces.

### Zod schema constraint

```typescript
const yamlRootPageSchema: z.ZodType<Component> = z.object({
  pages: z.array(yamlPageSchema).min(1),
  datasets: z.array(externalDataSetDefSchema).optional(),
  global: yamlPageSettingsSchema.optional(),
  properties: z.record(z.string()).optional(),
}).transform(normalizeToRootPage);
// The YAML `pages:` key is sugar — desugars to a root page containing child pages.
```

`z.ZodType<Component>` ensures the schema output matches the model interface. The parser returns a `Component` of type `"page"` — the root page.

### Reused existing code

- `externalDataSetDefSchema` from `@casehub/data` — unchanged
- `parseLookup()` from `@casehub/data` — called within displayer desugaring
- Filter, group, sort schemas — unchanged

---

## 11. File Organization

```
packages/
├── casehub-ui/                         # @casehub/ui
│   └── src/
│       ├── model/
│       │   ├── types.ts                # Component, PageProps, PageSettings, PageChild,
│       │   │                           #   LazyPage, GridItem, GridPlacement, AccessControl,
│       │   │                           #   FilterSettings, DrillDown, DataComponentDefaults,
│       │   │                           #   LookupDefaults, DataSetDefaults,
│       │   │                           #   RefreshSettings, PermissionContext, ALLOW_ALL
│       │   ├── displayer-types.ts      # DisplayerCommon, ChartSettings,
│       │   │                           #   BarChartProps, LineChartProps, ScatterChartProps,
│       │   │                           #   TableProps, MetricProps, MeterProps, SelectorProps,
│       │   │                           #   MapProps, IframePluginProps
│       │   ├── type-guards.ts          # isBarChart(), isTable(), ..., ComponentTypeRegistry,
│       │   │                           #   getProps()
│       │   └── index.ts
│       │
│       ├── dsl/
│       │   ├── builders.ts             # dashboard(), page(), grid(), at(), columns(),
│       │   │                           #   tabs(), panel(), barChart(), scatterChart(), etc.
│       │   ├── lookup-helpers.ts       # lookup(), groupBy(), groupByCalendar(),
│       │   │                           #   filterBy(), and(), or(), not(), sortBy(),
│       │   │                           #   col(), sum(), avg(), count(), etc.
│       │   └── index.ts
│       │
│       ├── parser/
│       │   ├── page-parser.ts     # parsePage()
│       │   ├── page-schema.ts     # Zod schemas
│       │   ├── component-desugar.ts    # YAML shorthand → Component transforms
│       │   ├── displayer-desugar.ts    # flat settings map → typed props
│       │   ├── nav-desugar.ts          # navGroupId + targetDivId → slot composition
│       │   ├── property-substitution.ts
│       │   └── index.ts
│       │
│       └── index.ts                    # public re-exports
│
├── casehub-data/                       # @casehub/data (existing packages/core/)
│   └── src/
│       ├── dataset/                    # types, lookup, filter, group, sort, ops, manager
│       │   └── external/              # ExternalDataSetDef, providers, extraction, presets
│       └── expression/                # evaluator, jsonata-bridge
│
├── casehub-viz/                        # @casehub/viz (replaces React components/)
│   └── src/
│       ├── bar-chart.ts               # <casehub-bar-chart>
│       ├── line-chart.ts              # <casehub-line-chart>
│       ├── pie-chart.ts              # <casehub-pie-chart>
│       ├── scatter-chart.ts           # <casehub-scatter-chart>
│       ├── table.ts                   # <casehub-table>
│       ├── metric.ts                  # <casehub-metric>
│       ├── meter.ts                   # <casehub-meter>
│       ├── selector.ts               # <casehub-selector>
│       ├── map.ts                     # <casehub-map>
│       ├── timeseries.ts             # <casehub-timeseries>
│       ├── bubble-chart.ts           # <casehub-bubble-chart>
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
- All component types (bar, line, area, pie, scatter, table, metric, meter, selector, map, timeseries, bubble, html, markdown, title, tabs, panel, screen)
- `extraConfiguration` passthrough for ECharts native options (as `ChartSettings.extra`)

**Modernized:**
- `dragTypeName` Java class names → clean string type IDs (`"bar-chart"`, `"tabs"`)
- Flat `Map<String, String>` settings → typed props per displayer type
- Bootstrap 12-column `span` → CSS Grid coordinate placement with `{x, y, w, h}`
- Fixed Row/Column hierarchy → slot-based recursive component tree
- React iframe components → Web Components with Shadow DOM
- YAML-only authoring → TypeScript DSL as primary, YAML as secondary
- `LayoutComponentPart` / CSS parts → standard Web Component `::part()` selectors
- `navGroupId` + `targetDivId` indirection → direct slot composition
- `ColumnSettings` field names → cleaner `id`, `name`, `expression`, `pattern`, `empty`

**Dropped:**
- `dragTypeName` (Java class name identifiers — replaced by clean type strings)
- `LayoutComponentPart` (editor-specific CSS plumbing — replaced by Web Component `::part()`)
- `DisplayerSubType` as a shared enum (replaced by per-type `subtype` unions)
- `DataSetLookup.metadata` (zero consumers — removed per YAGNI, issue #5)
- `RuntimeModel.lastModified` (storage metadata, not model)

---

## 13. Testing Strategy

### Model types (`casehub-ui/src/model/`)
- Immutability: all returned objects are frozen
- Type discrimination: each component type maps to correct props interface
- Type guards: `isBarChart()` correctly narrows, rejects wrong types
- ComponentTypeRegistry: `getProps()` returns typed props, throws on mismatch

### DSL builders (`casehub-ui/src/dsl/`)
- Each builder: correct `type`, `props`, `style`, and `slots` structure
- `grid()` + `at()`: placement validation (no overlaps, within column bounds)
- `columns()`: distribution normalization; throws on length mismatch with slot contents
- `tabs()`, `panel()`, `accordion()`: correct slot naming from labels
- `page()` with options: datasets/settings extraction from variadic args
- Composition: nested builders produce valid recursive trees
- Branded types: `lookup("sales")` produces `DataSetId`; `filterBy("col", ...)` produces `ColumnId`
- Filter combinators: `and(filterBy(...), or(filterBy(...), filterBy(...)))` produces correct expression tree
- `groupBy(null, sum("revenue"))` produces `groupingKey: null`
- `groupBy("region", col("region"))` with default strategy/maxIntervals/etc.
- `groupByCalendar("date", "MONTH", col("date"), sum("revenue"))` produces fixedCalendar strategy
- `col()`, `sum()`, `avg()` etc. produce correct `ResultColumn` from `@casehub/data`

### YAML parser (`casehub-ui/src/parser/`)
- **All 45+ existing example dashboards parse without error** — backwards compatibility regression suite
- Property substitution: `${name}` replaced; metric template `${value}`, `${title}`, `${this}` NOT replaced
- Desugaring: `components` shorthand → grid, `rows`/`columns`/`span` → grid placements
- Component shortcuts: `html`, `markdown`, `title`, `screen`, `panel`, `div` → correct Component type
- `properties` on components → `style` field on Component
- Displayer desugaring: flat dot-notation → typed props, `extraConfiguration` → `ChartSettings.extra`, unknown keys rejected (casehub types) or collected (iframe-plugin)
- `rowCount`/`rowOffset` in lookup YAML → extracted to displayer props, NOT in DataSetLookup
- Navigation desugaring: `navGroupId` + `targetDivId` + navTree → resolved into named slots
- Global merge: displayer defaults merged into each component (shallow, per-field, own-wins)
- Global dataset merge: dataset defaults merged into each definition
- Lookup parsing: delegates to existing `parseLookup()` — no duplication
- Error paths: missing pages → ZodError, invalid displayer type → ZodError, unknown dataset ref → validation warning
- Round-trip: DSL-built dashboard serialized to YAML, re-parsed, produces equivalent model

### Cross-filtering (`FilterSettings`)
- Page-scoped broadcast: emitter → all listeners on page
- Group scoping: emitter in group → only group listeners
- Ungrouped listener: receives events from all emitters
- Self-apply: emitter filters itself when enabled
- Drill-down: produces navigation event with parameter mapping

### Access control & page loading
- `ALLOW_ALL` PermissionContext: all checks return true
- Component with `access: { roles: ["admin"] }` + non-admin context → not rendered
- Component without `access` → always rendered regardless of context
- `LazyPage` with `href` → resolved to inline Component on fetch
- Page filtering: dashboard with 5 pages, 2 restricted → filtered payload has 3 pages
- Recursive filtering: tabs component with 3 tabs, 1 restricted → 2 tabs in output
- Navigation omission: restricted pages absent from tab/tree/menu entries (not blocked, invisible)
- `DataAccessPolicy` on dataset: model carries declaration, TS engine ignores it

### ColumnSettings migration (`@casehub/data`)
- Renamed fields (`id` not `columnId`, `name` not `columnName`, etc.) compile and pass all existing tests
- `Column.settings` references updated

---

## 14. Deferred Concerns

Items out of scope for issue #8:

- **DnD visual builder** — pure TS implementation operating over this model. The builder generates the model; the model is the source of truth.
- **Web Component implementations** (`@casehub/viz`) — the custom elements that render each component type. Separate issue.
- **`@casehub/ui` extraction** — making the component model + layout a standalone shared package for other casehub UIs. Noted as the architectural direction; extraction is a later concern.
- **Responsive layouts** — breakpoint-aware grid configurations (`ResponsiveLayouts` from react-grid-layout). Backwards-compatible addition.
- **Workspace layout primitives** — `split()` (resizable panes) for IDE-like layouts. Same component model, different layout component type. Another casehub app needs this.
- **JSON Schema generation** — from Zod schemas, for editor tooling and external validation.
- **`@casehub/data-relay`** — Quarkus server-side HTTP proxy.
- **Component registration / manifest** — how `@casehub/viz` registers component types with `@casehub/ui` so the DnD builder knows what's available, what slots they accept, and what props they expose.
- **Undo/redo** — model diffing for the DnD builder's edit history.
- **Theming** — CSS custom properties for dark/light mode and brand customization across Web Components.
