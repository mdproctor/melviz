# 02 -- Type Safety Strategy and Schema System

This document defines the type safety strategy for the TypeScript migration: compiler configuration, linting rules, branded types, and the Zod schema system that serves as the single source of truth for all data structures.

---

## 1. Compiler Configuration

TypeScript strict mode is enabled with every sub-flag that tightens the type system beyond the `strict` umbrella.

```jsonc
// tsconfig.json (root)
{
  "compilerOptions": {
    // strict umbrella — enables strictNullChecks, strictFunctionTypes,
    // strictBindCallApply, strictPropertyInitialization,
    // noImplicitAny, noImplicitThis, alwaysStrict, useUnknownInCatchVariables
    "strict": true,

    // Array/map index access returns T | undefined, not T.
    // Forces explicit checks before using indexed values.
    "noUncheckedIndexedAccess": true,

    // Every code path in a function must return a value (or be void).
    // Catches missing return statements in branches.
    "noImplicitReturns": true,

    // Switch cases must break, return, or throw. Fallthrough requires
    // an explicit /* falls through */ comment.
    "noFallthroughCasesInSwitch": true,

    // Distinguishes { x?: number } (x may be missing) from
    // { x: number | undefined } (x is present but undefined).
    "exactOptionalPropertyTypes": true,

    // Methods that override a base class method must use the override keyword.
    // Catches stale overrides when the base signature changes.
    "noImplicitOverride": true,

    // import/export must use the type modifier for type-only imports.
    // Prevents runtime imports of things that only exist at compile time.
    "verbatimModuleSyntax": true
  }
}
```

Each flag serves a specific purpose. `noUncheckedIndexedAccess` is the one most projects skip -- and it is the one that catches the most bugs in a codebase that manipulates columnar data by index. Every `dataset.values[columnIndex]` access returns `T | undefined`, forcing a check before use. This matches the reality of a system where columns can be absent.

---

## 2. ESLint -- No `any` Leaks

The `any` type is the escape hatch that defeats every other type safety measure. One `any` propagates through assignment, return, and member access to infect entire call chains. The ESLint configuration treats all five propagation vectors as errors.

```jsonc
// eslint.config.ts (root override)
{
  rules: {
    // Forbids writing any explicitly: function f(x: any)
    "@typescript-eslint/no-explicit-any": "error",

    // Forbids assigning an any-typed value to a typed variable
    "@typescript-eslint/no-unsafe-assignment": "error",

    // Forbids calling an any-typed value as a function
    "@typescript-eslint/no-unsafe-call": "error",

    // Forbids accessing a property on an any-typed value
    "@typescript-eslint/no-unsafe-member-access": "error",

    // Forbids returning an any-typed value from a function
    "@typescript-eslint/no-unsafe-return": "error"
  }
}
```

### Bridge File Overrides

Bridge files are thin wrappers around third-party libraries whose own types may be incomplete or use `any` internally. These files are the only place where type unsafety is permitted.

```jsonc
// eslint.config.ts (bridge override)
{
  files: ["**/bridge/*.ts", "**/*-bridge.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unsafe-assignment": "off"
  }
}
```

The convention:
- Bridge files live in `bridge/` subdirectories or use the `-bridge.ts` suffix.
- Each bridge file exports a fully typed public API. The `any` stays inside.
- CI runs `grep -rn ': any' --include='*.ts' --exclude-dir='bridge' --exclude='*-bridge.ts'` as a second gate. If `any` appears outside bridge files, the build fails.
- The remaining three rules (`no-unsafe-call`, `no-unsafe-member-access`, `no-unsafe-return`) stay enabled in bridge files. Only the entry points for untyped values are relaxed, not their propagation.

---

## 3. Branded Types

IDs that are structurally identical (`string`) but semantically distinct get branded types. Brands exist only in the type system -- zero runtime overhead, zero extra allocations.

```typescript
// packages/core/src/types/branded.ts

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type ColumnId = Brand<string, "ColumnId">;
export type DataSetId = Brand<string, "DataSetId">;
export type ComponentId = Brand<string, "ComponentId">;
export type PluginId = Brand<string, "PluginId">;
export type PageId = Brand<string, "PageId">;
export type FilterId = Brand<string, "FilterId">;

// Constructor functions for creating branded values at boundaries
export const ColumnId = (id: string) => id as ColumnId;
export const DataSetId = (id: string) => id as DataSetId;
export const ComponentId = (id: string) => id as ComponentId;
export const PluginId = (id: string) => id as PluginId;
```

