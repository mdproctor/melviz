# 04 -- Application Shell

**Parent:** [00-overview.md](00-overview.md)
**Depends on:** [01-core-engine.md](01-core-engine.md) (DataSet model, TypedDataSet), [03-schema-system.md](03-schema-system.md) (Zod schemas), [04-displayer-plugin-system.md](04-displayer-plugin-system.md) (PluginRegistry, ComponentCapabilities)

---

## 1. React Router

The GWT app uses a hand-rolled `PlaceManager` that maintains a `Map<String, Place>` of screens (EmptyScreen, ContentErrorScreen, DashboardsListScreen, RuntimeScreen, SamplesScreen, NotFoundScreen) and renders them by swapping DOM children. There is no URL history, no deep linking, no back/forward support, and no lazy loading. The `Router` class dispatches based on `RuntimeClientSetup` configuration and URL query parameters (`?import=`, `?samples`), using full page navigations (`window.location.href = ...`) for cross-screen transitions.

React Router replaces both `PlaceManager` and `Router` with declarative route definitions, client-side navigation, and `React.lazy()` code splitting.

### Route Definitions

```typescript
const routes = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorScreen />,
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: 'dashboards', element: <DashboardsListScreen /> },
      {
        path: 'dashboard/:id',
        element: <DashboardScreen />,
        children: [
          { path: 'page/:pageId', element: <DashboardPage /> },
        ],
      },
      { path: 'editor', element: <EditorScreen /> },
      { path: 'editor/:id', element: <EditorScreen /> },
      { path: 'samples', element: <SamplesScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
]);
```

`HomeRedirect` replaces the `Router.doRoute()` dispatch logic -- it reads the `MelvizConfig` from context and redirects to the appropriate screen based on mode, dashboard count, and `samplesDefaultHome` setting.

### App.tsx Structure

```typescript
function App() {
  return (
    <MelvizProvider config={config}>
      <Suspense fallback={<LoadingIndicator />}>
        <Outlet />
      </Suspense>
    </MelvizProvider>
  );
}
```

Every route is lazy-loaded. `Suspense` shows a loading indicator during chunk fetches. `ErrorBoundary` (via `errorElement`) catches render failures and shows a structured error screen rather than the current approach of routing to `ContentErrorScreen` via imperative `placeManager.goTo()` calls.

### Deep Linking

URLs like `/dashboard/sales-q4/page/revenue` are directly loadable -- no `?import=` query parameter workaround. The `DashboardScreen` component loads the dashboard model from the URL parameter, and `DashboardPage` navigates to the correct page within the `NavTree`. Back/forward browser navigation works natively.

---

## 2. MelvizProvider -- Replacing Errai CDI

The GWT app uses Errai CDI with 364 `@Inject` annotations across the codebase and 5 `@Observes` event handlers. Beans are discovered at runtime, dependencies are resolved implicitly, and the injection graph is not statically analysable.

`MelvizProvider` replaces this with a single React context that holds all application-wide state and services. Every injection point becomes an explicit hook call.

### MelvizContext Interface

```typescript
interface MelvizContext {
  readonly config: MelvizConfig;
  readonly registry: PluginRegistry;
  readonly dataSetManager: DataSetManager;
  readonly filterState: FilterStateManager;
  readonly dataService: DataService;
  readonly mode: MelvizRuntimeMode;
}
```

### Typed Hooks

Each context slice has a dedicated hook. Components import only the hooks they need rather than the entire context:

```typescript
function usePluginRegistry(): PluginRegistry;
function useDataSetManager(): DataSetManager;
function useFilterState(): FilterStateManager;
function useDataService(): DataService;
function useMelvizMode(): MelvizRuntimeMode;
```

These hooks throw if called outside `MelvizProvider` -- a compile-time-like check enforced at the React tree boundary rather than at CDI bootstrap.

### What This Replaces

| Errai CDI Pattern | React Equivalent |
|---|---|
| `@Inject RuntimeClientLoader` | `const ds = useDataService()` |
| `@Inject RendererManager` | `const reg = usePluginRegistry()` |
| `@Inject DisplayerCoordinator` | `const filters = useFilterState()` |
| `@Inject NavigationManager` | Route params + `useNavigate()` |
| `@Inject BusyIndicator` | `Suspense` boundary + loading state |
| `@Observes UpdatedRuntimeModelEvent` | `useSyncExternalStore` on config |
| `IOC.getBeanManager().destroyBean()` | Component unmount lifecycle |

