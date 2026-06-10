# 03 -- Displayer Framework and Plugin System

**Parent:** [00-overview.md](00-overview.md)
**Status:** Draft -- Rev 2
**Scope:** Unified component model, displayer type system, settings key-path migration, navigation components, three-tier plugin loading, plugin authoring DX.

**Review findings addressed:** #4 (missing DisplayerTypes), #5 (DisplayerSubType decomposition), #7 (DataSetLookupConstraints separation), #10 (flat settings key-path migration), #11 (navigation components), #15 (Module Federation plugin authoring DX).

---

## 1. Complete DisplayerType System

The Java `DisplayerType` enum defines 13 values, each with zero or more `DisplayerSubType` values. The TypeScript replacement uses a discriminated union on the `type` field, with subtypes decomposed into structural boolean/enum properties on each settings interface.

### 1.1 Type and Subtype Enumerations

```typescript
// ---- types/displayer.ts ----

/**
 * All 13 displayer types from org.melviz.displayer.DisplayerType.
 * This is the discriminant value used in the DisplayerSettings union.
 */
export type DisplayerType =
  | "BARCHART"
  | "PIECHART"
  | "AREACHART"
  | "LINECHART"
  | "BUBBLECHART"
  | "METERCHART"
  | "SCATTERCHART"
  | "TABLE"
  | "MAP"
  | "SELECTOR"
  | "METRIC"
  | "EXTERNAL_COMPONENT"
  | "TIMESERIES";
```

### 1.2 Subtype Decomposition

The Java `DisplayerSubType` enum has 20 values spread across 7 types. Rather than carrying a parallel subtype enum, each TypeScript settings interface decomposes its subtypes into structural properties that describe what the subtype actually means:

| Java DisplayerType | Java DisplayerSubType values | TypeScript structural properties |
|---------------------|------------------------------|----------------------------------|
| `BARCHART` | `BAR`, `BAR_STACKED`, `COLUMN`, `COLUMN_STACKED` | `orientation: "VERTICAL" \| "HORIZONTAL"`, `stacked: boolean` |
| `PIECHART` | `PIE`, `PIE_3D`, `DONUT` | `donut: boolean`, `threeDimensional: boolean` |
| `AREACHART` | `AREA`, `AREA_STACKED` | `stacked: boolean` |
| `LINECHART` | `LINE`, `SMOOTH` | `smooth: boolean` |
| `BUBBLECHART` | (none) | -- |
| `METERCHART` | (none) | -- |
| `SCATTERCHART` | (none) | -- |
| `TABLE` | (none) | -- |
| `MAP` | `MAP_REGIONS`, `MAP_MARKERS` | `variant: "REGIONS" \| "MARKERS"` |
| `SELECTOR` | `SELECTOR_DROPDOWN`, `SELECTOR_SLIDER`, `SELECTOR_LABELS` | `variant: "DROPDOWN" \| "SLIDER" \| "LABELS"` |
| `METRIC` | `METRIC_CARD`, `METRIC_CARD2`, `METRIC_PLAIN_TEXT`, `METRIC_QUOTA` | `variant: "CARD" \| "CARD2" \| "PLAIN_TEXT" \| "QUOTA"` |
| `EXTERNAL_COMPONENT` | (none) | -- |
| `TIMESERIES` | (none) | -- |

The mapping from Java subtypes to structural properties is handled by the YAML parser (Section 2). A `subtype: COLUMN_STACKED` in YAML becomes `{ orientation: "VERTICAL", stacked: true }` in the parsed settings object.

### 1.3 The DisplayerSettings Discriminated Union

```typescript
// ---- types/displayer.ts ----

/**
 * Discriminated union of all displayer settings.
 * Switch on `type` to narrow to the specific settings interface.
 *
 * This replaces the Java DisplayerSettings class (a single class with a
 * Map<String, String> property bag and typed getter/setter methods for
 * every possible attribute).
 */
export type DisplayerSettings =
  | BarChartSettings
  | PieChartSettings
  | AreaChartSettings
  | LineChartSettings
  | BubbleChartSettings
  | MeterChartSettings
  | ScatterChartSettings
  | TableSettings
  | MapSettings
  | SelectorSettings
  | MetricSettings
  | ExternalComponentSettings
  | TimeseriesSettings;
```

### 1.4 Shared Base Types

Every displayer shares a common set of properties. These are extracted into interfaces that each concrete settings type extends.

```typescript
// ---- types/displayer-base.ts ----

import type { ColumnId, DataSetLookup } from "./dataset";

/**
 * Axis configuration shared by cartesian chart types.
 *
 * YAML paths: axis.x.labels_show, axis.x.title, axis.x.labels_angle,
 *             axis.y.labels_show, axis.y.title
 */
export interface AxisConfig {
  readonly labelsShow: boolean;
  readonly title: string;
  readonly labelsAngle?: number; // only xAxis supports this in the Java source
}

/**
 * Legend configuration.
 * YAML path: chart.legend.show, chart.legend.position
 */
export interface LegendConfig {
  readonly show: boolean;
  readonly position: "TOP" | "BOTTOM" | "LEFT" | "RIGHT" | "IN";
}

/**
 * Chart margin configuration.
 * YAML path: chart.margin.top, chart.margin.bottom, chart.margin.left, chart.margin.right
 */
export interface MarginConfig {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Grid configuration.
 * YAML path: chart.grid.x, chart.grid.y
 */
export interface GridConfig {
  readonly x: boolean;
  readonly y: boolean;
}

/**
 * Chart-level visual configuration. Shared by all chart-type displayers.
 * YAML path: chart.*
 */
export interface ChartConfig {
  readonly width: number;
  readonly height: number;
  readonly resizable: boolean;
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly bgColor: string;
  readonly margin: MarginConfig;
  readonly legend: LegendConfig;
  readonly grid: GridConfig;
  readonly zoom: boolean;
}

/**
 * Filter configuration.
 * YAML path: filter.*
 */
export interface FilterConfig {
  readonly enabled: boolean;
  readonly selfApply: boolean;
  readonly notification: boolean;
  readonly listening: boolean;
}

/**
 * Refresh configuration.
 * YAML path: refresh.*
 */
export interface RefreshConfig {
  readonly staleData: boolean;
  readonly interval: number; // seconds, -1 means disabled
}

/**
 * Export configuration.
 * YAML path: export.*
 */
export interface ExportConfig {
  readonly csv: boolean;
  readonly xls: boolean;
  readonly png: boolean;
}

/**
 * Column-level settings (display name, expression, pattern, empty template).
 */
export interface ColumnSettings {
  readonly columnId: ColumnId;
  readonly columnName?: string;
  readonly valueExpression?: string;
  readonly valuePattern?: string;
  readonly emptyTemplate?: string;
}

/**
 * Base properties shared by ALL displayer types.
 *
 * Important: the data source is `lookup: DataSetLookup`, not `dataSet: DataSetRef`.
 * DataSetLookup includes the dataset reference plus filter/group/sort operations.
 * This matches the Java source where DisplayerSettings has both dataSet and
 * dataSetLookup fields, but the lookup is the primary mechanism for data retrieval.
 */
export interface BaseDisplayerSettings {
  readonly id?: string;
  readonly title: string;
  readonly subtitle: string;
  readonly titleVisible: boolean;
  readonly lookup: DataSetLookup;
  readonly columns: readonly ColumnSettings[];
  readonly filter: FilterConfig;
  readonly refresh: RefreshConfig;
  readonly export: ExportConfig;
}
```