### Compile-Time Safety

```typescript
function getColumn(dataSet: DataSet, columnId: ColumnId): DataColumn { ... }
function getComponent(registry: Registry, componentId: ComponentId): Component { ... }

const col = ColumnId("revenue");
const comp = ComponentId("bar-chart-1");

getColumn(ds, col);   // OK
getColumn(ds, comp);  // Compile error: ComponentId is not assignable to ColumnId
getColumn(ds, "raw"); // Compile error: string is not assignable to ColumnId
```

The branding pattern catches a class of bugs that the Java codebase suffered from: every ID was `String`, so passing a component ID where a column ID was expected compiled without error and failed silently at runtime.

---

## 4. Zod as Single Source of Truth

All data structures are defined as Zod schemas. Types, validation, and JSON Schema files are derived from them -- never hand-written separately.

```
Zod schema (source of truth)
    |
    +-- TypeScript types        via z.infer<typeof schema>
    |
    +-- Runtime validation      via schema.parse(input)
    |                           via schema.safeParse(input) for error collection
    |
    +-- JSON Schema files       via zod-to-json-schema (build-time generation)
            |
            +-- dashboard.schema.json
            +-- dataset-def.schema.json
            +-- dataset-lookup.schema.json
            +-- displayer-settings.schema.json
            +-- plugin-manifest.schema.json
            +-- global-settings.schema.json
            +-- setup-config.schema.json
```

This eliminates the 1,000+ lines of hand-written JSON marshallers (`@Portable`, `@MapsTo` annotations, custom `toJson`/`fromJson` methods) in the GWT codebase. A single Zod schema replaces both the type definition and the marshalling logic.

---

## 5. Schema Definitions

All schemas live in `packages/core/src/schema/`. Each schema has `.describe()` calls that flow through to JSON Schema `description` fields, providing hover documentation in editors.

### 5.1 Column and Data Primitives

```typescript
// packages/core/src/schema/column.ts

export const columnTypeSchema = z.enum([
  "DATE", "NUMBER", "LABEL", "TEXT",
]).describe("Column data type");

export const columnDefSchema = z.object({
  id: z.string().describe("Column identifier"),
  type: columnTypeSchema,
  name: z.string().optional().describe("Display name (defaults to id)"),
  pattern: z.string().optional().describe("Format pattern for display"),
}).describe("Column definition");

export type ColumnDef = z.infer<typeof columnDefSchema>;
```

### 5.2 Data Set References

The `dataSetRefSchema` is a discriminated union covering all data source types. Inline and URL sources work without a backend. SQL, Prometheus, Kafka, and Elasticsearch require the Quarkus backend.

```typescript
// packages/core/src/schema/dataset-ref.ts

export const dataSetRefSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("inline"),
    columns: z.array(columnDefSchema),
    data: z.array(z.array(z.string())),
  }).describe("Inline dataset embedded in the dashboard YAML"),

  z.object({
    type: z.literal("url"),
    url: z.string().url(),
    format: z.enum(["json", "csv"]).default("json"),
    headers: z.record(z.string()).optional(),
    refresh: z.number().positive().optional()
      .describe("Refresh interval in seconds"),
    cacheTtl: z.number().nonnegative().optional()
      .describe("Cache TTL in seconds"),
  }).describe("External dataset loaded from URL"),

  z.object({
    type: z.literal("sql"),
    dataSource: z.string().describe("JNDI data source name"),
    query: z.string().describe("SQL query"),
    columns: z.array(columnDefSchema).optional(),
    refresh: z.number().positive().optional(),
  }).describe("SQL dataset -- requires backend"),

  z.object({
    type: z.literal("prometheus"),
    endpoint: z.string().url().optional()
      .describe("Prometheus server URL (defaults to backend config)"),
    query: z.string().describe("PromQL query"),
    columns: z.array(columnDefSchema).optional(),
    refresh: z.number().positive().optional(),
  }).describe("Prometheus dataset -- requires backend"),

  z.object({
    type: z.literal("kafka"),
    topic: z.string().describe("Kafka topic name"),
    bootstrapServers: z.string().optional()
      .describe("Bootstrap servers (defaults to backend config)"),
    columns: z.array(columnDefSchema),
    maxRecords: z.number().int().positive().optional()
      .describe("Maximum records to consume"),
    refresh: z.number().positive().optional(),
  }).describe("Kafka dataset -- requires backend"),

  z.object({
    type: z.literal("elasticsearch"),
    index: z.string().describe("Elasticsearch index name"),
    endpoint: z.string().url().optional()
      .describe("Elasticsearch URL (defaults to backend config)"),
    query: z.record(z.unknown()).optional()
      .describe("Elasticsearch query DSL"),
    columns: z.array(columnDefSchema).optional(),
    refresh: z.number().positive().optional(),
  }).describe("Elasticsearch dataset -- requires backend"),
]).describe("Dataset source definition");

export type DataSetRef = z.infer<typeof dataSetRefSchema>;
```