---

## 3. FilterStateManager

The GWT app coordinates cross-component filtering through `DisplayerCoordinator`, which maintains a list of `Displayer` instances and a `CoordinatorListener` inner class. When one displayer fires a filter event (`onFilterEnabled`, `onFilterReset`, `onFilterUpdate`), the coordinator broadcasts it to all other displayers via the `DisplayerListener` interface. The notification veto map (`notificationVetoMap`) prevents circular filter loops.

This design has three problems:
1. **Implicit ordering** -- listeners fire in list insertion order, which is non-deterministic from the dashboard author's perspective.
2. **Not inspectable** -- there is no way to query "what filters are currently active?" without iterating every displayer.
3. **Coupled to the displayer lifecycle** -- filter state is lost when a displayer is closed and recreated (e.g., during page navigation).

### FilterStateManager Design

```typescript
interface FilterEntry {
  readonly source: ComponentId;
  readonly dataSetId: DataSetId;
  readonly filter: TypedFilter;
  readonly timestamp: number;
}

interface FilterStateManager {
  /** Apply a filter from a component. Replaces any existing filter from the same source. */
  applyFilter(source: ComponentId, dataSetId: DataSetId, filter: TypedFilter): void;

  /** Remove all filters from a specific component. */
  resetFilters(source: ComponentId): void;

  /** Get all active filters for a given dataset. */
  getFilters(dataSetId: DataSetId): readonly FilterEntry[];

  /** Get all active filters across all datasets. */
  getAllFilters(): readonly FilterEntry[];

  /** Subscribe to filter changes. Returns unsubscribe function. */
  subscribe(listener: (filters: readonly FilterEntry[]) => void): () => void;
}
```

### useFilters Hook

Components interact with the filter system through a single hook:

```typescript
function useFilters(dataSetId: DataSetId): {
  /** Current filters applied to this dataset by other components */
  readonly activeFilters: readonly FilterEntry[];
  /** Apply a filter from this component */
  readonly applyFilter: (filter: TypedFilter) => void;
  /** Clear this component's filters */
  readonly resetFilters: () => void;
};
```

The hook derives the component ID from React context (set by `ComponentSlot`) and scopes filter operations to the component's dataset. This replaces the `DisplayerCoordinator` broadcast pattern with targeted subscriptions -- a component only re-renders when filters affecting its dataset change.

### Interaction with DataSetLookup

When `useFilters` reports active filters, the `useDataSet` hook (from the core engine) merges them into the `DataSetLookup` request before execution. This replaces the GWT pattern where `AbstractDisplayer.beforeDataSetLookup()` modifies the lookup in-place.

---

## 4. Dashboard Renderer

The GWT app renders dashboards through `RuntimePerspectivePluginManager`, which converts `LayoutTemplate` objects into UberFire perspectives. Each perspective renders rows and columns using the uberfire-layout-editor-client framework, which maps `LayoutColumn.span` values to Bootstrap grid column classes.

### Layout Model

The existing Java layout model maps directly to TypeScript:

```typescript
interface LayoutTemplate {
  readonly name: string;
  readonly style: 'PAGE' | 'FLUID';
  readonly properties: Record<string, string>;
  readonly rows: readonly LayoutRow[];
}

interface LayoutRow {
  readonly height?: string;
  readonly properties: Record<string, string>;
  readonly columns: readonly LayoutColumn[];
}

interface LayoutColumn {
  readonly span: string;                          // "1" through "12"
  readonly height?: string;
  readonly properties: Record<string, string>;
  readonly rows: readonly LayoutRow[];            // nested rows (recursive)
  readonly components: readonly LayoutComponent[];
}

interface LayoutComponent {
  readonly dragTypeName: string;
  readonly properties: Record<string, string>;
  readonly parts: readonly LayoutComponentPart[];
  readonly settings?: unknown;
}
```

The `LayoutColumn.span` field maps to Tailwind's 12-column grid. A column with `span: "6"` becomes `col-span-6` in a `grid-cols-12` container, which is functionally identical to Bootstrap's `col-6`.

### DashboardRenderer Component

