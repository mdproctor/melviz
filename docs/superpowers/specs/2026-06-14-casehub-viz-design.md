# @casehub/viz — Web Component Visualization Layer

Covers issue #11. Designs `@casehub/viz` — a package of Web Component wrappers for visualization. Each component is a custom element (`<casehub-bar-chart>`, `<casehub-table>`, etc.) that receives data and typed props, and renders using Apache ECharts or custom HTML.

**Architectural decisions made during brainstorming:**
- **Connected components (Approach B)** — components self-activate on DOM insertion via `connectedCallback`, dispatch a `casehub-data-request` event to announce what data they need, and an ancestor (site runtime) resolves and pushes the data back. Direct property setting (`el.dataset = ...`) also works for standalone/testing use.
- **Event-based context** — no globals, no ancestor type coupling. Components dispatch events upward, data flows down via properties. Standard Web Component composition.
- **ECharts 6.x** — confirmed as the right charting library. Covers all chart types (bar, line, area, pie, scatter, bubble, timeseries, map, gauge). Tree-shakeable to ~100kB. No single alternative covers the full range.
- **Three-level class hierarchy** — `CasehubElement<P>` (base, generic) → `CasehubChartElement<P>` (ECharts) → concrete chart. Non-ECharts components extend base directly.
- **Four-stage option pipeline** — dataset → subtype → typed settings → deep merge `extra` (arrays replace, objects deep-merge).
- **All 13 components in scope** — no deferral. The base class handles shared complexity; each component is a thin mapping layer.

**Required changes to `@casehub/ui` (displayer-types.ts):**
- `MapProps` must extend `DataComponentCommon, ChartSettings` (currently extends `DataComponentCommon` only — missing legend, margin, extra passthrough that ECharts geo/scatter maps need). This matches the flat inheritance pattern used by all other chart types (`BarChartProps extends DataComponentCommon, ChartSettings`, etc.). Inapplicable fields (xAxis, yAxis) are simply ignored, same as `PieChartProps`.
- `MapProps` must add `mapName?: string` — the registered ECharts map name (e.g., `"world"`, `"usa"`). `colorScheme` remains a color palette for choropleth, not a map identifier.

---

## 1. Package Architecture

```
@casehub/viz
├── base/
│   ├── CasehubElement.ts          ← base class for all components
│   ├── CasehubChartElement.ts     ← ECharts intermediate class
│   ├── deep-merge.ts              ← deep merge utility (arrays replace, objects merge)
│   └── cell-extract.ts            ← cellToRaw() — CellValue → raw JS value
├── charts/
│   ├── CasehubBarChart.ts
│   ├── CasehubLineChart.ts
│   ├── CasehubAreaChart.ts
│   ├── CasehubPieChart.ts
│   ├── CasehubScatterChart.ts
│   ├── CasehubBubbleChart.ts
│   ├── CasehubTimeseries.ts
│   ├── CasehubMeter.ts            ← ECharts gauge
│   └── CasehubMap.ts              ← ECharts geo
├── components/
│   ├── CasehubTable.ts            ← custom HTML rendering
│   ├── CasehubMetric.ts
│   ├── CasehubSelector.ts
│   └── CasehubIframePlugin.ts     ← iframe passthrough
└── index.ts                       ← registers all custom elements
```

### Dependencies

```
@casehub/viz → @casehub/ui/model (Component, typed props)
             → @casehub/data (TypedDataSet, DataSetLookup, ColumnType, CellValue)
             → echarts 6.x (tree-shaken per component)
```

### Yarn workspace

`packages/casehub-viz/` alongside `packages/casehub-ui/` and `packages/core/`. Vitest for tests. TypeScript compiled to ESM.

---

## 2. Class Hierarchy

### VizComponentProps (base constraint)

The minimum props contract that any viz component must satisfy. All 13 component props types have these fields (required in `DataComponentCommon`, optional in `IframePluginProps`):

```typescript
interface VizComponentProps {
  readonly lookup?: DataSetLookup;
  readonly filter?: FilterSettings;
  readonly refresh?: RefreshSettings;
  readonly columns?: readonly ColumnSettings[];
}
```

### CasehubElement\<P extends VizComponentProps\> (base)

All 13 components extend this with their typed props parameter. The generic constraint ensures `this.props.lookup`, `this.props.filter`, `this.props.refresh`, and `this.props.columns` are type-safe without casts. Responsibilities:

- **Shadow DOM** — creates a shadow root with a container `<div>` in the constructor.
- **Properties** — `props: P` (typed per component via generic), `dataset: TypedDataSet`, `totalRows: number` (for server-side pagination), `theme: string` (set by site runtime from `PageSettings.mode`), `error: string` (set by site runtime on data resolution failure). Property setters trigger `update()`.
- **Connected lifecycle** — `connectedCallback` dispatches `casehub-data-request` if `props?.lookup` exists. The `props` setter also dispatches `casehub-data-request` when the element is already connected and the lookup has changed. This makes the component robust to any insertion order and to lookup changes (drill-down, navigation).
- **Refresh timer** — when `props.refresh.interval` is set, starts a `setInterval` in `connectedCallback` that re-dispatches `casehub-data-request`. Cleared in `disconnectedCallback`.
- **Resize observer** — watches the container for size changes, calls `onResize()` (overridable).
- **Abstract `render(container, props, dataset)`** — subclasses implement this.

```typescript
abstract class CasehubElement<P extends VizComponentProps> extends HTMLElement {
  protected shadow: ShadowRoot;
  protected container: HTMLDivElement;

  private _props: P | undefined;
  private _dataset: TypedDataSet | undefined;
  private _totalRows: number | undefined;
  private _theme: string | undefined;
  private _error: string | undefined;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _resizeObserver: ResizeObserver | undefined;
  private _dataRequested: boolean = false;

  set props(value: P) {
    const oldLookup = this._props?.lookup;
    const newLookup = value?.lookup;
    if (oldLookup !== newLookup) {
      this._dataRequested = false;
      this._dataset = undefined;
    }
    this._props = value;
    this.requestDataIfNeeded();
    this.update();
  }
  get props(): P | undefined { return this._props; }

  set dataset(value: TypedDataSet) { this._dataset = value; this._error = undefined; this.update(); }
  get dataset(): TypedDataSet | undefined { return this._dataset; }

  set totalRows(value: number) { this._totalRows = value; this.update(); }
  get totalRows(): number | undefined { return this._totalRows; }

  set theme(value: string) { this._theme = value; this.update(); }
  get theme(): string | undefined { return this._theme; }

  set error(value: string) { this._error = value; this._dataset = undefined; this.update(); }
  get error(): string | undefined { return this._error; }

  connectedCallback(): void {
    this.requestDataIfNeeded();
    this.startRefreshTimer();
    this.startResizeObserver();
  }

  disconnectedCallback(): void {
    this._dataRequested = false;
    this.stopRefreshTimer();
    this.stopResizeObserver();
  }

  private requestDataIfNeeded(): void {
    if (!this.isConnected || this._dataRequested) return;
    const lookup = this._props?.lookup;  // type-safe via VizComponentProps constraint
    if (!lookup) return;
    this._dataRequested = true;
    this.dispatchEvent(new CustomEvent('casehub-data-request', {
      bubbles: true, composed: true,
      detail: { element: this, lookup }
    }));
  }

  protected update(): void {
    if (!this.isConnected) return;
    if (this._error) { this.renderError(this.container, this._error); return; }
    if (!this._props) { this.renderLoading(this.container); return; }
    if (!this._dataset) { this.renderLoading(this.container); return; }
    this.render(this.container, this._props, this._dataset);
  }

  protected renderLoading(container: HTMLDivElement): void { /* default loading indicator */ }
  protected renderError(container: HTMLDivElement, message: string): void { /* default error display */ }
  protected onResize(): void { /* default no-op, overridable */ }
  protected abstract render(container: HTMLDivElement, props: P, dataset: TypedDataSet): void;
}
```

### CasehubChartElement\<P extends DataComponentCommon & ChartSettings\> (ECharts intermediate)

Extends `CasehubElement<P>` with the tighter constraint `P extends DataComponentCommon & ChartSettings`. This makes `this.props.legend`, `this.props.xAxis`, `this.props.filter`, `this.props.columns` all type-safe without casts. Adds:

- **ECharts instance management** — `echarts.init(container, theme)` on first render, `chart.dispose()` in `disconnectedCallback`.
- **Theme** — uses `this.theme` (inherited from base, set by site runtime). Re-initializes chart instance on theme change (dispose + re-init).
- **Resize** — overrides `onResize()` to call `chart.resize()`.
- **Click-to-filter** — registers an ECharts `click` event handler that emits `casehub-filter` (see §3.3). The handler reads `this.dataset` at call time (not a captured closure) to avoid stale references after data updates.
- **Render implementation** — calls `buildOption()`, then `chart.setOption(option, true)`.
- **Abstract `buildOption(props, dataset): EChartsOption`** — subclasses implement this.

