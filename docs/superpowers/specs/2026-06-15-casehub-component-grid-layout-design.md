# @casehub/component — Shared Component Primitives and Layout Renderer

Covers issue #12. Extracts zero-dependency component primitives from `@casehub/ui` into a new `@casehub/component` package, and adds a CSS Grid layout renderer that turns a `Component` tree into DOM.

**Architectural decisions made during brainstorming:**
- **`FilterSettings`, `DrillDown`, `RefreshSettings` go into `@casehub/component`** — they are zero-dep behavioural primitives (refresh polling, cross-component filtering, drill-down navigation) useful to all consumers, not just data visualization.
- **Split `ComponentTypeRegistry`** — `@casehub/component` defines the base registry with layout/content entries. `@casehub/ui` extends it with data-dep chart/displayer entries. Each package's type guards are self-consistent.
- **`html`, `markdown`, `title` treated as unknown types** — the layout renderer creates empty containers for them, same as charts. No DOMPurify or markdown parser dependency. Content activation is the site runtime's job.
- **Props serialised as `data-component-props` JSON on DOM elements** — self-describing activation. Activators don't need a reference to the original `Component` tree.
- **`@casehub/ui` re-exports everything from `@casehub/component`** — zero migration for existing consumers. Import paths that point at `@casehub/ui` continue to work unchanged.

---

## 1. Package Architecture

```
@casehub/component                    (zero-dep)
├── model/
│   ├── types.ts                      Component, GridItem, GridPlacement, AccessControl, PermissionContext, ALLOW_ALL
│   ├── component-props.ts            GridProps, ColumnsProps, RowsProps, StackProps, TabsProps, PillsProps,
│   │                                 SidebarProps, TreeProps, MenuProps, AccordionProps, CarouselProps,
│   │                                 AppGridProps, PanelProps, HtmlProps, MarkdownProps, TitleProps,
│   │                                 LazyPageProps, FilterSettings, DrillDown, RefreshSettings
│   ├── type-guards.ts                isGrid, isColumns, ..., getProps(), ComponentTypeRegistry (layout entries)
│   └── index.ts
├── renderer/
│   ├── render.ts                     renderComponent(target, component, options?) → DOM
│   ├── grid.ts                       GridItem placement → CSS Grid properties
│   ├── slots.ts                      recursive slot composition
│   └── index.ts
└── index.ts

@casehub/ui                           (depends on @casehub/component + @casehub/data + zod)
├── model/
│   ├── types.ts                      re-exports from @casehub/component
│   ├── component-props.ts            re-exports from @casehub/component
│   ├── displayer-types.ts            unchanged (DataComponentCommon, ChartSettings, *Props)
│   ├── page-types.ts                 unchanged (PageProps, Site, ViewState, etc.)
│   ├── type-guards.ts                extends ComponentTypeRegistry, adds chart/data guards
│   └── index.ts                      re-exports everything (component + data types)
├── dsl/                              unchanged
├── parser/                           unchanged
└── index.ts
```

### Dependencies

```
@casehub/component                → (nothing — zero runtime dependencies)
@casehub/ui                       → @casehub/component, @casehub/data, zod
@casehub/viz                      → @casehub/ui (→ @casehub/component), @casehub/data, echarts
```

### Yarn workspace

`packages/casehub-component/` alongside `packages/casehub-ui/` and `packages/core/`. Root `package.json` already has `"packages/*"` — auto-discovered, no change needed.

---

## 2. Type Extraction

### What moves to `@casehub/component`

**From `types.ts` (entire file):**
- `Component` — the recursive composable node
- `GridItem` — positioned child within a grid
- `GridPlacement` — `{x, y, w, h}` coordinate placement
- `AccessControl` — role/permission gating
- `PermissionContext` — runtime permission checker
- `ALLOW_ALL` — permissive `PermissionContext` constant

**From `component-props.ts` (entire file):**
- Layout props: `GridProps`, `ColumnsProps`, `RowsProps`, `StackProps`
- Navigation props: `TabsProps`, `PillsProps`, `SidebarProps`, `TreeProps`, `MenuProps`, `AccordionProps`, `CarouselProps`
- Container props: `AppGridProps`, `PanelProps`
- Content props: `HtmlProps`, `MarkdownProps`, `TitleProps`, `LazyPageProps`
- Behavioural props: `FilterSettings`, `DrillDown`, `RefreshSettings`