```typescript
function DashboardRenderer({ template }: { template: LayoutTemplate }) {
  return (
    <div className={template.style === 'PAGE' ? 'max-w-screen-xl mx-auto' : 'w-full'}>
      {template.rows.map((row, i) => (
        <LayoutRowRenderer key={i} row={row} />
      ))}
    </div>
  );
}

function LayoutRowRenderer({ row }: { row: LayoutRow }) {
  return (
    <div className="grid grid-cols-12 gap-4" style={row.height ? { height: row.height } : undefined}>
      {row.columns.map((col, i) => (
        <LayoutColumnRenderer key={i} column={col} />
      ))}
    </div>
  );
}

function LayoutColumnRenderer({ column }: { column: LayoutColumn }) {
  return (
    <div className={`col-span-${column.span}`}>
      {column.rows.length > 0
        ? column.rows.map((row, i) => <LayoutRowRenderer key={i} row={row} />)
        : column.components.map((comp, i) => <ComponentSlot key={i} component={comp} />)
      }
    </div>
  );
}
```

### ComponentSlot

`ComponentSlot` is the bridge between the layout tree and the plugin system. It resolves the component from the `PluginRegistry`, manages loading/error/data states, and provides the filter context for `useFilters`:

```typescript
function ComponentSlot({ component }: { component: LayoutComponent }) {
  const registry = usePluginRegistry();
  const plugin = registry.get(component.dragTypeName);

  if (!plugin) {
    return <ComponentError message={`Unknown component: ${component.dragTypeName}`} />;
  }

  return (
    <ComponentContext.Provider value={{ componentId: component.dragTypeName, properties: component.properties }}>
      <PluginErrorBoundary componentId={component.dragTypeName}>
        <Suspense fallback={<ComponentLoading />}>
          <PluginHost plugin={plugin} properties={component.properties} settings={component.settings} />
        </Suspense>
      </PluginErrorBoundary>
    </ComponentContext.Provider>
  );
}
```

`PluginHost` is defined in [04-displayer-plugin-system.md](04-displayer-plugin-system.md). `ComponentSlot` sets up the surrounding context and error handling.

---

## 5. Layout Editor

The GWT layout editor uses uberfire-layout-editor-client (~3K LOC custom drag-and-drop implementation) with `LayoutDragComponentHelper` for component palette management. The editor allows adding rows, resizing columns (by changing `span` values), and dragging displayer components into column slots.

### Drag-and-Drop

`@dnd-kit/core` replaces the custom DnD implementation. It provides accessible drag-and-drop out of the box (keyboard navigation, screen reader announcements) and is ~8KB gzipped.

```typescript
function LayoutEditor({ template, onChange }: LayoutEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex">
        <ComponentPalette />
        <EditableLayout template={template} onChange={onChange} />
      </div>
    </DndContext>
  );
}
```

### Settings Panels from Zod Schemas

The GWT editor has hand-wired settings panels for each displayer type. The TypeScript editor auto-generates settings panels from the component's Zod `settingsSchema` (defined in [03-schema-system.md](03-schema-system.md)):

```typescript
function SettingsPanel({ plugin, settings, onChange }: SettingsPanelProps) {
  const schema = plugin.settingsSchema;
  const shape = schema._def.shape();

  return (
    <div className="space-y-4 p-4">
      {Object.entries(shape).map(([key, fieldSchema]) => (
        <SchemaField
          key={key}
          name={key}
          schema={fieldSchema as z.ZodType}
          value={settings[key]}
          onChange={(value) => onChange({ ...settings, [key]: value })}
        />
      ))}
    </div>
  );
}
```

`SchemaField` introspects the Zod type to render the appropriate input: `z.string()` renders a text input, `z.enum()` renders a select, `z.number()` renders a number input with min/max from `.min()`/`.max()`, `z.boolean()` renders a toggle. Nested `z.object()` renders a collapsible group.

### Capability-Aware Column Assignment

The GWT editor allows dragging any component into any column. The TypeScript editor uses `ComponentCapabilities.columnRequirements` (from the plugin system) to validate assignments:

```typescript
function isValidDrop(plugin: RegisteredPlugin, availableColumns: ColumnDefinition[]): boolean {
  const required = plugin.capabilities.columnRequirements;
  return required.every(req =>
    availableColumns.some(col => col.type === req.type && !col.assigned)
  );
}
```

Invalid drops are visually indicated (greyed-out drop zones) rather than silently accepted and failing at render time.

### DataSetLookupConstraints in the Editor