### 5.3 Data Set Lookup

The `DataSetLookup` is the query abstraction -- it specifies which dataset to query, what operations to apply (filter, group, sort), and how to paginate results. This replaces the Java `DataSetLookup` class and its `List<DataSetOp>` pipeline.

```typescript
// packages/core/src/schema/dataset-lookup.ts

export const dataSetOpTypeSchema = z.enum([
  "FILTER", "GROUP", "SORT",
]).describe("Dataset operation type");

export const sortOrderSchema = z.enum([
  "ASCENDING", "DESCENDING",
]).describe("Sort direction");

export const sortColumnSchema = z.object({
  columnId: z.string(),
  order: sortOrderSchema.default("ASCENDING"),
}).describe("Sort specification for a single column");

export const dataSetSortSchema = z.object({
  op: z.literal("SORT"),
  columns: z.array(sortColumnSchema).min(1),
}).describe("Sort operation");

export const dataSetGroupSchema = z.object({
  op: z.literal("GROUP"),
  columnGroup: columnGroupSchema,
  groupFunctions: z.array(groupFunctionSchema).default([]),
  select: z.boolean().default(false)
    .describe("True if this is an interval selection, not a grouping"),
  selectedIntervalNames: z.array(z.string()).default([]),
}).describe("Group operation");

export const dataSetFilterSchema = z.object({
  op: z.literal("FILTER"),
  columns: z.array(filterExpressionSchema).min(1),
}).describe("Filter operation");

export const dataSetOpSchema = z.discriminatedUnion("op", [
  dataSetFilterSchema,
  dataSetGroupSchema,
  dataSetSortSchema,
]).describe("A single dataset operation");

export const dataSetLookupSchema = z.object({
  dataSetId: z.string().describe("UUID of the target dataset"),
  operations: z.array(dataSetOpSchema).default([])
    .describe("Ordered pipeline of filter, group, and sort operations"),
  offset: z.number().int().nonnegative().default(0)
    .describe("Starting row offset"),
  limit: z.number().int().default(-1)
    .describe("Maximum rows to return (-1 for all)"),
}).describe("Dataset lookup request -- the query abstraction");

export type DataSetLookup = z.infer<typeof dataSetLookupSchema>;
```

### 5.4 Filter Expressions

Filters are recursive: logical expressions (AND, OR, NOT) compose other filter expressions, which can themselves be logical expressions or core function filters. This mirrors the Java `LogicalExprFilter` / `CoreFunctionFilter` hierarchy but as a single discriminated union.

```typescript
// packages/core/src/schema/filter.ts

export const coreFunctionTypeSchema = z.enum([
  "IS_NULL", "NOT_NULL",
  "EQUALS_TO", "NOT_EQUALS_TO",
  "LIKE_TO",
  "GREATER_THAN", "GREATER_OR_EQUALS_TO",
  "LOWER_THAN", "LOWER_OR_EQUALS_TO",
  "BETWEEN",
  "TIME_FRAME",
  "IN", "NOT_IN",
]).describe("Core filter function type");

export const coreFunctionFilterSchema = z.object({
  type: z.literal("function"),
  columnId: z.string(),
  function: coreFunctionTypeSchema,
  parameters: z.array(z.union([z.string(), z.number(), z.boolean()]))
    .default([]),
  label: z.string().optional()
    .describe("Display label for the filter value"),
}).describe("A core filter function applied to a single column");

// Recursive schema -- filterExpressionSchema references itself
// through logicalExprFilterSchema.terms
export const logicalExprTypeSchema = z.enum([
  "AND", "OR", "NOT",
]).describe("Logical operator for combining filter expressions");

export type FilterExpression = z.infer<typeof coreFunctionFilterSchema> | {
  readonly type: "logical";
  readonly operator: z.infer<typeof logicalExprTypeSchema>;
  readonly columnId?: string;
  readonly terms: readonly FilterExpression[];
};

export const filterExpressionSchema: z.ZodType<FilterExpression> = z.lazy(
  () => z.discriminatedUnion("type", [
    coreFunctionFilterSchema,
    z.object({
      type: z.literal("logical"),
      operator: logicalExprTypeSchema,
      columnId: z.string().optional()
        .describe("Column ID inherited by child terms that lack one"),
      terms: z.array(filterExpressionSchema).min(1),
    }).describe("Logical composition of filter expressions"),
  ])
).describe("Filter expression -- either a core function or a logical composition");
```

