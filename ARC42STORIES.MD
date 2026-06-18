# melviz — ARC42STORIES.MD

**Spec:** Arc42Stories v0.1
**Profile:** Standalone open-source project
**Build position:** Independent — no upstream dependencies beyond npm packages
**Consumed by:** Any web application embedding interactive dashboards (DraftHouse, Claudony, standalone sites)
**Depends on:** Apache ECharts, js-yaml, marked, JSONata (all npm)

---

## §1 Introduction and Goals

### Description

`melviz` is a pure TypeScript dashboard rendering runtime — a GWT-to-TypeScript migration of the DashBuilder visualization engine. It parses YAML dashboard definitions, resolves datasets (inline, URL, JSONata), and renders interactive visualizations as Web Components.

Core packages: `@casehub/data` (DataSet model, operations engine, external data extraction), `@casehub/ui` (YAML parser, layout model, displayer desugaring), `@casehub/viz` (Web Component chart/table/metric wrappers around ECharts), `@casehub/component` (CSS grid layout renderer, slot management, interactive containers), `@casehub/runtime` (site orchestrator — wires parsing, data, and rendering into `loadSite()`).

### Stakeholders

| Stakeholder | Interest |
|---|---|
| Dashboard authors | Author YAML dashboards rendered without Java/GWT |
| Host applications | Embed dashboards via `loadSite()` API |
| DashBuilder users | Backward-compatible rendering of existing DashBuilder YAML |

### Quality Goals

| Goal | Scenario |
|---|---|
| DashBuilder compatibility | Existing DashBuilder YAML dashboards render correctly without modification |
| Zero-Java runtime | Full rendering pipeline in TypeScript — no GWT compilation, no Java at runtime |
| Interactive filtering | Cross-component filtering, sorting, and pagination work end-to-end |

---

## §2 Constraints

### Platform
TypeScript 4.6, React 17, Webpack 5. Yarn 4.10 workspaces. Node 18+.

The Java/GWT core (`core/` with Maven) still exists for the original webapp but is not required by the TypeScript runtime.

### Build

```bash
yarn install && yarn build        # development
yarn build:prod                   # production (includes GWT + examples gallery)
```

---

## §3 Context and Scope

```
┌─────────────────────────────────────────────────┐
│                  Host Application                │
│  (DraftHouse, Claudony, standalone HTML page)    │
│                                                  │
│   loadSite(yaml) ──► casehub-runtime             │
│                      ├── casehub-ui (parse)       │
│                      ├── casehub-data (resolve)   │
│                      ├── casehub-component (lay.) │
│                      └── casehub-viz (render)     │
│                                                  │
│   ◄── casehub-filter, casehub-sort events ──►    │
└─────────────────────────────────────────────────┘
         │                              │
    YAML files                    Data sources
  (inline/URL)              (REST, Prometheus, CSV)
```

**Boundary:** melviz owns parsing, data resolution, layout, and rendering. Domain logic (what dashboards to show, authentication, data source credentials) belongs to the host application.

---

## §4 Solution Strategy

### Data Flow

```
YAML dashboard definition
    ↓  (js-yaml)
parsePage() / parsePages()          — @casehub/ui
    ↓
ComponentNode tree + DataSetDef[]   — layout model
    ↓
resolveDataSet() / extractDataSet() — @casehub/data
    ↓
DataSet (columns + rows)            — wire format
    ↓
renderNode() / renderComponent()    — @casehub/component
    ↓
<casehub-bar-chart> etc.            — @casehub/viz Web Components
    ↓
casehub-filter / casehub-sort       — DOM custom events back to data layer
```

### Lazy Rendering for One-at-a-Time Containers

Tabs, pills, sidebar, carousel, and stack containers render only the active slot's children. On slot switch, the swap function tears down the old slot's DOM and renders the new slot lazily.

Key decisions:
- **Swap function as single owner** — each wire function (wireTabs, wireSidebar, wireCarousel, wireStack) builds one swap function that owns slot state, DOM lifecycle, button chrome, and event dispatch. Click handlers and `activateSlot` both delegate to it via a `slotSwapRegistry` WeakMap.
- **`slot-swap.ts` shared module** — consolidated `dispatchSlotChange` from interactive.ts and activate-slot.ts, eliminating duplication.
- **Registry eviction via `isConnected`** — `casehub-slot-change` handler scans the registry and removes entries whose element is disconnected from the DOM. O(1) per entry.
- **Accordion stays eager** — all accordion sections start expanded, so lazy rendering would change UX.

