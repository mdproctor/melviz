# @casehub/component — Shared Component Primitives and Layout Renderer

Covers issue #12. Extracts zero-dependency component primitives from `@casehub/ui` into a new `@casehub/component` package, and adds a CSS Grid layout renderer that turns a `Component` tree into DOM.

**Architectural decisions made during brainstorming:**
- **`FilterSettings`, `DrillDown`, `RefreshSettings` go into `@casehub/component`** — they are zero-dep behavioural primitives (refresh polling, cross-component filtering, drill-down navigation) useful to all consumers, not just data visualization.
- **Split `ComponentTypeRegistry`** — `@casehub/component` defines the base registry with layout/content entries. `@casehub/ui` extends it with data-dep chart/displayer entries. Each package's type guards are self-consistent.
- **`html`, `markdown`, `title` treated as unknown types** — the layout renderer creates empty containers for them, same as charts. No DOMPurify or markdown parser dependency. Content activation is the site runtime's job.
- **`tree` and `menu` treated as unknown types** — their visual rendering (nested expand/collapse, dropdowns, hover states, keyboard navigation) is too complex for the renderer. They stay in `ComponentTypeRegistry` as valid component types but the renderer creates empty activation containers for them. The site runtime instantiates `<casehub-tree>` or `<casehub-menu>` Web Components.
- **Props serialised as `data-component-props` JSON on all DOM elements** — universal, including layout types. Self-describing activation. The DnD editor will need to read layout props from the DOM to populate settings panels.
- **`@casehub/ui` re-exports everything from `@casehub/component`** — zero migration for existing consumers. Import paths that point at `@casehub/ui` continue to work unchanged.
- **Interactive layout types (tabs, pills, accordion, carousel) handled by the renderer** — visibility toggling (`display: none`/`display: block`) is layout behaviour, not data or activation behaviour. Event delegation on layout containers; listeners die when target is cleared on re-render.
- **All navigation components use named slots** — accordion, carousel, tabs, and pills all share the same named-slot contract (dashboard model spec §4 invariant). Slot keys serve as labels (tab names, accordion section headers). Swapping navigation types changes visual treatment without changing slot structure.
- **stack is a plain container, not a grid** — `display: none`/`display: block` toggling only. No `grid-template-areas` — hidden elements don't participate in grid layout, making the grid declaration pointless.
- **`::` as ID separator** — avoids collision with underscored slot names. `_` would make `root_a_b_0` ambiguous between slot `a_b` at index 0 and parent `root_a` with slot `b`.

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
│   ├── page-types.ts                 unchanged (PageProps, Site, ViewState, etc.); dead imports cleaned up
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

**`page-types.ts`** — `PageProps`, `PageSettings`, `DataComponentDefaults`, `LookupDefaults`, `DataSetDefaults`, `ViewState`, `DrillDownStep`, `LayoutOverride`, `DeepLink`, `Site`. All import from `@casehub/data`. Dead imports of `FilterSettings`, `RefreshSettings`, `ColumnId`, and `ColumnType` are cleaned up during extraction.

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
import { getProps as baseGetProps } from "@casehub/component";

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

// Re-export with widened generic constraint via type assertion.
// Single implementation in @casehub/component; the cast widens
// the key constraint to include chart/data types.
export const getProps = baseGetProps as <T extends keyof ComponentTypeRegistry>(
  component: Component,
  type: T,
) => ComponentTypeRegistry[T];