The recursive structure supports arbitrarily nested filter trees:

```typescript
// Example: (region = "EMEA" OR region = "APAC") AND amount > 1000
const filter: FilterExpression = {
  type: "logical",
  operator: "AND",
  terms: [
    {
      type: "logical",
      operator: "OR",
      columnId: "region",
      terms: [
        { type: "function", columnId: "region", function: "EQUALS_TO", parameters: ["EMEA"] },
        { type: "function", columnId: "region", function: "EQUALS_TO", parameters: ["APAC"] },
      ],
    },
    { type: "function", columnId: "amount", function: "GREATER_THAN", parameters: [1000] },
  ],
};
```

### 5.5 Column Groups and Aggregate Functions

Column grouping controls how values are bucketed into intervals. The Java `ColumnGroup` class has 10 fields; the Zod schema captures all of them with appropriate constraints.

```typescript
// packages/core/src/schema/group.ts

export const groupStrategySchema = z.enum([
  "FIXED", "DYNAMIC", "CUSTOM",
]).describe("Strategy for splitting values into intervals");

export const dateIntervalTypeSchema = z.enum([
  "MILLISECOND", "HUNDRETH", "TENTH", "SECOND",
  "MINUTE", "HOUR", "DAY", "DAY_OF_WEEK", "WEEK",
  "MONTH", "QUARTER", "YEAR", "DECADE", "CENTURY", "MILLENIUM",
]).describe("Date interval granularity");

export const dayOfWeekSchema = z.enum([
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY",
  "FRIDAY", "SATURDAY", "SUNDAY",
]).describe("Day of week");

export const monthSchema = z.enum([
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]).describe("Month of year");

export const columnGroupSchema = z.object({
  sourceId: z.string().describe("Source column to group by"),
  columnId: z.string().describe("Output column ID for the grouped values"),
  strategy: groupStrategySchema.default("DYNAMIC"),
  maxIntervals: z.number().int().positive().default(15)
    .describe("Maximum number of intervals"),
  intervalSize: z.string().optional()
    .describe("Fixed interval size (for FIXED strategy)"),
  emptyIntervals: z.boolean().default(false)
    .describe("Include intervals with no matching rows"),
  ascending: z.boolean().default(true)
    .describe("Sort intervals in ascending order"),
  firstMonthOfYear: monthSchema.optional()
    .describe("Starting month for yearly cycles"),
  firstDayOfWeek: dayOfWeekSchema.optional()
    .describe("Starting day for weekly cycles"),
}).describe("Column group definition");

export type ColumnGroup = z.infer<typeof columnGroupSchema>;

export const aggregateFunctionTypeSchema = z.enum([
  "COUNT", "DISTINCT",
  "AVERAGE", "SUM", "MIN", "MAX", "MEDIAN",
  "JOIN", "JOIN_COMMA", "JOIN_HYPHEN",
]).describe("Aggregate function type");

export const groupFunctionSchema = z.object({
  sourceId: z.string().describe("Source column to aggregate"),
  columnId: z.string().optional()
    .describe("Output column ID (defaults to sourceId)"),
  function: aggregateFunctionTypeSchema,
}).describe("Aggregate function applied to a column within a group");

export type GroupFunction = z.infer<typeof groupFunctionSchema>;
```

All 10 aggregate function types from the Java `AggregateFunctionType` enum are preserved: `COUNT`, `DISTINCT`, `AVERAGE`, `SUM`, `MIN`, `MAX`, `MEDIAN`, `JOIN`, `JOIN_COMMA`, `JOIN_HYPHEN`.

### 5.6 Displayer Settings

The displayer settings schema is a discriminated union covering all 13 displayer types from the Java `DisplayerType` enum. Each variant extends a common base and adds type-specific fields.