### NavTree Page Deduplication

`parsePage` initially included pages both as top-level `content` slot entries AND as slot values inside navigation containers, causing N-fold DOM duplication. Fix: `collectNavTreePageNames` extracts all page names from navTree groups. These are filtered from the root `content` slot. `patchSlotReferences` recursively replaces unresolved page references in nav slots with their resolved versions.

### Cross-Filter Event Protocol

The filter flow (selector → `casehub-filter` → listening component re-query) requires:
1. Event listener ordering — `renderComponent` must run AFTER `addEventListener` (custom elements dispatch `casehub-data-request` synchronously during `connectedCallback`)
2. `@casehub/viz` side-effect import — custom elements must be registered for `connectedCallback` to fire
3. `yamlLoad` call in the YAML string path

---

## §5 Building Block View

| Package | Responsibility |
|---|---|
| `@casehub/data` | DataSet model, filter/group/sort operations, external data extraction (JSON, CSV, Prometheus), JSONata expressions |
| `@casehub/ui` | YAML parser, DashBuilder backward compatibility (displayer desugaring, layout placement, nav desugaring), component model |
| `@casehub/viz` | Web Component wrappers: bar, line, area, pie, donut, bubble, timeseries, meter, map, table, metric, selector |
| `@casehub/component` | CSS grid layout renderer, interactive containers (tabs, pills, sidebar, carousel, stack, accordion), slot management |
| `@casehub/runtime` | Site orchestrator: `loadSite()`, page navigation, dataset resolution pipeline, event wiring |
| `@melviz/examples` | Dashboard gallery: dev server, Playwright tests, DashBuilder sample validation |

---

## §6 Runtime View

### Dashboard Loading

1. Host calls `loadSite(yaml, container, options)`
2. Runtime parses YAML via `@casehub/ui` → `ComponentNode` tree + `DataSetDef[]`
3. Runtime registers event listeners for `casehub-data-request`, `casehub-filter`, `casehub-sort`, `casehub-page`
4. Runtime calls `renderComponent()` → `@casehub/component` renders CSS grid layout
5. Web Components fire `casehub-data-request` during `connectedCallback`
6. Runtime resolves each dataset via `@casehub/data` and posts results back via `casehub-data-response`
7. Web Components render with ECharts / DOM

### Cross-Filtering

1. User interacts with selector component
2. Selector fires `casehub-filter` custom event with `FilterRequest`
3. Runtime intercepts, applies filter to the target dataset's operations
4. Runtime re-resolves the dataset and dispatches `casehub-data-response` to listening components
5. Listening components re-render with filtered data

---

## §7 Deployment View

Webpack bundle. Host applications include `@casehub/runtime` as an npm dependency or load the webapp bundle directly. The examples gallery serves at `localhost:8080` via webpack-dev-server.

---

## §8 Crosscutting Concepts

| Concern | Approach |
|---|---|
| DashBuilder compatibility | `displayer-desugar.ts` maps DashBuilder YAML properties to casehub component model. `backwards-compat.ts` handles legacy field names. |
| Case-insensitive column matching | `column-lookup.ts` provides `findColumnIndex` with case-insensitive fallback for filter/group/sort operations |
| JSON resilience | `extraction.ts` handles trailing commas, single-quoted JSON, and flat primitive arrays from hand-authored YAML content |
| Column expressions | `cell-extract.ts` evaluates per-cell expressions via `new Function("value", expression)` — dashboard author code, same trust model as GWT DashBuilder |

---

## §9 Journeys and Chapters

### Chapter 1: TypeScript DataSet Core (Epic #1)

**Status:** 🟡 in progress