### What stays in `@casehub/ui`

**`displayer-types.ts`** — `DataComponentCommon`, `ChartSettings`, `BarChartProps`, `LineChartProps`, `AreaChartProps`, `PieChartProps`, `ScatterChartProps`, `BubbleChartProps`, `TimeseriesProps`, `TableProps`, `MetricProps`, `MeterProps`, `SelectorProps`, `MapProps`, `IframePluginProps`. All import from `@casehub/data`.

**`page-types.ts`** — `PageProps`, `PageSettings`, `DataComponentDefaults`, `LookupDefaults`, `DataSetDefaults`, `ViewState`, `DrillDownStep`, `LayoutOverride`, `DeepLink`, `Site`. All import from `@casehub/data`.

**DSL builders** — import from both `@casehub/component` (via `@casehub/ui` re-exports) and `@casehub/data`.

**YAML parser** — same dependency pattern as DSL.

---

## 3. Type Guard Split

### `@casehub/component` type guards

```typescript
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
  "lazy-page": LazyPageProps;
}

export function getProps<T extends keyof ComponentTypeRegistry>(
  component: Component,
  type: T,
): ComponentTypeRegistry[T];

// One guard per layout/content type
export function isGrid(c: Component): c is Component & { props: GridProps };
export function isColumns(c: Component): c is Component & { props: ColumnsProps };
// ... etc for all layout/content types
```

### `@casehub/ui` extended type guards

```typescript
import type { ComponentTypeRegistry as BaseRegistry } from "@casehub/component";

export interface ComponentTypeRegistry extends BaseRegistry {
  page: PageProps;
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

// Re-exports base getProps with extended registry
export function getProps<T extends keyof ComponentTypeRegistry>(
  component: Component,
  type: T,
): ComponentTypeRegistry[T];

// Chart/data type guards
export function isPage(c: Component): c is Component & { props: PageProps };
export function isBarChart(c: Component): c is Component & { props: BarChartProps };
// ... etc for all data-dep types
```

---

## 4. Layout Renderer

### API

```typescript
interface RenderOptions {
  readonly permissions?: PermissionContext;
  readonly document?: Document;
}

function renderComponent(
  target: HTMLElement,
  component: Component,
  options?: RenderOptions,
): void;
```

`renderComponent` clears `target` and builds the DOM tree inside it. Access-controlled components are skipped when the `PermissionContext` doesn't satisfy their `AccessControl`.

`options.document` defaults to `globalThis.document`. Pass a jsdom `Document` for testing.

### Layout Type Rendering

| Type | CSS Strategy | Children Source |
|------|-------------|-----------------|
| `grid` | `display: grid; grid-template-columns: repeat(N, 1fr)` | `items` array — each `GridItem` placed via `grid-column: (x+1) / span w; grid-row: (y+1) / span h` |
| `columns` | `display: grid; grid-template-columns: <distribution>fr` | `slots.default` — one child per column |
| `rows` | `display: flex; flex-direction: column` | `slots.default` |
| `stack` | `display: grid; grid-template-areas: "main"` | `slots.default` — all layered, first visible |
| `tabs` / `pills` | stack + tab/pill bar | `slots.default` — tab bar from child names/titles, first active |
| `sidebar` | `display: grid; grid-template-columns: auto 1fr` | `slots.nav` + `slots.main` |
| `panel` | container with title header | `PanelProps.title` as header, `slots.default` for content |
| `accordion` | vertical stack with disclosure toggles | `slots.default` — each child collapsible, all expanded by default |
| `carousel` | stack + prev/next controls | `slots.default` — first child visible |
| `app-grid` | `display: grid; grid-template-areas` | Semantic slots: `slots.header`, `slots.nav`, `slots.main`, `slots.footer` |

### Unknown Type Rendering

Any `type` not in the layout table above gets an empty container:

```html
<div data-component-type="bar-chart"
     data-component-id="chart-1"
     data-component-props='{"subtype":"column","lookup":{...}}'>
</div>
```

The site runtime finds these containers and activates them — creating Web Components, rendering content, wiring data.

### Grid Placement Mapping

`GridItem.placement` maps to CSS Grid coordinates:

```
placement: { x: 0, y: 0, w: 6, h: 2 }
→ grid-column: 1 / span 6
  grid-row: 1 / span 2
```