The editor validates `DataSetLookup` configurations against the component's declared constraints. If a component requires at least one `NUMBER` column for aggregation but the selected dataset has none, the editor shows a validation message immediately rather than waiting for a render-time error.

---

## 6. UI Primitives -- Tailwind + Radix UI

The GWT app uses 15 PatternFly component wrappers in `melviz-patternfly/`: Alert, BusyIndicator, Button, Code, DatePicker, Label, Menu, Pagination, Panel, Select, Slider, Tab, Table, TextBox, Title. These are GWT Java wrappers around PatternFly CSS classes, implemented as Errai `@Templated` views.

The migration does not attempt to replicate PatternFly's visual appearance. PatternFly was inherited from the Red Hat / UberFire ecosystem -- Melviz has no brand identity tied to it. This is an opportunity for a visual refresh.

### Approach

Two layers replace PatternFly:

**Tailwind CSS** -- utility-first styling with no component library lock-in. Every UI element is styled with composable utility classes. There is no CSS framework to outgrow, no version-upgrade-breaking-changes cycle, and theming is a `tailwind.config.ts` change.

**Radix UI Primitives** -- headless (unstyled) accessible components for interactive UI patterns that are difficult to implement correctly from scratch: focus management, keyboard navigation, ARIA attributes, scroll locking, dismiss-on-click-outside. Radix provides the behaviour; Tailwind provides the appearance.

### Mapping

| PatternFly Component | Replacement | Why |
|---|---|---|
| Alert | Tailwind `div` with role="alert" | Simple enough without a library |
| BusyIndicator | React `Suspense` + Tailwind spinner | Built into React's loading model |
| Button | Tailwind `button` | Styling only |
| Code | Tailwind `pre`/`code` | Styling only |
| DatePicker | Radix Popover + custom date grid | Accessible popup with keyboard nav |
| Label | Tailwind `span` with badge styling | Styling only |
| Menu | Radix DropdownMenu | Focus management, keyboard nav, submenus |
| Pagination | Tailwind buttons + logic | Simple enough without a library |
| Panel | Tailwind `div` with card styling | Styling only |
| Select | Radix Select | Accessible, keyboard-navigable, virtual scrolling |
| Slider | Radix Slider | Accessible range input with ARIA |
| Tab | Radix Tabs | Keyboard navigation, ARIA tab pattern |
| Table | Tailwind `table` | Styling only |
| TextBox | Tailwind `input` | Styling only |
| Title | Tailwind heading | Styling only |

Of the 15, only 4 (DatePicker, Menu, Select, Slider, Tab) need Radix. The other 11 are pure Tailwind styling.

Additional Radix primitives used elsewhere in the app: Dialog (for modals), Tooltip (for hover hints), Toggle (for boolean settings).

### Design System

The `packages/ui/` package exports a small set of Melviz-specific components built on Tailwind + Radix. These are not a general-purpose component library -- they are the specific primitives this app needs:

```
packages/ui/
  src/
    Button.tsx
    Dialog.tsx
    DropdownMenu.tsx
    Select.tsx
    Slider.tsx
    Tabs.tsx
    Tooltip.tsx
    DataTable.tsx
    LoadingIndicator.tsx
    ErrorMessage.tsx
    Badge.tsx
    index.ts
  tailwind.config.ts
  package.json
```

---

## 7. Export Functionality

The GWT app supports three export types via `DisplayerSettings`: `EXPORT_TO_CSV` (`export.export_csv`), `EXPORT_TO_XLS` (`export.export_xls`), and `EXPORT_TO_PNG` (`export.png`). These are boolean settings in the `EXPORT_GROUP` attribute group. The deprecated aliases `ALLOW_EXPORT_CSV` and `ALLOW_EXPORT_EXCEL` from the `GENERAL_GROUP` are also accepted for backward compatibility.

### ExportSettings Type

```typescript
export interface ExportSettings {
  readonly csv: boolean;
  readonly xls: boolean;
  readonly png: boolean;
}

// Zod schema with backward-compatible aliases
const exportSettingsSchema = z.object({
  export_csv: z.boolean().default(false),
  export_xls: z.boolean().default(false),
  png: z.boolean().default(false),
  // Deprecated aliases from GENERAL_GROUP
  allow_csv: z.boolean().optional(),
  allow_excel: z.boolean().optional(),
}).transform(raw => ({
  csv: raw.export_csv || raw.allow_csv || false,
  xls: raw.export_xls || raw.allow_excel || false,
  png: raw.png,
}));
```

