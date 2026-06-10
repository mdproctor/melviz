# Melviz GWT-to-TypeScript Migration Design

**Date:** 2026-06-09
**Status:** Draft
**Scope:** Complete rewrite of the GWT/Java client-side core to TypeScript/React, plus a new optional Quarkus backend with pluggable data providers.

---

## Table of Contents

1. [Goals and Non-Goals](#1-goals-and-non-goals)
2. [Benefits: Old System vs New](#2-benefits-old-system-vs-new)
3. [Architecture Overview](#3-architecture-overview)
4. [Core Engine](#4-core-engine)
5. [Type Safety Strategy](#5-type-safety-strategy)
6. [Schema System](#6-schema-system)
7. [Displayer Framework and Plugin System](#7-displayer-framework-and-plugin-system)
8. [Application Shell](#8-application-shell)
9. [Data Service and Provider Architecture](#9-data-service-and-provider-architecture)
10. [Quarkus Backend](#10-quarkus-backend)
11. [Testing Strategy](#11-testing-strategy)
12. [Migration Strategy](#12-migration-strategy)
13. [Technology Stack](#13-technology-stack)

---

## 1. Goals and Non-Goals

### Goals

- **Eliminate Java/GWT/Maven from the client.** The entire `core/` directory (506 Java files, ~50K LOC) is replaced by TypeScript. No GWT compilation, no Errai CDI, no JsInterop wrappers.
- **Preserve all end-user capabilities.** Both CLIENT mode (readonly rendering) and EDITOR mode (drag-and-drop dashboard authoring) are ported. Every YAML dashboard that works today works after migration.
- **Modernise the toolchain.** Vite, React 18+, Tailwind CSS, Vitest, TypeScript 5.x strict mode.
- **Dramatically improve type safety.** Branded types for IDs, discriminated unions for displayer settings, column-type-aware filters, Zod schemas for runtime validation, JSON Schema for editor tooling.
- **Design for an optional backend.** A local-first `LocalDataService` (IndexedDB, in-memory ops) is the default. A Quarkus backend adds server-side SQL, Prometheus, Kafka, Elasticsearch data providers, caching, and dashboard persistence — but the app works fully without it.
- **Enable a plugin ecosystem.** Three-tier plugin loading: direct imports (monorepo), Module Federation 2.0 (third-party), iframe+postMessage (legacy/fallback). Pluggable data providers with the same extensibility.
- **Carry forward Dashbuilder's server-side capabilities.** SQL push-down (filter/group/sort to the database), server-side caching, data proxy (CORS bypass, auth injection), Prometheus/Kafka/Elasticsearch providers.
- **Shrink the codebase.** Target 5-8K LOC of TypeScript replacing ~50K LOC of Java. The reduction comes from killing marshalling boilerplate, Errai annotations, GWT interop wrappers, and the verbose DataSetOpEngine.

### Non-Goals

- KIE Server integration (removed — too domain-specific)
- Authentication/RBAC (can be added later via Quarkus security extensions)
- Multi-tenancy
- Server-side rendering (SSR) — the app is a client-rendered SPA
- 1:1 port of GWT/Errai framework internals — we port capabilities, not code

---

## 2. Benefits: Old System vs New

### Build and Development

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Build time | GWT compilation: 60-90s, full Maven build: 3-5min | Vite dev server: <1s start, HMR: instant |
| Dev feedback loop | Change Java → rebuild GWT → refresh browser | Change TS → HMR updates in-place |
| Build tooling | Maven + Webpack + Yarn (three ecosystems) | Vite + Yarn (one ecosystem) |
| Language | Java 17 compiled to JS via GWT | TypeScript compiled to JS natively |
| Debugging | GWT source maps (brittle, often misaligned) | Native browser debugging, accurate source maps |
| Test runner | JUnit (Java) + Jest (TS) — two test ecosystems | Vitest only — one test ecosystem |
| Bundle size | GWT output is monolithic and large | Vite tree-shakes, code-splits, lazy-loads |

### Type Safety

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Data values | `String[][]` everywhere — parse on every read | Parsed once at boundary, typed throughout (`CellValue` discriminated union) |
| IDs | All `String` — column ID, component ID, dataset ID interchangeable | Branded types — `ColumnId`, `ComponentId`, `DataSetId` are compile-time incompatible |
| Displayer config | `Map<String, String>` property bag — any property on any chart type | Discriminated union per chart type — `xAxis` on a table is a compile error |
| Filter safety | Any filter function on any column type — runtime errors | Column-type-specific filter unions — `BETWEEN` on TEXT is a compile error |
| Widget capabilities | Runtime `DisplayerConstraints.check()` — fails at render time | `ComponentCapabilities` interface — editor shows only valid options |
| YAML validation | Hand-written marshallers — silent failures on malformed input | Zod schemas — structured error messages, type inference, JSON Schema generation |
| Marshalling | 1K+ LOC hand-written JSON marshallers (`@Portable`, `@MapsTo`) | Zod `z.parse()` — ~100 lines of schema replaces all marshalling |

### Architecture

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| DI framework | Errai CDI — runtime bean discovery, 145 `@Inject` sites | React context + typed hooks — explicit, statically analysable |
| Event system | CDI `@Observes` events — implicit ordering, hard to debug | `FilterStateManager` — inspectable state, explicit subscriptions |
| Component model | Two models: internal displayer hierarchy + external component protocol | One unified model: every component (builtin or plugin) implements `MelvizComponentProps` |
| View layer | Errai `@Templated` HTML fragments (43 views, 30 HTML files) | React components — single rendering model |
| Routing | Hand-rolled `PlaceManager` — no URL history, no deep linking | React Router — deep linking, back/forward, lazy loading |
| JS library access | `ScriptInjector` + JsInterop wrappers for js-yaml, JSONata, ECharts | Direct `import` — native ES modules |
| Expression eval | `Global.eval(expr)` with keyword blocklist — security concern | JSONata library call — sandboxed by design, no `eval()` |

### Plugin Ecosystem

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Plugin loading | iframe + postMessage only | Three tiers: direct import, Module Federation 2.0, iframe fallback |
| Plugin author DX | Implement postMessage protocol manually, no type checking | Import `@melviz/core` types, full compile-time checking, Zod schema auto-generates editor UI |
| Plugin isolation | iframe provides isolation but at high cost | React error boundaries for direct/MF plugins, iframes for legacy |
| Plugin capabilities | Not declared — runtime errors if data shape is wrong | `ComponentCapabilities` declared at registration — editor enforces valid configuration |
| Data provider extensibility | Fixed set compiled into GWT | Pluggable `DataProvider` registry — add new source types at runtime |

### Data Handling

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| DataSetOpEngine | ~5K LOC Java, mutable state, in-browser only | Pure functions + JSONata, immutable DataSets, optionally server-side |
| Dataset caching | None — every draw/redraw refetches | IndexedDB + in-memory cache with TTL, stale-while-offline |
| Request deduplication | None — two charts on same URL = two HTTP requests | Coalesced concurrent requests for same DataSetRef |
| Offline support | None | IndexedDB cache serves stale data when network unavailable |
| Error model | String messages through CDI events | Structured `DataSetError` with error codes, `recoverable` flag, retry support |
| CSV parsing | Custom Java class | Papa Parse (battle-tested, streaming, 7KB) |
| Backend push-down | Not available (pure client) | SQL filter/group/sort pushed to database when backend present |
| Data sources | URL (JSON/CSV) only | URL, inline, CSV file, SQL, Prometheus, Kafka, Elasticsearch — all pluggable |

### Editor

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Drag-and-drop | uberfire-layout-editor-client (~3K LOC custom DnD) | @dnd-kit/core (~8KB, maintained, accessible) |
| Settings panels | Hand-wired per displayer type | Auto-generated from component's Zod `settingsSchema` |
| Column assignment | Manual, no validation against component requirements | Driven by `ComponentCapabilities.columnRequirements` — only valid columns shown |
| Third-party plugins in editor | Not supported | Full editor integration via capabilities + settings schema |

### Schema and Tooling

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| YAML validation | Runtime only — silent failures | Zod runtime validation + JSON Schema editor support |
| Editor autocomplete | None | JSON Schema gives autocomplete, hover docs, red squiggles in VS Code/IntelliJ |
| Schema source of truth | Hand-written marshallers (drift-prone) | Zod schemas generate both TS types and JSON Schema — single source |
| Dashboard format documentation | Implicit in Java code | Schema IS the documentation — `.describe()` calls flow to JSON Schema `description` fields |

### Codebase Size

| Module | Java (LOC) | TypeScript (estimated LOC) | Reduction |
|--------|-----------|---------------------------|-----------|
| `melviz-base` (DataSet, JSON) | 16,000 | ~2,000 | 87% |
| `melviz-shared` (APIs, marshalling) | 8,000 | ~1,000 | 87% |
| `melviz-client` (displayers, renderers, views) | 19,000 | ~3,000 | 84% |
| `melviz-webapp-parent` (app shell) | 6,000 | ~1,500 | 75% |
| **Total** | **~50,000** | **~7,500** | **85%** |

The reduction comes from:
- Killing ~1K LOC of hand-written JSON marshallers (replaced by ~100 lines of Zod schema)
- Killing Errai boilerplate — `@Inject`, `@Portable`, `@MapsTo`, `@Templated`, `@Observes`
- Killing GWT interop — `ScriptInjector`, `JsInterop` wrappers, `NativeLibraryResources`, `ClientBundle`
- Replacing the 5K LOC `DataSetOpEngine` with pure functions + JSONata
- Replacing 43 Errai templated views + 30 HTML fragments with React components
- Replacing hand-rolled PlaceManager/Router with React Router

---

## 3. Architecture Overview

### Directory Structure

```
melviz/
├── packages/
│   ├── core/                          # Engine (replaces core/)
│   │   ├── src/
│   │   │   ├── dataset/               # DataSet model, operations, typed values
│   │   │   ├── yaml/                  # YAML parser + Zod schemas
│   │   │   ├── displayer/             # DisplayerSettings discriminated unions
│   │   │   ├── layout/               # LayoutTemplate model + rendering
│   │   │   ├── navigation/            # NavTree, page navigation
│   │   │   ├── plugin/                # PluginHost + three-tier loaders
│   │   │   ├── expression/            # JSONata evaluation + bridge
│   │   │   ├── filter/                # FilterStateManager, typed filters
│   │   │   ├── services/              # DataService abstraction + implementations
│   │   │   │   ├── DataService.ts
│   │   │   │   ├── LocalDataService.ts
│   │   │   │   ├── RemoteDataService.ts
│   │   │   │   └── HybridDataService.ts
│   │   │   ├── context/               # MelvizProvider, React hooks
│   │   │   └── index.ts
│   │   └── package.json
│   ├── component-api/                 # React hooks/context (evolved from postMessage bridge)
│   ├── editor/                        # Layout editor (drag-and-drop)
│   └── ui/                            # Shared Tailwind-based UI primitives
├── components/                        # React visualization components (direct imports)
│   ├── melviz-component-echarts/
│   ├── melviz-component-svg-heatmap/
│   └── melviz-component-llm-prompter/
├── app/                               # Vite application shell (replaces webapp/)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── screens/
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── index.html
├── server/                            # Optional Quarkus backend
│   ├── src/main/java/org/melviz/server/
│   │   ├── api/                       # REST endpoints
│   │   ├── dataset/                   # DataProvider SPI + implementations
│   │   ├── cache/                     # Server-side dataset caching
│   │   ├── dashboard/                 # Dashboard persistence
│   │   └── plugin/                    # Plugin registry
│   ├── src/main/resources/
│   │   ├── application.properties
│   │   └── db/migration/
│   └── pom.xml
├── schemas/                           # Generated JSON Schema files
├── examples/                          # Dashboard examples gallery
└── scripts/
    └── generate-schemas.ts            # Zod → JSON Schema build step
```

### Data Flow

```
setup.js / postMessage YAML / Dashboard URL
        │
        ▼
  YAML Parser (js-yaml + Zod validation)
        │
        ▼
  RuntimeModel (typed, validated)
        │
        ├──▶ DataSetManager
        │       │
        │       ├──▶ DataProviderRegistry.resolve(ref)
        │       │       │
        │       │       ├── UrlProvider (browser fetch)
        │       │       ├── InlineProvider (embedded data)
        │       │       ├── CsvFileProvider (Papa Parse)
        │       │       └── RemoteProvider (delegates to Quarkus backend)
        │       │               │
        │       │               ├── SqlDataProvider (JNDI + SQL push-down)
        │       │               ├── PrometheusDataProvider (PromQL)
        │       │               ├── KafkaDataProvider (topic consumer)
        │       │               └── ElasticsearchDataProvider (query DSL)
        │       │
        │       ├──▶ DataSetCache (IndexedDB + in-memory / server Caffeine)
        │       │
        │       └──▶ DataSetOps (filter/group/sort — local JS or server push-down)
        │
        ├──▶ PluginRegistry
        │       │
        │       ├── Direct imports (monorepo components)
        │       ├── Module Federation 2.0 (third-party plugins)
        │       └── iframe + postMessage (legacy fallback)
        │
        └──▶ DashboardRenderer
                │
                ├── LayoutRow → LayoutColumn → ComponentSlot
                │                                    │
                │                                    ▼
                │                              PluginHost
                │                                    │
                │                              PluginErrorBoundary
                │                                    │
                │                              Component.render()
                │
                └── FilterStateManager ◀──── component.onFilter()
                        │
                        └──▶ re-render affected components
```

---

## 4. Core Engine

### DataSet Model

The current Java `DataSet` stores everything as `String[][]`. The TypeScript replacement parses values once at the boundary and works on typed data throughout.

```typescript
// packages/core/src/dataset/types.ts

export enum ColumnType {
  TEXT = "TEXT",
  NUMBER = "NUMBER",
  DATE = "DATE",
  LABEL = "LABEL",
}

export type ColumnId = string & { readonly __brand: "ColumnId" };
export type DataSetId = string & { readonly __brand: "DataSetId" };

export interface Column {
  readonly id: ColumnId;
  readonly name: string;
  readonly type: ColumnType;
  readonly settings?: ColumnSettings;
}

export interface ColumnSettings {
  readonly columnId: ColumnId;
  readonly columnName: string;
  readonly valueExpression?: string;
  readonly emptyTemplate?: string;
  readonly valuePattern?: string;
}

export type CellValue =
  | { readonly type: ColumnType.TEXT; readonly value: string }
  | { readonly type: ColumnType.NUMBER; readonly value: number }
  | { readonly type: ColumnType.DATE; readonly value: Date }
  | { readonly type: ColumnType.LABEL; readonly value: string };

export interface TypedDataSet {
  readonly columns: readonly Column[];
  readonly rows: readonly TypedRow[];
}

export interface TypedRow {
  readonly cells: readonly CellValue[];
  cell(columnId: ColumnId): CellValue;
  number(columnId: ColumnId): number;
  text(columnId: ColumnId): string;
  date(columnId: ColumnId): Date;
}

export interface DataSet {
  readonly columns: readonly Column[];
  readonly data: readonly (readonly string[])[];
}
```

### DataSet Operations

Pure functions replacing the 5K LOC mutable `DataSetOpEngine`:

```typescript
// packages/core/src/dataset/operations.ts

export type DataSetOp = FilterOp | GroupOp | SortOp | AggregateOp;

export function applyFilter(ds: TypedDataSet, filter: FilterOp): TypedDataSet { ... }
export function applyGroup(ds: TypedDataSet, group: GroupOp): TypedDataSet { ... }
export function applySort(ds: TypedDataSet, sort: SortOp): TypedDataSet { ... }
export function applyOps(ds: TypedDataSet, ops: readonly DataSetOp[]): TypedDataSet {
  return ops.reduce((dataset, op) => {
    switch (op.type) {
      case "filter": return applyFilter(dataset, op);
      case "group": return applyGroup(dataset, op);
      case "sort": return applySort(dataset, op);
      case "aggregate": return applyAggregate(dataset, op);
    }
  }, ds);
}
```

Every operation returns a new `TypedDataSet` — immutable by default.

### Column-Type-Aware Filters

```typescript
export type NumericFilter =
  | { fn: "GREATER_THAN"; value: number }
  | { fn: "LOWER_THAN"; value: number }
  | { fn: "BETWEEN"; low: number; high: number };

export type TextFilter =
  | { fn: "EQUALS_TO"; value: string }
  | { fn: "NOT_EQUALS_TO"; value: string }
  | { fn: "LIKE"; pattern: string };

export type DateFilter =
  | { fn: "BEFORE"; value: Date }
  | { fn: "AFTER"; value: Date }
  | { fn: "BETWEEN"; start: Date; end: Date };

export type NullFilter = { fn: "IS_NULL" } | { fn: "NOT_NULL" };

export type ColumnFilter =
  | { columnType: ColumnType.NUMBER; filter: NumericFilter | NullFilter }
  | { columnType: ColumnType.TEXT; filter: TextFilter | NullFilter }
  | { columnType: ColumnType.DATE; filter: DateFilter | NullFilter }
  | { columnType: ColumnType.LABEL; filter: TextFilter | NullFilter };
```

### YAML Parsing

js-yaml and JSONata are imported directly as npm packages — no `ScriptInjector`, no JsInterop wrappers:

```typescript
// packages/core/src/yaml/parser.ts
import yaml from "js-yaml";
import { runtimeModelSchema } from "./schema";

export function parseYaml(content: string): RuntimeModel {
  const raw = yaml.load(content);
  return runtimeModelSchema.parse(raw);
}
```

### Expression Evaluation

JSONata called as a library — no `Global.eval()`, no keyword blocklist:

```typescript
// packages/core/src/expression/evaluator.ts
import { evaluate as jsonataEval } from "./jsonata-bridge";

export function evaluateExpression(value: string, expression: string): string {
  if (!expression || expression === "value") return value;
  return jsonataEval(expression, { value });
}
```

```typescript
// packages/core/src/expression/jsonata-bridge.ts
import jsonata from "jsonata";

export function evaluate(expression: string, data: unknown): string {
  const expr = jsonata(expression);
  const result = expr.evaluate(data as jsonata.Focus) as unknown;
  return String(result ?? "");
}
```

---

## 5. Type Safety Strategy

### Compiler Configuration

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true
  }
}
```

### ESLint — no `any` leaks

```jsonc
{
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-return": "error"
  }
}
```

Bridge files (thin wrappers around third-party libraries) get targeted overrides:

```jsonc
{
  files: ["**/bridge/*.ts", "**/*-bridge.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unsafe-assignment": "off"
  }
}
```

All type unsafety from third-party libraries is quarantined in bridge files. The rest of the codebase is `any`-free. CI fails if `any` appears outside bridge files.

### Branded Types

```typescript
export type ColumnId = string & { readonly __brand: "ColumnId" };
export type DataSetId = string & { readonly __brand: "DataSetId" };
export type ComponentId = string & { readonly __brand: "ComponentId" };
export type PluginId = string & { readonly __brand: "PluginId" };
```

Zero runtime overhead — brands exist only in the type system.

### Discriminated Unions for DisplayerSettings

```typescript
export type DisplayerSettings =
  | BarChartSettings
  | LineChartSettings
  | PieChartSettings
  | TableSettings
  | MetricSettings
  | SelectorSettings
  | MapSettings
  | ExternalComponentSettings;

interface BaseDisplayerSettings {
  readonly id: string;
  readonly title?: string;
  readonly dataSet: DataSetRef;
  readonly columns: readonly ColumnMapping[];
  readonly filter?: FilterDef;
  readonly refresh?: RefreshSettings;
}

interface BarChartSettings extends BaseDisplayerSettings {
  readonly type: "BAR";
  readonly orientation: "VERTICAL" | "HORIZONTAL";
  readonly stacked: boolean;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
  readonly series: readonly SeriesConfig[];
}

interface PieChartSettings extends BaseDisplayerSettings {
  readonly type: "PIE";
  readonly donut: boolean;
  readonly innerRadius?: number;
  readonly labelPosition: "INSIDE" | "OUTSIDE" | "NONE";
}

interface TableSettings extends BaseDisplayerSettings {
  readonly type: "TABLE";
  readonly pageSize: number;
  readonly sortable: boolean;
  readonly columnWidths?: Record<ColumnId, number>;
}

interface SelectorSettings extends BaseDisplayerSettings {
  readonly type: "SELECTOR";
  readonly variant: "DROPDOWN" | "SLIDER" | "LABEL_SET";
  readonly multiSelect: boolean;
}
```

---

## 6. Schema System

### Single Source of Truth

Zod schemas are the source of truth. They produce:
- TypeScript types via `z.infer<>`
- Runtime validation via `z.parse()`
- JSON Schema files via `zod-to-json-schema` (generated at build time)

```
Zod schema (source of truth)
    ├── TypeScript types (via z.infer<>)
    ├── Runtime validation (via z.parse())
    └── JSON Schema files (via zod-to-json-schema)
          ├── dashboard.schema.json
          ├── dataset-def.schema.json
          ├── displayer-settings.schema.json
          ├── plugin-manifest.schema.json
          ├── global-settings.schema.json
          └── setup-config.schema.json
```

### Zod Schema Examples

```typescript
// packages/core/src/yaml/schema.ts

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
    refresh: z.number().optional().describe("Refresh interval in seconds"),
    cacheTtl: z.number().optional().describe("Cache TTL in seconds"),
  }).describe("External dataset loaded from URL"),
  z.object({
    type: z.literal("sql"),
    dataSource: z.string().describe("JNDI data source name"),
    query: z.string().describe("SQL query"),
    columns: z.array(columnDefSchema).optional(),
    refresh: z.number().optional(),
  }).describe("SQL dataset — requires backend"),
  z.object({
    type: z.literal("prometheus"),
    query: z.string().describe("PromQL query"),
    columns: z.array(columnDefSchema).optional(),
    refresh: z.number().optional(),
  }).describe("Prometheus dataset — requires backend"),
]).describe("Dataset source definition");

export const displayerSettingsSchema = z.discriminatedUnion("type", [
  barChartSchema,
  lineChartSchema,
  pieChartSchema,
  tableSchema,
  metricSchema,
  selectorSchema,
  mapSchema,
  externalComponentSchema,
]).describe("Displayer configuration — type field determines available options");

export const runtimeModelSchema = z.object({
  pages: z.array(layoutTemplateSchema).default([]),
  navTree: navTreeSchema.optional(),
  datasets: z.array(dataSetRefSchema).default([]),
  properties: z.record(z.string()).default({}),
  globalSettings: globalSettingsSchema.optional(),
  plugins: z.array(pluginManifestSchema).default([]),
}).describe("Complete dashboard model");

export type RuntimeModel = z.infer<typeof runtimeModelSchema>;
```

### JSON Schema Generation

```typescript
// scripts/generate-schemas.ts
import { zodToJsonSchema } from "zod-to-json-schema";
import { runtimeModelSchema, pluginManifestSchema, ... } from "@melviz/core";

const schemas = {
  "dashboard.schema.json": runtimeModelSchema,
  "plugin-manifest.schema.json": pluginManifestSchema,
  "dataset-def.schema.json": dataSetRefSchema,
  "displayer-settings.schema.json": displayerSettingsSchema,
  "global-settings.schema.json": globalSettingsSchema,
  "setup-config.schema.json": setupConfigSchema,
};

for (const [filename, schema] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, { target: "jsonSchema2019-09" });
  writeFileSync(`schemas/${filename}`, JSON.stringify(jsonSchema, null, 2));
}
```

### Editor Support

Dashboard YAML files get autocomplete and validation by referencing a schema:

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
                dataSet:
                  type: url
                  url: "/data/sales.json"
                xAxis:
                  column: region
```

The `.describe()` calls on Zod schemas flow through to JSON Schema `description` fields, providing hover documentation in VS Code and IntelliJ.

---

## 7. Displayer Framework and Plugin System

### Unified Component Model

Every visualization conforms to one interface — whether it's a built-in table, a monorepo echarts chart, a Module Federation plugin, or an iframe widget:

```typescript
export interface MelvizComponentProps {
  readonly settings: DisplayerSettings;
  readonly dataSet: TypedDataSet;
  readonly mode: "CLIENT" | "EDITOR";
  readonly onFilter: (filter: FilterRequest) => void;
  readonly onConfigChange?: (settings: DisplayerSettings) => void;
}

export interface ComponentRegistration {
  readonly id: PluginId;
  readonly name: string;
  readonly capabilities: ComponentCapabilities;
  readonly settingsSchema: z.ZodType;
  readonly render: React.ComponentType<MelvizComponentProps>;
  readonly editorPanel?: React.ComponentType<EditorPanelProps>;
}
```

### Component Capabilities

```typescript
export interface ComponentCapabilities {
  readonly supportedTypes: readonly DisplayerType[];
  readonly minColumns: number;
  readonly maxColumns: number;
  readonly columnRequirements: readonly ColumnRequirement[];
  readonly supportsFilter: boolean;
  readonly supportsGroup: boolean;
  readonly supportsDrillDown: boolean;
}

export interface ColumnRequirement {
  readonly role: "category" | "series" | "measure" | "latitude" | "longitude";
  readonly acceptedTypes: readonly ColumnType[];
  readonly required: boolean;
}
```

The editor uses `ComponentCapabilities` to show only valid configuration options. Third-party plugins get correct editor behaviour for free by declaring their capabilities.

### Three-Tier Plugin Loading

```typescript
export type PluginLoader =
  | { readonly type: "import"; readonly module: string }
  | { readonly type: "federated"; readonly url: string;
      readonly scope: string; readonly module: string }
  | { readonly type: "iframe"; readonly url: string };
```

**Tier 1 — Direct imports (monorepo).** Static imports, tree-shaken, type-checked at compile time. The echarts component that today runs in an iframe becomes a direct React component in the same bundle.

**Tier 2 — Module Federation 2.0 (third-party).** Plugins load as federated modules at runtime by URL. Shared React instance, no duplicate bundles. Plugin authors import `@melviz/core` types for compile-time checking. Their Zod `settingsSchema` auto-generates editor UI.

**Tier 3 — iframe + postMessage (fallback).** Preserves backwards compatibility with existing Melviz components. The `@melviz/component-api` package works unchanged. `TypedDataSet` is serialized back to `string[][]` wire format for the iframe boundary.

### PluginHost Component

```typescript
export function PluginHost({ componentId, settings, dataSet, mode, onFilter }: PluginHostProps) {
  const registry = usePluginRegistry();
  const registration = registry.get(componentId);

  if (!registration) return <PluginError message={`Unknown component: ${componentId}`} />;

  const validatedSettings = registration.settingsSchema.safeParse(settings);
  if (!validatedSettings.success) {
    return <PluginError message={formatZodError(validatedSettings.error)} />;
  }

  const Component = registration.render;
  return (
    <PluginErrorBoundary pluginId={componentId}>
      <Component
        settings={validatedSettings.data}
        dataSet={dataSet}
        mode={mode}
        onFilter={onFilter}
      />
    </PluginErrorBoundary>
  );
}
```

A crashing third-party plugin is caught by `PluginErrorBoundary` — it shows an error card while the rest of the dashboard keeps running.

### Plugin Manifest in YAML

```yaml
plugins:
  - id: gantt-chart
    loader:
      type: federated
      url: "https://plugins.example.com/gantt/remoteEntry.js"
      scope: ganttChart
      module: "./MelvizPlugin"

  - id: legacy-custom-viz
    loader:
      type: iframe
      url: "https://internal.example.com/custom-viz/"
```

---

## 8. Application Shell

### React Router

```typescript
// app/src/App.tsx
export function App({ config }: { config: MelvizConfig }) {
  return (
    <MelvizProvider config={config} registerPlugins={registerBuiltins}>
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<RootRedirect config={config} />} />
            <Route path="/dashboards" element={<DashboardList />} />
            <Route path="/dashboard/:id" element={<DashboardView />} />
            <Route path="/dashboard/:id/page/:pageId" element={<DashboardView />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/editor/:id" element={<Editor />} />
            <Route path="/samples" element={<SamplesGallery />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MelvizProvider>
  );
}
```

Deep linking, browser back/forward, lazy-loaded screens.

### MelvizProvider — Replacing Errai CDI

```typescript
export interface MelvizContext {
  readonly config: MelvizConfig;
  readonly registry: PluginRegistry;
  readonly dataSetManager: DataSetManager;
  readonly filterState: FilterStateManager;
  readonly dataService: DataService;
  readonly mode: "CLIENT" | "EDITOR";
}

export function usePluginRegistry(): PluginRegistry { ... }
export function useDataSetManager(): DataSetManager { ... }
export function useFilterState(): FilterStateManager { ... }
export function useDataService(): DataService { ... }
export function useMelvizMode(): "CLIENT" | "EDITOR" { ... }
```

### FilterStateManager

Replaces CDI `@Observes` events with inspectable, explicit state:

```typescript
export class FilterStateManager {
  private readonly state = new Map<ComponentId, FilterState>();
  private readonly listeners = new Set<FilterListener>();

  applyFilter(source: ComponentId, filter: ColumnFilter): void { ... }
  resetFilter(source: ComponentId): void { ... }
  getActiveFilters(): ReadonlyMap<ComponentId, FilterState> { ... }
  subscribe(listener: FilterListener): () => void { ... }
}
```

### Dashboard Renderer

```typescript
export function DashboardRenderer({ model, pageId }: DashboardRendererProps) {
  const page = model.pages.find(p => p.name === pageId) ?? model.pages[0];
  return (
    <div className={page.style === "PAGE" ? "max-w-7xl mx-auto" : "w-full"}>
      {page.rows.map((row, i) => <LayoutRow key={i} row={row} />)}
    </div>
  );
}
```

Tailwind's `grid-cols-12` maps directly to the Bootstrap 12-column grid the current layout uses.

### Layout Editor

Uses `@dnd-kit/core` for drag-and-drop. Settings panels are auto-generated from each component's Zod `settingsSchema`:

```typescript
export function SettingsPanel({ registration, settings, onChange }: SettingsPanelProps) {
  const fields = zodToFormFields(registration.settingsSchema);
  return (
    <div className="space-y-4">
      <h3 className="font-medium">{registration.name}</h3>
      {fields.map(field => (
        <SchemaField key={field.path} field={field}
          value={getNestedValue(settings, field.path)}
          onChange={(v) => onChange(setNestedValue(settings, field.path, v))} />
      ))}
      {registration.editorPanel && (
        <registration.editorPanel settings={settings} onChange={onChange} />
      )}
    </div>
  );
}
```

A `SchemaField` renders the right control based on the Zod type: `z.boolean()` → toggle, `z.enum()` → dropdown, `z.number().min().max()` → slider.

### setup.js and postMessage Compatibility

Both existing APIs are preserved:

```typescript
// app/src/main.tsx
const rawConfig = (window as any).melviz ?? {};
const config = setupConfigSchema.parse(rawConfig);

window.addEventListener("message", (event) => {
  if (typeof event.data === "string") {
    loadDashboardFromYaml(event.data);
  }
});

createRoot(document.getElementById("app")!).render(<App config={config} />);
```

---

## 9. Data Service and Provider Architecture

### DataService Interface

```typescript
export interface DataService {
  fetchDataSet(ref: DataSetRef): Promise<TypedDataSet>;
  queryDataSet(ref: DataSetRef, ops: readonly DataSetOp[]): Promise<TypedDataSet>;
  saveDashboard(id: string, model: RuntimeModel): Promise<void>;
  loadDashboard(id: string): Promise<RuntimeModel | undefined>;
  listDashboards(): Promise<readonly DashboardSummary[]>;
  deleteDashboard(id: string): Promise<void>;
  listAvailablePlugins(): Promise<readonly PluginManifest[]>;
  capabilities(): ServiceCapabilities;
}

export interface ServiceCapabilities {
  readonly serverSideQuery: boolean;
  readonly serverSideCache: boolean;
  readonly persistence: boolean;
  readonly sqlDataSources: boolean;
  readonly dataProxy: boolean;
  readonly pluginRegistry: boolean;
  readonly dataProviders: readonly string[];
}
```

### Three Implementations

**LocalDataService** — the default, no backend needed:

| Capability | Implementation |
|---|---|
| Dataset fetch | Browser `fetch()` (subject to CORS) |
| Dataset ops | In-memory JS (applyOps) |
| Persistence | IndexedDB |
| Caching | IndexedDB + in-memory with TTL |
| Offline | Serves stale cache when network unavailable |
| Data providers | url, inline, csv-file |

**RemoteDataService** — delegates to Quarkus backend:

| Capability | Implementation |
|---|---|
| Dataset fetch | Server proxy (CORS bypass, auth injection) |
| Dataset ops | Server pushes to SQL/source |
| Persistence | PostgreSQL via server API |
| Caching | Server-side Caffeine |
| Data providers | All local + sql, prometheus, kafka, elasticsearch, json-proxy, csv-proxy |

**HybridDataService** — tries remote, falls back to local:

- Saves locally first (instant, works offline), then syncs to server
- Failed server operations queue in IndexedDB `syncQueue` for retry
- The UI adapts via `capabilities()` — features requiring a server don't appear without one

### Service Resolution

```typescript
function resolveDataService(config: MelvizConfig): DataService {
  const local = new LocalDataService();
  if (!config.backendUrl) return local;
  const remote = new RemoteDataService(config.backendUrl);
  return new HybridDataService(local, remote);
}
```

### DataProvider Interface (Client-Side)

```typescript
export interface DataProvider {
  readonly type: string;
  canHandle(ref: DataSetRef): boolean;
  fetch(ref: DataSetRef): Promise<RawDataSet>;
  query?(ref: DataSetRef, ops: readonly DataSetOp[]): Promise<TypedDataSet>;
}

export class DataProviderRegistry {
  register(provider: DataProvider): void { ... }
  resolve(ref: DataSetRef): DataProvider { ... }
  has(type: string): boolean { ... }
}
```

Built-in providers: `urlProvider`, `inlineProvider`, `csvFileProvider`.

When a backend is configured, additional providers are registered dynamically:

```typescript
async function registerServerProviders(registry: DataProviderRegistry, backendUrl: string) {
  const caps = await fetch(`${backendUrl}/api/capabilities`).then(r => r.json());
  for (const providerType of caps.dataProviders) {
    if (!registry.has(providerType)) {
      registry.register(createRemoteProvider(providerType, backendUrl));
    }
  }
}
```

### DataSetManager

```typescript
export class DataSetManager {
  constructor(
    private readonly providers: DataProviderRegistry,
    private readonly cache: DataSetCache,
  ) {}

  async load(ref: DataSetRef): Promise<TypedDataSet> { ... }

  async query(ref: DataSetRef, ops: readonly DataSetOp[]): Promise<TypedDataSet> {
    const provider = this.providers.resolve(ref);
    if (provider.query) return provider.query(ref, ops);
    const ds = await this.load(ref);
    return applyOps(ds, ops);
  }
}
```

Key improvements over the current implementation:
- Request deduplication (concurrent requests for the same dataset coalesced)
- IndexedDB caching with TTL and stale-while-offline
- Structured errors with `DataSetError` (error codes, `recoverable` flag)
- Subscription model for refresh events

### IndexedDB Schema

```typescript
export const STORES = {
  dashboards: { keyPath: "id" },
  datasetCache: { keyPath: "cacheKey", indexes: [
    { name: "fetchedAt", keyPath: "fetchedAt" },
    { name: "expiresAt", keyPath: "expiresAt" },
  ]},
  syncQueue: { keyPath: "id", autoIncrement: true, indexes: [
    { name: "queuedAt", keyPath: "queuedAt" },
    { name: "operation", keyPath: "operation" },
  ]},
} as const;
```

### useDataSet Hook

```typescript
export function useDataSet(ref: DataSetRef, ops?: readonly DataSetOp[]): DataSetResult {
  const manager = useDataSetManager();
  const filters = useFilters();
  // ... handles loading, error, refresh, filter application, capability-aware query delegation
}
```

---

## 10. Quarkus Backend

The backend is **optional**. The app works fully without it using `LocalDataService`. Adding `backendUrl` to `setup.js` activates `HybridDataService`.

### Module Structure

```
server/
├── src/main/java/org/melviz/server/
│   ├── MelvizApplication.java
│   ├── api/
│   │   ├── CapabilitiesResource.java
│   │   ├── DataSetResource.java
│   │   ├── DashboardResource.java
│   │   └── PluginResource.java
│   ├── dataset/
│   │   ├── DataProvider.java
│   │   ├── DataProviderRegistry.java
│   │   ├── DataSetQueryEngine.java
│   │   └── providers/
│   │       ├── SqlDataProvider.java
│   │       ├── PrometheusDataProvider.java
│   │       ├── KafkaDataProvider.java
│   │       ├── ElasticsearchDataProvider.java
│   │       ├── CsvProxyProvider.java
│   │       └── JsonProxyProvider.java
│   ├── cache/
│   │   └── DataSetCache.java
│   ├── dashboard/
│   │   ├── DashboardEntity.java
│   │   └── DashboardRepository.java
│   └── plugin/
│       ├── PluginManifestEntity.java
│       └── PluginRepository.java
├── src/main/resources/
│   ├── application.properties
│   └── db/migration/
│       └── V1__init.sql
└── pom.xml
```

### Data Provider SPI

```java
public interface DataProvider {
    String type();
    boolean canHandle(DataSetRef ref);
    RawDataSet fetch(DataSetRef ref);

    default TypedDataSet query(DataSetRef ref, List<DataSetOp> ops) {
        RawDataSet raw = fetch(ref);
        TypedDataSet typed = DataSetConverter.toTyped(raw, ref.columns());
        return DataSetQueryEngine.apply(typed, ops);
    }
}
```

Providers are CDI beans discovered automatically by Quarkus.

### SQL Data Provider

Pushes filter, group, and sort operations down to the database via `SqlQueryBuilder`:

```java
@ApplicationScoped
public class SqlDataProvider implements DataProvider {
    @Inject AgroalDataSource defaultDataSource;
    @ConfigProperty(name = "melviz.datasources") Map<String, String> namedDataSources;

    @Override
    public TypedDataSet query(DataSetRef ref, List<DataSetOp> ops) {
        SqlDataSetRef sqlRef = (SqlDataSetRef) ref;
        DataSource ds = resolveDataSource(sqlRef.dataSource());
        SqlQueryBuilder builder = new SqlQueryBuilder(sqlRef.query());
        for (DataSetOp op : ops) {
            switch (op) {
                case FilterOp f -> builder.addFilter(f);
                case GroupOp g -> builder.addGroupBy(g);
                case SortOp s -> builder.addOrderBy(s);
                case AggregateOp a -> builder.addAggregate(a);
            }
        }
        // Execute SQL, return typed results
    }
}
```

`SqlQueryBuilder` wraps the user's base query as a subquery and applies operations on top — the user SQL stays untouched.

### Prometheus Data Provider

Translates time-range filters into PromQL `start`/`end` parameters and aggregation into PromQL functions.

### Kafka Data Provider

Consumes from configured topics within a time window, parses records by configured value format (JSON, CSV, Avro).

### Elasticsearch Data Provider

Translates `DataSetOp` filter/group/sort operations into Elasticsearch query DSL and aggregations.

### Proxy Providers (CSV, JSON)

Server fetches external data on behalf of the client — bypasses CORS restrictions and injects server-side auth headers (API keys, bearer tokens).

### Caching

Quarkus Cache (Caffeine) with configurable TTL per dataset:

```java
@ApplicationScoped
public class DataSetCache {
    @Inject Cache<String, CachedDataSet> cache;
    @ConfigProperty(name = "melviz.cache.default-ttl", defaultValue = "300") int defaultTtlSeconds;

    public Optional<TypedDataSet> get(DataSetRef ref) { ... }
    public void put(DataSetRef ref, TypedDataSet dataSet) { ... }
    public void invalidate(DataSetRef ref) { ... }
    public void invalidateAll() { ... }
}
```

### Dashboard Persistence

```java
@Entity
@Table(name = "dashboards")
public class DashboardEntity extends PanacheEntity {
    @Column(nullable = false, unique = true) public String dashboardId;
    @Column(columnDefinition = "TEXT") public String yamlContent;
    @Column(columnDefinition = "JSONB") public String modelJson;
    public Instant createdAt;
    public Instant updatedAt;
}
```

### REST API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/capabilities` | GET | Report server capabilities and available data providers |
| `/api/dataset/fetch` | POST | Fetch a dataset through server (proxy, auth injection) |
| `/api/dataset/query` | POST | Fetch + apply ops server-side (SQL push-down) |
| `/api/dashboard` | GET | List all dashboards |
| `/api/dashboard/:id` | GET | Load a dashboard |
| `/api/dashboard/:id` | PUT | Save a dashboard |
| `/api/dashboard/:id` | DELETE | Delete a dashboard |
| `/api/plugins` | GET | List available plugins from server registry |

### Database Schema

```sql
-- V1__init.sql
CREATE TABLE dashboards (
    id BIGSERIAL PRIMARY KEY,
    dashboard_id VARCHAR(255) NOT NULL UNIQUE,
    yaml_content TEXT,
    model_json JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE plugin_manifests (
    id BIGSERIAL PRIMARY KEY,
    plugin_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    loader_type VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    scope VARCHAR(255),
    module VARCHAR(255),
    capabilities JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Configuration

```properties
quarkus.http.port=8090
quarkus.http.cors=true
quarkus.datasource.db-kind=postgresql
quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/melviz
quarkus.flyway.migrate-at-start=true

melviz.datasources.sales=java:comp/jdbc/SalesDB
melviz.prometheus.url=http://prometheus:9090
melviz.kafka.bootstrap-servers=kafka:9092
melviz.elasticsearch.url=http://elasticsearch:9200
melviz.cache.default-ttl=300
```

### Dependencies

```xml
<dependencies>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-rest-jackson</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-hibernate-orm-panache</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-jdbc-postgresql</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-flyway</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-cache</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-kafka-client</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-elasticsearch-rest-client</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-smallrye-health</artifactId></dependency>
    <dependency><groupId>io.quarkus</groupId><artifactId>quarkus-container-image-jib</artifactId></dependency>
</dependencies>
```

---

## 11. Testing Strategy

Testing is the safety net that makes a 50K LOC rewrite viable. Every subsystem is developed test-first (TDD). Tests are not an afterthought or a phase — they are the primary mechanism for verifying that the new system does what the old system did, and does it correctly.

### Testing Principles

- **TDD everywhere.** Write the test first, watch it fail, implement until it passes. This applies to every layer — dataset operations, YAML parsing, displayer rendering, plugin loading, data service, and backend providers.
- **No guessing about rendering.** Playwright E2E tests load real dashboards in a real browser and assert on what's actually visible — pixel-level screenshots, DOM structure, interactive behaviour. A test that checks a React component rendered without errors is not sufficient. A test that checks the chart SVG contains the right number of bars with the right heights is.
- **Test at every boundary.** Unit tests for pure functions, integration tests for subsystem interactions, E2E tests for user-visible behaviour. Each layer catches different failure modes.
- **Existing dashboards are the acceptance suite.** Every YAML dashboard in `examples/dashboards/` becomes a Playwright E2E test that renders the dashboard and asserts it looks and behaves correctly. This is how we prove feature parity.
- **Backend tests are real.** Quarkus integration tests use Testcontainers — real PostgreSQL, real Kafka, real Elasticsearch. No mocking data sources.

### Test Layers

#### Layer 1: Unit Tests (Vitest)

Pure functions, models, and logic — no DOM, no browser, no network.

| Subsystem | What's tested | Example assertions |
|-----------|--------------|-------------------|
| DataSet operations | `applyFilter`, `applyGroup`, `applySort`, `applyOps` | Filter NUMBER column by BETWEEN(10, 50) returns only matching rows; group by LABEL column produces correct aggregate counts |
| Column-type filters | Type-specific filter construction and application | `NumericFilter` with `BETWEEN` on a TEXT column is a compile error (type-level test); runtime filter on NUMBER returns correct rows |
| Typed DataSet | `toTypedDataSet` parsing from raw `string[][]` | NUMBER column values parsed to numbers; DATE column values parsed to Dates; malformed values produce `DataSetError` with `SCHEMA_MISMATCH` code |
| YAML parser | `parseYaml` with Zod schema validation | Valid YAML produces correct `RuntimeModel`; missing required fields produce structured Zod error; extra fields are stripped; default values applied |
| Zod schemas | All schema definitions | Each schema validates known-good fixtures; each schema rejects known-bad fixtures with correct error paths |
| Expression evaluator | JSONata expressions via `evaluateExpression` | `value` returns raw value; arithmetic expressions compute correctly; malformed expressions throw, not return garbage |
| FilterStateManager | State transitions, subscription notification | Apply filter notifies subscribers; reset filter removes state; multiple filters from different components coexist; subscriber unsubscribe stops notifications |
| DataSetCache | TTL, staleness, eviction | Fresh cache hit returns data; stale cache returns undefined; put then get round-trips correctly |
| PluginRegistry | Registration, lookup, capability matching | Register then lookup by ID succeeds; unknown ID returns undefined; `matching(requirements)` filters by column requirements |
| RuntimeModel | Model construction, page lookup, navigation | Multi-page model navigates correctly; missing page falls back to first; empty model produces `EmptyDashboard` |
| Branded types | Compile-time type safety | `ColumnId` cannot be passed where `ComponentId` is expected (compile error — verified via `tsd` or `expect-type`) |

```typescript
// Example: dataset operation unit test
describe("applyFilter", () => {
  const ds = createTypedDataSet({
    columns: [
      { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
      { id: "revenue" as ColumnId, name: "Revenue", type: ColumnType.NUMBER },
    ],
    rows: [
      ["Acme", 100],
      ["Beta", 250],
      ["Gamma", 50],
    ],
  });

  it("filters NUMBER column by GREATER_THAN", () => {
    const result = applyFilter(ds, {
      type: "filter",
      columnId: "revenue" as ColumnId,
      columnType: ColumnType.NUMBER,
      filter: { fn: "GREATER_THAN", value: 80 },
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].number("revenue" as ColumnId)).toBe(100);
    expect(result.rows[1].number("revenue" as ColumnId)).toBe(250);
  });

  it("returns immutable result — source unchanged", () => {
    const result = applyFilter(ds, { ... });
    expect(ds.rows).toHaveLength(3);  // original untouched
  });
});
```

**Coverage target:** 95%+ line coverage for `packages/core/src/dataset/`, `packages/core/src/yaml/`, `packages/core/src/expression/`, `packages/core/src/filter/`.

#### Layer 2: Component Tests (Vitest + React Testing Library)

React components rendered in jsdom — tests the component contract, not the browser.

| Component | What's tested | Example assertions |
|-----------|--------------|-------------------|
| PluginHost | Renders correct component from registry; shows error on unknown plugin; shows validation error on bad settings; error boundary catches crash | Renders `<BarChart>` when settings.type is "BAR"; shows "Unknown component" for unregistered ID; crashing plugin shows error card, not blank screen |
| DashboardRenderer | Layout grid rendering; row/column spans; page navigation | 12-column grid renders correctly; `span: 6` produces `col-span-6`; page navigation updates visible content |
| ComponentSlot | Loading state, error state, data rendering | Shows skeleton while loading; shows retry button for recoverable errors; shows config error for structural errors; renders PluginHost with loaded data |
| SettingsPanel | Auto-generated fields from Zod schema | Boolean field renders toggle; enum field renders dropdown; number with min/max renders slider; nested objects render sub-panels |
| EditorCanvas | Drag-and-drop operations | Drag component to column adds it; drag between columns moves it; drag from palette creates new; drop on invalid target reverts |
| FilterStateManager hook | `useFilters` reactivity | Applying filter in one component re-renders others; reset clears filter; multiple concurrent filters compose |
| DashboardList | List rendering, selection | Lists available dashboards; click navigates to dashboard; search filters list |

```typescript
// Example: PluginHost component test
describe("PluginHost", () => {
  it("renders the registered component with validated settings", () => {
    const registry = new PluginRegistry();
    registry.register({
      id: "test-chart" as PluginId,
      name: "Test Chart",
      capabilities: { ... },
      settingsSchema: z.object({ type: z.literal("TEST"), color: z.string() }),
      render: ({ settings }) => <div data-testid="chart">{settings.color}</div>,
    });

    render(
      <PluginRegistryContext.Provider value={registry}>
        <PluginHost
          componentId={"test-chart" as PluginId}
          settings={{ type: "TEST", color: "red" }}
          dataSet={emptyDataSet}
          mode="CLIENT"
          onFilter={() => {}}
        />
      </PluginRegistryContext.Provider>
    );

    expect(screen.getByTestId("chart")).toHaveTextContent("red");
  });

  it("shows error boundary card when component throws", () => {
    const CrashingComponent = () => { throw new Error("boom"); };
    // ... register CrashingComponent, render PluginHost
    expect(screen.getByText(/plugin error/i)).toBeInTheDocument();
  });
});
```

#### Layer 3: Integration Tests (Vitest)

Subsystem interactions — multiple units working together, but no browser.

| Integration | What's tested | Example assertions |
|-------------|--------------|-------------------|
| YAML → RuntimeModel → DashboardRenderer | Full parsing pipeline to rendered component tree | Parse YAML string, produce RuntimeModel, render layout, verify correct number of rows/columns/components |
| DataSetManager → DataProvider → Cache | Fetch, cache, serve from cache, refresh | First fetch calls provider; second fetch serves from cache; after TTL expiry re-fetches; concurrent requests coalesced |
| FilterStateManager → useDataSet → Component re-render | Cross-component filter propagation | Chart A filters column X; Chart B re-renders with filtered data; Chart A reset restores Chart B to full data |
| PluginRegistry → FederatedLoader | Module Federation loading | Load federated module from mock remote; register component; render via PluginHost (uses Vite test server for MF remotes) |
| PluginRegistry → IframeLoader | iframe postMessage protocol | Load iframe component; send INIT message; send DATASET message; receive FILTER message back |
| DataService → LocalDataService → IndexedDB | Persistence round-trip | Save dashboard; close and reopen IndexedDB; load dashboard; verify content identical (uses `fake-indexeddb` in tests) |
| DataService → HybridDataService | Server fallback | With mock server: queries go to server. Server down: falls back to local. Server returns: syncs queued operations |
| Schema generation | Zod → JSON Schema → validation | Generate JSON Schema from Zod; validate known-good YAML against JSON Schema; validate known-bad YAML produces errors |

```typescript
// Example: full pipeline integration test
describe("YAML to render pipeline", () => {
  it("parses a multi-component dashboard and renders all components", () => {
    const yaml = `
pages:
  - name: Sales
    rows:
      - columns:
          - span: 6
            components:
              - type: TABLE
                dataSet:
                  type: inline
                  columns: [{id: name, type: TEXT}, {id: revenue, type: NUMBER}]
                  data: [["Acme", "100"], ["Beta", "250"]]
          - span: 6
            components:
              - type: METRIC
                dataSet:
                  type: inline
                  columns: [{id: total, type: NUMBER}]
                  data: [["350"]]
    `;

    const model = parseYaml(yaml);
    expect(model.pages).toHaveLength(1);
    expect(model.pages[0].rows[0].columns).toHaveLength(2);

    const { container } = render(
      <TestMelvizProvider>
        <DashboardRenderer model={model} />
      </TestMelvizProvider>
    );

    expect(container.querySelectorAll("[data-component-type]")).toHaveLength(2);
  });
});
```

#### Layer 4: End-to-End Tests (Playwright)

Real browser, real rendering, real interactions. This is where we prove the system works — not guess.

| Test suite | What's tested | How |
|------------|--------------|-----|
| **Dashboard rendering** | Every example dashboard renders correctly | Load each YAML from `examples/dashboards/`, wait for all components to render, take screenshot, compare against baseline |
| **Chart correctness** | Charts display correct data | Load known dataset, render bar chart, assert SVG has correct number of `<rect>` elements with correct heights/widths proportional to data values |
| **Table correctness** | Tables display correct data | Load known dataset, render table, assert correct number of rows, correct cell contents, correct column headers |
| **Filter interaction** | Cross-component filtering works | Click bar in chart A → table B updates to show filtered rows → selector C updates to show selected value → reset button restores all |
| **Editor drag-and-drop** | Layout editing works | Open editor, drag component from palette to canvas, verify it appears; drag to reorder, verify new order; resize column, verify span changes |
| **Editor settings** | Settings panel modifies component | Select component in editor, change title in settings panel, verify title updates in preview; change chart type, verify component swaps |
| **Deep linking** | URL navigation works | Navigate to `/dashboard/sales/page/revenue`, verify correct page rendered; use browser back, verify previous page; bookmark URL, reload, verify same state |
| **Offline resilience** | App works without network | Load dashboard, go offline (network emulation), reload page, verify dashboard renders from IndexedDB cache; go online, verify fresh data loads |
| **Plugin loading (MF)** | Module Federation plugins load and render | Start MF remote dev server, load dashboard referencing federated plugin, verify plugin renders correctly and responds to filter events |
| **Plugin loading (iframe)** | iframe plugins load and communicate | Load dashboard with iframe plugin, verify postMessage INIT received, verify DATASET renders, verify FILTER sends back to host |
| **Plugin crash isolation** | Bad plugin doesn't break dashboard | Load dashboard where one plugin throws, verify error boundary shows error card, verify other components still render and interact |
| **setup.js compatibility** | Legacy configuration works | Configure `window.melviz` with dashboards array, load app, verify correct dashboards loaded |
| **postMessage API** | Dynamic YAML loading works | Load app, postMessage YAML string, verify dashboard renders |
| **Responsive layout** | Grid adapts to viewport | Render dashboard at desktop/tablet/mobile widths, verify layout reflows correctly, no horizontal overflow |
| **Accessibility** | Keyboard navigation, ARIA | Tab through components, verify focus indicators; screen reader announces chart data; editor palette navigable by keyboard |

```typescript
// Example: Playwright E2E test for chart rendering correctness
test.describe("Bar chart rendering", () => {
  test("renders correct number of bars with correct proportions", async ({ page }) => {
    await page.goto("/test-fixtures/bar-chart-basic");
    await page.waitForSelector("[data-component-type='BAR']");

    // Wait for ECharts to finish rendering
    await page.waitForSelector("canvas", { state: "visible" });
    // Or for SVG renderer:
    const bars = await page.locator("rect.echarts-bar").all();
    expect(bars).toHaveLength(3);

    // Verify proportions match data (100, 250, 50 → heights proportional)
    const heights = await Promise.all(bars.map(b => b.getAttribute("height")));
    const numericHeights = heights.map(Number);
    // Tallest bar (250) should be ~5x shortest (50)
    expect(numericHeights[1] / numericHeights[2]).toBeCloseTo(5, 0.5);
  });

  test("matches screenshot baseline", async ({ page }) => {
    await page.goto("/test-fixtures/bar-chart-basic");
    await page.waitForSelector("[data-component-type='BAR']");
    await expect(page.locator("[data-component-type='BAR']"))
      .toHaveScreenshot("bar-chart-basic.png", { maxDiffPixelRatio: 0.01 });
  });
});

// Example: cross-component filter interaction
test.describe("Filter interaction", () => {
  test("clicking chart bar filters table", async ({ page }) => {
    await page.goto("/test-fixtures/chart-table-filter");
    await page.waitForSelector("[data-component-type='BAR']");
    await page.waitForSelector("[data-component-type='TABLE']");

    // Table initially shows all rows
    const rowsBefore = await page.locator("table tbody tr").count();
    expect(rowsBefore).toBe(5);

    // Click first bar
    await page.locator("rect.echarts-bar").first().click();

    // Table now shows filtered rows
    await page.waitForFunction(() => {
      return document.querySelectorAll("table tbody tr").length < 5;
    });
    const rowsAfter = await page.locator("table tbody tr").count();
    expect(rowsAfter).toBeLessThan(5);
    expect(rowsAfter).toBeGreaterThan(0);
  });
});
```

#### Layer 5: Backend Tests (Quarkus — JUnit 5 + Testcontainers)

Real databases, real message brokers — no mocking data sources.

| Test suite | What's tested | Infrastructure |
|------------|--------------|---------------|
| SQL DataProvider | Query generation, filter push-down, group-by, sort | Testcontainers PostgreSQL with seeded test data |
| SqlQueryBuilder | SQL generation correctness | Unit tests (no DB needed) — asserts generated SQL and parameter list |
| Prometheus DataProvider | PromQL query construction, response parsing | WireMock simulating Prometheus API responses |
| Kafka DataProvider | Topic consumption, windowed reads, format parsing | Testcontainers Kafka with test messages |
| Elasticsearch DataProvider | Query DSL generation, response parsing | Testcontainers Elasticsearch with seeded indices |
| Proxy providers | HTTP proxy, header injection, CORS bypass | WireMock simulating upstream APIs |
| DataSetCache | TTL, invalidation, concurrent access | Unit tests with Caffeine cache |
| Dashboard persistence | CRUD operations, JSONB storage, migration | Testcontainers PostgreSQL + Flyway |
| REST API | Endpoint contracts, error responses, content types | `@QuarkusTest` with REST Assured |
| Capabilities | Provider discovery, dynamic capability reporting | Integration test verifying capabilities endpoint reflects registered providers |

```java
// Example: SQL DataProvider integration test
@QuarkusTest
@TestProfile(PostgresTestProfile.class)
class SqlDataProviderTest {

    @Inject
    SqlDataProvider provider;

    @Test
    void pushesFilterToSql() {
        var ref = SqlDataSetRef.of("default", "SELECT region, revenue FROM sales",
            List.of(column("region", ColumnType.TEXT), column("revenue", ColumnType.NUMBER)));

        var ops = List.<DataSetOp>of(
            new FilterOp("revenue", ColumnType.NUMBER,
                new NumericFilter("GREATER_THAN", 100)));

        TypedDataSet result = provider.query(ref, ops);

        // All returned rows have revenue > 100
        for (TypedRow row : result.rows()) {
            assertThat(row.number("revenue")).isGreaterThan(100);
        }
    }

    @Test
    void pushesGroupByToSql() {
        var ref = SqlDataSetRef.of("default",
            "SELECT region, revenue FROM sales", ...);

        var ops = List.<DataSetOp>of(
            new GroupOp("region", List.of(
                new AggregateColumn("revenue", "SUM", "total_revenue"))));

        TypedDataSet result = provider.query(ref, ops);

        // One row per distinct region
        assertThat(result.rows()).hasSizeLessThanOrEqualTo(
            distinctRegionCount());
        // Each row has region and total_revenue
        for (TypedRow row : result.rows()) {
            assertThat(row.text("region")).isNotBlank();
            assertThat(row.number("total_revenue")).isPositive();
        }
    }
}

// Example: REST API contract test
@QuarkusTest
class DataSetResourceTest {

    @Test
    void queryEndpointReturnsTypedDataSet() {
        given()
            .contentType(ContentType.JSON)
            .body("""
                {
                  "ref": {"type": "sql", "dataSource": "default",
                          "query": "SELECT * FROM sales"},
                  "ops": [{"type": "filter", "columnId": "revenue",
                           "columnType": "NUMBER",
                           "filter": {"fn": "GREATER_THAN", "value": 100}}]
                }
                """)
        .when()
            .post("/api/dataset/query")
        .then()
            .statusCode(200)
            .body("columns", hasSize(greaterThan(0)))
            .body("rows", hasSize(greaterThan(0)));
    }

    @Test
    void queryWithUnknownProviderReturns400() {
        given()
            .contentType(ContentType.JSON)
            .body("""
                {"ref": {"type": "nonexistent"}, "ops": []}
                """)
        .when()
            .post("/api/dataset/query")
        .then()
            .statusCode(400)
            .body("code", equalTo("UNKNOWN_PROVIDER"));
    }
}
```

#### Layer 6: Feature Parity Tests (Playwright)

The migration-specific test suite that proves the new system does everything the old system did.

| Test | Approach |
|------|----------|
| Every example dashboard | Load each YAML from `examples/dashboards/` in the new app, screenshot, compare against baseline captured from the GWT app |
| setup.js modes | Test CLIENT mode, EDITOR mode, samples mode, dashboard list mode — all via setup.js configuration |
| postMessage protocol | Send YAML via postMessage, verify dashboard renders identically to static load |
| Filter interactions | For each dashboard that has interactive filters: script the interactions, verify the filtered state matches the GWT app's behaviour |
| Edge cases | Empty dashboard, single-component dashboard, maximum columns, deeply nested navigation, very large datasets (10K rows) |

```typescript
// Feature parity: render every example dashboard
const exampleDashboards = fs.readdirSync("examples/dashboards", { recursive: true })
  .filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));

for (const dashboard of exampleDashboards) {
  test(`renders example: ${dashboard}`, async ({ page }) => {
    // Load dashboard via postMessage (same as current GWT app)
    await page.goto("/");
    const yaml = fs.readFileSync(`examples/dashboards/${dashboard}`, "utf-8");
    await page.evaluate((content) => {
      window.postMessage(content, "*");
    }, yaml);

    // Wait for all components to render
    await page.waitForSelector("[data-component-type]", { timeout: 10000 });
    await page.waitForLoadState("networkidle");

    // Screenshot comparison against baseline
    await expect(page).toHaveScreenshot(`parity/${dashboard}.png`, {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });
}
```

### Test Infrastructure

| Tool | Purpose | Layer |
|------|---------|-------|
| Vitest | Unit tests, component tests, integration tests | Layers 1-3 |
| React Testing Library | React component rendering in jsdom | Layer 2 |
| `fake-indexeddb` | IndexedDB mock for Node.js tests | Layers 2-3 |
| `msw` (Mock Service Worker) | HTTP request interception for integration tests | Layer 3 |
| Playwright | E2E browser tests | Layers 4, 6 |
| JUnit 5 | Backend unit and integration tests | Layer 5 |
| Testcontainers | Real PostgreSQL, Kafka, Elasticsearch in tests | Layer 5 |
| WireMock | HTTP mock for Prometheus, upstream APIs | Layer 5 |
| REST Assured | REST API contract testing | Layer 5 |
| `expect-type` / `tsd` | Compile-time type assertion tests | Layer 1 |

### CI Pipeline

```
┌─────────────────────────────────────────────────────────┐
│ CI Pipeline (every PR)                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Type check         tsc --noEmit                    │
│  2. Lint               eslint (no-any enforcement)     │
│  3. Unit tests         vitest run (layers 1-3)         │
│  4. Schema validation  generate schemas, validate      │
│  5. Build              vite build (must succeed)       │
│  6. E2E tests          playwright test (layer 4)       │
│  7. Backend tests      mvn test (layer 5, if changed)  │
│  8. Parity tests       playwright parity suite         │
│                                                         │
│  Any failure blocks merge.                             │
└─────────────────────────────────────────────────────────┘
```

### Coverage Requirements

| Package | Minimum line coverage |
|---------|----------------------|
| `packages/core/src/dataset/` | 95% |
| `packages/core/src/yaml/` | 95% |
| `packages/core/src/expression/` | 95% |
| `packages/core/src/filter/` | 95% |
| `packages/core/src/plugin/` | 90% |
| `packages/core/src/services/` | 90% |
| `packages/editor/` | 85% |
| `app/src/` | 80% |
| `server/` (Java) | 90% |
| Overall | 90% |

### TDD Workflow

Every feature follows Red-Green-Refactor:

1. **Write the test first** — define what the function/component should do
2. **Run it — it fails** (red)
3. **Write the minimum implementation** to make it pass (green)
4. **Refactor** — clean up without changing behaviour, tests still pass
5. **Add edge case tests** — null inputs, empty datasets, malformed YAML, concurrent requests
6. **Add robustness tests** — what happens when the network drops mid-fetch? When IndexedDB is full? When a plugin crashes during render?

This is not optional for any phase. Phase 1 doesn't ship "core skeleton + we'll add tests later." Phase 1 ships "core skeleton where every function has tests that prove it works."

---

## 12. Migration Strategy

### Approach: Clean Rewrite

The TypeScript core is built from scratch alongside the existing GWT core. Both coexist in the repo during development. When the TS core reaches feature parity, the GWT `core/` directory and Maven build are deleted.

### Phases

**Phase 1: TypeScript core skeleton**
- `packages/core/` — DataSet model, Zod schemas, YAML parser, expression evaluator
- `app/` — Vite app shell, React Router, MelvizProvider
- Type safety infrastructure (tsconfig strict, ESLint no-any, bridge pattern)
- JSON Schema generation pipeline
- `LocalDataService` with IndexedDB persistence

**Phase 2: Port displayers**
- Table, selector, metric as React components in `packages/core/displayers/`
- Evolve `packages/component-api/` from postMessage bridge to React hooks
- Migrate echarts, svg-heatmap, llm-prompter components to direct imports
- `PluginHost` component with error boundaries

**Phase 3: Plugin system**
- Module Federation 2.0 loader (`@module-federation/vite`)
- iframe fallback loader (preserves backwards compatibility)
- `PluginRegistry` with capability-based component matching
- `DataProviderRegistry` with pluggable client-side providers

**Phase 4: Layout editor**
- `packages/editor/` — drag-and-drop with @dnd-kit/core
- Auto-generated settings panels from Zod schemas
- Capability-aware column assignment

**Phase 5: Quarkus backend**
- `server/` — REST API, DataProvider SPI
- SQL, Prometheus, Kafka, Elasticsearch providers
- DataSetCache (Caffeine), Dashboard persistence (Panache + PostgreSQL)
- `HybridDataService` integration

**Phase 6: Feature parity validation and switchover**
- Test all existing YAML dashboards against the new core
- Validate postMessage API compatibility for iframe plugins
- Validate setup.js configuration compatibility
- Delete `core/`, `webapp/`, remove Maven from the build
- Update CLAUDE.md, README, CI

### During Development

- Both cores exist in the repo
- The TypeScript core is developed and tested independently
- The GWT core remains the "production" path until switchover
- Each phase is independently testable

---

## 13. Technology Stack

| Layer | Technology | Replaces |
|-------|-----------|----------|
| Language | TypeScript 5.x (strict mode) | Java 17 |
| UI framework | React 18+ | GWT + Errai CDI |
| Bundler | Vite | Maven + Webpack 5 |
| Styling | Tailwind CSS | PatternFly (webjars) |
| Routing | React Router | Hand-rolled PlaceManager |
| DI | React Context + hooks | Errai CDI |
| Drag-and-drop | @dnd-kit/core | uberfire-layout-editor-client |
| YAML parsing | js-yaml (direct import) | js-yaml (ScriptInjector + JsInterop) |
| JSON transforms | JSONata (direct import) | JSONata (ScriptInjector + JsInterop + eval()) |
| CSV parsing | Papa Parse | Custom Java class |
| Runtime validation | Zod | Hand-written marshallers |
| Schema tooling | zod-to-json-schema → JSON Schema | None |
| Plugin loading | Module Federation 2.0 (@module-federation/vite) | iframe + postMessage only |
| Local persistence | IndexedDB | None |
| Backend (optional) | Quarkus | None (was in Dashbuilder, removed in Melviz) |
| Backend DB | PostgreSQL + Flyway | None |
| Backend cache | Quarkus Cache (Caffeine) | None |
| Package manager | Yarn 4.x with workspaces | Yarn 4.x + Maven |
| **Testing — Frontend** | | |
| Unit + integration tests | Vitest | JUnit (Java) + Jest (TS) |
| Component tests | React Testing Library | None (Errai views untestable in isolation) |
| E2E / visual regression | Playwright | None |
| HTTP mocking | msw (Mock Service Worker) | None |
| IndexedDB mocking | fake-indexeddb | None |
| Type-level assertions | expect-type / tsd | None |
| **Testing — Backend** | | |
| Test framework | JUnit 5 | JUnit 4 |
| Integration testing | Testcontainers (PostgreSQL, Kafka, ES) | None |
| HTTP mocking | WireMock | None |
| API contract testing | REST Assured | None |