### 1.5 Per-Type Settings Interfaces

Each interface extends `BaseDisplayerSettings` and adds a literal `type` discriminant plus type-specific properties. Subtypes are decomposed into structural properties.

```typescript
// ---- types/displayer-settings.ts ----

import type {
  BaseDisplayerSettings,
  ChartConfig,
  AxisConfig,
} from "./displayer-base";

/**
 * Bar chart settings.
 *
 * Subtypes decomposed:
 *   BAR         -> orientation: "HORIZONTAL", stacked: false
 *   BAR_STACKED -> orientation: "HORIZONTAL", stacked: true
 *   COLUMN      -> orientation: "VERTICAL",   stacked: false
 *   COLUMN_STACKED -> orientation: "VERTICAL", stacked: true
 */
export interface BarChartSettings extends BaseDisplayerSettings {
  readonly type: "BARCHART";
  readonly chart: ChartConfig;
  readonly orientation: "VERTICAL" | "HORIZONTAL";
  readonly stacked: boolean;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
}

/**
 * Pie chart settings.
 *
 * Subtypes decomposed:
 *   PIE    -> donut: false, threeDimensional: false
 *   PIE_3D -> donut: false, threeDimensional: true
 *   DONUT  -> donut: true,  threeDimensional: false
 */
export interface PieChartSettings extends BaseDisplayerSettings {
  readonly type: "PIECHART";
  readonly chart: ChartConfig;
  readonly donut: boolean;
  readonly threeDimensional: boolean;
  readonly holeTitle?: string;       // donut center label (YAML: donut.hole_title)
  readonly labelPosition: "INSIDE" | "OUTSIDE" | "NONE";
}

/**
 * Area chart settings.
 *
 * Subtypes decomposed:
 *   AREA         -> stacked: false
 *   AREA_STACKED -> stacked: true
 */
export interface AreaChartSettings extends BaseDisplayerSettings {
  readonly type: "AREACHART";
  readonly chart: ChartConfig;
  readonly stacked: boolean;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
}

/**
 * Line chart settings.
 *
 * Subtypes decomposed:
 *   LINE   -> smooth: false
 *   SMOOTH -> smooth: true
 */
export interface LineChartSettings extends BaseDisplayerSettings {
  readonly type: "LINECHART";
  readonly chart: ChartConfig;
  readonly smooth: boolean;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
}

/**
 * Bubble chart settings.
 * No subtypes. Has bubble-specific radius and color properties.
 * YAML path: bubble.minRadius, bubble.maxRadius, bubble.color
 */
export interface BubbleChartSettings extends BaseDisplayerSettings {
  readonly type: "BUBBLECHART";
  readonly chart: ChartConfig;
  readonly minRadius: number;
  readonly maxRadius: number;
  readonly color?: string;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
}

/**
 * Meter (gauge) chart settings.
 * No subtypes. Defines threshold bands for the gauge.
 * YAML path: meter.start, meter.warning, meter.critical, meter.end
 */
export interface MeterChartSettings extends BaseDisplayerSettings {
  readonly type: "METERCHART";
  readonly chart: ChartConfig;
  readonly start: number;
  readonly warning: number;
  readonly critical: number;
  readonly end: number;
}

/**
 * Scatter chart settings.
 * No subtypes.
 */
export interface ScatterChartSettings extends BaseDisplayerSettings {
  readonly type: "SCATTERCHART";
  readonly chart: ChartConfig;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
}

/**
 * Table settings.
 * No subtypes. Has pagination and sorting configuration.
 * YAML paths: table.pageSize, table.width, table.sort.enabled,
 *             table.sort.columnId, table.sort.order, table.show_column_picker
 */
export interface TableSettings extends BaseDisplayerSettings {
  readonly type: "TABLE";
  readonly pageSize: number;
  readonly sort: {
    readonly enabled: boolean;
    readonly columnId?: ColumnId;
    readonly order?: "ASCENDING" | "DESCENDING";
  };
  readonly columnPicker: boolean;
  readonly width?: number;
}

/**
 * Map settings.
 *
 * Subtypes decomposed:
 *   MAP_REGIONS -> variant: "REGIONS"
 *   MAP_MARKERS -> variant: "MARKERS"
 *
 * YAML path: map.color_scheme
 */
export interface MapSettings extends BaseDisplayerSettings {
  readonly type: "MAP";
  readonly chart: ChartConfig;
  readonly variant: "REGIONS" | "MARKERS";
  readonly colorScheme?: string;
}

/**
 * Selector settings.
 *
 * Subtypes decomposed:
 *   SELECTOR_DROPDOWN -> variant: "DROPDOWN"
 *   SELECTOR_SLIDER   -> variant: "SLIDER"
 *   SELECTOR_LABELS   -> variant: "LABELS"
 *
 * YAML paths: selector.width, selector.multiple, selector.inputs_show
 */
export interface SelectorSettings extends BaseDisplayerSettings {
  readonly type: "SELECTOR";
  readonly variant: "DROPDOWN" | "SLIDER" | "LABELS";
  readonly multiSelect: boolean;
  readonly width?: number;
  readonly showInputs: boolean;
}

/**
 * Metric settings.
 *
 * Subtypes decomposed:
 *   METRIC_CARD       -> variant: "CARD"
 *   METRIC_CARD2      -> variant: "CARD2"
 *   METRIC_PLAIN_TEXT -> variant: "PLAIN_TEXT"
 *   METRIC_QUOTA      -> variant: "QUOTA"
 */
export interface MetricSettings extends BaseDisplayerSettings {
  readonly type: "METRIC";
  readonly variant: "CARD" | "CARD2" | "PLAIN_TEXT" | "QUOTA";
}

/**
 * External component settings.
 * For third-party plugins loaded via Module Federation or iframe.
 *
 * YAML paths: component, external_component_partition,
 *             external.baseUrl, external.width, external.height
 * Component-specific properties are stored in the `properties` bag,
 * keyed by property name (not prefixed by componentId as in Java).
 */
export interface ExternalComponentSettings extends BaseDisplayerSettings {
  readonly type: "EXTERNAL_COMPONENT";
  readonly componentId: string;
  readonly partition?: string;
  readonly baseUrl?: string;
  readonly width?: string;
  readonly height?: string;
  readonly properties: Record<string, unknown>;
}

/**
 * Timeseries settings.
 * No subtypes. Timeseries is a specialised line chart with time-based x-axis.
 */
export interface TimeseriesSettings extends BaseDisplayerSettings {
  readonly type: "TIMESERIES";
  readonly chart: ChartConfig;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
}
```

