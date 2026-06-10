# Melviz GWT-to-TypeScript Migration Design

**Date:** 2026-06-09
**Status:** Draft -- Rev 2
**Scope:** Complete rewrite of the GWT/Java client-side core to TypeScript/React, plus a new optional Quarkus backend with pluggable data providers.

---

## Spec Index

| Doc | Title | Scope |
|-----|-------|-------|
| [00-overview.md](00-overview.md) | Overview and Index | Goals, benefits, architecture summary, technology stack |
| [01-core-engine.md](01-core-engine.md) | Core Engine | DataSet model, operations, typed values, YAML parsing, expression evaluation |
| [02-type-safety.md](02-type-safety.md) | Type Safety Strategy | Compiler config, ESLint rules, branded types, discriminated unions |
| [03-schema-system.md](03-schema-system.md) | Schema System | Zod schemas, JSON Schema generation, editor support |
| [04-displayer-plugin-system.md](04-displayer-plugin-system.md) | Displayer Framework and Plugin System | Unified component model, capabilities, three-tier plugin loading |
| [05-application-shell.md](05-application-shell.md) | Application Shell | React Router, MelvizProvider, FilterStateManager, layout editor |
| [06-data-service-backend.md](06-data-service-backend.md) | Data Service and Backend | DataService interface, Local/Remote/Hybrid implementations, Quarkus backend, data providers |
| [07-testing-migration.md](07-testing-migration.md) | Testing Strategy and Migration Plan | Six test layers, TDD workflow, CI pipeline, phased migration plan |

---

## 1. Goals and Non-Goals

### Goals

- **Eliminate Java/GWT/Maven from the client.** The entire `core/` directory (579 Java files, ~60K LOC including tests; 506 non-test source files, ~50K LOC) is replaced by TypeScript. No GWT compilation, no Errai CDI, no JsInterop wrappers.
- **Preserve all end-user capabilities.** Both CLIENT mode (readonly rendering) and EDITOR mode (drag-and-drop dashboard authoring) are ported. Every YAML dashboard that works today works after migration.
- **Modernise the toolchain.** Vite, React 18+, Tailwind CSS, Vitest, TypeScript 5.x strict mode.
- **Dramatically improve type safety.** Branded types for IDs, discriminated unions for displayer settings, column-type-aware filters, Zod schemas for runtime validation, JSON Schema for editor tooling.
- **Design for an optional backend.** A local-first `LocalDataService` (IndexedDB, in-memory ops) is the default. A Quarkus backend adds server-side SQL, Prometheus, Kafka, Elasticsearch data providers, caching, and dashboard persistence -- but the app works fully without it.
- **Enable a plugin ecosystem.** Three-tier plugin loading: direct imports (monorepo), Module Federation 2.0 (third-party), iframe+postMessage (legacy/fallback). Pluggable data providers with the same extensibility.
- **Carry forward Dashbuilder's server-side capabilities.** SQL push-down (filter/group/sort to the database), server-side caching, data proxy (CORS bypass, auth injection), Prometheus/Kafka/Elasticsearch providers.
- **Shrink the codebase.** Target 8-12K LOC of TypeScript replacing ~50K LOC of Java. The reduction comes from killing marshalling boilerplate, Errai annotations, GWT interop wrappers, and replacing the verbose melviz-dataset module with pure functions -- though the full operation engine (interval builders, complete filter model, DataSetLookup pipeline) means the TypeScript side is not trivially small.

### Non-Goals

- KIE Server integration (removed -- too domain-specific)
- Authentication/RBAC (can be added later via Quarkus security extensions)
- Multi-tenancy
- Server-side rendering (SSR) -- the app is a client-rendered SPA
- 1:1 port of GWT/Errai framework internals -- we port capabilities, not code

---

## 2. Benefits: Old System vs New

### Build and Development

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Build time | GWT compilation: 60-90s, full Maven build: 3-5min | Vite dev server: <1s start, HMR: instant |
| Dev feedback loop | Change Java -> rebuild GWT -> refresh browser | Change TS -> HMR updates in-place |
| Build tooling | Maven + Webpack + Yarn (three ecosystems) | Vite + Yarn (one ecosystem) |
| Language | Java 17 compiled to JS via GWT | TypeScript compiled to JS natively |
| Debugging | GWT source maps (brittle, often misaligned) | Native browser debugging, accurate source maps |
| Test runner | JUnit (Java) + Jest (TS) -- two test ecosystems | Vitest only -- one test ecosystem |
| Bundle size | GWT output is monolithic and large | Vite tree-shakes, code-splits, lazy-loads |