```typescript
// packages/core/src/schema/displayer.ts

export const axisConfigSchema = z.object({
  column: z.string().describe("Column ID mapped to this axis"),
  label: z.string().optional(),
  format: z.string().optional().describe("Number/date format pattern"),
  min: z.number().optional(),
  max: z.number().optional(),
}).describe("Axis configuration");

export const seriesConfigSchema = z.object({
  column: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
}).describe("Data series configuration");

export const refreshSettingsSchema = z.object({
  staleData: z.boolean().default(false)
    .describe("Whether to show stale indicator while refreshing"),
  interval: z.number().nonnegative().default(0)
    .describe("Auto-refresh interval in seconds (0 = disabled)"),
}).describe("Refresh behavior for a displayer");

export const exportSettingsSchema = z.object({
  csv: z.boolean().default(true).describe("Allow CSV export"),
  xls: z.boolean().default(false).describe("Allow XLS export"),
  png: z.boolean().default(false).describe("Allow PNG screenshot export"),
}).describe("Export options for a displayer");

const baseDisplayerSchema = z.object({
  id: z.string().optional().describe("Unique displayer identifier"),
  title: z.string().optional(),
  dataSet: dataSetRefSchema.optional(),
  dataSetLookup: dataSetLookupSchema.optional()
    .describe("Lookup query applied to a registered dataset"),
  columns: z.array(z.object({
    id: z.string(),
    displayName: z.string().optional(),
    expression: z.string().optional().describe("JSONata expression"),
  })).optional().describe("Column mappings"),
  filter: filterExpressionSchema.optional(),
  refresh: refreshSettingsSchema.optional(),
  export: exportSettingsSchema.optional(),
});

export const barChartSchema = baseDisplayerSchema.extend({
  type: z.literal("BAR"),
  subType: z.enum(["BAR", "BAR_STACKED", "COLUMN", "COLUMN_STACKED"])
    .default("COLUMN"),
  xAxis: axisConfigSchema,
  yAxis: axisConfigSchema,
  series: z.array(seriesConfigSchema).optional(),
}).describe("Bar chart displayer");

export const lineChartSchema = baseDisplayerSchema.extend({
  type: z.literal("LINE"),
  subType: z.enum(["LINE", "SMOOTH"]).default("LINE"),
  xAxis: axisConfigSchema,
  yAxis: axisConfigSchema,
  series: z.array(seriesConfigSchema).optional(),
}).describe("Line chart displayer");

export const areaChartSchema = baseDisplayerSchema.extend({
  type: z.literal("AREA"),
  subType: z.enum(["AREA", "AREA_STACKED"]).default("AREA"),
  xAxis: axisConfigSchema,
  yAxis: axisConfigSchema,
  series: z.array(seriesConfigSchema).optional(),
}).describe("Area chart displayer");

export const pieChartSchema = baseDisplayerSchema.extend({
  type: z.literal("PIE"),
  subType: z.enum(["PIE", "PIE_3D", "DONUT"]).default("PIE"),
  innerRadius: z.number().min(0).max(1).optional()
    .describe("Inner radius ratio for donut charts"),
  labelPosition: z.enum(["INSIDE", "OUTSIDE", "NONE"]).default("OUTSIDE"),
}).describe("Pie chart displayer");

export const bubbleChartSchema = baseDisplayerSchema.extend({
  type: z.literal("BUBBLE"),
  xAxis: axisConfigSchema,
  yAxis: axisConfigSchema,
  sizeColumn: z.string().describe("Column controlling bubble size"),
}).describe("Bubble chart displayer");

export const meterChartSchema = baseDisplayerSchema.extend({
  type: z.literal("METER"),
  min: z.number().default(0),
  max: z.number().default(100),
  thresholds: z.array(z.object({
    value: z.number(),
    color: z.string(),
  })).optional(),
}).describe("Meter/gauge chart displayer");

export const scatterChartSchema = baseDisplayerSchema.extend({
  type: z.literal("SCATTER"),
  xAxis: axisConfigSchema,
  yAxis: axisConfigSchema,
}).describe("Scatter chart displayer");

export const tableSchema = baseDisplayerSchema.extend({
  type: z.literal("TABLE"),
  pageSize: z.number().int().positive().default(20),
  sortable: z.boolean().default(true),
  columnWidths: z.record(z.number()).optional()
    .describe("Column width overrides keyed by column ID"),
}).describe("Table displayer");

export const mapSchema = baseDisplayerSchema.extend({
  type: z.literal("MAP"),
  subType: z.enum(["MAP_REGIONS", "MAP_MARKERS"]).default("MAP_REGIONS"),
  regionColumn: z.string().optional(),
  valueColumn: z.string().optional(),
}).describe("Map displayer");

export const selectorSchema = baseDisplayerSchema.extend({
  type: z.literal("SELECTOR"),
  variant: z.enum(["DROPDOWN", "SLIDER", "LABEL_SET"]).default("DROPDOWN"),
  multiSelect: z.boolean().default(false),
}).describe("Selector/filter displayer");

export const metricSchema = baseDisplayerSchema.extend({
  type: z.literal("METRIC"),
  subType: z.enum([
    "METRIC_CARD", "METRIC_CARD2", "METRIC_QUOTA", "METRIC_PLAIN_TEXT",
  ]).default("METRIC_CARD"),
  format: z.string().optional().describe("Number format pattern"),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
}).describe("Metric/KPI displayer");

export const timeseriesSchema = baseDisplayerSchema.extend({
  type: z.literal("TIMESERIES"),
  timeColumn: z.string().describe("Column containing timestamps"),
  valueColumns: z.array(z.string()).min(1),
  zoomable: z.boolean().default(true),
}).describe("Timeseries displayer with time-based X axis");

export const externalComponentSchema = baseDisplayerSchema.extend({
  type: z.literal("EXTERNAL_COMPONENT"),
  componentId: z.string().describe("Registered component identifier"),
  properties: z.record(z.unknown()).optional()
    .describe("Component-specific properties passed via postMessage"),
}).describe("External component displayer (plugin)");

export const displayerSettingsSchema = z.discriminatedUnion("type", [
  barChartSchema,
  lineChartSchema,
  areaChartSchema,
  pieChartSchema,
  bubbleChartSchema,
  meterChartSchema,
  scatterChartSchema,
  tableSchema,
  mapSchema,
  selectorSchema,
  metricSchema,
  timeseriesSchema,
  externalComponentSchema,
]).describe("Displayer configuration -- type field determines available options");

export type DisplayerSettings = z.infer<typeof displayerSettingsSchema>;
```