```typescript
abstract class CasehubChartElement<P extends DataComponentCommon & ChartSettings>
  extends CasehubElement<P> {

  protected chart: ECharts | undefined;
  private _currentTheme: string | undefined;

  protected render(container: HTMLDivElement, props: P, dataset: TypedDataSet): void {
    if (!this.chart || this._currentTheme !== this.theme) {
      this.chart?.dispose();
      this.chart = echarts.init(container, this.theme);
      this._currentTheme = this.theme;
      this.chart.on('click', (params) => this.onChartClick(params));
    }
    const option = this.buildOption(props, dataset);
    this.chart.setOption(option, true);
  }

  protected onChartClick(params: ECElementEvent): void {
    if (!this.dataset) return;
    const filterProps = this.props?.filter;  // type-safe via constraint
    if (!filterProps?.enabled) return;

    const columnId = this.dataset.columns[0]!.id;
    this.dispatchEvent(new CustomEvent('casehub-filter', {
      bubbles: true, composed: true,
      detail: {
        columnId,
        rowIndex: params.dataIndex,
        reset: false,
        group: filterProps.group,
      }
    }));
  }

  protected onResize(): void {
    this.chart?.resize();
  }

  disconnectedCallback(): void {
    this.chart?.dispose();
    this.chart = undefined;
    super.disconnectedCallback();
  }

  protected abstract buildOption(props: P, dataset: TypedDataSet): EChartsOption;
}
```

### Concrete components

Each ECharts component implements `buildOption()`. Each non-ECharts component implements `render()` directly.

Example:
```typescript
class CasehubBarChart extends CasehubChartElement<BarChartProps> {
  protected buildOption(props: BarChartProps, dataset: TypedDataSet): EChartsOption {
    // Stage 1–4 pipeline (see §4)
  }
}
customElements.define('casehub-bar-chart', CasehubBarChart);
```

---

## 3. Data Flow & Event Protocol

### 3.1 Connected lifecycle

1. Component inserted into DOM → `connectedCallback` fires → calls `requestDataIfNeeded()`.
2. If `props` is already set and has a `lookup`, dispatches `casehub-data-request` (bubbles, composed):
   ```typescript
   detail: { element: this, lookup: this.props.lookup }
   ```
3. If `props` is not yet set, nothing happens. When `props` is later set via the property setter, `requestDataIfNeeded()` fires and dispatches the event (since `isConnected` is now true).
4. Ancestor (site runtime) handles event, resolves lookup via DataSetManager.
5. Ancestor sets `el.dataset = typedDataSet` and `el.totalRows = n` and `el.theme = mode`.
6. Property setter triggers `update()` → `render()`.

This makes the component robust to any insertion ordering — the data request fires from whichever happens last: DOM insertion or props assignment.

### 3.2 Standalone usage

Set `el.dataset` directly as a property. No event dispatched. Component renders immediately. Works for testing, embedding, or any context without a site runtime ancestor.

### 3.3 Click-to-filter mapping

When a user clicks a data point in an ECharts chart, the chart's click handler maps the ECharts event to a `casehub-filter` event:

**ECharts click event provides:** `{ dataIndex, seriesIndex, seriesName, name, value, componentType }`

**Mapping to filter event:**
- `columnId` — the category column (first column in the dataset, or the explicit group key column from the lookup). This is the column being filtered.
- `rowIndex` — `params.dataIndex` from ECharts. This is the row index in the current dataset.
- `reset` — always `false` for chart click events. Filter reset is handled by the site runtime via UI controls (toolbar buttons), not by chart interaction — matching the GWT precedent.
- `group` — from `props.filter.group` (the filter group this component belongs to).

The click handler is defined on `CasehubChartElement` (see §2). It is registered once when the ECharts instance is created and reads `this.dataset` at call time — not a captured closure — to avoid stale references after data updates:

```typescript
protected onChartClick(params: ECElementEvent): void {
  if (!this.dataset) return;
  const filterProps = this.props?.filter;  // type-safe via P extends DataComponentCommon
  if (!filterProps?.enabled) return;

  const columnId = this.dataset.columns[0]!.id;  // category column
  this.dispatchEvent(new CustomEvent('casehub-filter', {
    bubbles: true, composed: true,
    detail: {
      columnId,
      rowIndex: params.dataIndex,
      reset: false,
      group: filterProps.group,
    }
  }));
}
```