### 1.6 Subtype-to-Structural Mapping in the YAML Parser

When the YAML parser encounters a `subtype` field, it decomposes it into the structural properties on the relevant settings interface. This runs during Zod parsing, before the settings object reaches any component.

```typescript
// ---- yaml/subtype-mapping.ts ----

import type { DisplayerType } from "../types/displayer";

/**
 * Maps a Java-era subtype string to the structural properties it implies.
 * Called by the Zod schema's .transform() step.
 *
 * Returns undefined if the subtype is not recognised for the given type.
 */
export function decomposeSubtype(
  type: DisplayerType,
  subtype: string
): Record<string, unknown> | undefined {
  const key = `${type}:${subtype.toUpperCase()}`;
  return SUBTYPE_MAP[key];
}

const SUBTYPE_MAP: Record<string, Record<string, unknown>> = {
  // BARCHART subtypes
  "BARCHART:BAR":            { orientation: "HORIZONTAL", stacked: false },
  "BARCHART:BAR_STACKED":    { orientation: "HORIZONTAL", stacked: true },
  "BARCHART:COLUMN":         { orientation: "VERTICAL",   stacked: false },
  "BARCHART:COLUMN_STACKED": { orientation: "VERTICAL",   stacked: true },

  // PIECHART subtypes
  "PIECHART:PIE":    { donut: false, threeDimensional: false },
  "PIECHART:PIE_3D": { donut: false, threeDimensional: true },
  "PIECHART:DONUT":  { donut: true,  threeDimensional: false },

  // AREACHART subtypes
  "AREACHART:AREA":         { stacked: false },
  "AREACHART:AREA_STACKED": { stacked: true },

  // LINECHART subtypes
  "LINECHART:LINE":   { smooth: false },
  "LINECHART:SMOOTH": { smooth: true },

  // MAP subtypes
  "MAP:MAP_REGIONS": { variant: "REGIONS" },
  "MAP:MAP_MARKERS": { variant: "MARKERS" },

  // SELECTOR subtypes
  "SELECTOR:SELECTOR_DROPDOWN": { variant: "DROPDOWN" },
  "SELECTOR:SELECTOR_SLIDER":   { variant: "SLIDER" },
  "SELECTOR:SELECTOR_LABELS":   { variant: "LABELS" },

  // METRIC subtypes
  "METRIC:METRIC_CARD":       { variant: "CARD" },
  "METRIC:METRIC_CARD2":      { variant: "CARD2" },
  "METRIC:METRIC_PLAIN_TEXT": { variant: "PLAIN_TEXT" },
  "METRIC:METRIC_QUOTA":      { variant: "QUOTA" },
};
```

---

## 2. Settings Key-Path Migration

### 2.1 The Problem

In the Java codebase, `DisplayerSettings` stores all configuration in a `Map<String, String>` with flat key paths derived from `DisplayerAttributeDef.getFullId()`. The `DisplayerAttributeGroupDef` hierarchy defines the path structure:

```
general.title
general.subtitle
general.visible
filter.enabled
filter.selfapply
filter.notification
filter.listening
refresh.staleData
refresh.interval
export.export_csv
export.export_xls
export.png
chart.width
chart.height
chart.resizable
chart.maxWidth
chart.maxHeight
chart.bgColor
chart.3d
chart.zoom
chart.margin.top
chart.margin.bottom
chart.margin.left
chart.margin.right
chart.legend.show
chart.legend.position
chart.grid.x
chart.grid.y
table.pageSize
table.width
table.sort.enabled
table.sort.columnId
table.sort.order
table.show_column_picker
axis.x.labels_show
axis.x.title
axis.x.labels_angle
axis.y.labels_show
axis.y.title
meter.start
meter.warning
meter.critical
meter.end
donut.hole_title
map.color_scheme
bubble.minRadius
bubble.maxRadius
bubble.color
selector.width
selector.multiple
selector.inputs_show
external.width
external.height
external.baseUrl
```

### 2.2 The Solution: YAML Nesting Already Matches

The flat paths are exactly what YAML nesting produces. The path `chart.margin.top` corresponds to the YAML:

```yaml
chart:
  margin:
    top: 20
```

This means there is no separate "mapping layer" needed -- the Zod schema's structure directly mirrors the YAML key hierarchy. The YAML parser (`js-yaml`) produces a nested JavaScript object, and the Zod schema validates and types it.

### 2.3 Zod Schema Structure

The Zod schemas mirror the `DisplayerAttributeGroupDef` hierarchy exactly:

```typescript
// ---- schemas/displayer.ts ----

import { z } from "zod";

// ---- Shared sub-schemas (mirror DisplayerAttributeGroupDef hierarchy) ----

const marginConfigSchema = z.object({
  top:    z.number().default(0),
  bottom: z.number().default(0),
  left:   z.number().default(0),
  right:  z.number().default(0),
}).default({});

const legendConfigSchema = z.object({
  show:     z.boolean().default(false),
  position: z.enum(["TOP", "BOTTOM", "LEFT", "RIGHT", "IN"]).default("BOTTOM"),
}).default({});

const gridConfigSchema = z.object({
  x: z.boolean().default(false),
  y: z.boolean().default(false),
}).default({});

const chartConfigSchema = z.object({
  width:     z.number().default(500),
  height:    z.number().default(300),
  resizable: z.boolean().default(false),
  maxWidth:  z.number().default(600),
  maxHeight: z.number().default(400),
  bgColor:   z.string().default(""),
  zoom:      z.boolean().default(false),
  margin:    marginConfigSchema,
  legend:    legendConfigSchema,
  grid:      gridConfigSchema,
}).default({});

const filterConfigSchema = z.object({
  enabled:      z.boolean().default(false),
  selfapply:    z.boolean().default(false),  // matches Java key name
  notification: z.boolean().default(false),
  listening:    z.boolean().default(false),
}).default({});

const refreshConfigSchema = z.object({
  staleData: z.boolean().default(false),
  interval:  z.number().default(-1),
}).default({});

const exportConfigSchema = z.object({
  export_csv: z.boolean().default(false),  // matches Java key name
  export_xls: z.boolean().default(false),
  png:        z.boolean().default(false),
}).default({});

const axisConfigSchema = z.object({
  labels_show:  z.boolean().default(true),
  title:        z.string().default(""),
  labels_angle: z.number().optional(),
}).default({});

const axisGroupSchema = z.object({
  x: axisConfigSchema,
  y: axisConfigSchema,
}).default({});

// ---- Base displayer schema (shared fields) ----

const baseDisplayerSchema = z.object({
  type:    z.string(),     // refined per-type below
  subtype: z.string().optional(),
  title:   z.string().default(""),
  subtitle: z.string().default(""),
  general: z.object({
    visible: z.boolean().default(true),
  }).default({}),
  filter:  filterConfigSchema,
  refresh: refreshConfigSchema,
  export:  exportConfigSchema,
  columns: z.array(z.object({
    id:         z.string(),
    name:       z.string().optional(),
    expression: z.string().optional(),
    pattern:    z.string().optional(),
    empty:      z.string().optional(),
  })).default([]),
  // lookup is parsed separately (see 01-core-engine.md)
});
```

### 2.4 Transform Step: YAML Field Names to TypeScript Properties

The Zod schemas use `.transform()` to rename YAML field names (which use underscores, matching the Java `DisplayerAttributeDef` ids) to the TypeScript property names (which use camelCase):

```typescript
// ---- schemas/transforms.ts ----

/**
 * After Zod validates the raw YAML shape, a transform step renames
 * YAML-convention fields to TypeScript-convention properties.
 *
 * Examples:
 *   filter.selfapply     -> filter.selfApply
 *   export.export_csv    -> export.csv
 *   selector.inputs_show -> selector.showInputs
 *   axis.x.labels_show   -> xAxis.labelsShow
 *   table.show_column_picker -> columnPicker
 *
 * This keeps the Zod input schema matching existing YAML files exactly,
 * while the output types use idiomatic TypeScript naming.
 */
```

The key insight: the Zod schema's input shape matches the YAML structure (and therefore the Java `DisplayerAttributeDef.getFullId()` paths). The output shape, after `.transform()`, uses TypeScript naming conventions. Existing dashboards parse without modification.

### 2.5 Backward Compatibility: Deprecated Key Paths

Some Java keys were deprecated with replacements (e.g., `allow_csv` replaced by `export.export_csv`, `external_component_id` replaced by `component`). The Zod schema accepts both:

```typescript
// The schema accepts the deprecated key and the current key.
// .transform() normalises to the current field.
const componentIdSchema = z.union([
  z.object({ component: z.string() }),
  z.object({ external_component_id: z.string() }),
]).transform((val) => ({
  componentId: "component" in val ? val.component : val.external_component_id,
}));
```

---

## 3. Navigation Components

### 3.1 Not Data Displayers

The Java `NavDragComponentType` enum defines five navigation widgets:

| Value | Java class | Purpose |
|-------|-----------|---------|
| `CAROUSEL` | `NavCarouselDragComponent` | Carousel of runtime perspectives/pages |
| `MENUBAR` | `NavMenuBarDragComponent` | Horizontal menu bar |
| `TABLIST` | `NavTabListDragComponent` | Tab strip navigation |
| `TREE` | `NavTreeDragComponent` | Tree view navigation |
| `TILES` | `NavTilesDragComponent` | Grid of tiles |

These are structural navigation widgets. They do not have `DataSetLookup`, filter capabilities, or `DisplayerConstraints`. They control page/section visibility based on the `NavTree` structure. They belong in `LayoutComponent`, not `DisplayerSettings`.

### 3.2 TypeScript Model

Navigation components appear as a variant of `LayoutComponentType`, distinct from data displayers:

```typescript
// ---- types/layout.ts ----

import type { DisplayerSettings } from "./displayer";

/**
 * All five navigation component types from NavDragComponentType.
 */
export type NavigationType =
  | "CAROUSEL"
  | "MENUBAR"
  | "TABLIST"
  | "TREE"
  | "TILES";

/**
 * Navigation-specific settings. These widgets render pages/sections
 * from the NavTree -- they do not consume DataSets.
 */
export interface NavigationSettings {
  readonly navType: NavigationType;
  readonly navGroupId?: string;
  readonly defaultPageId?: string;
  readonly targetDivId?: string;
}

/**
 * A layout component is one of four kinds.
 * This discriminated union replaces the Java LayoutComponent class
 * (which used dragTypeName strings and a generic properties map).
 */
export type LayoutComponentType =
  | { readonly type: "displayer"; readonly settings: DisplayerSettings }
  | { readonly type: "navigation"; readonly navType: NavigationType; readonly settings: NavigationSettings }
  | { readonly type: "html"; readonly content: string }
  | { readonly type: "markdown"; readonly content: string };

/**
 * A layout column contains a span (Bootstrap grid width) and components.
 */
export interface LayoutColumn {
  readonly span: string;  // e.g. "12", "6", "4"
  readonly rows: readonly LayoutRow[];
  readonly components: readonly LayoutComponentType[];
}

/**
 * A layout row contains columns.
 */
export interface LayoutRow {
  readonly columns: readonly LayoutColumn[];
  readonly properties?: Record<string, string>;
}

/**
 * A page/layout template. Replaces Java LayoutTemplate.
 */
export interface LayoutTemplate {
  readonly name: string;
  readonly style: "PAGE" | "FLUID";
  readonly properties: Record<string, string>;
  readonly rows: readonly LayoutRow[];
}
```

### 3.3 Navigation Component Rendering

Navigation components are rendered directly as React components -- they do not go through the PluginHost pipeline since they have no data lifecycle:

```typescript
// ---- components/navigation/NavigationRenderer.tsx ----

import type { NavigationSettings } from "../../types/layout";

interface NavigationRendererProps {
  readonly settings: NavigationSettings;
}

export function NavigationRenderer({ settings }: NavigationRendererProps) {
  switch (settings.navType) {
    case "CAROUSEL":
      return <NavCarousel settings={settings} />;
    case "MENUBAR":
      return <NavMenuBar settings={settings} />;
    case "TABLIST":
      return <NavTabList settings={settings} />;
    case "TREE":
      return <NavTree settings={settings} />;
    case "TILES":
      return <NavTiles settings={settings} />;
  }
}
```

---

## 4. Unified Component Model

### 4.1 MelvizComponentProps

Every data-driven component -- whether a built-in chart, a monorepo component, or a third-party plugin -- receives the same props interface. This replaces both the Java `AbstractDisplayer` class hierarchy and the `ComponentController` postMessage protocol with a single, type-safe contract.

```typescript
// ---- types/component.ts ----

import type { DataSet, ColumnId } from "./dataset";
import type { DisplayerSettings } from "./displayer";
import type { FilterRequest } from "./filter";

/**
 * Props passed to every data-driven component.
 *
 * This is the universal contract that replaces:
 * - Java AbstractDisplayer (internal displayer hierarchy)
 * - TypeScript ComponentController (iframe postMessage protocol)
 *
 * Components receive typed settings, a typed DataSet, and a filter callback.
 * They never need to parse settings from a string map or decode postMessage payloads.
 */
export interface MelvizComponentProps<S extends DisplayerSettings = DisplayerSettings> {
  /** The validated, typed settings for this component. */
  readonly settings: S;

  /** The data to render, already filtered/grouped/sorted by the engine. */
  readonly dataSet: DataSet;

  /** Additional parameters passed from the dashboard configuration. */
  readonly params: ReadonlyMap<string, unknown>;

  /**
   * Callback to send a filter request back to the engine.
   * The engine applies the filter and re-renders affected components.
   */
  readonly onFilter: (request: FilterRequest) => void;

  /**
   * Whether the component is in edit mode (EDITOR) or view mode (CLIENT).
   */
  readonly mode: "EDITOR" | "CLIENT";
}
```

### 4.2 ComponentRegistration

Every component (built-in or plugin) is registered with a `ComponentRegistration` that declares its identity, capabilities, settings schema, and render function.

```typescript
// ---- types/component.ts (continued) ----

import type { z, ZodType } from "zod";
import type { ComponentNode } from "react";

/**
 * A registered component. This is what the PluginRegistry stores.
 *
 * The settingsSchema is a Zod schema that:
 * 1. Validates settings at parse time (not render time)
 * 2. Infers the TypeScript type for the component's settings
 * 3. Generates JSON Schema for editor autocomplete
 * 4. Auto-generates the settings editor panel
 */
export interface ComponentRegistration<S extends DisplayerSettings = DisplayerSettings> {
  /** Unique identifier. For built-in components, matches DisplayerType. */
  readonly id: string;

  /** Human-readable name for the editor palette. */
  readonly name: string;

  /**
   * What this component can do. The editor uses this to show only valid
   * options and column assignments.
   */
  readonly capabilities: ComponentCapabilities;

  /**
   * Zod schema for the component's settings.
   * Input: raw YAML-parsed object. Output: typed settings.
   */
  readonly settingsSchema: ZodType<S>;

  /**
   * The React component to render.
   * Receives MelvizComponentProps<S> as props.
   */
  readonly render: React.ComponentType<MelvizComponentProps<S>>;

  /**
   * Optional custom editor panel. If not provided, the editor
   * auto-generates a settings panel from the Zod schema.
   */
  readonly editorPanel?: React.ComponentType<{
    settings: S;
    onChange: (updated: Partial<S>) => void;
  }>;
}
```

### 4.3 ComponentCapabilities

`ComponentCapabilities` declares what a component supports at registration time. The editor uses this to constrain the UI -- hiding invalid column assignments, disabling unsupported features, and showing only applicable settings.

```typescript
// ---- types/component.ts (continued) ----

import type { ColumnType } from "./dataset";

/**
 * Declares what a component supports.
 *
 * This replaces the Java DisplayerConstraints class's
 * `supportedEditorAttributes` set. Instead of listing which settings keys
 * are supported (a negative-space approach), this declares positive
 * capabilities: what types of data, what column shapes, what interactive
 * features.
 */
export interface ComponentCapabilities {
  /** Which DisplayerType values this component can render. */
  readonly supportedTypes: readonly DisplayerType[];

  /**
   * Column requirements. Each entry describes a column slot:
   * what types it accepts, whether it's required, and its role label.
   *
   * Example for a bar chart:
   *   [
   *     { role: "Category", types: ["LABEL", "DATE"], required: true },
   *     { role: "Value",    types: ["NUMBER"],        required: true },
   *   ]
   */
  readonly columnRequirements: readonly ColumnRequirement[];

  /** Whether the component supports filtering (clicking to filter). */
  readonly supportsFilter: boolean;

  /** Whether the component supports data grouping. */
  readonly supportsGroup: boolean;

  /** Whether the component supports drill-down navigation. */
  readonly supportsDrillDown: boolean;

  /** Whether extra columns beyond the requirements are accepted. */
  readonly extraColumnsAllowed: boolean;

  /** If extra columns are allowed, what type they must be. */
  readonly extraColumnsType?: ColumnType;
}

export interface ColumnRequirement {
  readonly role: string;
  readonly types: readonly ColumnType[];
  readonly required: boolean;
}
```

### 4.4 DataSetLookupConstraints -- Separate from ComponentCapabilities

In the Java codebase, `DisplayerConstraints` wraps a `DataSetLookupConstraints` and a set of supported attributes. The two layers validate different things:

- **`ComponentCapabilities`** (Section 4.3): declares what the component supports at registration time. Used by the editor to constrain the UI.
- **`DataSetLookupConstraints`**: validates the structure of a `DataSetLookup` at the operation level -- whether grouping is allowed/required, column count bounds, column type requirements.

These remain separate in TypeScript:

```typescript
// ---- types/lookup-constraints.ts ----

import type { ColumnType, DataSetLookup } from "./dataset";

/**
 * Constraints on a DataSetLookup's structure.
 *
 * This replaces Java's DataSetLookupConstraints and DataSetConstraints.
 * It validates at the operation level: are groups allowed? Required?
 * How many columns? What types?
 *
 * This is NOT the same as ComponentCapabilities. ComponentCapabilities
 * describes what a component can do (for the editor).
 * DataSetLookupConstraints validates whether a specific lookup request
 * is structurally valid (for the engine).
 */
export interface DataSetLookupConstraints {
  readonly filterAllowed: boolean;
  readonly groupAllowed: boolean;
  readonly groupRequired: boolean;
  readonly maxGroups: number;       // -1 = unlimited
  readonly minColumns: number;      // -1 = no minimum
  readonly maxColumns: number;      // -1 = no maximum
  readonly extraColumnsAllowed: boolean;
  readonly extraColumnsType?: ColumnType;
  readonly uniqueColumnIds: boolean;
  readonly functionRequired: boolean;
  readonly columnTypes?: readonly (readonly ColumnType[])[];
  readonly groupsTitle: string;
  readonly columnsTitle: string;
}

/**
 * Validate a DataSetLookup against constraints.
 * Returns null if valid, or a ValidationError describing the problem.
 */
export function validateLookup(
  lookup: DataSetLookup,
  constraints: DataSetLookupConstraints,
  metadata?: DataSetMetadata
): ValidationError | null {
  // Group validation
  const groupOps = lookup.operations.filter(op => op.type === "GROUP");

  if (!constraints.groupAllowed && groupOps.length > 0) {
    return { code: "GROUP_NOT_ALLOWED", message: "Grouping is not allowed" };
  }
  if (constraints.groupRequired && groupOps.length === 0) {
    return { code: "GROUP_REQUIRED", message: `${constraints.groupsTitle} column required` };
  }
  if (constraints.maxGroups !== -1 && groupOps.length > constraints.maxGroups) {
    return {
      code: "GROUP_NUMBER",
      message: `Maximum ${constraints.maxGroups} groups allowed`,
    };
  }

  // Column count and type validation against metadata
  // (mirrors Java DataSetLookupConstraints.check())
  // ...

  return null;
}

export interface ValidationError {
  readonly code: string;
  readonly message: string;
}
```

The relationship between the two:

```
ComponentRegistration
  ├── capabilities: ComponentCapabilities    (editor-time: what the component supports)
  └── lookupConstraints: DataSetLookupConstraints  (engine-time: what lookups are valid)
```

Each built-in component declares both. Third-party plugins declare only `capabilities` (the engine uses sensible defaults for lookup constraints unless the plugin overrides them).

---

## 5. Three-Tier Plugin Loading

### 5.1 Overview

The plugin system loads components through three tiers, in order of preference:

| Tier | Mechanism | Isolation | Latency | Use case |
|------|-----------|-----------|---------|----------|
| 1 | Direct `import` | React error boundary | None (bundled) | Monorepo components |
| 2 | Module Federation 2.0 | React error boundary | Network fetch of `remoteEntry.js` | Third-party published plugins |
| 3 | `iframe` + `postMessage` | Full process isolation | iframe load + message overhead | Legacy components, untrusted plugins |

### 5.2 Tier 1: Direct Imports (Monorepo)

Components in the `components/` directory are imported directly. They implement `ComponentRegistration` and are registered at build time:

```typescript
// ---- plugin/registry.ts ----

import type { ComponentRegistration } from "../types/component";

class PluginRegistry {
  private readonly components = new Map<string, ComponentRegistration>();

  register(registration: ComponentRegistration): void {
    if (this.components.has(registration.id)) {
      console.warn(`Component ${registration.id} already registered, overwriting`);
    }
    this.components.set(registration.id, registration);
  }

  get(id: string): ComponentRegistration | undefined {
    return this.components.get(id);
  }

  getAll(): ReadonlyMap<string, ComponentRegistration> {
    return this.components;
  }
}

export const pluginRegistry = new PluginRegistry();
```

Registration at application startup:

```typescript
// ---- plugin/builtins.ts ----

import { pluginRegistry } from "./registry";
import { echartsRegistration } from "@melviz/component-echarts";
import { svgHeatmapRegistration } from "@melviz/component-svg-heatmap";
import { llmPrompterRegistration } from "@melviz/component-llm-prompter";

export function registerBuiltinComponents(): void {
  pluginRegistry.register(echartsRegistration);
  pluginRegistry.register(svgHeatmapRegistration);
  pluginRegistry.register(llmPrompterRegistration);
}
```

### 5.3 Tier 2: Module Federation 2.0 (Third-Party)

Third-party plugins are loaded at runtime via Module Federation. The dashboard YAML references them in a plugin manifest:

```yaml
# Dashboard YAML with a third-party plugin
plugins:
  - id: gantt-chart
    url: https://cdn.example.com/melviz-gantt/remoteEntry.js
    module: ./GanttChart

pages:
  - components:
    - type: EXTERNAL_COMPONENT
      component: gantt-chart
      # ...
```

The loader:

```typescript
// ---- plugin/federation-loader.ts ----

import { init, loadRemote } from "@module-federation/enhanced/runtime";
import type { ComponentRegistration } from "../types/component";

/**
 * Plugin manifest entry from dashboard YAML.
 */
export interface PluginManifest {
  readonly id: string;
  readonly url: string;
  readonly module: string;
}

/**
 * Load a Module Federation plugin at runtime.
 *
 * The remote module must export a `registration` conforming to
 * ComponentRegistration. The registration's settingsSchema is used
 * to validate settings before the component renders.
 */
export async function loadFederatedPlugin(
  manifest: PluginManifest
): Promise<ComponentRegistration> {
  // Initialise the federation runtime with the remote entry
  init({
    name: "melviz-host",
    remotes: [
      {
        name: manifest.id,
        entry: manifest.url,
      },
    ],
  });

  // Load the remote module
  const remoteModule = await loadRemote<{
    registration: ComponentRegistration;
  }>(`${manifest.id}/${manifest.module}`);

  if (!remoteModule?.registration) {
    throw new Error(
      `Plugin ${manifest.id} at ${manifest.url} does not export a 'registration'`
    );
  }

  return remoteModule.registration;
}
```

### 5.4 Tier 3: iframe + postMessage (Legacy Fallback)

Existing components that use the current `@melviz/component-api` postMessage protocol continue to work via iframe embedding. This tier wraps the legacy protocol in a `ComponentRegistration`:

```typescript
// ---- plugin/iframe-adapter.ts ----

import type { ComponentRegistration, MelvizComponentProps } from "../types/component";

/**
 * Creates a ComponentRegistration that wraps a legacy iframe-based component.
 * The component communicates via the postMessage protocol defined by
 * @melviz/component-api's ComponentController interface.
 */
export function createIframeRegistration(
  id: string,
  iframeUrl: string
): ComponentRegistration<ExternalComponentSettings> {
  return {
    id,
    name: id,
    capabilities: {
      supportedTypes: ["EXTERNAL_COMPONENT"],
      columnRequirements: [],
      supportsFilter: true,
      supportsGroup: true,
      supportsDrillDown: false,
      extraColumnsAllowed: true,
    },
    settingsSchema: externalComponentSchema,
    render: function IframeComponent(props: MelvizComponentProps<ExternalComponentSettings>) {
      return (
        <IframeHost
          url={iframeUrl}
          settings={props.settings}
          dataSet={props.dataSet}
          params={props.params}
          onFilter={props.onFilter}
          mode={props.mode}
        />
      );
    },
  };
}
```

The `IframeHost` component manages the postMessage protocol, translating between the typed `MelvizComponentProps` and the legacy message format. It handles the `init`, `dataset`, and `filter` message types defined in the current `@melviz/component-api` package.

---

## 6. Plugin Authoring DX

### 6.1 Overview

A third-party author who wants to build a Melviz plugin follows five steps:

1. Scaffold the project
2. Implement the component
3. Declare the registration (capabilities, settings schema, render function)
4. Configure Module Federation
5. Publish the `remoteEntry.js` to a static host

### 6.2 Project Scaffolding

```
npm create melviz-plugin@latest my-gantt-chart
```

This generates:

```
my-gantt-chart/
  ├── src/
  │   ├── GanttChart.tsx           # React component
  │   ├── settings.ts              # Zod schema + TypeScript types
  │   ├── registration.ts          # ComponentRegistration
  │   └── index.ts                 # Module Federation entry point
  ├── vite.config.ts               # Vite + Module Federation config
  ├── package.json
  └── tsconfig.json
```

### 6.3 Step 1: Define the Settings Schema

The settings schema is a Zod schema that defines the plugin's configuration. It extends `ExternalComponentSettings` from `@melviz/core`.

```typescript
// ---- src/settings.ts ----

import { z } from "zod";

export const ganttSettingsSchema = z.object({
  type: z.literal("EXTERNAL_COMPONENT"),
  componentId: z.literal("gantt-chart"),

  // Plugin-specific settings
  barHeight: z.number()
    .min(10)
    .max(100)
    .default(30)
    .describe("Height of each task bar in pixels"),

  showDependencies: z.boolean()
    .default(true)
    .describe("Whether to draw dependency arrows between tasks"),

  dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"])
    .default("YYYY-MM-DD")
    .describe("Date format for task start/end display"),

  colorScheme: z.enum(["default", "pastel", "vibrant", "monochrome"])
    .default("default")
    .describe("Color scheme for task bars"),
});

export type GanttSettings = z.infer<typeof ganttSettingsSchema>;
```

### 6.4 Step 2: Implement the Component

```typescript
// ---- src/GanttChart.tsx ----

import type { MelvizComponentProps } from "@melviz/core";
import type { GanttSettings } from "./settings";

export function GanttChart({ dataSet, settings, onFilter }: MelvizComponentProps<GanttSettings>) {
  // dataSet is already filtered/grouped by the engine.
  // settings is validated and typed.
  // onFilter sends filter requests back to the engine.

  const tasks = dataSet.columns[0].values.map((name, i) => ({
    name: name as string,
    start: dataSet.columns[1].values[i] as string,
    end: dataSet.columns[2].values[i] as string,
    progress: (dataSet.columns[3]?.values[i] as number) ?? 0,
  }));

  return (
    <div className="gantt-container">
      {tasks.map((task, i) => (
        <div
          key={i}
          className="gantt-bar"
          style={{ height: settings.barHeight }}
          onClick={() => onFilter({ type: "COLUMN_FILTER", columnIndex: 0, row: i })}
        >
          {task.name}: {task.start} - {task.end}
        </div>
      ))}
    </div>
  );
}
```

### 6.5 Step 3: Declare the Registration

```typescript
// ---- src/registration.ts ----

import type { ComponentRegistration } from "@melviz/core";
import { GanttChart } from "./GanttChart";
import { ganttSettingsSchema, type GanttSettings } from "./settings";

export const registration: ComponentRegistration<GanttSettings> = {
  id: "gantt-chart",
  name: "Gantt Chart",

  capabilities: {
    supportedTypes: ["EXTERNAL_COMPONENT"],
    columnRequirements: [
      { role: "Task Name", types: ["LABEL"], required: true },
      { role: "Start Date", types: ["DATE"], required: true },
      { role: "End Date", types: ["DATE"], required: true },
      { role: "Progress", types: ["NUMBER"], required: false },
    ],
    supportsFilter: true,
    supportsGroup: false,
    supportsDrillDown: false,
    extraColumnsAllowed: true,
  },

  settingsSchema: ganttSettingsSchema,
  render: GanttChart,
  // editorPanel is omitted -- the editor auto-generates from the Zod schema
};
```

### 6.6 Step 4: Module Federation Entry Point

```typescript
// ---- src/index.ts ----

// This is the module that Module Federation exposes.
// The host application loads this via loadRemote().
export { registration } from "./registration";
```

### 6.7 Step 5: Vite Configuration

```typescript
// ---- vite.config.ts ----

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "gantt-chart",
      filename: "remoteEntry.js",
      exposes: {
        "./GanttChart": "./src/index.ts",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^18.0.0" },
        "react-dom": { singleton: true, requiredVersion: "^18.0.0" },
        zod: { singleton: true, requiredVersion: "^3.22.0" },
      },
    }),
  ],
  build: {
    target: "esnext",
    minify: true,
  },
});
```

### 6.8 Step 6: Build and Publish

```bash
# Build produces dist/remoteEntry.js + chunks
npm run build

# Publish to any static host
# Option A: npm (for versioned distribution)
npm publish

# Option B: any CDN or static host
# Upload dist/ contents to https://cdn.example.com/melviz-gantt/
```

### 6.9 Step 7: Reference in Dashboard YAML

```yaml
plugins:
  - id: gantt-chart
    url: https://cdn.example.com/melviz-gantt/remoteEntry.js
    module: ./GanttChart

pages:
  - name: Project Timeline
    components:
      - type: EXTERNAL_COMPONENT
        component: gantt-chart
        lookup:
          uuid: project-tasks
          group:
            - columnGroup:
                source: task_name
              columns:
                - id: task_name
                - id: start_date
                - id: end_date
                - id: progress
                  function: SUM
        properties:
          barHeight: 25
          showDependencies: true
          colorScheme: pastel
```

