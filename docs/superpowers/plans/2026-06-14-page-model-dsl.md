# Page Model & DSL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `@casehub/ui` page model types, TypeScript DSL builders, and YAML parser with backwards compatibility for all existing dashboards.

**Architecture:** Model-first — TypeScript interfaces define the component model (`Component`, `GridItem`, typed props). DSL builder functions construct model objects with validation. YAML parser uses Zod schemas constrained to match model types, with desugaring transforms for backwards compatibility. The model lives in `packages/casehub-ui/`, a new Yarn workspace alongside the existing `packages/core/` (which becomes `@casehub/data`).

**Tech Stack:** TypeScript 5.6+, Zod 3.23+, Vitest 3.0+, Yarn workspaces

**Spec:** `docs/superpowers/specs/2026-06-14-dashboard-model-design.md`

---

## File Structure

```
packages/casehub-ui/
├── package.json
├── tsconfig.json
├── src/
│   ├── model/
│   │   ├── types.ts              # Component, GridItem, GridPlacement, AccessControl,
│   │   │                         #   PermissionContext, ALLOW_ALL (ZERO deps)
│   │   ├── component-props.ts    # GridProps, ColumnsProps, TabsProps, PanelProps,
│   │   │                         #   HtmlProps, MarkdownProps, TitleProps, LazyPageProps,
│   │   │                         #   FilterSettings, DrillDown, RefreshSettings (ZERO deps)
│   │   ├── page-types.ts         # PageProps, PageSettings, ViewState, Site,
│   │   │                         #   DataComponentDefaults, LookupDefaults, DataSetDefaults,
│   │   │                         #   DeepLink (depends on @casehub/data)
│   │   ├── displayer-types.ts    # DataComponentCommon, ChartSettings, BarChartProps,
│   │   │                         #   LineChartProps, TableProps, MetricProps, etc.,
│   │   │                         #   IframePluginProps (depends on @casehub/data)
│   │   ├── type-guards.ts        # ComponentTypeRegistry, getProps(), isBarChart(), etc.
│   │   └── index.ts              # re-exports
│   │
│   ├── dsl/
│   │   ├── builders.ts           # page(), grid(), at(), columns(), tabs(), panel(),
│   │   │                         #   barChart(), html(), withId(), withAccess(), withStyle()
│   │   ├── lookup-helpers.ts     # lookup(), groupBy(), filterBy(), and(), or(), not(),
│   │   │                         #   sortBy(), col(), sum(), avg(), count(), etc.
│   │   └── index.ts              # re-exports
│   │
│   ├── parser/
│   │   ├── page-parser.ts        # parsePage() entry point
│   │   ├── page-schema.ts        # Zod schemas for YAML validation
│   │   ├── component-desugar.ts  # YAML shorthand → Component transforms
│   │   ├── displayer-desugar.ts  # flat settings map → typed props
│   │   ├── nav-desugar.ts        # navGroupId + targetDivId → slot composition
│   │   ├── property-substitution.ts  # ${name} replacement
│   │   └── index.ts              # re-exports
│   │
│   └── index.ts                  # public API re-exports
```

**Pre-requisite:** Task 1 renames `ColumnSettings` fields in `@casehub/data` (breaking change). All subsequent tasks depend on this.

---

### Task 0: Scaffold `casehub-ui` package

**Files:**
- Create: `packages/casehub-ui/package.json`
- Create: `packages/casehub-ui/tsconfig.json`
- Create: `packages/casehub-ui/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@casehub/ui",
  "version": "0.0.1",
  "description": "CaseHub UI — component model, layout primitives, DSL, YAML parser",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rimraf dist"
  },
  "dependencies": {
    "@casehub/data": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "rimraf": "^6.1.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  },
  "license": "Apache-2.0"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
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

- [ ] **Step 3: Create stub index.ts**

```typescript
// @casehub/ui — component model, layout primitives, DSL, YAML parser
// Populated as modules are implemented.
```

- [ ] **Step 4: Register workspace in root package.json**

Add `"packages/casehub-ui"` to the `workspaces` array in the root `package.json`.

- [ ] **Step 5: Rename @melviz/core to @casehub/data**

Change `"name"` in `packages/core/package.json` from `"@melviz/core"` to `"@casehub/data"`.

- [ ] **Step 6: Install dependencies**

Run: `yarn install`
Expected: Clean install with the new workspace resolved.

- [ ] **Step 7: Verify build**

Run: `yarn workspace @casehub/ui run build`
Expected: Compiles with no errors (empty index.ts).

- [ ] **Step 8: Commit**

```
feat: scaffold @casehub/ui package, rename @melviz/core to @casehub/data  Refs #8
```

---

### Task 1: ColumnSettings breaking rename in @casehub/data

**Files:**
- Modify: `packages/core/src/dataset/types.ts`
- Modify: all files that reference `ColumnSettings` fields

This is a prerequisite — the data layer's `ColumnSettings` field names must match the spec before the UI layer imports them.

- [ ] **Step 1: Write test verifying new field names**

Create `packages/core/src/dataset/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ColumnSettings, ColumnId } from "./types.js";