The **site runtime** receives the event, looks up `dataset.rows[rowIndex].cell(columnId)` to get the actual value, and builds the appropriate `FilterExpression` (e.g., `EQUALS_TO` on the column). The component does not construct filter expressions — it identifies the click target, and the runtime constructs the filter.

**Per chart type:**

| Chart type | Category column | dataIndex meaning |
|-----------|----------------|-------------------|
| Bar / Line / Area | First column (x-axis labels) | Row in dataset |
| Pie | First column (slice labels) | Row in dataset |
| Scatter / Bubble | First column | Row in dataset |
| Timeseries | First column (DATE type) | Row in dataset |
| Map | Region/marker identifier column | Row in dataset |

All chart types use the same mapping: `dataIndex` → row index, first column → category column. This is consistent because the ECharts `dataset.source` format (§4 Stage 1) preserves the row ordering from `TypedDataSet`.

### 3.4 Event protocol

| Event | Dispatched by | Detail shape | Handled by |
|-------|--------------|-------------|------------|
| `casehub-data-request` | All viz components | `{ element: CasehubElement, lookup: DataSetLookup }` | Site runtime — resolves data, sets dataset/totalRows/theme properties |
| `casehub-filter` | Charts, selector | `{ columnId: ColumnId, rowIndex: number, reset: boolean, group?: string }` | Site runtime — resolves value from dataset, builds FilterExpression, pushes updated datasets |
| `casehub-page` | Table | `{ offset: number, count: number }` | Site runtime — re-resolves lookup with new rowOffset/rowCount |
| `casehub-sort` | Table | `{ columnId: ColumnId, order: SortOrder }` | Site runtime — re-resolves lookup with sort op |

### 3.5 Refresh

The component owns its timer. When `props.refresh.interval` is set, `connectedCallback` starts a `setInterval`. Each tick resets `_dataRequested = false` and calls `requestDataIfNeeded()`. `disconnectedCallback` clears the timer.

### 3.6 Cross-filtering

A user clicks a data point → the chart emits `casehub-filter` with `columnId` and `rowIndex`. The site runtime receives it, looks up the actual cell value from the dataset, builds a `FilterExpression`, applies it to affected datasets (scoped by `FilterSettings.group`), and pushes updated `dataset` properties to all components in that filter group. `FilterSettings.selfApply` controls whether the emitting component also receives filtered data.

### 3.7 Site runtime contract

The site runtime is out of scope for #11. It will be a new TypeScript component — not the GWT `RuntimeEntryPoint`. The contract that `@casehub/viz` depends on:

**Any ancestor element that:**
1. Listens for `casehub-data-request` events and resolves the `lookup` to a `TypedDataSet`
2. Sets `dataset`, `totalRows`, `theme`, and `error` properties on the source element (`detail.element`)
3. Listens for `casehub-filter`, `casehub-page`, `casehub-sort` events and applies them to the data pipeline
4. Pushes updated datasets to affected components after filter/page/sort changes

A test harness satisfies this contract by listening for events and setting properties directly. The production site runtime delegates to `DataSetManager` from `@casehub/data`.

---

## 4. ECharts Option Mapping Pipeline

All `CasehubChartElement` subclasses follow a four-stage pipeline in `buildOption()`:

### Stage 1 — Dataset to ECharts source

Convert `TypedDataSet` into ECharts `dataset.source` — an array-of-arrays with the first row as column display names. Uses `cellToRaw()` to extract the raw JS value from the `CellValue` discriminated union, and `resolveColumnName()` to apply `props.columns` display name overrides:

```typescript
function cellToRaw(cell: CellValue): string | number | Date | null {
  if (cell.type === "NULL") return null;
  return cell.value;
}

function resolveColumnName(
  column: Column,
  propsColumns?: readonly ColumnSettings[],
): string {
  const override = propsColumns?.find(c => c.id === column.id);
  return override?.name ?? column.settings?.name ?? column.name;
}

function datasetToSource(
  dataset: TypedDataSet,
  propsColumns?: readonly ColumnSettings[],
): (string | number | Date | null)[][] {
  return [
    dataset.columns.map(c => resolveColumnName(c, propsColumns)),
    ...dataset.rows.map(row =>
      dataset.columns.map(c => cellToRaw(row.cell(c.id)))
    ),
  ];
}
```

`cellToRaw()` is the typed counterpart to `cellToString()` in `conversion.ts`. It preserves the native JS type (number stays number, Date stays Date) rather than serializing to string — ECharts needs typed values for axis scaling, date formatting, and numeric comparisons.