### Type Safety

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Data values | `String[][]` everywhere -- parse on every read | Parsed once at boundary, typed throughout (`CellValue` discriminated union) |
| IDs | All `String` -- column ID, component ID, dataset ID interchangeable | Branded types -- `ColumnId`, `ComponentId`, `DataSetId` are compile-time incompatible |
| Displayer config | `Map<String, String>` property bag -- any property on any chart type | Discriminated union per chart type -- `xAxis` on a table is a compile error |
| Filter safety | Any filter function on any column type -- runtime errors | Column-type-specific filter unions -- `BETWEEN` on TEXT is a compile error |
| Widget capabilities | Runtime `DisplayerConstraints.check()` -- fails at render time | `ComponentCapabilities` interface -- editor shows only valid options |
| YAML validation | Hand-written marshallers -- silent failures on malformed input | Zod schemas -- structured error messages, type inference, JSON Schema generation |
| Marshalling | 1K+ LOC hand-written JSON marshallers (`@Portable`, `@MapsTo`) | Zod `z.parse()` -- ~100 lines of schema replaces all marshalling |

### Architecture

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| DI framework | Errai CDI -- runtime bean discovery, 356 injection points across 145 files | React context + typed hooks -- explicit, statically analysable |
| Event system | CDI `@Observes` events -- implicit ordering, hard to debug | `FilterStateManager` -- inspectable state, explicit subscriptions |
| Component model | Two models: internal displayer hierarchy + external component protocol | One unified model: every component (builtin or plugin) implements `MelvizComponentProps` |
| View layer | Errai `@Templated` HTML fragments (43 views, 30 HTML files) | React components -- single rendering model |
| Routing | Hand-rolled `PlaceManager` -- no URL history, no deep linking | React Router -- deep linking, back/forward, lazy loading |
| JS library access | `ScriptInjector` + JsInterop wrappers for js-yaml, JSONata, ECharts | Direct `import` -- native ES modules |
| Expression eval | `Global.eval(expr)` with keyword blocklist -- security concern | JSONata library call -- sandboxed by design, no `eval()` |

### Plugin Ecosystem

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Plugin loading | iframe + postMessage only | Three tiers: direct import, Module Federation 2.0, iframe fallback |
| Plugin author DX | Implement postMessage protocol manually, no type checking | Import `@melviz/core` types, full compile-time checking, Zod schema auto-generates editor UI |
| Plugin isolation | iframe provides isolation but at high cost | React error boundaries for direct/MF plugins, iframes for legacy |
| Plugin capabilities | Not declared -- runtime errors if data shape is wrong | `ComponentCapabilities` declared at registration -- editor enforces valid configuration |
| Data provider extensibility | Fixed set compiled into GWT | Pluggable `DataProvider` registry -- add new source types at runtime |

### Data Handling

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| DataSetOpEngine | ~14.2K LOC melviz-dataset module (131 files), mutable state | Pure TypeScript functions, immutable DataSets, optionally server-side push-down |
| Dataset caching | None -- every draw/redraw refetches | IndexedDB + in-memory cache with TTL, stale-while-offline |
| Request deduplication | None -- two charts on same URL = two HTTP requests | Coalesced concurrent requests for same DataSetRef |
| Offline support | None | IndexedDB cache serves stale data when network unavailable |
| Error model | String messages through CDI events | Structured `DataSetError` with error codes, `recoverable` flag, retry support |
| CSV parsing | Custom Java class | Papa Parse (battle-tested, streaming, 7KB) |
| Backend push-down | Not available (pure client) | SQL filter/group/sort pushed to database when backend present |
| Data sources | URL (JSON/CSV) only | URL, inline, CSV file, SQL, Prometheus, Kafka, Elasticsearch -- all pluggable |

### Editor

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| Drag-and-drop | uberfire-layout-editor-client (~3K LOC custom DnD) | @dnd-kit/core (~8KB, maintained, accessible) |
| Settings panels | Hand-wired per displayer type | Auto-generated from component's Zod `settingsSchema` |
| Column assignment | Manual, no validation against component requirements | Driven by `ComponentCapabilities.columnRequirements` -- only valid columns shown |
| Third-party plugins in editor | Not supported | Full editor integration via capabilities + settings schema |

### Schema and Tooling

| Dimension | GWT/Java (Old) | TypeScript (New) |
|-----------|----------------|------------------|
| YAML validation | Runtime only -- silent failures | Zod runtime validation + JSON Schema editor support |
| Editor autocomplete | None | JSON Schema gives autocomplete, hover docs, red squiggles in VS Code/IntelliJ |
| Schema source of truth | Hand-written marshallers (drift-prone) | Zod schemas generate both TS types and JSON Schema -- single source |
| Dashboard format documentation | Implicit in Java code | Schema IS the documentation -- `.describe()` calls flow to JSON Schema `description` fields |

### Codebase Size

| Module | Java (LOC) | TypeScript (estimated LOC) | Reduction |
|--------|-----------|---------------------------|-----------|
| `melviz-base` (DataSet, JSON, dataset module) | 16,000+ | ~3,000 | 81% |
| `melviz-shared` (APIs, marshalling) | 8,000 | ~1,000 | 87% |
| `melviz-client` (displayers, renderers, views) | 19,000 | ~3,000 | 84% |
| `melviz-webapp-parent` (app shell) | 6,000 | ~1,500 | 75% |
| **Total (non-test source)** | **~50,000** | **~8,500-12,000** | **76-83%** |
| **Total (including tests)** | **~60,000** | -- | -- |