### Implementation

**CSV -- Papa Parse `unparse()`:**

```typescript
function exportCsv(dataSet: TypedDataSet, filename: string): void {
  const header = dataSet.columns.map(c => c.name);
  const rows = dataSet.rows.map(row =>
    dataSet.columns.map((_, i) => formatCellValue(row[i]))
  );
  const csv = Papa.unparse({ fields: header, data: rows });
  downloadBlob(new Blob([csv], { type: 'text/csv' }), `${filename}.csv`);
}
```

Papa Parse is already a dependency for CSV data source parsing. `unparse()` handles quoting, escaping, and newlines correctly.

**PNG -- html2canvas:**

```typescript
async function exportPng(element: HTMLElement, filename: string): Promise<void> {
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2,  // retina-quality export
  });
  canvas.toBlob(blob => {
    if (blob) downloadBlob(blob, `${filename}.png`);
  });
}
```

`html2canvas` captures the component's DOM element (the `ComponentSlot` container) as a canvas. The `scale: 2` parameter produces high-DPI output. This is a lazy-loaded dependency -- it is only fetched when the user clicks the PNG export button.

**XLS -- SheetJS (`xlsx` package):**

```typescript
function exportXls(dataSet: TypedDataSet, filename: string): void {
  const header = dataSet.columns.map(c => c.name);
  const rows = dataSet.rows.map(row =>
    dataSet.columns.map((_, i) => formatCellValue(row[i]))
  );
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
```

SheetJS is also lazy-loaded. It produces `.xlsx` files (not the older `.xls` format) which is a minor improvement over the GWT version.

### Export UI

Export buttons are rendered conditionally in the displayer chrome (the wrapper around each component):

```typescript
function DisplayerChrome({ children, exportSettings, dataSet, title }: DisplayerChromeProps) {
  return (
    <div className="relative group">
      {children}
      {(exportSettings.csv || exportSettings.xls || exportSettings.png) && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {exportSettings.csv && <ExportButton onClick={() => exportCsv(dataSet, title)} label="CSV" />}
          {exportSettings.xls && <ExportButton onClick={() => exportXls(dataSet, title)} label="XLS" />}
          {exportSettings.png && <ExportButton onClick={() => exportPng(ref.current!, title)} label="PNG" />}
        </div>
      )}
    </div>
  );
}
```

---

## 8. Refresh and Polling

The GWT app supports periodic data refresh via two `DisplayerSettings` properties: `REFRESH_INTERVAL` (seconds between refreshes, -1 = disabled) and `REFRESH_STALE_DATA` (whether to show stale data during refresh). The `AbstractDisplayer.View` interface exposes `enableRefreshTimer(int seconds)` and `cancelRefreshTimer()` methods, and the view implementation uses GWT's `Timer` to trigger redraws.

### RefreshSettings Type

```typescript
export interface RefreshSettings {
  /** Whether to show current (stale) data while a refresh is in progress. */
  readonly staleData: boolean;
  /** Refresh interval in seconds. 0 or negative = no automatic refresh. */
  readonly interval: number;
}

const refreshSettingsSchema = z.object({
  staleData: z.boolean().default(true),
  interval: z.number().int().default(-1),
});
```

### React Implementation

Refresh is implemented as a `useEffect` within the `useDataSet` hook rather than as a separate timer mechanism:

```typescript
function useDataSet(lookup: DataSetLookup, refresh: RefreshSettings): DataSetResult {
  const dataService = useDataService();
  const filters = useFilters(lookup.dataSetId);
  const [state, setState] = useState<DataSetResult>({ status: 'loading' });

  // Initial fetch and filter-triggered refetch
  useEffect(() => {
    const mergedLookup = mergeFilters(lookup, filters.activeFilters);
    fetchDataSet(dataService, mergedLookup).then(
      data => setState({ status: 'loaded', data }),
      error => setState({ status: 'error', error }),
    );
  }, [lookup, filters.activeFilters]);

  // Periodic refresh
  useEffect(() => {
    if (refresh.interval <= 0) return;

    const id = setInterval(async () => {
      if (!refresh.staleData) {
        setState(prev => prev.status === 'loaded'
          ? { status: 'refreshing', staleData: prev.data }
          : prev
        );
      }
      // When staleData=true, keep showing current data; swap silently on completion
      const mergedLookup = mergeFilters(lookup, filters.activeFilters);
      try {
        const data = await fetchDataSet(dataService, mergedLookup);
        setState({ status: 'loaded', data });
      } catch (error) {
        // On refresh failure, keep showing last good data
        setState(prev => prev.status === 'loaded' || prev.status === 'refreshing'
          ? { status: 'loaded', data: prev.status === 'refreshing' ? prev.staleData : prev.data }
          : { status: 'error', error }
        );
      }
    }, refresh.interval * 1000);

    return () => clearInterval(id);
  }, [refresh.interval, refresh.staleData, lookup, filters.activeFilters]);

  return state;
}
```