CSS Grid is 1-based; `GridPlacement` is 0-based. The renderer adds 1 to both `x` and `y`.

### Access Control

Before rendering any component, the renderer checks `component.access` against the `PermissionContext` from `RenderOptions`:
- If `access` is undefined → render (no restriction)
- If `access.roles` is set → check `permissions.hasRole()` for at least one
- If `access.permissions` is set → check `permissions.hasPermission()` for at least one
- If neither matches → skip the component (don't render it or its children)

When no `PermissionContext` is provided in options, `ALLOW_ALL` is used (everything renders).

### Recursive Composition

The renderer walks the `Component` tree depth-first:

1. Check access control → skip if denied
2. Create container `<div>` with `data-component-*` attributes
3. If `type` is a known layout type → apply CSS layout properties
4. If `items` array exists → render each `GridItem` with placement
5. If `slots` exist → for each slot, render children recursively into a slot container
6. If neither items nor slots → container stays empty (leaf component)

---

## 5. Re-export Strategy

`@casehub/ui` re-exports everything from `@casehub/component` so existing import paths continue to work.

**`@casehub/ui/src/model/types.ts`** becomes:
```typescript
export {
  Component, GridItem, GridPlacement,
  AccessControl, PermissionContext, ALLOW_ALL,
} from "@casehub/component";
```

**`@casehub/ui/src/model/component-props.ts`** becomes:
```typescript
export {
  GridProps, ColumnsProps, RowsProps, StackProps,
  TabsProps, PillsProps, SidebarProps, TreeProps,
  MenuProps, AccordionProps, CarouselProps, AppGridProps,
  PanelProps, HtmlProps, MarkdownProps, TitleProps,
  LazyPageProps, FilterSettings, DrillDown, RefreshSettings,
} from "@casehub/component";
```

**`@casehub/ui/src/model/type-guards.ts`** re-exports base guards from `@casehub/component`, adds chart/data guards, and exports the extended `ComponentTypeRegistry`.

**`@casehub/ui/package.json`** adds `"@casehub/component": "workspace:*"` to dependencies.

No existing consumer code changes. `@casehub/viz`, DSL, parser all continue to import from `@casehub/ui`.

---

## 6. Build Integration

### Package setup

**Location:** `packages/casehub-component/`

**`package.json`:**
```json
{
  "name": "@casehub/component",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rimraf dist"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "rimraf": "^6.1.0"
  }
}
```

Zero runtime dependencies.

**`tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "esModuleInterop": false,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

`"DOM"` in `lib` because the renderer uses `HTMLElement`, `document.createElement`, CSS properties.

### Build order

`@casehub/component` must build before `@casehub/ui`. The `yarn build:packages` script needs updating to include it in the correct position:

```
@casehub/component → @casehub/ui → @casehub/viz
```

### Tests

Vitest with jsdom environment for renderer tests. Type-only tests (model, type guards) run without jsdom.

---

## 7. Test Strategy

### Model tests (moved from `@casehub/ui`)

Existing tests for `types.ts` and `component-props.ts` move to `@casehub/component`. These verify type guard correctness, `getProps()` behaviour, and `ALLOW_ALL` semantics.

### Renderer tests (new)

**Grid placement:**
- `GridItem` at `{x:0, y:0, w:6, h:2}` → `grid-column: 1 / span 6; grid-row: 1 / span 2`
- Multiple items in a grid don't overlap when placements are valid
- `GridProps.columns` sets `grid-template-columns: repeat(N, 1fr)`

**Layout types:**
- `columns` with `distribution: [2, 1]` → `grid-template-columns: 2fr 1fr`
- `rows` → `flex-direction: column`
- `sidebar` → two-column grid from `slots.nav` and `slots.main`
- `panel` → title header + content area
- `app-grid` → semantic slot zones

**Slot composition:**
- Nested slots render recursively
- Empty slots produce no output
- Multiple named slots render into correct containers

**Access control:**
- Component with matching role renders
- Component with non-matching role is skipped (no DOM output)
- Missing `PermissionContext` defaults to `ALLOW_ALL`
- Access control on parent skips entire subtree

**Unknown types:**
- Unknown type produces `<div data-component-type="..." data-component-id="..." data-component-props="...">`
- Props are valid JSON in the attribute
- Component ID is auto-generated when not provided