### 6.10 What the Plugin Author Gets for Free

By implementing `ComponentRegistration`:

- **Type safety.** The plugin's settings are validated by Zod before the component renders. Invalid configuration produces structured error messages, not runtime crashes.
- **Editor integration.** The editor auto-generates a settings panel from the Zod schema. `.describe()` calls on schema fields become tooltips. `.enum()` fields become dropdowns. `.number().min().max()` fields become sliders.
- **Column validation.** The editor shows only columns matching the plugin's `columnRequirements`. Users cannot assign a NUMBER column to a LABEL slot.
- **Error isolation.** The plugin renders inside a `PluginErrorBoundary`. If it throws, the boundary catches the error and shows a fallback -- the rest of the dashboard stays up.
- **Filter interop.** Calling `onFilter()` integrates the plugin into the dashboard's cross-filter system. Other components react to its filters and vice versa.
- **Hot reload in dev.** Running `npm run dev` starts a Vite dev server. The host application can load the plugin from `http://localhost:5174/remoteEntry.js` during development.

---

## 7. PluginHost Component

### 7.1 Responsibility

`PluginHost` is the React component that sits between the layout engine and any data-driven component. It handles:

1. **Settings validation** via the component's Zod schema
2. **Error isolation** via `PluginErrorBoundary`
3. **Data lifecycle** (passing DataSet + filter callback)
4. **Loading states** (for Tier 2 federated plugins that load asynchronously)

```typescript
// ---- plugin/PluginHost.tsx ----

import { Suspense, useMemo } from "react";
import type { DisplayerSettings } from "../types/displayer";
import type { DataSet } from "../types/dataset";
import type { FilterRequest } from "../types/filter";
import { pluginRegistry } from "./registry";
import { PluginErrorBoundary } from "./PluginErrorBoundary";

interface PluginHostProps {
  readonly settings: DisplayerSettings;
  readonly dataSet: DataSet;
  readonly params: ReadonlyMap<string, unknown>;
  readonly onFilter: (request: FilterRequest) => void;
  readonly mode: "EDITOR" | "CLIENT";
}

export function PluginHost({ settings, dataSet, params, onFilter, mode }: PluginHostProps) {
  const componentId = resolveComponentId(settings);
  const registration = pluginRegistry.get(componentId);

  if (!registration) {
    return <PluginNotFound componentId={componentId} />;
  }

  // Validate settings against the component's schema
  const validationResult = registration.settingsSchema.safeParse(settings);

  if (!validationResult.success) {
    return (
      <PluginConfigError
        componentId={componentId}
        errors={validationResult.error.issues}
      />
    );
  }

  const Component = registration.render;
  const validatedSettings = validationResult.data;

  return (
    <PluginErrorBoundary
      componentId={componentId}
      onError={(error) => console.error(`Plugin ${componentId} crashed:`, error)}
    >
      <Suspense fallback={<PluginLoading componentId={componentId} />}>
        <Component
          settings={validatedSettings}
          dataSet={dataSet}
          params={params}
          onFilter={onFilter}
          mode={mode}
        />
      </Suspense>
    </PluginErrorBoundary>
  );
}

/**
 * Resolve the component ID from settings.
 * For EXTERNAL_COMPONENT, it comes from settings.componentId.
 * For built-in types (BARCHART, TABLE, etc.), it is the type itself.
 */
function resolveComponentId(settings: DisplayerSettings): string {
  if (settings.type === "EXTERNAL_COMPONENT") {
    return (settings as ExternalComponentSettings).componentId;
  }
  return settings.type;
}
```

### 7.2 PluginErrorBoundary

```typescript
// ---- plugin/PluginErrorBoundary.tsx ----

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  readonly componentId: string;
  readonly onError?: (error: Error, errorInfo: ErrorInfo) => void;
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
}

/**
 * Error boundary that isolates plugin crashes.
 * If a plugin throws during render, the boundary catches it and shows
 * a fallback. The rest of the dashboard continues to render normally.
 *
 * This replaces the iframe-level isolation that the old architecture
 * relied on for external components. Tier 1 and Tier 2 plugins run
 * in the same JS context as the host -- error boundaries are the
 * isolation mechanism.
 */
export class PluginErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" className="plugin-error">
          <h3>Component "{this.props.componentId}" failed to render</h3>
          <pre>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 7.3 Plugin Manifest in YAML

The `plugins` section in dashboard YAML declares third-party plugins that need to be loaded before the dashboard renders:

```yaml
# Top-level plugins declaration
plugins:
  # Module Federation plugin (Tier 2)
  - id: gantt-chart
    url: https://cdn.example.com/melviz-gantt/remoteEntry.js
    module: ./GanttChart

  # iframe plugin (Tier 3 -- legacy)
  - id: custom-map
    iframe: https://maps.example.com/melviz-custom-map/
```

The Zod schema for the manifest:

```typescript
// ---- schemas/plugin-manifest.ts ----

import { z } from "zod";

const federatedPluginSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  module: z.string().startsWith("./"),
});

const iframePluginSchema = z.object({
  id: z.string(),
  iframe: z.string().url(),
});

export const pluginManifestEntrySchema = z.discriminatedUnion("id", [
  // Cannot use discriminatedUnion on "id" here since ids vary.
  // Use a union with refinement instead.
]).or(
  z.union([federatedPluginSchema, iframePluginSchema])
);

export const pluginsSchema = z.array(
  z.union([federatedPluginSchema, iframePluginSchema])
).default([]);

export type FederatedPlugin = z.infer<typeof federatedPluginSchema>;
export type IframePlugin = z.infer<typeof iframePluginSchema>;
```

The dashboard loader resolves all plugin manifests before rendering. Federated plugins are loaded via `loadFederatedPlugin()` (Section 5.3). iframe plugins are wrapped via `createIframeRegistration()` (Section 5.4). All plugins are registered in the `PluginRegistry` before the first render pass.

---

## 8. Cross-References

| Topic | Document |
|-------|----------|
| DataSet model, DataSetLookup pipeline | [01-core-engine.md](01-core-engine.md) |
| Zod schema system, JSON Schema generation | [03-schema-system.md](03-schema-system.md) |
| FilterStateManager, cross-filter coordination | [05-application-shell.md](05-application-shell.md) |
| DataService abstraction, data providers | [06-data-service-backend.md](06-data-service-backend.md) |
| Testing strategy for plugins | [07-testing-migration.md](07-testing-migration.md) |