`resolveColumnName()` resolves display names through a priority chain: `props.columns` override → `column.settings.name` → `column.name`. This ensures YAML authors who set custom column display names see those names in chart legends, axis labels, and tooltips. The `ColumnSettings` type (`@casehub/data`) has `id: ColumnId` and `name?: string`.

### Stage 2 — Apply subtype

Map the typed `subtype` enum to ECharts configuration:

| Component | Subtype | ECharts mapping |
|-----------|---------|----------------|
| bar-chart | `column` | `xAxis: {type: 'category'}, yAxis: {type: 'value'}` (default) |
| bar-chart | `bar` | `xAxis: {type: 'value'}, yAxis: {type: 'category'}` (rotated) |
| bar-chart | `column-stacked` | default + `series[].stack: 'total'` |
| bar-chart | `bar-stacked` | rotated + `series[].stack: 'total'` |
| line-chart | `line` | `series[].type: 'line'` (default) |
| line-chart | `smooth` | `series[].type: 'line', series[].smooth: true` |
| area-chart | `area` | `series[].type: 'line', series[].areaStyle: {}` |
| area-chart | `area-stacked` | `series[].type: 'line', series[].areaStyle: {}, series[].stack: 'total'` |
| pie-chart | `pie` | `series[].type: 'pie'` (default) |
| pie-chart | `donut` | `series[].type: 'pie', series[].radius: ['40%', '70%']` |
| scatter-chart | *(no subtype)* | `series[].type: 'scatter'`. If dataset has ≥3 columns, column 3 maps to `series[].symbolSize` via a callback function. |
| bubble-chart | *(no subtype)* | `series[].type: 'scatter'`. Column 3 maps to `symbolSize` scaled between `props.minRadius` (default 5) and `props.maxRadius` (default 50) using linear interpolation across the column's value range. |
| timeseries | *(no subtype)* | `xAxis: { type: 'time' }`, `series[].type: 'line'`. First column must be DATE type. ECharts handles date axis formatting automatically. `tooltip.trigger: 'axis'` for crosshair-style time tooltips. |
| meter | *(no subtype)* | `series[].type: 'gauge'`. Value from dataset's first row, first value column. `props.end` → `max`. Color bands via `axisLine.lineStyle.color`: `[[warning/end, '#91cc75'], [critical/end, '#fac858'], [1, '#ee6666']]`. When `warning` or `critical` is absent, single-color gauge. |
| map (regions) | `regions` | `geo: { map: '<mapName>' }`, `visualMap` for choropleth coloring from value column, `series[].type: 'map'`. Requires registered map GeoJSON via `echarts.registerMap()`. |
| map (markers) | `markers` | `geo: { map: '<mapName>' }`, `series[].type: 'scatter'`, `series[].coordinateSystem: 'geo'`. Data columns: [name, longitude, latitude, value]. |

### Stage 3 — Apply typed settings

Map typed props (TypeScript access paths, flat via `ChartSettings` inheritance) to ECharts option paths:

| TypeScript access | ECharts option |
|-------------------|---------------|
| `props.title` | `title.text` |
| `props.legend?.show` | `legend.show` |
| `props.legend?.position` | `legend.top/left/right/bottom` (mapped: `"top"` → `{top: 0}`, `"bottom"` → `{bottom: 0}`, `"left"` → `{left: 0, orient: 'vertical'}`, `"right"` → `{right: 0, orient: 'vertical'}`) |
| `props.xAxis?.title` | `xAxis.name` |
| `props.xAxis?.showLabels` | `xAxis.axisLabel.show` |
| `props.yAxis?.title` | `yAxis.name` |
| `props.yAxis?.showLabels` | `yAxis.axisLabel.show` |
| `props.margin?.top` | `grid.top` |
| `props.margin?.right` | `grid.right` |
| `props.margin?.bottom` | `grid.bottom` |
| `props.margin?.left` | `grid.left` |
| `props.zoom` | `dataZoom: [{ type: 'inside' }, { type: 'slider' }]` |
| `props.resizable` | (handled by container CSS, not ECharts) |

Note: `props.legend`, `props.margin`, `props.xAxis` etc. are flat properties on the props object — not nested under a `chart` key. The YAML desugar reads from the YAML `chart:` key and flattens into the typed props (see `displayer-desugar.ts`). The `buildOption()` implementation reads the flat TypeScript props.

