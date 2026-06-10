# 06 -- Testing Strategy

**Parent:** [00-overview.md](00-overview.md)

---

Testing is the safety net that makes a 50K LOC rewrite viable. Every subsystem is developed test-first (TDD). Tests are not an afterthought or a phase -- they are the primary mechanism for verifying that the new system does what the old system did, and does it correctly.

---

## Testing Principles

- **TDD everywhere.** Write the test first, watch it fail, implement until it passes. This applies to every layer -- dataset operations, YAML parsing, displayer rendering, plugin loading, data service, and backend providers.
- **No guessing about rendering.** Playwright E2E tests load real dashboards in a real browser and assert on what's actually visible -- pixel-level screenshots, DOM structure, interactive behaviour. A test that checks a React component rendered without errors is not sufficient. A test that checks the chart SVG contains the right number of bars with the right heights is.
- **Test at every boundary.** Unit tests for pure functions, integration tests for subsystem interactions, E2E tests for user-visible behaviour. Each layer catches different failure modes.
- **Existing dashboards are the acceptance suite.** Every YAML dashboard in `examples/dashboards/` becomes a Playwright E2E test that renders the dashboard and asserts it looks and behaves correctly. This is how we prove feature parity.
- **Backend tests are real.** Quarkus integration tests use Testcontainers -- real PostgreSQL, real Kafka, real Elasticsearch. No mocking data sources.

---

## Purity Constraint

All dataset operations in `packages/core/src/dataset/`, `packages/core/src/filter/`, and `packages/core/src/interval/` are **pure functions** with **no browser API dependencies**. This is a hard architectural constraint, not a preference.

What this means concretely:

- **Date handling uses UTC arithmetic only.** No `Intl.DateTimeFormat`, no `toLocaleString()`, no timezone-sensitive browser APIs. Interval bucketing (QUARTER, MONTH, DAY_OF_WEEK) operates on UTC epoch milliseconds. Display-layer formatting happens downstream, outside the core engine.
- **Number formatting uses explicit patterns.** No `Intl.NumberFormat` in the operation layer. The core produces raw numeric values; formatting patterns (e.g. `#,##0.00`) are applied at the displayer boundary.
- **No DOM, no `window`, no `navigator`, no `fetch`.** The dataset engine is a pure computation layer that transforms `TypedDataSet -> TypedDataSet`.

This purity enables testing the entire operation engine in **Vitest running on Node.js** without jsdom, browser simulation, or any test environment gymnastics. A test that passes on Node.js will produce identical results in the browser because the code path has zero environment-specific branches.

The constraint also means the dataset engine is portable -- it can run in a Web Worker, a service worker, or server-side in a Node.js process without modification.

---

## Test Layers

### Layer 1: Unit Tests (Vitest)

Pure functions, models, and logic -- no DOM, no browser, no network. These run on Node.js directly thanks to the purity constraint.