### State Machine

```
          initial fetch
loading ───────────────> loaded
   │                       │
   │                       │ interval tick (staleData=false)
   │                       v
   │                   refreshing ──> loaded (swap new data)
   │                       │
   │                       │ fetch error
   │                       v
   │                   loaded (keep stale data)
   │
   │ fetch error
   v
  error
```

When `staleData=true`, the state stays `loaded` throughout the refresh cycle -- the user sees no loading indicator. When `staleData=false`, the state transitions to `refreshing`, which components can use to show a subtle refresh indicator (e.g., a pulsing border) while still rendering the stale data.

### Interaction with Caching

The `DataService` cache respects the refresh interval. If a component has `refresh.interval = 30`, the cache TTL for that dataset's lookup is set to 30 seconds. Concurrent components with different refresh intervals on the same dataset use the shortest interval as the effective cache TTL. This prevents redundant fetches when multiple components share a data source.

---

## 9. HTML Template Support

The GWT `DisplayerAttributeDef` defines two template-related settings in `HTML_GROUP`: `HTML_TEMPLATE` (attribute key: `html`) and `JS_TEMPLATE` (attribute key: `javascript`). The `MetricDisplayer` uses these to render custom metric displays where the HTML template contains `{value}` placeholders and the JS template runs arbitrary JavaScript via `Global.eval()` to manipulate the rendered DOM.

### HTML_TEMPLATE -- Kept, Sanitized

HTML templates are preserved but sanitized before rendering:

```typescript
import DOMPurify from 'dompurify';

function HtmlTemplateDisplayer({ html, data }: HtmlTemplateProps) {
  const interpolated = interpolateTemplate(html, data);
  const sanitized = DOMPurify.sanitize(interpolated, {
    ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                   'strong', 'em', 'a', 'img', 'ul', 'ol', 'li', 'table',
                   'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr', 'pre', 'code'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target'],
  });

  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

`DOMPurify` strips `<script>`, event handlers (`onclick`, `onerror`), and other XSS vectors. The `ALLOWED_TAGS` list is deliberately conservative -- it covers the formatting tags that HTML templates actually use without allowing executable content.

### JS_TEMPLATE -- Dropped

`JS_TEMPLATE` is **removed** from the new system. It uses `Global.eval()` to execute arbitrary JavaScript strings from dashboard YAML files. This is a security concern: any dashboard author (or anyone who can modify a dashboard YAML) can execute arbitrary code in the user's browser.

This is an explicit, deliberate breaking change. Dashboards using `JS_TEMPLATE` must migrate to one of:

- **JSONata value expressions** for data transformations (the expression engine from [01-core-engine.md](01-core-engine.md) covers most data manipulation needs)
- **Markdown components** for rich text with embedded data
- **Custom React components** registered as plugins for complex interactive content

The Zod schema for displayer settings will parse and discard the `javascript` key with a deprecation warning logged to the console:

```typescript
const htmlGroupSchema = z.object({
  html: z.string().optional(),
  javascript: z.string().optional().transform((val) => {
    if (val !== undefined) {
      console.warn(
        'Melviz: JS_TEMPLATE (javascript) is no longer supported. ' +
        'Migrate to JSONata expressions, Markdown, or a custom plugin.'
      );
    }
    return undefined;  // discard
  }),
});
```

The migration guide (in [07-testing-migration.md](07-testing-migration.md)) will document this breaking change with migration examples.

---

## 10. setup.js and postMessage Compatibility

The GWT app reads configuration from `window.melviz` (via the `RuntimeClientSetup` JsInterop bridge) and accepts dashboard YAML via `window.postMessage` (via `RuntimeModelContentListener`). Both APIs are preserved unchanged for consumers.

### window.melviz Configuration

```typescript
const setupConfigSchema = z.object({
  mode: z.enum(['CLIENT', 'EDITOR']).optional(),
  path: z.string().optional(),
  dashboards: z.array(z.string()).optional(),
  samplesUrl: z.string().optional(),
  samplesEditService: z.string().optional(),
  samplesDefaultHome: z.boolean().default(false),
  allowExternal: z.boolean().default(false),
}).strict();