Stage 3 is skipped for chart types that don't use Cartesian axes (pie, meter). Map uses a subset (legend, margin — no xAxis/yAxis).

### Stage 4 — Deep merge `extra`

`props.extra` is deep-merged onto the option from stages 1–3. `extra` wins on conflict — it's the user's explicit escape hatch to any ECharts feature not covered by typed props.

**Merge semantics:**
- **Objects** — deep-merged recursively. `extra: { xAxis: { name: "Revenue" } }` sets the axis name without wiping out axis type, data, or other properties.
- **Arrays** — replaced entirely. `extra: { series: [{ color: 'red' }] }` replaces the whole series array. This is intentional — users setting `extra.series` are overriding the auto-generated series configuration.
- **Primitives** — replaced.

This matches the mental model of `extra` as an override layer: "I want to set this specific ECharts option to this specific value." Array replacement is more predictable than index-matching — when a user writes `extra: { dataZoom: [{ type: 'inside' }] }`, they mean "use only this dataZoom", not "merge with the first existing dataZoom."

---

## 5. ECharts Component Details

### Meter (`<casehub-meter>`)

Extends `CasehubChartElement<MeterProps>`. Uses ECharts gauge series.

`buildOption()` mapping:
- Value: first row, first value column (NUMBER type) from dataset
- `props.end` → `series[0].max` (gauge maximum)
- `props.warning` / `props.critical` → `series[0].axisLine.lineStyle.color` as proportional bands:
  ```typescript
  const bands: [number, string][] = [];
  if (warning) bands.push([warning / end, '#91cc75']);  // green zone
  if (critical) bands.push([critical / end, '#fac858']); // yellow zone
  bands.push([1, '#ee6666']);  // red zone
  ```
- When `warning` or `critical` is absent, single solid color

### Map (`<casehub-map>`)

Extends `CasehubChartElement<MapProps>`. Uses ECharts geo/scatter-map.

`buildOption()` mapping:

**Subtype `regions`** (choropleth):
- Requires map GeoJSON registered via `echarts.registerMap(mapName, geoJson)`. Map name from `props.mapName` (defaults to `"world"` if absent).
- `visualMap: { min, max, inRange: { color: [...] } }` for choropleth coloring
- `series[0].type: 'map'`, `series[0].map: mapName`
- Data: `[{ name: regionName, value: number }]` derived from first two columns

**Subtype `markers`** (scatter on geo):
- Same geo registration
- `series[0].type: 'scatter'`, `series[0].coordinateSystem: 'geo'`
- Data columns: `[name, longitude, latitude, value?]`
- Symbol size from value column if present

---

## 6. HTML Components

### Table (`<casehub-table>`)

Extends `CasehubElement<TableProps>` directly. Renders a `<table>` inside Shadow DOM.

**Features:**
- Header row from column names
- Rows from dataset
- **Client-side pagination** when `totalRows` is absent or equals `dataset.rows.length` — component owns page state, slices locally
- **Server-side pagination** when `totalRows > dataset.rows.length` — page changes emit `casehub-page` event with `{ offset, count }`
- **Sortable columns** (click header) — local sort when client-side, emits `casehub-sort` when server-side
- Column resize via drag (when `props.resizable` is true)
- CSV export (when `props.csvExport` is true)
- Click-to-filter: clicking a cell emits `casehub-filter` with `{ columnId: clickedColumn, rowIndex: clickedRow }`

### Metric (`<casehub-metric>`)

Extends `CasehubElement<MetricProps>`. Renders a single value prominently. The dataset's first row, first column provides the value.

**Subtypes:**
- `card` — styled card with title and large value display
- `card2` — alternative card layout (compact)
- `plain-text` — minimal text rendering, no card frame
- `quota` — value with a target/max indicator bar

When `props.html.template` is set, renders the template with `${value}` substitution instead of the default layout.

### Selector (`<casehub-selector>`)

Extends `CasehubElement<SelectorProps>`. An input component — renders filter controls, not data visualization.

**Subtypes:**
- `dropdown` — `<select>` element populated with distinct values from the target column
- `slider` — range slider for numeric columns
- `labels` — clickable label chips

On selection change, emits `casehub-filter` with `{ columnId, rowIndex, reset: false, group }`. Reset clears the selection and emits with `reset: true`.

### IframePlugin (`<casehub-iframe-plugin>`)

Extends `CasehubElement<IframePluginProps>`. Creates an `<iframe>` in Shadow DOM. Communicates with the iframe content via the existing `postMessage` protocol from `@melviz/component-api` — backwards compatible with existing React-based components.