| Subsystem | What's tested | Example assertions |
|-----------|--------------|-------------------|
| DataSet operations | `applyFilter`, `applyGroup`, `applySort`, `applyOps` | Filter NUMBER column by BETWEEN(10, 50) returns only matching rows; group by LABEL column produces correct aggregate counts |
| Column-type filters | Type-specific filter construction and application | `NumericFilter` with `BETWEEN` on a TEXT column is a compile error (type-level test); runtime filter on NUMBER returns correct rows |
| CoreFunctionType filter operations | All 13 filter function types | IS_NULL returns rows with null/undefined values; NOT_NULL returns non-null rows; EQUALS_TO matches exact values; NOT_EQUALS_TO excludes exact values; LIKE_TO with `%` wildcard matches substrings, with `_` matches single characters, with `[charlist]` matches character sets; GREATER_THAN and GREATER_OR_EQUALS_TO on NUMBER/DATE; LOWER_THAN and LOWER_OR_EQUALS_TO on NUMBER/DATE; BETWEEN on NUMBER returns rows in range (inclusive); TIME_FRAME on DATE column filters by relative time window; IN matches any value in a set; NOT_IN excludes all values in a set |
| CoreFunctionType column-type constraints | `supportsType()` parity | TIME_FRAME only supports DATE; LIKE_TO only supports TEXT and LABEL; IN/NOT_IN support everything except DATE; all other functions support all types |
| AggregateFunctionType | All 10 aggregate functions | COUNT returns row count; DISTINCT returns unique value count; AVERAGE computes mean of NUMBER column; SUM totals NUMBER column; MIN returns minimum value (preserving column type); MAX returns maximum value (preserving column type); MEDIAN returns middle value; JOIN concatenates with space; JOIN_COMMA concatenates with `,`; JOIN_HYPHEN concatenates with `-` |
| AggregateFunctionType column-type constraints | `supportType()` and `getResultType()` parity | AVERAGE/MEDIAN/SUM/MAX/MIN require NUMBER columns; COUNT/DISTINCT/JOIN variants work on all types; MIN/MAX preserve original column type; JOIN variants always produce TEXT; all others produce NUMBER |
| DateIntervalType bucketing | IntervalBuilderFixedDate | QUARTER produces 4 intervals (Q1-Q4); MONTH produces 12 intervals (Jan-Dec); DAY_OF_WEEK produces 7 intervals (Mon-Sun); HOUR produces 24 intervals; MINUTE/SECOND produce 60 intervals; dates are assigned to correct buckets using UTC arithmetic |
| DateIntervalType bucketing | IntervalBuilderDynamicLabel | Auto-sizes intervals based on data range span; small range (hours) produces MINUTE/HOUR intervals; medium range (days) produces DAY intervals; large range (years) produces MONTH/YEAR intervals; boundary dates fall into correct intervals |
| DataSetLookup orchestration | Request pipeline: lookup -> group -> filter -> sort -> aggregate | Single-group lookup produces grouped dataset; multi-group lookup chains operations correctly; lookup with filter + group + sort applies operations in correct order; empty lookup returns full dataset |
| DataSetLookupConstraints | Validation rules for lookup configurations | Rejects lookup with group on non-existent column; rejects aggregate function incompatible with column type (e.g. SUM on TEXT); validates max groups/columns constraints; accepts valid configurations |
| LogicalExprFilter | AND/OR/NOT composition | AND of two filters returns intersection; OR of two filters returns union; NOT inverts a filter; nested composition (AND(OR(a,b), NOT(c))) evaluates correctly; empty term list handled gracefully |
| Recursive FilterExpression evaluation | Nested filter tree evaluation | Single CoreFunctionFilter evaluates directly; LogicalExprFilter with AND evaluates all terms and short-circuits on first false; OR short-circuits on first true; NOT with single term inverts; deeply nested trees (3+ levels) evaluate correctly; column ID inheritance from parent to child terms works |
| Typed DataSet | `toTypedDataSet` parsing from raw `string[][]` | NUMBER column values parsed to numbers; DATE column values parsed to Dates; malformed values produce `DataSetError` with `SCHEMA_MISMATCH` code |
| YAML parser | `parseYaml` with Zod schema validation | Valid YAML produces correct `RuntimeModel`; missing required fields produce structured Zod error; extra fields are stripped; default values applied |
| Zod schemas | All schema definitions | Each schema validates known-good fixtures; each schema rejects known-bad fixtures with correct error paths |
| Expression evaluator | JSONata expressions via `evaluateExpression` | `value` returns raw value; arithmetic expressions compute correctly; malformed expressions throw, not return garbage |
| FilterStateManager | State transitions, subscription notification | Apply filter notifies subscribers; reset filter removes state; multiple filters from different components coexist; subscriber unsubscribe stops notifications |
| DataSetCache | TTL, staleness, eviction | Fresh cache hit returns data; stale cache returns undefined; put then get round-trips correctly |
| PluginRegistry | Registration, lookup, capability matching | Register then lookup by ID succeeds; unknown ID returns undefined; `matching(requirements)` filters by column requirements |
| RuntimeModel | Model construction, page lookup, navigation | Multi-page model navigates correctly; missing page falls back to first; empty model produces `EmptyDashboard` |
| Branded types | Compile-time type safety | `ColumnId` cannot be passed where `ComponentId` is expected (compile error -- verified via `expect-type`) |

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

  it("returns immutable result -- source unchanged", () => {
    const result = applyFilter(ds, { ... });
    expect(ds.rows).toHaveLength(3);  // original untouched
  });
});
```

```typescript
// Example: CoreFunctionType exhaustive filter tests
describe("CoreFunctionType filters", () => {
  const ds = createTypedDataSet({
    columns: [
      { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
      { id: "amount" as ColumnId, name: "Amount", type: ColumnType.NUMBER },
      { id: "date" as ColumnId, name: "Date", type: ColumnType.DATE },
    ],
    rows: [
      ["Alpha", 100, new Date("2024-01-15T00:00:00Z")],
      ["Beta", null, new Date("2024-06-15T00:00:00Z")],
      ["Gamma", 300, null],
    ],
  });

  it("IS_NULL returns rows where column value is null", () => {
    const result = applyFilter(ds, {
      type: "filter",
      columnId: "amount" as ColumnId,
      columnType: ColumnType.NUMBER,
      filter: { fn: "IS_NULL" },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].text("name" as ColumnId)).toBe("Beta");
  });

  it("LIKE_TO with wildcard matches pattern", () => {
    const result = applyFilter(ds, {
      type: "filter",
      columnId: "name" as ColumnId,
      columnType: ColumnType.TEXT,
      filter: { fn: "LIKE_TO", pattern: "%lpha", caseSensitive: true },
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].text("name" as ColumnId)).toBe("Alpha");
  });

  it("IN matches any value in the provided set", () => {
    const result = applyFilter(ds, {
      type: "filter",
      columnId: "name" as ColumnId,
      columnType: ColumnType.TEXT,
      filter: { fn: "IN", values: ["Alpha", "Gamma"] },
    });
    expect(result.rows).toHaveLength(2);
  });
});
```

```typescript
// Example: AggregateFunctionType tests
describe("AggregateFunctionType", () => {
  const ds = createTypedDataSet({
    columns: [
      { id: "region" as ColumnId, name: "Region", type: ColumnType.LABEL },
      { id: "revenue" as ColumnId, name: "Revenue", type: ColumnType.NUMBER },
    ],
    rows: [
      ["East", 100], ["East", 200], ["West", 150],
    ],
  });

  it("SUM aggregates numeric column", () => {
    const result = applyAggregate(ds, {
      type: "aggregate",
      columnId: "revenue" as ColumnId,
      function: "SUM",
    });
    expect(result).toBe(450);
  });

  it("JOIN_COMMA concatenates with comma separator", () => {
    const result = applyAggregate(ds, {
      type: "aggregate",
      columnId: "region" as ColumnId,
      function: "JOIN_COMMA",
    });
    expect(result).toBe("East,East,West");
  });

  it("MEDIAN returns middle value", () => {
    const result = applyAggregate(ds, {
      type: "aggregate",
      columnId: "revenue" as ColumnId,
      function: "MEDIAN",
    });
    expect(result).toBe(150);
  });
});
```

```typescript
// Example: IntervalBuilderFixedDate tests
describe("IntervalBuilderFixedDate", () => {
  it("QUARTER produces 4 buckets and assigns dates correctly", () => {
    const dates = [
      new Date("2024-01-15T00:00:00Z"),  // Q1
      new Date("2024-04-10T00:00:00Z"),  // Q2
      new Date("2024-07-20T00:00:00Z"),  // Q3
      new Date("2024-11-05T00:00:00Z"),  // Q4
    ];
    const intervals = buildFixedIntervals(DateIntervalType.QUARTER, dates);
    expect(intervals).toHaveLength(4);
    expect(intervals[0].rows).toContain(dates[0]);
    expect(intervals[1].rows).toContain(dates[1]);
    expect(intervals[2].rows).toContain(dates[2]);
    expect(intervals[3].rows).toContain(dates[3]);
  });

  it("DAY_OF_WEEK produces 7 buckets", () => {
    const intervals = buildFixedIntervals(DateIntervalType.DAY_OF_WEEK, sampleDates);
    expect(intervals).toHaveLength(7);
  });

  it("uses UTC arithmetic -- no timezone drift", () => {
    // A date at 23:00 UTC should not shift to the next day
    const lateDate = new Date("2024-03-31T23:00:00Z");
    const intervals = buildFixedIntervals(DateIntervalType.MONTH, [lateDate]);
    expect(intervals[2].rows).toContain(lateDate); // March = index 2
  });
});
```

```typescript
// Example: LogicalExprFilter composition tests
describe("LogicalExprFilter", () => {
  it("AND of two filters returns intersection", () => {
    const filter: LogicalFilter = {
      type: "logical",
      operator: "AND",
      terms: [
        { type: "filter", columnId: "revenue" as ColumnId,
          columnType: ColumnType.NUMBER, filter: { fn: "GREATER_THAN", value: 50 } },
        { type: "filter", columnId: "revenue" as ColumnId,
          columnType: ColumnType.NUMBER, filter: { fn: "LOWER_THAN", value: 200 } },
      ],
    };
    const result = applyFilter(ds, filter);
    // Only rows with 50 < revenue < 200
    expect(result.rows.every(r => {
      const v = r.number("revenue" as ColumnId);
      return v > 50 && v < 200;
    })).toBe(true);
  });

  it("NOT inverts a filter result", () => {
    const filter: LogicalFilter = {
      type: "logical",
      operator: "NOT",
      terms: [
        { type: "filter", columnId: "name" as ColumnId,
          columnType: ColumnType.TEXT, filter: { fn: "EQUALS_TO", value: "Acme" } },
      ],
    };
    const result = applyFilter(ds, filter);
    expect(result.rows.every(r =>
      r.text("name" as ColumnId) !== "Acme"
    )).toBe(true);
  });

  it("nested AND(OR(a,b), NOT(c)) evaluates correctly", () => {
    const filter: LogicalFilter = {
      type: "logical",
      operator: "AND",
      terms: [
        {
          type: "logical", operator: "OR",
          terms: [
            { type: "filter", columnId: "region" as ColumnId,
              columnType: ColumnType.TEXT, filter: { fn: "EQUALS_TO", value: "East" } },
            { type: "filter", columnId: "region" as ColumnId,
              columnType: ColumnType.TEXT, filter: { fn: "EQUALS_TO", value: "West" } },
          ],
        },
        {
          type: "logical", operator: "NOT",
          terms: [
            { type: "filter", columnId: "revenue" as ColumnId,
              columnType: ColumnType.NUMBER, filter: { fn: "LOWER_THAN", value: 100 } },
          ],
        },
      ],
    };
    const result = applyFilter(ds, filter);
    // Only East or West regions, with revenue >= 100
    for (const row of result.rows) {
      expect(["East", "West"]).toContain(row.text("region" as ColumnId));
      expect(row.number("revenue" as ColumnId)).toBeGreaterThanOrEqual(100);
    }
  });
});
```

**Coverage target:** 95%+ line coverage for `packages/core/src/dataset/`, `packages/core/src/yaml/`, `packages/core/src/expression/`, `packages/core/src/filter/`, `packages/core/src/interval/`, `packages/core/src/lookup/`.

### Layer 2: Component Tests (Vitest + React Testing Library)

React components rendered in jsdom -- tests the component contract, not the browser.

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

### Layer 3: Integration Tests (Vitest)

Subsystem interactions -- multiple units working together, but no browser.

| Integration | What's tested | Example assertions |
|-------------|--------------|-------------------|
| YAML -> RuntimeModel -> DashboardRenderer | Full parsing pipeline to rendered component tree | Parse YAML string, produce RuntimeModel, render layout, verify correct number of rows/columns/components |
| DataSetManager -> DataProvider -> Cache | Fetch, cache, serve from cache, refresh | First fetch calls provider; second fetch serves from cache; after TTL expiry re-fetches; concurrent requests coalesced |
| FilterStateManager -> useDataSet -> Component re-render | Cross-component filter propagation | Chart A filters column X; Chart B re-renders with filtered data; Chart A reset restores Chart B to full data |
| PluginRegistry -> FederatedLoader | Module Federation loading | Load federated module from mock remote; register component; render via PluginHost (uses Vite test server for MF remotes) |
| PluginRegistry -> IframeLoader | iframe postMessage protocol | Load iframe component; send INIT message; send DATASET message; receive FILTER message back |
| DataService -> LocalDataService -> IndexedDB | Persistence round-trip | Save dashboard; close and reopen IndexedDB; load dashboard; verify content identical (uses `fake-indexeddb` in tests) |
| DataService -> HybridDataService | Server fallback | With mock server: queries go to server. Server down: falls back to local. Server returns: syncs queued operations |
| Schema generation | Zod -> JSON Schema -> validation | Generate JSON Schema from Zod; validate known-good YAML against JSON Schema; validate known-bad YAML produces errors |

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

### Layer 4: End-to-End Tests (Playwright)

Real browser, real rendering, real interactions. This is where we prove the system works -- not guess.

| Test suite | What's tested | How |
|------------|--------------|-----|
| **Dashboard rendering** | Every example dashboard renders correctly | Load each YAML from `examples/dashboards/`, wait for all components to render, take screenshot, compare against baseline |
| **Chart correctness -- bar** | Bar charts display correct data | Load known dataset, render bar chart, assert SVG has correct number of `<rect>` elements with correct heights/widths proportional to data values |
| **Chart correctness -- area** | Area charts render filled regions | Load known dataset, render area chart, assert SVG contains `<path>` elements with correct fill areas corresponding to data series |
| **Chart correctness -- bubble** | Bubble charts map three dimensions | Load known dataset (x, y, size), render bubble chart, assert circles have positions and radii proportional to data values |
| **Chart correctness -- scatter** | Scatter plots position points correctly | Load known dataset, render scatter chart, assert point positions correspond to x/y data values |
| **Chart correctness -- timeseries** | Timeseries charts render temporal data | Load time-indexed dataset, render timeseries, assert x-axis labels match date intervals, data points align with temporal values |
| **Chart correctness -- meter** | Meter/gauge charts display value | Load known single-value dataset, render meter chart, assert gauge needle/fill level corresponds to data value within min/max range |
| **Table correctness** | Tables display correct data | Load known dataset, render table, assert correct number of rows, correct cell contents, correct column headers |
| **Navigation components -- TABLIST** | Tab navigation switches pages | Render multi-page dashboard with TABLIST navigation, click each tab, verify correct page content displays |
| **Navigation components -- CAROUSEL** | Carousel cycles through pages | Render dashboard with CAROUSEL navigation, click next/previous, verify page transitions and wrapping at boundaries |
| **Navigation components -- TREE** | Tree navigation expands and navigates | Render dashboard with TREE navigation, expand tree nodes, click leaf nodes, verify correct page loads |
| **Navigation components -- MENUBAR** | Menu navigation selects pages | Render dashboard with MENUBAR navigation, click menu items, verify correct page renders, verify dropdown submenus |
| **Navigation components -- TILES** | Tile navigation grid displays and navigates | Render dashboard with TILES navigation, verify tile grid layout, click tile, verify correct page loads |
| **Filter interaction** | Cross-component filtering works | Click bar in chart A -> table B updates to show filtered rows -> selector C updates to show selected value -> reset button restores all |
| **Editor drag-and-drop** | Layout editing works | Open editor, drag component from palette to canvas, verify it appears; drag to reorder, verify new order; resize column, verify span changes |
| **Editor settings** | Settings panel modifies component | Select component in editor, change title in settings panel, verify title updates in preview; change chart type, verify component swaps |
| **Deep linking** | URL navigation works | Navigate to `/dashboard/sales/page/revenue`, verify correct page rendered; use browser back, verify previous page; bookmark URL, reload, verify same state |
| **Offline resilience** | App works without network | Load dashboard, go offline (network emulation), reload page, verify dashboard renders from IndexedDB cache; go online, verify fresh data loads |
| **Plugin loading (MF)** | Module Federation plugins load and render | Start MF remote dev server, load dashboard referencing federated plugin, verify plugin renders correctly and responds to filter events |
| **Plugin loading (iframe)** | iframe plugins load and communicate | Load dashboard with iframe plugin, verify postMessage INIT received, verify DATASET renders, verify FILTER sends back to host |
| **Plugin crash isolation** | Bad plugin doesn't break dashboard | Load dashboard where one plugin throws, verify error boundary shows error card, verify other components still render and interact |
| **setup.js compatibility** | Legacy configuration works | Configure `window.melviz` with dashboards array, load app, verify correct dashboards loaded |
| **postMessage API** | Dynamic YAML loading works | Load app, postMessage YAML string, verify dashboard renders |
| **Export -- CSV** | CSV export produces valid output | Render table component, trigger CSV export, verify downloaded file is valid CSV with correct headers and data rows matching displayed table |
| **Export -- PNG** | PNG export captures component | Render chart component, trigger PNG export, verify downloaded file is a valid PNG image with non-zero dimensions |
| **Export -- XLS** | XLS export produces valid spreadsheet | Render table component, trigger XLS export, verify downloaded file is a valid spreadsheet with correct sheet structure and cell values |
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

    // Verify proportions match data (100, 250, 50 -> heights proportional)
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

// Example: navigation component test
test.describe("Navigation components", () => {
  test("TABLIST switches pages on click", async ({ page }) => {
    await page.goto("/test-fixtures/tabbed-dashboard");
    await page.waitForSelector("[data-nav-type='TABLIST']");

    // First tab active by default
    const firstTabContent = await page.locator("[data-page-name='Overview']").textContent();
    expect(firstTabContent).toBeTruthy();

    // Click second tab
    await page.locator("[data-nav-type='TABLIST'] [role='tab']").nth(1).click();

    // Second page content visible, first hidden
    await page.waitForSelector("[data-page-name='Details']", { state: "visible" });
    await expect(page.locator("[data-page-name='Overview']")).not.toBeVisible();
  });

  test("CAROUSEL wraps at boundaries", async ({ page }) => {
    await page.goto("/test-fixtures/carousel-dashboard");
    await page.waitForSelector("[data-nav-type='CAROUSEL']");

    // Navigate to last page
    const pageCount = await page.locator("[data-carousel-indicator]").count();
    for (let i = 1; i < pageCount; i++) {
      await page.locator("[data-carousel-next]").click();
    }

    // One more click wraps to first page
    await page.locator("[data-carousel-next]").click();
    await expect(page.locator("[data-carousel-indicator]").first())
      .toHaveAttribute("aria-selected", "true");
  });
});

// Example: export tests
test.describe("Export functionality", () => {
  test("CSV export produces valid CSV with correct data", async ({ page }) => {
    await page.goto("/test-fixtures/table-with-export");
    await page.waitForSelector("[data-component-type='TABLE']");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("[data-action='export-csv']").click(),
    ]);

    const content = await download.createReadStream().then(stream => {
      return new Promise<string>((resolve) => {
        let data = "";
        stream.on("data", chunk => data += chunk);
        stream.on("end", () => resolve(data));
      });
    });

    const lines = content.trim().split("\n");
    expect(lines[0]).toContain("Name");     // header row
    expect(lines.length).toBeGreaterThan(1); // data rows present
    // Each line has same number of commas (consistent columns)
    const commaCount = lines[0].split(",").length;
    for (const line of lines) {
      expect(line.split(",").length).toBe(commaCount);
    }
  });
});
```

### Layer 5: Backend Tests (Quarkus -- JUnit 5 + Testcontainers)

Real databases, real message brokers -- no mocking data sources.

| Test suite | What's tested | Infrastructure |
|------------|--------------|---------------|
| SQL DataProvider | Query generation, filter push-down, group-by, sort | Testcontainers PostgreSQL with seeded test data |
| SqlQueryBuilder | SQL generation correctness | Unit tests (no DB needed) -- asserts generated SQL and parameter list |
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

### Layer 6: Feature Parity Tests (Playwright)

The migration-specific test suite that proves the new system does everything the old system did.

| Test | Approach |
|------|----------|
| Every example dashboard | Load each YAML from `examples/dashboards/` in the new app, screenshot, compare against baseline captured from the GWT app |
| setup.js modes | Test CLIENT mode, EDITOR mode, samples mode, dashboard list mode -- all via setup.js configuration |
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

---

## Test Infrastructure

| Tool | Purpose | Layer |
|------|---------|-------|
| Vitest | Unit tests, component tests, integration tests | Layers 1-3 |
| React Testing Library | React component rendering in jsdom | Layer 2 |
| `fake-indexeddb` | IndexedDB mock for Node.js tests | Layers 2-3 |
| `msw` (Mock Service Worker) | HTTP request interception for integration tests | Layer 3 |
| DOMPurify | Sanitization of HTML template content; tests verify that injected HTML in markdown components, custom HTML templates, and user-provided content is sanitized before rendering -- XSS payloads in `<script>`, `onerror`, `javascript:` URIs are stripped | Layers 2-3 |
| Playwright | E2E browser tests | Layers 4, 6 |
| JUnit 5 | Backend unit and integration tests | Layer 5 |
| Testcontainers | Real PostgreSQL, Kafka, Elasticsearch in tests | Layer 5 |
| WireMock | HTTP mock for Prometheus, upstream APIs | Layer 5 |
| REST Assured | REST API contract testing | Layer 5 |
| `expect-type` | Compile-time type assertion tests | Layer 1 |

---

## CI Pipeline

```
+---------------------------------------------------------+
| CI Pipeline (every PR)                                  |
+---------------------------------------------------------+
|                                                         |
|  1. Type check         tsc --noEmit                    |
|  2. Lint               eslint (no-any enforcement)     |
|  3. Unit tests         vitest run (layers 1-3)         |
|  4. Schema validation  generate schemas, validate      |
|  5. Build              vite build (must succeed)       |
|  6. E2E tests          playwright test (layer 4)       |
|  7. Backend tests      mvn test (layer 5, if changed)  |
|  8. Parity tests       playwright parity suite         |
|                                                         |
|  Any failure blocks merge.                             |
+---------------------------------------------------------+
```

---

## Coverage Requirements

| Package | Minimum line coverage |
|---------|----------------------|
| `packages/core/src/dataset/` | 95% |
| `packages/core/src/yaml/` | 95% |
| `packages/core/src/expression/` | 95% |
| `packages/core/src/filter/` | 95% |
| `packages/core/src/interval/` | 95% |
| `packages/core/src/lookup/` | 95% |
| `packages/core/src/plugin/` | 90% |
| `packages/core/src/services/` | 90% |
| `packages/editor/` | 85% |
| `app/src/` | 80% |
| `server/` (Java) | 90% |
| Overall | 90% |

---

## TDD Workflow

Every feature follows Red-Green-Refactor:

1. **Write the test first** -- define what the function/component should do
2. **Run it -- it fails** (red)
3. **Write the minimum implementation** to make it pass (green)
4. **Refactor** -- clean up without changing behaviour, tests still pass
5. **Add edge case tests** -- null inputs, empty datasets, malformed YAML, concurrent requests
6. **Add robustness tests** -- what happens when the network drops mid-fetch? When IndexedDB is full? When a plugin crashes during render?

This is not optional for any phase. Phase 1 doesn't ship "core skeleton + we'll add tests later." Phase 1 ships "core skeleton where every function has tests that prove it works."