// Chart/data type guards
export function isPage(c: Component): c is Component & { props: PageProps };
export function isBarChart(c: Component): c is Component & { props: BarChartProps };
// ... etc for all data-dep types
```

The type assertion approach preserves the single `getProps` implementation in `@casehub/component` while widening the generic constraint at the `@casehub/ui` level. TypeScript cannot retroactively extend a re-exported function's generic constraint; the cast is the correct mechanism.

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

### DOM Attributes

Every component — layout types and unknown types alike — gets all three attributes on its container element:

- `data-component-type` — the component's `type` string
- `data-component-id` — the component's `id` (deterministic if not provided, see §4.6)
- `data-component-props` — JSON-serialised props

All props interfaces in the model are pure data (`Readonly<Record<string, unknown>>` with no functions, symbols, or circular references). `JSON.stringify` is safe on all of them. This invariant must hold for any future props interface added to the model.

Universal attributes serve two consumers: the site runtime (activation of unknown types) and the DnD editor (reading layout props to populate settings panels).

### Component.style

The renderer applies `Component.style` as inline CSS on the container element via `element.style.setProperty()`. Author-set style properties override renderer-applied layout defaults when they conflict — for example, an author setting `display` on a grid component overrides the renderer's `display: grid`.

Application order: renderer applies layout CSS first, then iterates `Component.style` entries and applies each via `setProperty()`, overwriting any renderer-set values on the same property.

### Layout Type Rendering

The renderer handles these structural component types. All other types are treated as unknown (empty activation containers).

| Type | CSS Strategy | Children Source |
|------|-------------|-----------------|
| `grid` | `display: grid; grid-template-columns: repeat(N, 1fr)` | `items` array — each `GridItem` placed via `grid-column: (x+1) / span w; grid-row: (y+1) / span h` |
| `columns` | `display: grid; grid-template-columns: <distribution>fr` | `slots["col-0"]`, `slots["col-1"]`, ... — one slot per column, named positionally |
| `rows` | `display: flex; flex-direction: column` | `slots.default` |
| `stack` | plain container | `slots.default` — first child `display: block`, rest `display: none`. No grid needed — visibility toggling only. |
| `tabs` | stack + tab bar | See §4.5 Interactive Layout Types |
| `pills` | stack + pill bar | See §4.5 Interactive Layout Types |
| `accordion` | vertical stack with disclosure toggles | See §4.5 Interactive Layout Types |
| `carousel` | stack + prev/next controls | See §4.5 Interactive Layout Types |
| `sidebar` | `display: grid; grid-template-columns: auto 1fr` | `slots.nav` + `slots.main` |
| `panel` | container with title header | `PanelProps.title` as header, `slots.default` for content |
| `app-grid` | `display: grid; grid-template-areas` | Semantic slots: `slots.header`, `slots.nav`, `slots.main`, `slots.footer` |

**Types NOT rendered by the layout renderer** (treated as unknown — empty activation containers):

| Type | Reason |
|------|--------|
| `tree` | Complex interactive rendering — nested expand/collapse, keyboard navigation. Site runtime activates a `<casehub-tree>` Web Component. |
| `menu` | Complex interactive rendering — dropdowns, hover states, keyboard navigation. Site runtime activates a `<casehub-menu>` Web Component. |
| `html` | Content rendering — requires DOMPurify for XSS safety. Site runtime activates. |
| `markdown` | Content rendering — requires a markdown parser. Site runtime activates. |
| `title` | Content rendering — trivial, but for consistency all content types are activation targets. |
| `lazy-page` | Requires async fetch. Site runtime resolves and replaces. |
| `page` | Not a layout type. The renderer creates an activation container but still renders the page's slot children recursively (see §4.7). |
| All chart/data types | Site runtime creates Web Components and wires data. |

### Interactive Layout Types

Tabs, pills, accordion, and carousel require interactivity to determine which child is visible. This is layout behaviour — visibility toggling — not data binding or site-runtime concern. The renderer owns it.

**Tabs / Pills:**
- Renderer creates a tab/pill bar from slot names (the keys of `slots`). Each tab is a `<button>` inside a bar container.
- One child container per slot, all rendered. First child `display: block`; rest `display: none`.
- Event delegation on the tab bar container: click handler reads the slot name from the clicked button's `data-slot` attribute, hides all children, shows the target.
- Tab bar styling differs between tabs (underline/border) and pills (chip/badge) via CSS classes.

**Accordion:**
- Uses named slots, same contract as tabs/pills. The slot key is the section label — consistent with the dashboard model spec's invariant that all navigation components share the same named-slot contract. Swapping `tabs` for `accordion` changes visual treatment without changing the slot structure.
- Each named slot becomes a section: disclosure header (`<button>` with slot key as text) followed by the slot's content container.
- All sections expanded by default (`display: block`).
- Click handler on each header toggles `display: none`/`display: block` on its content container.

**Carousel:**
- Uses named slots (same contract as tabs/pills/accordion). Slot keys are available for indicator dots if ever needed, but prev/next buttons don't require them.
- All children rendered. First child `display: block`; rest `display: none`.
- Renderer creates prev/next `<button>` controls.
- Click handlers cycle through children by index, toggling `display`.

**Listener lifecycle:** Event listeners attach to the structural DOM elements the renderer creates. When `renderComponent()` clears `target` (via `target.innerHTML = ""`), all descendant elements and their listeners are removed. No explicit cleanup needed — the DOM is the lifecycle manager.

### Deterministic ID Generation

When `component.id` is absent, the renderer generates a deterministic ID based on the component's position in the tree. The separator is `::` (not `_`) to avoid ambiguity with underscored slot names — e.g., a slot named `a_b` with `_` as separator would produce the same ID as parent `root_a` with slot `b`.

- **Root component:** `root`
- **Slot children:** `{parentId}::{slotName}::{index}` — e.g., `root::main::0`, `root::nav::1`
- **Grid items:** `{parentId}::{x}::{y}` — e.g., `root::0::0`, `root::8::0`

This ensures:
- IDs are deterministic (same tree → same IDs across re-renders)
- IDs are unique within the tree (no separator collision with slot names)
- DOM queries by the site runtime produce predictable results
- Tests can assert exact attribute values

Explicit `id` values on a `Component` always override generated ones.

### Page Component Handling

Page components (`type: "page"`) are not layout types — the renderer does not apply layout CSS to them. However, the renderer still renders their slot children recursively. A page's datasets, settings, navigation registration, and URL addressability are all site-runtime concerns. The renderer produces an activation container with `data-component-type="page"` and recurses into the page's `slots` to render its content subtree.

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

### Recursive Composition Algorithm

The renderer walks the `Component` tree depth-first:

1. **Access control** — check `component.access` against `PermissionContext`. Skip this component and its entire subtree if denied.
2. **Create container** — `<div>` with `data-component-type`, `data-component-id` (deterministic if absent), `data-component-props` (JSON-serialised).
3. **Apply layout CSS** — if `type` is a known layout type, apply layout-specific CSS properties (display, grid-template-columns, flex-direction, etc.).
4. **Apply `Component.style`** — set inline CSS via `element.style.setProperty()` for each entry. Runs after layout CSS so author-set properties override renderer defaults on the same property.
5. **Render children** — from whichever source exists. If both `items` and `slots` are present (the model says they're mutually exclusive, but defensively), `items` takes precedence.
   - `items` array → render each `GridItem` with CSS Grid placement
   - `slots` → for each named slot, create a slot container and render children recursively
   - Neither → container is a leaf (empty, awaiting activation)
6. **Wire interactivity** — for interactive layout types (tabs, pills, accordion, carousel), attach event delegation listeners.

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

**`@casehub/ui/src/model/type-guards.ts`** imports `getProps` from `@casehub/component`, re-exports it with a widened type assertion (see §3), re-exports all base guards, and adds chart/data guards with the extended `ComponentTypeRegistry`.

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

The full `build:packages` script chain becomes:

```
@melviz/component-api → @melviz/component-echarts-base → @melviz/component-dev → @casehub/component → @casehub/data → @casehub/ui → @casehub/viz
```

`@casehub/component` and `@casehub/data` have no dependency on each other. The script is sequential; `@casehub/component` before `@casehub/data` keeps the casehub packages in dependency order (`@casehub/ui` depends on both, so both must build before it).

### Tests

Vitest with jsdom environment for renderer tests. Type-only tests (model, type guards) run without jsdom.

---

## 7. DSL Fixes Required

The renderer depends on `Component.type` and slot names matching the layout table (§4.4). Two fixes are needed in `@casehub/ui`'s DSL builders:

### 7.1 Slot name normalisation — `content` → `default`

The DSL currently uses `slots.content` for `rows()`, `stack()`, and `panel()`. The renderer expects `slots.default` — the Web Components convention for the unnamed default slot. Rename in the DSL:

| Builder | Current | After |
|---------|---------|-------|
| `rows()` | `{ type: "rows", slots: { content: children } }` | `{ type: "rows", slots: { default: children } }` |
| `stack()` | delegates to `rows()` → `{ type: "rows", slots: { content: ... } }` | see §7.2 |
| `panel()` | `{ type: "panel", slots: { content: children } }` | `{ type: "panel", slots: { default: children } }` |

`columns()` is correct — it uses `slots["col-0"]`, `slots["col-1"]`, etc. (positionally named, no rename needed).

### 7.2 stack() must produce type: "stack"

`stack()` currently aliases `rows()`, returning `{ type: "rows" }`. The renderer treats `rows` and `stack` as distinct layout types with different CSS strategies (`rows` = flex column with all children visible; `stack` = plain container with display toggling). `stack()` must return its own type:

```typescript
export function stack(...children: Component[]): Component {
  return freeze({
    type: "stack",
    slots: { default: children },
  });
}
```

Tabs, pills, accordion, and carousel all build on the stack concept (one-at-a-time visibility). They already produce their own `type` values via `navComponent()` — only the standalone `stack()` builder is broken.

### 7.3 Existing tests

Both fixes are breaking changes to the DSL output shape. Existing tests that assert on `slots.content` or on `stack()` producing `type: "rows"` must be updated. These are mechanical — search for `slots.content` and `type: "rows"` in test assertions.

---

## 8. Cleanup During Extraction

### Dead imports in `page-types.ts`

`page-types.ts` imports `FilterSettings`, `RefreshSettings`, `ColumnId`, and `ColumnType` but uses none of them in any interface. These dead imports are removed during the extraction.

---

## 9. Test Strategy

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

**Component.style:**
- Style properties applied as inline CSS on container
- Author `style` overrides renderer layout CSS on the same property
- Missing style produces no inline CSS

**Interactive layout types:**
- Tabs — clicking a tab shows the target child, hides others
- Tabs — first child visible by default
- Tabs — slot keys used as tab labels
- Accordion — clicking a header toggles its section
- Accordion — all sections expanded by default
- Accordion — slot keys used as section labels (same contract as tabs)
- Accordion — swapping type from `tabs` to `accordion` on same slots changes visual treatment only
- Carousel — prev/next buttons cycle through children
- Carousel — uses named slots (same contract as tabs/accordion)
- Pills — same behaviour as tabs, different CSS class
- Stack — first child visible, rest `display: none`, no grid CSS

**Slot composition:**
- Nested slots render recursively
- Empty slots produce no output
- Multiple named slots render into correct containers

**Access control:**
- Component with matching role renders
- Component with non-matching role is skipped (no DOM output)
- Missing `PermissionContext` defaults to `ALLOW_ALL`
- Access control on parent skips entire subtree

**Deterministic IDs:**
- Root component gets `id="root"`
- Slot child gets `id="{parentId}::{slotName}::{index}"` (e.g., `root::main::0`)
- Grid item gets `id="{parentId}::{x}::{y}"` (e.g., `root::0::0`)
- Explicit `id` overrides generated ID
- Same tree produces same IDs across re-renders
- `::` separator avoids collision with underscored slot names

**Unknown types:**
- Unknown type produces `<div data-component-type="..." data-component-id="..." data-component-props="...">`
- Props are valid JSON in the attribute
- `tree` and `menu` treated as unknown types (activation containers)
- `html`, `markdown`, `title` treated as unknown types
- `page` treated as unknown type but slot children still render recursively

**DSL slot name consistency:**
- `rows()` produces `slots.default` (not `slots.content`)
- `stack()` produces `type: "stack"` with `slots.default` (not `type: "rows"`)
- `panel()` produces `slots.default` (not `slots.content`)
- `columns()` produces `slots["col-0"]`, `slots["col-1"]`, etc.
- Renderer correctly reads children from these slot names

**DOM attributes on layout types:**
- Layout types carry `data-component-type`, `data-component-id`, `data-component-props` (same as unknown types)
- `data-component-props` on a grid contains `{"columns":12}` (verifiable from DOM)