Serializes the `TypedDataSet` into the wire format (`DataSet` with string arrays) using `toWireDataSet()` from `@casehub/data/dist/dataset/conversion.js` (already implemented and exported). Sends via `postMessage`. Receives filter events from the iframe and re-emits as `casehub-filter`.

---

## 7. CSS & Theming Strategy

### Theme propagation

Theme is a site-level concern, not a per-component setting.

1. The site runtime sets `el.theme = "light" | "dark"` on each component (derived from `PageSettings.mode`).
2. **ECharts components** pass `this.theme` to `echarts.init(container, theme)`. On theme change, the chart is disposed and re-initialized with the new theme.
3. **HTML components** (table, metric, selector) use CSS custom properties that inherit through the shadow boundary. The site root defines custom properties on a wrapper element; shadow DOM styles reference them with fallbacks.

### CSS custom properties

Defined by the site runtime on the page container (or `<html>`):

```css
/* Light mode (defaults) */
--casehub-bg: #ffffff;
--casehub-bg-alt: #f5f5f5;
--casehub-text: #333333;
--casehub-text-muted: #888888;
--casehub-border: #e0e0e0;
--casehub-accent: #5470c6;
--casehub-font: system-ui, sans-serif;
--casehub-font-size: 14px;
--casehub-radius: 4px;

/* Dark mode */
--casehub-bg: #1a1a2e;
--casehub-bg-alt: #16213e;
--casehub-text: #e0e0e0;
--casehub-text-muted: #888888;
--casehub-border: #333355;
--casehub-accent: #5470c6;
```

### Per-component shadow styles

Each HTML component includes a `<style>` in its shadow root:

```css
/* Example: table component */
:host {
  display: block;
  font-family: var(--casehub-font, system-ui, sans-serif);
  font-size: var(--casehub-font-size, 14px);
  color: var(--casehub-text, #333);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th {
  background: var(--casehub-bg-alt, #f5f5f5);
  border-bottom: 2px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px;
  text-align: left;
  cursor: pointer; /* sortable */
}
td {
  border-bottom: 1px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px;
}
tr:nth-child(even) {
  background: var(--casehub-bg-alt, #f5f5f5);
}
```

Each component is self-contained — no shared external stylesheet. CSS custom properties provide the integration point between site theme and component rendering.

---

## 8. Element Registration & Tag Names

Each component calls `customElements.define()` at import time.

| Class | Tag | Extends |
|-------|-----|---------|
| `CasehubBarChart` | `<casehub-bar-chart>` | `CasehubChartElement<BarChartProps>` |
| `CasehubLineChart` | `<casehub-line-chart>` | `CasehubChartElement<LineChartProps>` |
| `CasehubAreaChart` | `<casehub-area-chart>` | `CasehubChartElement<AreaChartProps>` |
| `CasehubPieChart` | `<casehub-pie-chart>` | `CasehubChartElement<PieChartProps>` |
| `CasehubScatterChart` | `<casehub-scatter-chart>` | `CasehubChartElement<ScatterChartProps>` |
| `CasehubBubbleChart` | `<casehub-bubble-chart>` | `CasehubChartElement<BubbleChartProps>` |
| `CasehubTimeseries` | `<casehub-timeseries>` | `CasehubChartElement<TimeseriesProps>` |
| `CasehubMeter` | `<casehub-meter>` | `CasehubChartElement<MeterProps>` |
| `CasehubMap` | `<casehub-map>` | `CasehubChartElement<MapProps>` |
| `CasehubTable` | `<casehub-table>` | `CasehubElement<TableProps>` |
| `CasehubMetric` | `<casehub-metric>` | `CasehubElement<MetricProps>` |
| `CasehubSelector` | `<casehub-selector>` | `CasehubElement<SelectorProps>` |
| `CasehubIframePlugin` | `<casehub-iframe-plugin>` | `CasehubElement<IframePluginProps>` |

The package `index.ts` imports all components (triggering registration) and re-exports all classes and types.

---

## 9. ECharts Tree-Shaking

Each chart component imports only the ECharts modules it needs:

```typescript
// Example: CasehubBarChart.ts
import { use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent]);
```

The package `index.ts` aggregates all registrations. Consumers who import the full package get all ECharts modules registered. Consumers who import individual components get only what they need.

---

## 10. Testing Strategy

### Three layers