Passing `xAxis` on a `TABLE` is a compile error. Passing `pageSize` on a `PIE` is a compile error. The Java codebase stored all settings in a `Map<String, String>` property bag where any property could appear on any chart type; errors surfaced at render time or not at all.

### 5.7 Layout Template

```typescript
// packages/core/src/schema/layout.ts

export const layoutComponentSchema = z.object({
  type: z.string().optional().describe("Displayer type or markdown"),
  markdown: z.string().optional().describe("Inline markdown content"),
  html: z.string().optional().describe("Inline HTML content"),
  displayer: displayerSettingsSchema.optional(),
  properties: z.record(z.string()).optional(),
}).describe("A single component within a layout");

export const layoutColumnSchema = z.object({
  span: z.number().int().min(1).max(12).default(12)
    .describe("Bootstrap-style grid span (1-12)"),
  components: z.array(layoutComponentSchema).default([]),
}).describe("A column in a layout row");

export const layoutRowSchema = z.object({
  columns: z.array(layoutColumnSchema).default([]),
  height: z.string().optional().describe("CSS height value"),
}).describe("A row in a layout");

export const layoutTemplateSchema = z.object({
  name: z.string().optional().describe("Page name"),
  style: z.enum(["FLUID", "PAGE", "STATIC"]).default("FLUID"),
  rows: z.array(layoutRowSchema).default([]),
  properties: z.record(z.string()).optional(),
}).describe("A single page layout template");

export type LayoutTemplate = z.infer<typeof layoutTemplateSchema>;
```

### 5.8 Runtime Model

The `runtimeModelSchema` is the top-level wire format. It uses `.transform()` to accept both the new field names and the legacy names from the GWT codebase, providing backward compatibility.

```typescript
// packages/core/src/schema/runtime-model.ts

export const navNodeSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  children: z.lazy(() => z.array(navNodeSchema)).default([]),
}).describe("Navigation tree node");

export const navTreeSchema = z.object({
  rootId: z.string().default("root"),
  nodes: z.array(navNodeSchema).default([]),
}).describe("Navigation tree structure");

const runtimeModelRawSchema = z.object({
  // Accept both new and legacy field names
  pages: z.array(layoutTemplateSchema).optional(),
  layoutTemplates: z.array(layoutTemplateSchema).optional(),

  datasets: z.array(dataSetRefSchema).optional(),
  clientDataSets: z.array(dataSetRefSchema).optional(),

  navTree: navTreeSchema.optional(),
  properties: z.record(z.string()).default({}),
  globalSettings: globalSettingsSchema.optional(),
  plugins: z.array(pluginManifestSchema).default([]),
}).describe("Complete dashboard model");

export const runtimeModelSchema = runtimeModelRawSchema.transform((raw) => ({
  pages: raw.pages ?? raw.layoutTemplates ?? [],
  datasets: raw.datasets ?? raw.clientDataSets ?? [],
  navTree: raw.navTree,
  properties: raw.properties,
  globalSettings: raw.globalSettings,
  plugins: raw.plugins,
}));

export type RuntimeModel = z.output<typeof runtimeModelSchema>;
```

