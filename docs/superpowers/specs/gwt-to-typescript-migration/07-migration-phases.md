# 07 -- Migration Strategy and Phasing

## 1. Approach: Clean Rewrite

TypeScript core built from scratch alongside the existing GWT core. Both coexist in the repository throughout development. Switchover happens at feature parity, validated by automated comparison.

## 2. Phases

### Phase 1: TypeScript Core Skeleton

- `packages/core/` -- DataSet model, TypedDataSet, DataSetLookup, Zod schemas, YAML parser, expression evaluator
- Complete filter model (all 13 CoreFunctionType, recursive FilterExpression)
- Complete aggregation model (all 10 AggregateFunctionType with result-type inference)
- Date interval builders (IntervalBuilderFixed, IntervalBuilderDynamic)
- GroupOp with FIXED/DYNAMIC/CUSTOM strategies
- `app/` -- Vite app shell, React Router, MelvizProvider
- Type safety infrastructure (tsconfig strict, ESLint no-any, bridge pattern)
- JSON Schema generation pipeline
- LocalDataService with IndexedDB persistence
- TDD: unit tests for every operation, Vitest

### Phase 2: Port Displayers

- All 13 DisplayerType settings interfaces
- All 20 DisplayerSubType structural decompositions
- Table, selector, metric as React components
- Evolve component-api from postMessage bridge to React hooks
- Migrate echarts, svg-heatmap, llm-prompter to direct imports
- PluginHost with error boundaries
- Navigation components (CAROUSEL, MENUBAR, TABLIST, TREE, TILES)
- Export functionality (CSV, PNG, XLS)
- HTML template support (DOMPurify sanitized, JS_TEMPLATE dropped)
- TDD: component tests with React Testing Library

### Phase 3: Plugin System

- Module Federation 2.0 loader
- iframe fallback loader
- PluginRegistry with capability-based matching
- DataProviderRegistry with pluggable providers
- Plugin authoring template and documentation
- TDD: integration tests for plugin loading

### Phase 4: Layout Editor

- `packages/editor/` -- @dnd-kit/core
- Auto-generated settings panels from Zod schemas
- DataSetLookupConstraints validation
- Capability-aware column assignment
- TDD: component tests + Playwright E2E for drag-and-drop

### Phase 5: Quarkus Backend

- `server/` -- REST API, DataProvider SPI
- SQL, Prometheus, Kafka, Elasticsearch providers
- DataSetCache (Caffeine), Dashboard persistence
- HybridDataService with conflict resolution
- TDD: JUnit 5 + Testcontainers

### Phase 6: Feature Parity Validation and Switchover

- Run all example dashboards through new app
- Playwright screenshot baselines compared against GWT app
- Validate postMessage API, setup.js compatibility
- Validate settings key-path backward compatibility
- Delete `core/`, `webapp/`, remove Maven from build
- Update CLAUDE.md, README, CI

## 3. Phase Dependencies

```
Phase 1 -----> Phase 2 -----> Phase 4
                    \-------> Phase 3
Phase 1 -----> Phase 5
All -----------------------------> Phase 6
```

Phases 2, 3, and 5 can run in parallel after Phase 1. Phase 4 depends on Phase 2 (needs displayers to edit). Phase 6 is the final gate after all others complete.

The dependency graph visualised as a timeline:

```
            |  Phase 1  |
            +-----------+
                 |
       +---------+---------+
       |         |         |
  Phase 2    Phase 3    Phase 5
       |
  Phase 4
       |
       +---------+---------+
                 |
            Phase 6
```

## 4. During Development

- Both cores exist in the repo simultaneously
- TypeScript core developed and tested independently of the GWT core
- GWT core remains the "production" path until switchover
- Each phase is independently testable -- no phase requires another to be complete before its own tests pass
- CI runs both test suites throughout the migration period

## 5. Breaking Changes Log

Deliberate breaking changes from the GWT version, tracked here for migration awareness:

| Change | Reason | Backward Compatibility |
|--------|--------|----------------------|
| JS_TEMPLATE dropped | Security: eval-based execution | None -- intentionally removed |
| `layoutTemplates` renamed to `pages` | Clearer naming | Maintained via Zod transform |
| `clientDataSets` renamed to `datasets` | Clearer naming | Maintained via Zod transform |
| Settings key paths use structural types | Replace flat `Map<String, String>` | Maintained via YAML nesting |
| `@Inject`/CDI replaced by React context | Internal architecture change | Not needed -- internal only |