// Read and validate at app startup
const rawConfig = (window as any).melviz;
const config = rawConfig ? setupConfigSchema.parse(rawConfig) : defaultConfig;
```

The Zod schema validates the configuration at startup and produces structured error messages if the configuration is malformed -- an improvement over the GWT version which silently falls back to defaults on invalid values.

### postMessage API

```typescript
useEffect(() => {
  function handleMessage(event: MessageEvent) {
    if (typeof event.data === 'string' && event.data !== 'ready') {
      loadDashboardFromYaml(event.data);
    }
  }

  window.addEventListener('message', handleMessage);

  // Signal readiness to parent frame
  if (window.parent && window.parent !== window) {
    window.parent.postMessage('ready', '*');
  }

  return () => window.removeEventListener('message', handleMessage);
}, []);
```

The `window.setMelvizContent` bridge function (set up by `RuntimeModelContentListener` via GWT JSNI) is also preserved:

```typescript
useEffect(() => {
  (window as any).setMelvizContent = (content: string) => {
    loadDashboardFromYaml(content);
  };
  return () => { delete (window as any).setMelvizContent; };
}, []);
```

Both APIs work unchanged from the consumer's perspective. The only observable difference is better error reporting -- malformed YAML now produces structured Zod validation errors rather than silent failures or opaque Java stack traces.

---

## 11. RuntimeModel Backward Compatibility

The Java `RuntimeModel` class has two fields that are renamed in the TypeScript model: `layoutTemplates` becomes `pages` and `clientDataSets` becomes `datasets`. The new names better reflect what these fields represent -- `layoutTemplates` is an UberFire-ism that leaks framework internals, and `clientDataSets` is redundant (`client` is implied when running in the client).

### Zod Schema with Dual-Name Acceptance

The Zod schema accepts both old and new field names and normalises to the new names:

```typescript
const runtimeModelSchema = z.object({
  globalSettings: globalSettingsSchema.optional(),
  navTree: navTreeSchema.optional(),
  properties: z.record(z.string()).default({}),
  lastModified: z.number().optional(),

  // New field names (preferred)
  pages: z.array(layoutTemplateSchema).default([]),
  datasets: z.array(dataSetRefSchema).default([]),

  // Old field names (accepted for backward compatibility)
  layoutTemplates: z.array(layoutTemplateSchema).optional(),
  clientDataSets: z.array(dataSetRefSchema).optional(),
}).transform(raw => ({
  globalSettings: raw.globalSettings,
  navTree: raw.navTree,
  properties: raw.properties,
  lastModified: raw.lastModified,
  pages: raw.pages.length > 0 ? raw.pages : (raw.layoutTemplates ?? []),
  datasets: raw.datasets.length > 0 ? raw.datasets : (raw.clientDataSets ?? []),
}));

type RuntimeModel = z.output<typeof runtimeModelSchema>;
```

The transform logic: if the new name has values, use them. Otherwise, fall back to the old name. This means existing YAML dashboards using `layoutTemplates:` and `clientDataSets:` continue to work without modification. New dashboards should use `pages:` and `datasets:`.

### Serialisation

When the editor serialises a `RuntimeModel` back to YAML (for download or persistence), it uses only the new field names. This means a round-trip through the editor modernises the field names automatically, which is the intended migration path.

---

## Cross-References

- **PluginRegistry, PluginHost, ComponentCapabilities:** [04-displayer-plugin-system.md](04-displayer-plugin-system.md)
- **DataSetLookup, TypedDataSet, TypedFilter:** [01-core-engine.md](01-core-engine.md)
- **Zod schemas, settingsSchema, SchemaField:** [03-schema-system.md](03-schema-system.md)
- **DataService, LocalDataService:** [06-data-service-backend.md](06-data-service-backend.md)
- **Migration plan and breaking changes:** [07-testing-migration.md](07-testing-migration.md)