The `.transform()` step means existing YAML dashboards that use `layoutTemplates` or `clientDataSets` continue to work without modification. New dashboards use the shorter `pages` and `datasets` names.

### 5.9 Plugin Manifest

```typescript
// packages/core/src/schema/plugin.ts

export const componentCapabilitiesSchema = z.object({
  dataColumns: z.object({
    minColumns: z.number().int().nonnegative().default(0),
    maxColumns: z.number().int().positive().optional(),
    requiredTypes: z.array(columnTypeSchema).optional(),
  }).optional().describe("Data shape requirements"),
  filtering: z.boolean().default(false)
    .describe("Whether this component can emit filter events"),
  configProperties: z.array(z.object({
    key: z.string(),
    type: z.enum(["string", "number", "boolean", "color", "enum"]),
    label: z.string().optional(),
    default: z.unknown().optional(),
    enumValues: z.array(z.string()).optional(),
  })).default([]).describe("Component-specific configuration options"),
}).describe("Declared capabilities for editor validation");

export const pluginManifestSchema = z.object({
  id: z.string().describe("Unique plugin identifier"),
  name: z.string().describe("Display name"),
  version: z.string().describe("SemVer version string"),
  description: z.string().optional(),
  author: z.string().optional(),
  loadingStrategy: z.enum(["direct", "federation", "iframe"])
    .default("federation")
    .describe("How the plugin is loaded into the host"),
  entryPoint: z.string()
    .describe("Module path or URL depending on loading strategy"),
  capabilities: componentCapabilitiesSchema.optional(),
}).describe("Plugin registration manifest");

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
```

### 5.10 Global Settings and Setup Config

```typescript
// packages/core/src/schema/global-settings.ts

export const globalSettingsSchema = z.object({
  mode: z.enum(["CLIENT", "EDITOR"]).default("CLIENT")
    .describe("Runtime mode -- CLIENT for readonly, EDITOR for authoring"),
  allowUrlProperties: z.boolean().default(false)
    .describe("Allow dashboard properties to be set via URL parameters"),
  allowExternalUrl: z.boolean().default(false)
    .describe("Allow loading datasets from arbitrary external URLs"),
  defaultRefresh: refreshSettingsSchema.optional()
    .describe("Default refresh settings for all displayers"),
  defaultExport: exportSettingsSchema.optional()
    .describe("Default export settings for all displayers"),
}).describe("Global dashboard settings");

export type GlobalSettings = z.infer<typeof globalSettingsSchema>;

export const setupConfigSchema = z.object({
  dashboards: z.array(z.object({
    url: z.string(),
    name: z.string().optional(),
  })).default([]).describe("Dashboard YAML files to load"),
  samplesUrl: z.string().optional()
    .describe("URL to samples directory for the editor palette"),
  mode: z.enum(["CLIENT", "EDITOR"]).default("CLIENT"),
  properties: z.record(z.string()).optional(),
  backendUrl: z.string().url().optional()
    .describe("Quarkus backend URL (enables server-side data providers)"),
}).describe("setup.js configuration schema");

export type SetupConfig = z.infer<typeof setupConfigSchema>;
```

---

## 6. JSON Schema Generation

A build-time script converts the Zod schemas into JSON Schema files. These files serve two purposes: YAML editor integration (autocomplete, validation) and external tooling (CI linting of dashboard files, API documentation).

```typescript
// scripts/generate-schemas.ts

import { writeFileSync, mkdirSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  runtimeModelSchema,
  dataSetRefSchema,
  dataSetLookupSchema,
  displayerSettingsSchema,
  pluginManifestSchema,
  globalSettingsSchema,
  setupConfigSchema,
} from "@melviz/core";

const schemas: Record<string, z.ZodTypeAny> = {
  "dashboard.schema.json": runtimeModelSchema,
  "dataset-def.schema.json": dataSetRefSchema,
  "dataset-lookup.schema.json": dataSetLookupSchema,
  "displayer-settings.schema.json": displayerSettingsSchema,
  "plugin-manifest.schema.json": pluginManifestSchema,
  "global-settings.schema.json": globalSettingsSchema,
  "setup-config.schema.json": setupConfigSchema,
};

mkdirSync("schemas", { recursive: true });

for (const [filename, schema] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, {
    target: "jsonSchema2019-09",
    $refStrategy: "none",  // Inline all refs for maximum editor compatibility
  });
  writeFileSync(
    `schemas/${filename}`,
    JSON.stringify(jsonSchema, null, 2) + "\n"
  );
}
```