| Issue | Title | Status |
|---|---|---|
| #2 | GroupOp + AggregateFunctionType | ✅ closed |
| #3 | Expression evaluator (JSONata bridge) | 🔲 open |
| #4 | SortOp + DataSetLookup | ✅ closed |
| #5 | Zod schemas + YAML parser | ✅ closed |
| #6 | ExternalDataSetDef + typed extraction | ✅ closed |
| #7 | DataSetManager service layer | ✅ closed |
| #8 | Full dashboard YAML schema | ✅ closed |
| #11 | @casehub/viz Web Components | ✅ closed |
| #12 | @casehub/component CSS grid layout | ✅ closed |
| #13 | Site runtime — loadSite() | ✅ closed |

### Chapter 2: DashBuilder Demo Gallery (Epic #19)

**Status:** ✅ complete — all issues closed

| Issue | Title | Status |
|---|---|---|
| #20 | Dashboard demo runner — host page + dev server | ✅ closed |
| #21 | Wire axis and grid settings | ✅ closed |
| #14 | Markdown parser | ✅ closed |
| #22 | Migrate and validate DashBuilder samples | ✅ closed |
| #25 | Global displayer defaults | ✅ closed |
| #26 | Inline content extraction | ✅ closed |
| #27 | Navigation types: tree, menu, tiles | ✅ closed |
| #28 | fetch this-binding in webpack | ✅ closed |
| #30 | Canonical kie-samples versions | ✅ closed |
| #31 | Case-insensitive column matching | ✅ closed |
| #32 | Tab navigation duplicates | ✅ closed |
| #33 | Mock data for Prometheus dashboards | ✅ closed |

### Backlog

| Issue | Title | Status |
|---|---|---|
| #15 | View state persistence | 🔲 open |
| #16 | Dataset refresh timers | 🔲 open |
| #17 | Minor runtime improvements | 🔲 open |
| #18 | Event handler integration tests | 🔲 open |
| #23 | Domain-specific example dashboards | 🔲 open |
| #24 | Epic: Move to casehubio org | 🔲 open |
| #29 | Gallery URL configuration form | 🔲 open |
| #34 | Type-safe TypeScript audit | 🔲 open |
| #35 | Prometheus API response extraction | ✅ closed |

---

## §10 Architectural Decisions

Decisions not captured inline in §4:

| Decision | Rationale |
|---|---|
| Web Components over React for viz | Components must work inside any host framework (React, vanilla, GWT iframe). Web Components are framework-agnostic. |
| Custom events over callback API | `casehub-filter`, `casehub-sort` etc. decouple components from the runtime. Any host can intercept and handle events. |
| DashBuilder YAML as primary format | Backward compatibility with existing dashboards. Parser handles both DashBuilder legacy and clean casehub format. |

---

## §11 Quality Requirements

| Requirement | Metric |
|---|---|
| DashBuilder compatibility | 28/31 sample dashboards render correctly (validation matrix: `examples/VALIDATION.md`) |
| Test coverage | 602 tests (@casehub/data), 148 tests (@casehub/component), 100 tests (@casehub/runtime) |
| No Java at runtime | `loadSite()` works without GWT compilation or Java process |

---

## §12 Risks and Technical Debt

| Risk | Impact | Mitigation |
|---|---|---|
| `new Function()` requires CSP `unsafe-eval` | Blocks deployment in strict CSP environments | Column expressions could be moved to a sandboxed evaluator (#3 JSONata bridge) |
| Kitchensink map component rendering | `regions` property undefined — map tab empty | Map page is an orphan (commented out of navTree) |
| GWT core still in repo | Build complexity, dual maintenance | #24 tracks org move and cleanup |

---

## §13 Glossary

| Term | Definition |
|---|---|
| `DataSet` | Column-oriented tabular data — the wire format between data resolution and visualization |
| `DataSetLookup` | A query against a named dataset: filter → group → sort pipeline |
| `ComponentNode` | A node in the parsed layout tree — carries type, props, slots (children), and optional dataset reference |
| `DisplayerSettings` | DashBuilder's configuration object for a chart/table — desugared into ComponentNode props by `displayer-desugar.ts` |
| `loadSite()` | Entry point: accepts YAML string or parsed config, renders into a DOM container, returns a dispose handle |
| `NavTree` | Navigation structure: groups of named pages rendered as tabs, tree, menu, or tiles |

---

*Created 2026-06-17. Journal entries from issue-19-dashbuilder-demos merged into §4.*