**Option mapping tests (bulk of tests):** Test `buildOption()` as a pure function. Given `(BarChartProps, TypedDataSet)`, assert the ECharts option object. One suite per chart type covering: all subtypes, axis settings, legend positions, margin mapping, zoom, extra deep merge (object merge + array replace), edge cases (empty dataset, single row, single column, null cells).

**Component lifecycle tests:** Mount the custom element, assert:
- `connectedCallback` with props already set → `casehub-data-request` event fires
- Props set after DOM insertion → `casehub-data-request` event fires
- Props updated with different lookup → new `casehub-data-request` fires, old dataset cleared
- Props updated with same lookup → no duplicate data request
- Element removed and re-inserted → new `casehub-data-request` fires (not suppressed by stale `_dataRequested`)
- Setting `dataset` property → `render()` called
- Setting `error` property → error message rendered, dataset cleared
- No props → loading indicator rendered
- No dataset → loading indicator rendered
- Click handler on chart after data update → uses current dataset, not stale closure
- Click handler on chart → `casehub-filter` event fires with correct `columnId` and `rowIndex`
- Table page change → `casehub-page` event fires with correct offset
- Table sort click → `casehub-sort` event fires (server-side mode)
- Refresh timer → `casehub-data-request` re-fires after interval
- `disconnectedCallback` → timer cleared, resize observer disconnected, ECharts disposed, `_dataRequested` reset

**Render tests (HTML components):** Set `props` and `dataset` directly, assert Shadow DOM content:
- Table: correct number of `<tr>` rows, header content, pagination controls, zebra striping
- Metric: value displayed, subtype layout applied, template substitution
- Selector: correct options rendered from distinct column values, filter event on selection

### What we don't test

ECharts rendering output. We test that we produce the correct `option` object — ECharts' responsibility is to render it correctly. We mock `echarts.init()` and assert `chart.setOption()` calls.

---

## 11. Webapp Integration

The existing `webapp/webpack.config.js` copies React component bundles into `dist/melviz/component/<name>/` for iframe loading. With Web Components, this indirection is unnecessary.

**New model:** The webapp imports `@casehub/viz` directly. Custom elements are registered globally. The site runtime creates elements via `document.createElement('casehub-bar-chart')` or declaratively in HTML. No iframe, no separate bundle per component.

The site runtime will be a new TypeScript component (not the GWT `RuntimeEntryPoint`). It satisfies the contract defined in §3.7 — listening for data request and filter events, resolving lookups via `DataSetManager`, and setting properties on components. The site runtime is a separate issue, not part of #11.

The old React component directories (`components/melviz-component-echarts/`, `components/melviz-component-llm-prompter/`, `components/melviz-component-svg-heatmap/`) and `@melviz/component-api` become obsolete once the migration is complete. They remain functional during transition — the `IframePlugin` component preserves backwards compatibility by speaking the existing postMessage protocol.

---

## 12. File Structure

```
packages/casehub-viz/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── base/
│   │   ├── CasehubElement.ts
│   │   ├── CasehubElement.test.ts
│   │   ├── CasehubChartElement.ts
│   │   ├── CasehubChartElement.test.ts
│   │   ├── cell-extract.ts
│   │   ├── cell-extract.test.ts
│   │   ├── deep-merge.ts
│   │   └── deep-merge.test.ts
│   ├── charts/
│   │   ├── CasehubBarChart.ts
│   │   ├── CasehubBarChart.test.ts
│   │   ├── CasehubLineChart.ts
│   │   ├── CasehubLineChart.test.ts
│   │   ├── CasehubAreaChart.ts
│   │   ├── CasehubAreaChart.test.ts
│   │   ├── CasehubPieChart.ts
│   │   ├── CasehubPieChart.test.ts
│   │   ├── CasehubScatterChart.ts
│   │   ├── CasehubScatterChart.test.ts
│   │   ├── CasehubBubbleChart.ts
│   │   ├── CasehubBubbleChart.test.ts
│   │   ├── CasehubTimeseries.ts
│   │   ├── CasehubTimeseries.test.ts
│   │   ├── CasehubMeter.ts
│   │   ├── CasehubMeter.test.ts
│   │   ├── CasehubMap.ts
│   │   └── CasehubMap.test.ts
│   └── components/
│       ├── CasehubTable.ts
│       ├── CasehubTable.test.ts
│       ├── CasehubMetric.ts
│       ├── CasehubMetric.test.ts
│       ├── CasehubSelector.ts
│       ├── CasehubSelector.test.ts
│       ├── CasehubIframePlugin.ts
│       └── CasehubIframePlugin.test.ts
```