The `melviz-base` figure includes the full melviz-dataset module (131 files, ~14.2K LOC) which houses `DataSetOpEngine`, interval builders, filter implementations, group operations, sort logic, and the `DataSetLookup` pipeline. The TypeScript estimate is 8-12K LOC rather than a lower figure because a faithful port of the operation engine -- including date interval builders, the complete filter model with all function types, and the `DataSetLookup` request/response pipeline -- is non-trivial even with modern language features.

The reduction comes from:

- Killing ~1K LOC of hand-written JSON marshallers (replaced by ~100 lines of Zod schema)
- Killing Errai boilerplate -- `@Inject`, `@Portable`, `@MapsTo`, `@Templated`, `@Observes` across 356 injection points
- Killing GWT interop -- `ScriptInjector`, `JsInterop` wrappers, `NativeLibraryResources`, `ClientBundle`
- Replacing the melviz-dataset module's mutable engine with pure functions + JSONata
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
│   │   │   ├── lookup/                # DataSetLookup request/response pipeline
│   │   │   ├── interval/              # Date interval builders (fixed, dynamic)
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
    └── generate-schemas.ts            # Zod -> JSON Schema build step
```

### Data Flow

```
setup.js / postMessage YAML / Dashboard URL
        |
        v
  YAML Parser (js-yaml + Zod validation)
        |
        v
  RuntimeModel (typed, validated)
        |
        |---> DataSetManager
        |       |
        |       |---> DataProviderRegistry.resolve(ref)
        |       |       |
        |       |       |-- UrlProvider (browser fetch)
        |       |       |-- InlineProvider (embedded data)
        |       |       |-- CsvFileProvider (Papa Parse)
        |       |       +-- RemoteProvider (delegates to Quarkus backend)
        |       |               |
        |       |               |-- SqlDataProvider (JNDI + SQL push-down)
        |       |               |-- PrometheusDataProvider (PromQL)
        |       |               |-- KafkaDataProvider (topic consumer)
        |       |               +-- ElasticsearchDataProvider (query DSL)
        |       |
        |       |---> DataSetCache (IndexedDB + in-memory / server Caffeine)
        |       |
        |       +---> DataSetOps (filter/group/sort -- local JS or server push-down)
        |               |
        |               +---> DataSetLookup (request pipeline: intervals, groups, filters)
        |
        |---> PluginRegistry
        |       |
        |       |-- Direct imports (monorepo components)
        |       |-- Module Federation 2.0 (third-party plugins)
        |       +-- iframe + postMessage (legacy fallback)
        |
        +---> DashboardRenderer
                |
                |-- LayoutRow -> LayoutColumn -> ComponentSlot
                |                                    |
                |                                    v
                |                              PluginHost
                |                                    |
                |                              PluginErrorBoundary
                |                                    |
                |                              Component.render()
                |
                +-- FilterStateManager <---- component.onFilter()
                        |
                        +---> re-render affected components
```

---

## 4. Technology Stack

| Layer | Technology | Replaces |
|-------|-----------|----------|
| Language | TypeScript 5.x (strict mode) | Java 17 |
| UI framework | React 18+ | GWT + Errai CDI |
| Bundler | Vite | Maven + Webpack 5 |
| Styling | Tailwind CSS | PatternFly (webjars) |
| Accessible components | Radix UI (headless) | None |
| Routing | React Router | Hand-rolled PlaceManager |
| DI | React Context + hooks | Errai CDI |
| Drag-and-drop | @dnd-kit/core | uberfire-layout-editor-client |
| YAML parsing | js-yaml (direct import) | js-yaml (ScriptInjector + JsInterop) |
| JSON transforms | JSONata (direct import) | JSONata (ScriptInjector + JsInterop + eval()) |
| CSV parsing | Papa Parse | Custom Java class |
| Runtime validation | Zod | Hand-written marshallers |
| Schema tooling | zod-to-json-schema -> JSON Schema | None |
| Plugin loading | Module Federation 2.0 (@module-federation/vite) | iframe + postMessage only |
| Local persistence | IndexedDB | None |
| Backend (optional) | Quarkus | None (was in Dashbuilder, removed in Melviz) |
| Backend DB | PostgreSQL + Flyway | None |
| Backend cache | Quarkus Cache (Caffeine) | None |
| Package manager | Yarn 4.x with workspaces | Yarn 4.x + Maven |
| **Testing -- Frontend** | | |
| Unit + integration tests | Vitest | JUnit (Java) + Jest (TS) |
| Component tests | React Testing Library | None (Errai views untestable in isolation) |
| E2E / visual regression | Playwright | None |
| HTTP mocking | msw (Mock Service Worker) | None |
| IndexedDB mocking | fake-indexeddb | None |
| Type-level assertions | expect-type | None |
| **Testing -- Backend** | | |
| Test framework | JUnit 5 | JUnit 4 |
| Integration testing | Testcontainers (PostgreSQL, Kafka, ES) | None |
| HTTP mocking | WireMock | None |
| API contract testing | REST Assured | None |