The `.describe()` calls on every Zod schema flow through to JSON Schema `description` fields. This is not optional decoration -- it is the primary documentation mechanism for dashboard authors who interact with the system through YAML files and editor tooling.

The generation script runs as part of `yarn build:packages`. Generated files are committed to the repository so editors can reference them without running a build.

---

## 7. Editor Support

### YAML Language Server Schema Directive

Dashboard YAML files declare their schema with a directive comment. The YAML language server (built into VS Code and available as an IntelliJ plugin) picks this up automatically.

```yaml
# yaml-language-server: $schema=https://melviz.org/schemas/dashboard.schema.json
pages:
  - name: "Sales Overview"
    style: FLUID
    rows:
      - columns:
          - span: 6
            components:
              - type: BAR
                title: "Revenue by Region"
                subType: COLUMN
                dataSet:
                  type: url
                  url: "/data/sales.json"
                xAxis:
                  column: region
                yAxis:
                  column: revenue
                  format: "#,##0"
```

### Autocomplete

With the schema directive in place, the editor provides:
- Property name completion at every level (e.g., typing inside a `BAR` component suggests `xAxis`, `yAxis`, `subType`, `series` -- but not `pageSize` or `variant`, which belong to other types).
- Enum value completion (e.g., `subType` under `BAR` suggests `BAR`, `BAR_STACKED`, `COLUMN`, `COLUMN_STACKED`).
- Required field indicators for mandatory properties.

### Hover Documentation

Every `.describe()` call becomes hover documentation. Hovering over `cacheTtl` in a `url`-type dataset shows "Cache TTL in seconds". Hovering over `emptyIntervals` in a column group shows "Include intervals with no matching rows". This documentation is generated, not hand-maintained, so it stays in sync with the code.

---

## 8. Design Constraint: Operation Purity

All dataset operations -- filtering, grouping, sorting, aggregation, interval building -- are pure functions with no browser API dependencies.

This is a hard constraint, not a guideline. It exists because the Java GWT codebase leaked browser dependencies into data operations (locale-dependent date formatting, browser `Date` parsing, `Intl.NumberFormat` locale defaults), which made operations impossible to test outside a browser environment and produced different results on different machines.

### Date Handling

UTC-based arithmetic throughout. No `new Date()` (locale-dependent parsing), no `toLocaleDateString()` (locale-dependent formatting), no `getTimezoneOffset()` (environment-dependent).

```typescript
// All date operations use explicit UTC functions
function addInterval(timestamp: number, interval: DateIntervalType): number {
  // Pure arithmetic on UTC milliseconds -- no Date object locale behavior
  switch (interval) {
    case "HOUR":   return timestamp + 3_600_000;
    case "DAY":    return timestamp + 86_400_000;
    case "WEEK":   return timestamp + 604_800_000;
    // Month/year use calendar-aware UTC arithmetic
    case "MONTH":  return addUTCMonths(timestamp, 1);
    case "YEAR":   return addUTCMonths(timestamp, 12);
    // ...
  }
}
```

### Number Formatting

Explicit format patterns, not `Intl.NumberFormat` locale defaults. A format pattern like `#,##0.00` produces the same output regardless of the user's locale. Locale-aware formatting is the display layer's responsibility, not the data engine's.

### String Comparison

Explicit case sensitivity parameter on every comparison function. No `localeCompare()` (locale-dependent collation order), no implicit case folding.

```typescript
function compareStrings(a: string, b: string, caseSensitive: boolean): number {
  const left = caseSensitive ? a : a.toLowerCase();
  const right = caseSensitive ? b : b.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}
```

### Why This Matters

The purity constraint ensures:
- All data operations run identically in Vitest (Node.js) and in the browser.
- Test results are deterministic across machines, CI environments, and timezones.
- No `jsdom` or browser environment simulation is needed for data engine tests.
- Server-side evaluation (in the Quarkus backend) produces identical results to client-side evaluation.