describe("ColumnSettings", () => {
  it("has renamed fields", () => {
    const settings: ColumnSettings = {
      id: "revenue" as ColumnId,
      name: "Revenue",
      expression: "value * 100",
      pattern: "#,###",
      empty: "N/A",
    };
    expect(settings.id).toBe("revenue");
    expect(settings.name).toBe("Revenue");
    expect(settings.expression).toBe("value * 100");
    expect(settings.pattern).toBe("#,###");
    expect(settings.empty).toBe("N/A");
  });

  it("name is optional", () => {
    const settings: ColumnSettings = {
      id: "revenue" as ColumnId,
    };
    expect(settings.name).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehub/data run test -- src/dataset/types.test.ts`
Expected: FAIL — old field names don't match.

- [ ] **Step 3: Rename fields in types.ts**

In `packages/core/src/dataset/types.ts`, change `ColumnSettings`:

```typescript
export interface ColumnSettings {
  readonly id: ColumnId;
  readonly name?: string;
  readonly expression?: string;
  readonly pattern?: string;
  readonly empty?: string;
}
```

- [ ] **Step 4: Update all references to old field names**

Search for `columnId`, `columnName`, `valueExpression`, `valuePattern`, `emptyTemplate` in `packages/core/src/` and rename to `id`, `name`, `expression`, `pattern`, `empty`. Key files:
- `packages/core/src/dataset/lookup-parser.ts` — column schema in the Zod parser
- `packages/core/src/dataset/external/schema.ts` — if it references ColumnSettings
- Any test files that construct ColumnSettings objects

- [ ] **Step 5: Run all tests**

Run: `yarn workspace @casehub/data run test`
Expected: All tests pass with renamed fields.

- [ ] **Step 6: Commit**

```
refactor!: rename ColumnSettings fields — id, name, expression, pattern, empty  Refs #8

BREAKING: columnId→id, columnName→name, valueExpression→expression,
valuePattern→pattern, emptyTemplate→empty. Migration is mechanical.
```

---

### Task 2: Core model types (zero-dep)

**Files:**
- Create: `packages/casehub-ui/src/model/types.ts`
- Create: `packages/casehub-ui/src/model/types.test.ts`

- [ ] **Step 1: Write tests for core types**

```typescript
import { describe, it, expect } from "vitest";
import type { Component, GridItem, GridPlacement, AccessControl } from "./types.js";
import { ALLOW_ALL } from "./types.js";

describe("Component", () => {
  it("represents a leaf component", () => {
    const c: Component = {
      type: "html",
      props: { content: "<h1>Hello</h1>" },
    };
    expect(c.type).toBe("html");
    expect(c.props).toEqual({ content: "<h1>Hello</h1>" });
  });

  it("represents a component with slots", () => {
    const child: Component = { type: "html", props: { content: "child" } };
    const parent: Component = {
      type: "tabs",
      slots: { "Tab 1": [child] },
    };
    expect(parent.slots!["Tab 1"]![0]).toBe(child);
  });

  it("represents a grid with items", () => {
    const chart: Component = { type: "bar-chart", props: {} };
    const item: GridItem = {
      placement: { x: 0, y: 0, w: 6, h: 2 },
      component: chart,
    };
    const grid: Component = {
      type: "grid",
      props: { columns: 12 },
      items: [item],
    };
    expect(grid.items![0]!.placement.w).toBe(6);
    expect(grid.items![0]!.component).toBe(chart);
  });

  it("supports optional id, style, and access", () => {
    const c: Component = {
      type: "panel",
      id: "admin-panel",
      props: { title: "Admin" },
      style: { margin: "10px", "background-color": "blue" },
      access: { roles: ["admin"] },
    };
    expect(c.id).toBe("admin-panel");
    expect(c.style!["margin"]).toBe("10px");
    expect(c.access!.roles).toEqual(["admin"]);
  });
});

describe("ALLOW_ALL", () => {
  it("grants all roles and permissions", () => {
    expect(ALLOW_ALL.hasRole("anything")).toBe(true);
    expect(ALLOW_ALL.hasPermission("anything")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @casehub/ui run test -- src/model/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types.ts**

```typescript
export interface Component {
  readonly type: string;
  readonly id?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly style?: Readonly<Record<string, string>>;
  readonly access?: AccessControl;
  readonly slots?: Readonly<Record<string, readonly Component[]>>;
  readonly items?: readonly GridItem[];
}

export interface AccessControl {
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

export interface GridPlacement {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface GridItem {
  readonly placement: GridPlacement;
  readonly component: Component;
}

export interface PermissionContext {
  hasRole(role: string): boolean;
  hasPermission(permission: string): boolean;
}

export const ALLOW_ALL: PermissionContext = {
  hasRole: () => true,
  hasPermission: () => true,
};
```

- [ ] **Step 4: Run test**

Run: `yarn workspace @casehub/ui run test -- src/model/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat: core component model types — Component, GridItem, AccessControl  Refs #8
```

---

### Task 3: Component props (zero-dep)

**Files:**
- Create: `packages/casehub-ui/src/model/component-props.ts`
- Create: `packages/casehub-ui/src/model/component-props.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import type {
  GridProps, ColumnsProps, PanelProps, HtmlProps, MarkdownProps,
  TitleProps, LazyPageProps, FilterSettings, DrillDown, RefreshSettings,
} from "./component-props.js";

describe("component props", () => {
  it("GridProps has columns", () => {
    const p: GridProps = { columns: 12 };
    expect(p.columns).toBe(12);
  });

  it("ColumnsProps has distribution", () => {
    const p: ColumnsProps = { distribution: [1, 2, 1] };
    expect(p.distribution).toEqual([1, 2, 1]);
  });

  it("PanelProps has title", () => {
    const p: PanelProps = { title: "Admin" };
    expect(p.title).toBe("Admin");
  });

  it("HtmlProps has content", () => {
    const p: HtmlProps = { content: "<h1>Hi</h1>" };
    expect(p.content).toBe("<h1>Hi</h1>");
  });

  it("LazyPageProps has name and href", () => {
    const p: LazyPageProps = { name: "Admin", href: "/pages/admin.json" };
    expect(p.name).toBe("Admin");
    expect(p.href).toBe("/pages/admin.json");
  });

  it("FilterSettings with drill-down", () => {
    const f: FilterSettings = {
      notification: true,
      listening: false,
      group: "region",
      drillDown: { target: "Detail", parameters: { region: "region" } },
    };
    expect(f.group).toBe("region");
    expect(f.drillDown!.target).toBe("Detail");
  });

  it("RefreshSettings uses showStaleIndicator", () => {
    const r: RefreshSettings = { interval: 30, showStaleIndicator: true };
    expect(r.interval).toBe(30);
    expect(r.showStaleIndicator).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Implement component-props.ts**

```typescript
export interface GridProps {
  readonly columns: number;
}

export interface ColumnsProps {
  readonly distribution: readonly number[];
}

export interface RowsProps {}
export interface StackProps {}

export interface TabsProps {}
export interface PillsProps {}
export interface SidebarProps {}
export interface TreeProps {}
export interface MenuProps {}
export interface AccordionProps {}
export interface CarouselProps {}
export interface AppGridProps {}

export interface PanelProps {
  readonly title: string;
}

export interface HtmlProps {
  readonly content: string;
}

export interface MarkdownProps {
  readonly content: string;
}

export interface TitleProps {
  readonly text: string;
  readonly size?: string;
}

export interface LazyPageProps {
  readonly name: string;
  readonly href: string;
}

export interface FilterSettings {
  readonly enabled?: boolean;
  readonly notification?: boolean;
  readonly listening?: boolean;
  readonly selfApply?: boolean;
  readonly group?: string;
  readonly drillDown?: DrillDown;
}

export interface DrillDown {
  readonly target: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface RefreshSettings {
  readonly interval?: number;
  readonly showStaleIndicator?: boolean;
}
```

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```
feat: component props — layout, navigation, content, filter, refresh  Refs #8
```

---

### Task 4: Page types and data component types

**Files:**
- Create: `packages/casehub-ui/src/model/page-types.ts`
- Create: `packages/casehub-ui/src/model/displayer-types.ts`
- Create: `packages/casehub-ui/src/model/page-types.test.ts`
- Create: `packages/casehub-ui/src/model/displayer-types.test.ts`

- [ ] **Step 1: Write page-types tests**

```typescript
import { describe, it, expect } from "vitest";
import type { PageProps, PageSettings, ViewState, DeepLink } from "./page-types.js";
import type { DataSetId, ColumnId } from "@casehub/data/dataset/types.js";

describe("PageProps", () => {
  it("has name, datasets, settings, properties", () => {
    const p: PageProps = {
      name: "Sales",
      properties: { region: "North" },
    };
    expect(p.name).toBe("Sales");
    expect(p.properties!["region"]).toBe("North");
  });
});

describe("ViewState", () => {
  it("has activeFilters keyed by ColumnId", () => {
    const state: ViewState = {
      currentPage: "Overview",
      activeFilters: { ["region" as ColumnId]: ["North", "South"] },
    };
    expect(state.currentPage).toBe("Overview");
  });
});

describe("DeepLink", () => {
  it("has page, parameters, filters", () => {
    const link: DeepLink = {
      page: "CaseReview",
      parameters: { caseId: "12345", action: "approve" },
      filters: { region: ["North"] },
    };
    expect(link.page).toBe("CaseReview");
    expect(link.parameters!["caseId"]).toBe("12345");
  });
});
```

- [ ] **Step 2: Write displayer-types tests**

```typescript
import { describe, it, expect } from "vitest";
import type {
  DataComponentCommon, ChartSettings, BarChartProps, TableProps,
  MetricProps, IframePluginProps, MapProps, BubbleChartProps,
} from "./displayer-types.js";

describe("DataComponentCommon", () => {
  it("requires lookup", () => {
    const common = {
      lookup: { dataSetId: "sales", operations: [] },
      title: "Revenue",
      rowCount: 10,
    } satisfies Partial<DataComponentCommon>;
    expect(common.title).toBe("Revenue");
    expect(common.rowCount).toBe(10);
  });
});

describe("ChartSettings", () => {
  it("has axis config and extra passthrough", () => {
    const s: ChartSettings = {
      xAxis: { title: "Month", showLabels: true },
      yAxis: { title: "Revenue" },
      extra: { toolbox: { feature: { saveAsImage: {} } } },
    };
    expect(s.xAxis!.title).toBe("Month");
    expect(s.extra!["toolbox"]).toBeDefined();
  });
});

describe("BarChartProps", () => {
  it("has subtype union", () => {
    const p = { subtype: "bar-stacked" } satisfies Partial<BarChartProps>;
    expect(p.subtype).toBe("bar-stacked");
  });
});

describe("IframePluginProps", () => {
  it("does NOT require lookup", () => {
    const p: IframePluginProps = {
      componentId: "uniforms",
      settings: { "uniforms.url": "http://acme.com" },
    };
    expect(p.lookup).toBeUndefined();
    expect(p.componentId).toBe("uniforms");
  });

  it("optionally has refresh", () => {
    const p: IframePluginProps = {
      componentId: "echarts",
      lookup: { dataSetId: "metrics", operations: [] } as any,
      refresh: { interval: 30 },
    };
    expect(p.refresh!.interval).toBe(30);
  });
});

describe("BubbleChartProps", () => {
  it("has radius config", () => {
    const p = { minRadius: 5, maxRadius: 50 } satisfies Partial<BubbleChartProps>;
    expect(p.minRadius).toBe(5);
  });
});

describe("MapProps", () => {
  it("has colorScheme", () => {
    const p = { colorScheme: "blues" } satisfies Partial<MapProps>;
    expect(p.colorScheme).toBe("blues");
  });
});

describe("MetricProps", () => {
  it("has subtype for built-in templates", () => {
    const p = { subtype: "card" } satisfies Partial<MetricProps>;
    expect(p.subtype).toBe("card");
  });
});
```

- [ ] **Step 3: Run tests — FAIL**

- [ ] **Step 4: Implement page-types.ts**

All types from spec §2 — `PageProps`, `PageSettings`, `DataComponentDefaults`, `LookupDefaults`, `DataSetDefaults`, `ViewState`, `DeepLink`, `DrillDownStep`, `LayoutOverride`, and the `Site` interface. Imports `DataSetId`, `ColumnId`, `DataSetOp`, `ExternalDataSetDef`, `ExternalColumnDef`, `HttpMethod` from `@casehub/data`.

- [ ] **Step 5: Implement displayer-types.ts**

All types from spec §5 — `DataComponentCommon`, `ChartSettings`, `BarChartProps`, `LineChartProps`, `AreaChartProps`, `PieChartProps`, `ScatterChartProps`, `BubbleChartProps`, `TimeseriesProps`, `TableProps`, `MetricProps`, `MeterProps`, `SelectorProps`, `MapProps`, `IframePluginProps`. Imports `DataSetLookup`, `ColumnSettings` from `@casehub/data`.

- [ ] **Step 6: Run tests — PASS**

- [ ] **Step 7: Commit**

```
feat: page types and data component types  Refs #8
```

---

### Task 5: Type guards and ComponentTypeRegistry

**Files:**
- Create: `packages/casehub-ui/src/model/type-guards.ts`
- Create: `packages/casehub-ui/src/model/type-guards.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import type { Component } from "./types.js";
import { isBarChart, isTable, isHtml, isPage, isGrid, getProps } from "./type-guards.js";

describe("type guards", () => {
  it("isBarChart narrows correctly", () => {
    const c: Component = { type: "bar-chart", props: { title: "Revenue" } };
    expect(isBarChart(c)).toBe(true);
    if (isBarChart(c)) {
      expect(c.props.title).toBe("Revenue");
    }
  });

  it("isBarChart rejects wrong type", () => {
    const c: Component = { type: "table", props: {} };
    expect(isBarChart(c)).toBe(false);
  });

  it("isHtml narrows content components", () => {
    const c: Component = { type: "html", props: { content: "<p>hi</p>" } };
    expect(isHtml(c)).toBe(true);
  });

  it("isGrid narrows grid components", () => {
    const c: Component = { type: "grid", props: { columns: 12 }, items: [] };
    expect(isGrid(c)).toBe(true);
  });
});

describe("getProps", () => {
  it("returns typed props for matching component", () => {
    const c: Component = { type: "bar-chart", props: { title: "Revenue" } };
    const props = getProps(c, "bar-chart");
    expect(props.title).toBe("Revenue");
  });

  it("throws for mismatched type", () => {
    const c: Component = { type: "table", props: {} };
    expect(() => getProps(c, "bar-chart")).toThrow("Expected bar-chart, got table");
  });
});
```

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Implement type-guards.ts**

Define `ComponentTypeRegistry` with all entries from the spec. Generate type guard functions (`isBarChart`, `isTable`, `isHtml`, `isPage`, `isGrid`, `isPanel`, `isMarkdown`, `isTitle`, `isLazyPage`, `isLineChart`, `isAreaChart`, `isPieChart`, `isScatterChart`, `isBubbleChart`, `isTimeseries`, `isMetric`, `isMeter`, `isSelector`, `isMap`, `isIframePlugin`, `isTabs`, `isColumns`, `isRows`, `isStack`). Implement `getProps<T>()`.

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Create model/index.ts re-exporting all model modules**

- [ ] **Step 6: Commit**

```
feat: type guards and ComponentTypeRegistry  Refs #8
```

---

### Task 6: DSL builders — layout and navigation

**Files:**
- Create: `packages/casehub-ui/src/dsl/builders.ts`
- Create: `packages/casehub-ui/src/dsl/builders.test.ts`

- [ ] **Step 1: Write tests for page(), grid(), at(), columns(), rows(), stack()**

```typescript
import { describe, it, expect } from "vitest";
import { page, grid, at, columns, rows, stack, html, markdown, title, panel, tabs } from "./builders.js";
import { isPage, isGrid, isHtml } from "../model/type-guards.js";

describe("page()", () => {
  it("creates a page component", () => {
    const p = page("Sales", html("<h1>Hi</h1>"));
    expect(isPage(p)).toBe(true);
    expect(p.props!["name"]).toBe("Sales");
    expect(p.slots!["content"]!.length).toBe(1);
  });

  it("accepts PageOptions as last arg", () => {
    const p = page("Sales", html("<h1>Hi</h1>"), {
      settings: { mode: "dark" },
    });
    expect((p.props as any).settings.mode).toBe("dark");
  });

  it("rejects / in page name", () => {
    expect(() => page("Sales/Q1", html("hi"))).toThrow();
  });

  it("rejects duplicate child page names", () => {
    expect(() =>
      page("App", page("A"), page("A"))
    ).toThrow();
  });
});

describe("grid()", () => {
  it("creates a grid with items", () => {
    const g = grid(12,
      at(0, 0, 6, 2, html("<p>left</p>")),
      at(6, 0, 6, 2, html("<p>right</p>")),
    );
    expect(isGrid(g)).toBe(true);
    expect(g.items!.length).toBe(2);
    expect(g.items![0]!.placement).toEqual({ x: 0, y: 0, w: 6, h: 2 });
  });

  it("generates deterministic IDs for grid items", () => {
    const g = grid(12,
      at(0, 0, 6, 1, html("a")),
      at(6, 0, 6, 1, html("b")),
    );
    expect(g.items![0]!.component.id).toBeDefined();
    expect(g.items![1]!.component.id).toBeDefined();
    expect(g.items![0]!.component.id).not.toBe(g.items![1]!.component.id);
  });
});

describe("columns()", () => {
  it("creates columns with distribution", () => {
    const c = columns([1, 2], [html("left")], [html("right")]);
    expect(c.type).toBe("columns");
    expect(c.slots!["col-0"]!.length).toBe(1);
    expect(c.slots!["col-1"]!.length).toBe(1);
  });

  it("throws on distribution/content length mismatch", () => {
    expect(() => columns([1, 2, 3], [html("a")], [html("b")])).toThrow();
  });
});

describe("tabs()", () => {
  it("creates tabs with named slots", () => {
    const t = tabs(["Sales", html("charts")], ["Costs", html("tables")]);
    expect(t.type).toBe("tabs");
    expect(t.slots!["Sales"]!.length).toBe(1);
    expect(t.slots!["Costs"]!.length).toBe(1);
  });
});

describe("content builders", () => {
  it("html()", () => {
    const h = html("<h1>Title</h1>");
    expect(h.type).toBe("html");
    expect(h.props!["content"]).toBe("<h1>Title</h1>");
  });

  it("markdown()", () => {
    const m = markdown("# Title");
    expect(m.type).toBe("markdown");
    expect(m.props!["content"]).toBe("# Title");
  });

  it("title()", () => {
    const t = title("Hello", "2xl");
    expect(t.type).toBe("title");
    expect(t.props!["text"]).toBe("Hello");
    expect(t.props!["size"]).toBe("2xl");
  });
});
```

- [ ] **Step 2: Write tests for withId(), withAccess(), withStyle()**

```typescript
import { withId, withAccess, withStyle } from "./builders.js";

describe("component decorators", () => {
  it("withId sets id without mutating", () => {
    const original = html("<p>hi</p>");
    const decorated = withId("my-id", original);
    expect(decorated.id).toBe("my-id");
    expect(original.id).toBeUndefined();
  });

  it("withAccess sets access", () => {
    const decorated = withAccess({ roles: ["admin"] }, html("<p>hi</p>"));
    expect(decorated.access!.roles).toEqual(["admin"]);
  });

  it("withStyle sets style", () => {
    const decorated = withStyle({ margin: "10px" }, html("<p>hi</p>"));
    expect(decorated.style!["margin"]).toBe("10px");
  });
});
```

- [ ] **Step 3: Run tests — FAIL**

- [ ] **Step 4: Implement builders.ts**

Implement all builder functions from spec §9. Key validation rules:
- `page()`: reject `/` in name, detect duplicate child page names at same level
- `grid()`: auto-generate deterministic IDs for items using `grid_${gridIndex}_${x}_${y}` scheme
- `columns()`: throw if `distribution.length !== slotContents.length`
- All builders return frozen `Component` objects

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

```
feat: DSL builders — page, grid, columns, tabs, panel, content, decorators  Refs #8
```

---

### Task 7: DSL lookup helpers

**Files:**
- Create: `packages/casehub-ui/src/dsl/lookup-helpers.ts`
- Create: `packages/casehub-ui/src/dsl/lookup-helpers.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import {
  lookup, groupBy, groupByCalendar, filterBy, and, or, not, sortBy,
  col, sum, avg, count, min, max, distinct, join,
} from "./lookup-helpers.js";

describe("lookup()", () => {
  it("creates DataSetLookup with branded DataSetId", () => {
    const l = lookup("sales");
    expect(l.dataSetId).toBe("sales");
    expect(l.operations).toEqual([]);
  });

  it("accepts operations", () => {
    const l = lookup("sales", sortBy("revenue", "DESCENDING"));
    expect(l.operations.length).toBe(1);
    expect(l.operations[0]!.type).toBe("sort");
  });
});

describe("groupBy()", () => {
  it("creates group op with distinct strategy default", () => {
    const g = groupBy("region", col("region"), sum("revenue"));
    expect(g.type).toBe("group");
    expect(g.groupingKey!.strategy).toEqual({ mode: "distinct" });
    expect(g.columns.length).toBe(2);
  });

  it("null source produces null groupingKey", () => {
    const g = groupBy(null, sum("revenue"));
    expect(g.groupingKey).toBeNull();
  });

  it("infers key column kind when source matches groupBy source", () => {
    const g = groupBy("region", col("region"));
    expect(g.columns[0]!.kind).toBe("key");
  });

  it("infers select column kind when source differs", () => {
    const g = groupBy("region", col("region"), col("name"));
    expect(g.columns[1]!.kind).toBe("select");
  });
});

describe("filterBy()", () => {
  it("creates unresolved filter op", () => {
    const f = filterBy("region", "EQUALS_TO", "North");
    expect(f.type).toBe("filter");
    expect(f.expressions.length).toBe(1);
  });

  it("serializes Date args as ISO 8601", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const f = filterBy("created", "GREATER_THAN", date);
    const expr = f.expressions[0] as any;
    expect(expr.args[0]).toBe("2024-06-15T00:00:00.000Z");
  });
});

describe("boolean combinators", () => {
  it("and() combines filters", () => {
    const f = and(
      filterBy("region", "EQUALS_TO", "North"),
      filterBy("year", "EQUALS_TO", "2024"),
    );
    expect(f.expressions.length).toBe(1);
    expect(f.expressions[0]!.type).toBe("and");
  });

  it("or() combines filters", () => {
    const f = or(
      filterBy("region", "EQUALS_TO", "North"),
      filterBy("region", "EQUALS_TO", "South"),
    );
    expect(f.expressions[0]!.type).toBe("or");
  });

  it("not() wraps a filter", () => {
    const f = not(filterBy("archived", "EQUALS_TO", "true"));
    expect(f.expressions[0]!.type).toBe("not");
  });
});

describe("result column helpers", () => {
  it("sum() creates aggregate column", () => {
    const c = sum("revenue");
    expect(c.kind).toBe("aggregate");
    expect((c as any).fn).toEqual({ fn: "SUM" });
  });

  it("join() with separator", () => {
    const c = join("names", " | ");
    expect((c as any).fn).toEqual({ fn: "JOIN", separator: " | " });
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement lookup-helpers.ts**

All lookup helpers from spec §9. Key behaviors:
- `lookup()` accepts plain string, brands to `DataSetId` internally
- `filterBy()` serializes `Date` via `.toISOString()`, numbers via `String(n)`
- `groupBy()` infers `kind: "key"` when `source` matches groupBy source
- `col()` returns `ResultColumn` with kind determined by context in `groupBy()`
- Boolean combinators wrap filter expressions in `FilterExprTree` nodes

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Create dsl/index.ts re-exporting builders and lookup-helpers**

- [ ] **Step 6: Commit**

```
feat: DSL lookup helpers — lookup, groupBy, filterBy, and/or/not, sortBy  Refs #8
```

---

### Task 8: DSL data component builders

**Files:**
- Modify: `packages/casehub-ui/src/dsl/builders.ts`
- Create: `packages/casehub-ui/src/dsl/builders-displayers.test.ts`

- [ ] **Step 1: Write tests for barChart(), table(), metric(), etc.**

```typescript
import { describe, it, expect } from "vitest";
import {
  barChart, lineChart, areaChart, pieChart, scatterChart, bubbleChart,
  timeseries, table, metric, meter, selector, mapChart, iframePlugin,
} from "./builders.js";
import { lookup, groupBy, col, sum } from "./lookup-helpers.js";
import { isBarChart, isTable, isMetric } from "../model/type-guards.js";

describe("data component builders", () => {
  const salesLookup = lookup("sales", groupBy("product", col("product"), sum("revenue")));

  it("barChart()", () => {
    const c = barChart({ lookup: salesLookup, subtype: "bar-stacked", title: "Revenue" });
    expect(isBarChart(c)).toBe(true);
    expect(c.props!["subtype"]).toBe("bar-stacked");
    expect(c.props!["title"]).toBe("Revenue");
  });

  it("table()", () => {
    const c = table({ lookup: salesLookup, pageSize: 10, sortable: true });
    expect(isTable(c)).toBe(true);
    expect(c.props!["pageSize"]).toBe(10);
  });

  it("metric() with subtype", () => {
    const c = metric({ lookup: salesLookup, subtype: "card" });
    expect(isMetric(c)).toBe(true);
    expect(c.props!["subtype"]).toBe("card");
  });

  it("iframePlugin() without lookup", () => {
    const c = iframePlugin({ componentId: "uniforms" });
    expect(c.type).toBe("iframe-plugin");
    expect(c.props!["lookup"]).toBeUndefined();
  });

  it("bubbleChart() with radius", () => {
    const c = bubbleChart({ lookup: salesLookup, minRadius: 5, maxRadius: 50 });
    expect(c.props!["minRadius"]).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement data component builders in builders.ts**

Add `barChart()`, `lineChart()`, `areaChart()`, `pieChart()`, `scatterChart()`, `bubbleChart()`, `timeseries()`, `table()`, `metric()`, `meter()`, `selector()`, `mapChart()`, `iframePlugin()` to builders.ts. Each wraps the typed props into a frozen `Component`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```
feat: DSL data component builders — barChart, table, metric, etc.  Refs #8
```

---

### Task 9: YAML property substitution

**Files:**
- Create: `packages/casehub-ui/src/parser/property-substitution.ts`
- Create: `packages/casehub-ui/src/parser/property-substitution.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { substituteProperties } from "./property-substitution.js";

describe("substituteProperties", () => {
  it("replaces ${name} in string values", () => {
    const result = substituteProperties(
      { pages: [{ components: [{ html: "Hello ${name}" }] }] },
      { name: "World" },
    );
    expect((result as any).pages[0].components[0].html).toBe("Hello World");
  });

  it("replaces in nested objects", () => {
    const result = substituteProperties(
      { url: "https://api.com/${endpoint}" },
      { endpoint: "users" },
    );
    expect((result as any).url).toBe("https://api.com/users");
  });

  it("skips metric template fields (html.html and html.javascript)", () => {
    const input = {
      displayer: {
        type: "METRIC",
        html: {
          html: "<div>${value}</div>",
          javascript: "${this}.style.color = 'red'",
        },
      },
    };
    const result = substituteProperties(input, { value: "SHOULD_NOT_REPLACE" });
    expect((result as any).displayer.html.html).toBe("<div>${value}</div>");
    expect((result as any).displayer.html.javascript).toBe("${this}.style.color = 'red'");
  });

  it("leaves non-matching ${...} intact", () => {
    const result = substituteProperties(
      { text: "Hello ${unknown}" },
      { name: "World" },
    );
    expect((result as any).text).toBe("Hello ${unknown}");
  });

  it("handles multiple substitutions in one string", () => {
    const result = substituteProperties(
      { text: "${greeting} ${name}!" },
      { greeting: "Hello", name: "World" },
    );
    expect((result as any).text).toBe("Hello World!");
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement property-substitution.ts**

```typescript
export function substituteProperties(
  data: unknown,
  properties: Readonly<Record<string, string>>,
): unknown {
  return walk(data, properties, []);
}

function walk(
  node: unknown,
  properties: Readonly<Record<string, string>>,
  path: readonly string[],
): unknown {
  if (typeof node === "string") {
    if (isMetricTemplatePath(path)) return node;
    return node.replace(/\$\{(\w+)\}/g, (match, key) =>
      key in properties ? properties[key]! : match
    );
  }
  if (Array.isArray(node)) {
    return node.map((item, i) => walk(item, properties, [...path, String(i)]));
  }
  if (node !== null && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = walk(value, properties, [...path, key]);
    }
    return result;
  }
  return node;
}

function isMetricTemplatePath(path: readonly string[]): boolean {
  const len = path.length;
  if (len < 2) return false;
  const parent = path[len - 2];
  const field = path[len - 1];
  return parent === "html" && (field === "html" || field === "javascript");
}
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```
feat: YAML property substitution with metric template skip  Refs #8
```

---

### Task 10: YAML displayer desugaring

**Files:**
- Create: `packages/casehub-ui/src/parser/displayer-desugar.ts`
- Create: `packages/casehub-ui/src/parser/displayer-desugar.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { desugarDisplayer } from "./displayer-desugar.js";

describe("desugarDisplayer", () => {
  it("maps BARCHART to bar-chart with typed props", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      general: { title: "Revenue" },
      lookup: { uuid: "sales" },
    });
    expect(result.type).toBe("bar-chart");
    expect(result.props!["title"]).toBe("Revenue");
  });

  it("extracts rowCount from lookup into props", () => {
    const result = desugarDisplayer({
      type: "TABLE",
      lookup: { uuid: "sales", rowCount: 10 },
    });
    expect(result.props!["rowCount"]).toBe(10);
  });

  it("unflattens dot-notation settings", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      chart: { margin: { left: 80 } },
      lookup: { uuid: "sales" },
    });
    expect((result.props as any).margin).toEqual({ left: 80 });
  });

  it("maps html.html to html.template for metrics", () => {
    const result = desugarDisplayer({
      type: "METRIC",
      html: { html: "<div>${value}</div>", javascript: "console.log(1)" },
      lookup: { uuid: "sales" },
    });
    expect((result.props as any).html.template).toBe("<div>${value}</div>");
    expect((result.props as any).html.javascript).toBe("console.log(1)");
  });

  it("maps extraConfiguration to ChartSettings.extra", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      extraConfiguration: '{"color": ["#ff0000"]}',
      lookup: { uuid: "sales" },
    });
    expect((result.props as any).extra).toEqual({ color: ["#ff0000"] });
  });

  it("defaults to table type when no type specified", () => {
    const result = desugarDisplayer({
      lookup: { uuid: "sales" },
      table: { pageSize: 10 },
    });
    expect(result.type).toBe("table");
  });

  it("maps type: EXTERNAL to iframe-plugin", () => {
    const result = desugarDisplayer({
      component: "echarts",
      echarts: { title: { text: "Chart" } },
      lookup: { uuid: "data" },
    });
    expect(result.type).toBe("iframe-plugin");
    expect(result.props!["componentId"]).toBe("echarts");
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement displayer-desugar.ts**

Maps Java displayer type names to casehub component types. Unflattens dot-notation settings. Extracts `rowCount`/`rowOffset` from lookup. Renames `html.html` → `html.template`. Parses `extraConfiguration` JSON string to `extra` object. Handles both `type: EXTERNAL` and `displayer.component:` syntaxes for iframe plugins.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```
feat: YAML displayer desugaring — type mapping, settings unflattening  Refs #8
```

---

### Task 11: YAML component desugaring

**Files:**
- Create: `packages/casehub-ui/src/parser/component-desugar.ts`
- Create: `packages/casehub-ui/src/parser/component-desugar.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { desugarComponent } from "./component-desugar.js";

describe("desugarComponent", () => {
  it("html shorthand", () => {
    const result = desugarComponent({ html: "<h1>Hi</h1>" });
    expect(result.type).toBe("html");
    expect(result.props!["content"]).toBe("<h1>Hi</h1>");
  });

  it("markdown shorthand", () => {
    const result = desugarComponent({ markdown: "# Title" });
    expect(result.type).toBe("markdown");
    expect(result.props!["content"]).toBe("# Title");
  });

  it("title shorthand", () => {
    const result = desugarComponent({ title: "Hello" });
    expect(result.type).toBe("title");
    expect(result.props!["text"]).toBe("Hello");
  });

  it("screen shorthand → page-ref (transient)", () => {
    const result = desugarComponent({ screen: "Layout" });
    expect(result.type).toBe("page-ref");
    expect(result.props!["name"]).toBe("Layout");
  });

  it("panel shorthand with page name", () => {
    const result = desugarComponent({ panel: "Layout" });
    expect(result.type).toBe("panel");
    expect(result.props!["name"]).toBe("Layout");
  });

  it("div shorthand → slot-target (transient)", () => {
    const result = desugarComponent({ div: "my_div" });
    expect(result.type).toBe("slot-target");
    expect(result.props!["id"]).toBe("my_div");
  });

  it("properties → style", () => {
    const result = desugarComponent({
      html: "<p>text</p>",
      properties: { margin: "10px", "font-size": "large" },
    });
    expect(result.style).toEqual({ margin: "10px", "font-size": "large" });
  });

  it("displayer object → dispatches to displayer desugar", () => {
    const result = desugarComponent({
      displayer: { type: "BARCHART", lookup: { uuid: "sales" } },
    });
    expect(result.type).toBe("bar-chart");
  });

  it("type: TABS", () => {
    const result = desugarComponent({
      type: "TABS",
      properties: { navGroupId: "Metrics", targetDivId: "Metrics_Div" },
    });
    expect(result.type).toBe("tabs");
  });

  it("type: EXTERNAL → iframe-plugin", () => {
    const result = desugarComponent({
      type: "EXTERNAL",
      properties: { componentId: "uniforms" },
    });
    expect(result.type).toBe("iframe-plugin");
    expect(result.props!["componentId"]).toBe("uniforms");
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement component-desugar.ts**

Dispatches YAML component objects to the correct model type. Handles all shorthand forms from the desugaring rules table. Converts `properties` to `style`. Delegates displayer objects to `displayer-desugar.ts`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```
feat: YAML component desugaring — shortcuts, style mapping  Refs #8
```

---

### Task 12: YAML navigation desugaring

**Files:**
- Create: `packages/casehub-ui/src/parser/nav-desugar.ts`
- Create: `packages/casehub-ui/src/parser/nav-desugar.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import type { Component } from "../model/types.js";
import { resolveNavigation } from "./nav-desugar.js";

describe("resolveNavigation", () => {
  it("resolves navGroupId + targetDivId into tabs slots", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "CPU Usage" }, slots: { content: [{ type: "html", props: { content: "cpu" } }] } },
      { type: "page", props: { name: "Memory" }, slots: { content: [{ type: "html", props: { content: "mem" } }] } },
    ];

    const components: Component[] = [
      { type: "tabs", props: { navGroupId: "Metrics", targetDivId: "Metrics_Div" } },
      { type: "slot-target", props: { id: "Metrics_Div" } },
    ];

    const navTree = {
      root_items: [
        { type: "GROUP", id: "Metrics", children: [
          { page: "CPU Usage" },
          { page: "Memory" },
        ]},
      ],
    };

    const result = resolveNavigation(components, pages, navTree);

    expect(result.length).toBe(1);
    expect(result[0]!.type).toBe("tabs");
    expect(result[0]!.slots!["CPU Usage"]).toBeDefined();
    expect(result[0]!.slots!["Memory"]).toBeDefined();
  });

  it("removes slot-target placeholders", () => {
    const result = resolveNavigation(
      [
        { type: "tabs", props: { navGroupId: "G", targetDivId: "D" } },
        { type: "slot-target", props: { id: "D" } },
      ],
      [{ type: "page", props: { name: "P1" }, slots: { content: [] } }],
      { root_items: [{ type: "GROUP", id: "G", children: [{ page: "P1" }] }] },
    );
    expect(result.every(c => c.type !== "slot-target")).toBe(true);
  });

  it("resolves page-ref to inline page content", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "Layout" }, slots: { content: [{ type: "html", props: { content: "layout content" } }] } },
    ];
    const components: Component[] = [
      { type: "page-ref", props: { name: "Layout" } },
    ];
    const result = resolveNavigation(components, pages, undefined);
    expect(result[0]!.type).toBe("page");
    expect(result[0]!.props!["name"]).toBe("Layout");
  });

  it("throws on unresolvable page-ref", () => {
    expect(() => resolveNavigation(
      [{ type: "page-ref", props: { name: "NonExistent" } }],
      [],
      undefined,
    )).toThrow();
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement nav-desugar.ts**

Implements the 6-step resolution from spec §10. Resolves `navGroupId` against the `navTree`, maps children into named slots, removes `slot-target` placeholders, resolves `page-ref` to inline page content. Throws on unresolvable references.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```
feat: YAML navigation desugaring — navGroupId, page-ref, slot-target  Refs #8
```

---

### Task 13: YAML Zod schemas and parsePage()

**Files:**
- Create: `packages/casehub-ui/src/parser/page-schema.ts`
- Create: `packages/casehub-ui/src/parser/page-parser.ts`
- Create: `packages/casehub-ui/src/parser/page-parser.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from "vitest";
import { parsePage } from "./page-parser.js";

describe("parsePage", () => {
  it("parses minimal YAML", () => {
    const root = parsePage({
      pages: [{ components: [{ html: "Hello" }] }],
    });
    expect(root.type).toBe("page");
    expect(root.slots!["content"]).toBeDefined();
  });

  it("parses datasets and global settings", () => {
    const root = parsePage({
      datasets: [{ uuid: "test", content: "[['a', 1]]" }],
      global: { mode: "dark" },
      pages: [{ components: [{ html: "Hi" }] }],
    });
    expect((root.props as any).settings.mode).toBe("dark");
    expect((root.props as any).datasets.length).toBe(1);
  });

  it("desugars components shorthand to grid", () => {
    const root = parsePage({
      pages: [{ components: [{ html: "A" }, { html: "B" }] }],
    });
    const page = root.slots!["content"]![0]!;
    expect(page.items).toBeDefined();
    expect(page.items!.length).toBe(2);
  });

  it("desugars rows/columns/span to grid placement", () => {
    const root = parsePage({
      pages: [{
        rows: [{
          columns: [
            { span: 6, components: [{ html: "left" }] },
            { span: 6, components: [{ html: "right" }] },
          ],
        }],
      }],
    });
    const page = root.slots!["content"]![0]!;
    expect(page.items!.length).toBe(2);
    expect(page.items![0]!.placement.w).toBe(6);
    expect(page.items![1]!.placement.x).toBe(6);
  });

  it("applies property substitution", () => {
    const root = parsePage({
      properties: { name: "World" },
      pages: [{ components: [{ html: "Hello ${name}" }] }],
    });
    const page = root.slots!["content"]![0]!;
    const htmlComp = page.items![0]!.component;
    expect(htmlComp.props!["content"]).toBe("Hello World");
  });

  it("generates deterministic IDs for grid items", () => {
    const root = parsePage({
      pages: [{ components: [{ html: "A" }, { html: "B" }] }],
    });
    const page = root.slots!["content"]![0]!;
    expect(page.items![0]!.component.id).toBeDefined();
    expect(page.items![1]!.component.id).toBeDefined();
  });

  it("throws on missing pages", () => {
    expect(() => parsePage({})).toThrow();
  });

  it("accepts layoutTemplates as alias for pages", () => {
    const root = parsePage({
      layoutTemplates: [{ components: [{ html: "Hi" }] }],
    });
    expect(root.type).toBe("page");
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

- [ ] **Step 3: Implement page-schema.ts**

Zod schemas for the YAML format. Constrained with `z.ZodType<Component>` to match the model. Accepts both `pages` and `layoutTemplates`. Validates at least one page.

- [ ] **Step 4: Implement page-parser.ts**

```typescript
import { substituteProperties } from "./property-substitution.js";
import { desugarComponent } from "./component-desugar.js";
import { resolveNavigation } from "./nav-desugar.js";
import type { Component } from "../model/types.js";

export function parsePage(raw: unknown): Component {
  // 1. Extract properties for substitution
  // 2. Apply property substitution (skip metric template fields)
  // 3. Validate with Zod schema
  // 4. Desugar components (shortcuts, displayer settings)
  // 5. Desugar layout (components → grid, rows/columns → grid)
  // 6. Resolve navigation (navGroupId + targetDivId → slots)
  // 7. Generate deterministic IDs for grid items
  // 8. Wrap in root page with datasets/settings
  // 9. Return frozen Component
}
```

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Create parser/index.ts re-exporting parsePage**

- [ ] **Step 7: Update root index.ts to re-export model, dsl, and parser**

- [ ] **Step 8: Commit**

```
feat: YAML parser — parsePage with schema validation and desugaring  Refs #8
```

---

### Task 14: Backwards compatibility test suite

**Files:**
- Create: `packages/casehub-ui/src/parser/backwards-compat.test.ts`

- [ ] **Step 1: Write regression tests against existing example dashboards**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { load } from "js-yaml";
import { parsePage } from "./page-parser.js";
import { join } from "path";
import { globSync } from "glob";

const EXAMPLES_DIR = join(__dirname, "../../../../examples/dashboards");

describe("backwards compatibility — existing dashboards", () => {
  const files = globSync("**/*.{yaml,yml}", { cwd: EXAMPLES_DIR });

  it.each(files)("parses %s without error", (file) => {
    const content = readFileSync(join(EXAMPLES_DIR, file), "utf-8");
    const raw = load(content);
    expect(() => parsePage(raw)).not.toThrow();
  });

  it("parses Kitchensink with all component types", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Kitchensink.dash.yml"), "utf-8"
    );
    const root = parsePage(load(content));
    expect(root.type).toBe("page");
    expect(root.slots!["content"]!.length).toBeGreaterThan(10);
  });

  it("parses Filter dashboard with cross-filtering", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Filter.dash.yaml"), "utf-8"
    );
    const root = parsePage(load(content));
    expect(root.type).toBe("page");
  });

  it("parses Global Lookup Operation with global defaults", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Global Lookup Operation.dash.yaml"), "utf-8"
    );
    const root = parsePage(load(content));
    expect(root.type).toBe("page");
    expect((root.props as any).settings).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `yarn workspace @casehub/ui run test -- src/parser/backwards-compat.test.ts`
Expected: ALL PASS — every existing dashboard parses.

- [ ] **Step 3: Fix any failures**

Iterate on parser, component-desugar, displayer-desugar, and nav-desugar until all 45+ dashboards parse cleanly. This is the critical regression gate.

- [ ] **Step 4: Commit**

```
test: backwards compatibility suite — all 45+ existing dashboards parse  Refs #8
```

---

### Task 15: Full build and integration verification

- [ ] **Step 1: Run full test suite**

Run: `yarn workspace @casehub/data run test`
Expected: All pass (ColumnSettings rename didn't break anything).

Run: `yarn workspace @casehub/ui run test`
Expected: All pass.

- [ ] **Step 2: Run full build**

Run: `yarn workspace @casehub/ui run build`
Expected: Compiles with no errors, types emitted to `dist/`.

- [ ] **Step 3: Verify exports**

Check that `packages/casehub-ui/dist/index.d.ts` exports all public types and functions.

- [ ] **Step 4: Commit any final fixes**

---

## Summary

| Task | What | Deps |
|------|------|------|
| 0 | Scaffold `@casehub/ui` package, rename `@melviz/core` → `@casehub/data` | — |
| 1 | ColumnSettings field rename (breaking) | 0 |
| 2 | Core model types (zero-dep) | 0 |
| 3 | Component props (zero-dep) | 2 |
| 4 | Page types + displayer types | 1, 2, 3 |
| 5 | Type guards + ComponentTypeRegistry | 2, 3, 4 |
| 6 | DSL builders — layout + navigation | 2, 3, 5 |
| 7 | DSL lookup helpers | 1 |
| 8 | DSL data component builders | 4, 6, 7 |
| 9 | YAML property substitution | — |
| 10 | YAML displayer desugaring | 4, 7 |
| 11 | YAML component desugaring | 10 |
| 12 | YAML navigation desugaring | 2, 11 |
| 13 | YAML parsePage + Zod schemas | 9, 10, 11, 12 |
| 14 | Backwards compatibility test suite | 13 |
| 15 | Full build + integration | all |
