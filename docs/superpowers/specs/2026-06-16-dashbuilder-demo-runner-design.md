# DashBuilder Demo Runner Design

**Epic:** #19 — Load DashBuilder demo dashboards via casehub runtime
**Issues:** #20 (demo runner), #21 (axis/grid desugaring), #14 (markdown parser), #22 (validation)
**Date:** 2026-06-16

## Goal

Render all 32 DashBuilder sample YAML dashboards in a browser using the pure TypeScript casehub runtime — no GWT, no Java. The existing `examples/` gallery provides discovery, search, categories, source viewer, hash navigation, and a dev server. The only GWT-dependent part is the iframe rendering. This spec replaces that with direct `loadSite()` calls.

## Architecture

```
examples/
├── dashboards/              # 32 DashBuilder YAML files (unchanged)
├── scripts/
│   ├── generate-samples.js  # Auto-discovers dashboards → samples.json (unchanged)
│   ├── dev-server.js         # BrowserSync + file watching (unchanged)
│   └── copy-dashboards.js   # Copies YAML to dist/ (unchanged)
├── src/
│   ├── index.html           # Gallery HTML — iframe replaced with div
│   ├── app.js               # Gallery JS — loadSite() instead of iframe src
│   └── styles.css           # Gallery styles (minor additions for dashboard target)
├── webpack.config.js         # NEW — bundles casehub runtime + viz + js-yaml
└── package.json             # Updated deps and build scripts
```

### Data Flow

```
User clicks dashboard in sidebar
    ↓
app.js fetches YAML text via fetch()
    ↓
dispose() previous LiveSite (if any)
    ↓
loadSite(targetDiv, yamlText) → parsePage() → renderComponent() → Web Components mount
    ↓
Web Components dispatch casehub-data-request events
    ↓
DataPipeline resolves datasets (inline content, external URL, JSONata)
    ↓
component.dataSet = typedDataSet → echarts/table/metric renders
```

## Issue #20 — Demo Runner

### Webpack Bundle

New `examples/webpack.config.js` that produces `dist/casehub-bundle.js`:

- **Entry:** a new `src/casehub-entry.ts` that imports `@casehub/viz` (triggers Web Component registration) and re-exports `loadSite` from `@casehub/runtime` and `load` from `js-yaml`
- **Output:** UMD bundle exposing `window.casehub = { loadSite, yamlLoad }`
- **Dependencies bundled:** `@casehub/runtime`, `@casehub/viz`, `@casehub/ui`, `@casehub/component`, `@casehub/data`, `echarts`, `js-yaml`, `jsonata`, `zod`
- **Config:** extends `@melviz/webpack-base` for consistent loader/plugin setup

### HTML Changes

Replace:
```html
<iframe id="dashboard-iframe" src="melviz-webapp"></iframe>
```

With:
```html
<div id="dashboard-target"></div>
<script src="casehub-bundle.js"></script>
```

### app.js Changes

Replace iframe-based dashboard loading with:

```javascript
let currentSite = null;

async function loadDashboard(dashboardPath) {
  const response = await fetch(`dashboards/${dashboardPath}`);
  const yamlText = await response.text();

  if (currentSite) {
    currentSite.dispose();
  }

  const target = document.getElementById("dashboard-target");
  target.innerHTML = "";

  // Detect dark mode from YAML before loading
  const parsed = window.casehub.yamlLoad(yamlText);
  const isDark = parsed?.global?.mode?.toLowerCase() === "dark";
  target.classList.toggle("casehub-dark", isDark);

  currentSite = await window.casehub.loadSite(target, yamlText);
}
```

### Dark Mode

Dashboard YAML can specify `global: { mode: dark }`. The loader detects this and adds a `casehub-dark` CSS class on the target div. Styles apply a dark background and light text to the container. Individual chart components handle their own theming via echarts theme support.

### CSS Additions

```css
#dashboard-target {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.casehub-dark {
  background: #1a1a2e;
  color: #e0e0e0;
}
```

### Error Handling

Wrap `loadSite()` in a try/catch. On failure, render the error message in the target div with a styled error banner. This handles CORS failures from external URL datasets, parse errors, and missing component types gracefully without crashing the gallery.

### Build Scripts

Update `examples/package.json`:
- `build:bundle` — webpack build of casehub-entry.ts → dist/casehub-bundle.js
- `build` — existing steps + `build:bundle`
- `dev` — existing dev server, also watches casehub package changes

## Issue #21 — Axis and Grid Settings Desugaring

### Parser Changes (displayer-desugar.ts)

DashBuilder YAML has axis settings in two locations:
1. Top-level on displayer: `displayer.axis.x/y`
2. Nested in chart: `displayer.chart.axis.x/y` (less common)

Both must be extracted. The function already handles `raw.chart` — add axis/grid extraction after existing chart settings:

```typescript
// After existing chart.resizable, chart.zoom, etc. extraction:

// Axis settings — check both displayer.axis and displayer.chart.axis
const axisSource = raw.axis ?? raw.chart?.axis;
if (axisSource) {
  if (axisSource.x) {
    props.xAxis = {
      ...(props.xAxis ?? {}),
      ...(axisSource.x.title != null && { title: axisSource.x.title }),
      ...(axisSource.x.labels_show != null && { showLabels: axisSource.x.labels_show }),
      ...(axisSource.x.labels_angle != null && { labelAngle: axisSource.x.labels_angle }),
    };
  }
  if (axisSource.y) {
    props.yAxis = {
      ...(props.yAxis ?? {}),
      ...(axisSource.y.title != null && { title: axisSource.y.title }),
      ...(axisSource.y.labels_show != null && { showLabels: axisSource.y.labels_show }),
      ...(axisSource.y.labels_angle != null && { labelAngle: axisSource.y.labels_angle }),
    };
  }
}

// Grid visibility
const gridSource = raw.chart?.grid;
if (gridSource) {
  props.grid = {
    ...(gridSource.x != null && { x: gridSource.x }),
    ...(gridSource.y != null && { y: gridSource.y }),
  };
}
```

### Type Changes (displayer-types.ts)

Extend `ChartSettings`:

```typescript
export interface ChartSettings {
  // ... existing fields ...
  readonly xAxis?: {
    readonly title?: string;
    readonly showLabels?: boolean;
    readonly labelAngle?: number;      // NEW — echarts axisLabel.rotate
  };
  readonly yAxis?: {
    readonly title?: string;
    readonly showLabels?: boolean;
    readonly labelAngle?: number;      // NEW
  };
  readonly grid?: {                    // NEW — gridline visibility
    readonly x?: boolean;
    readonly y?: boolean;
  };
}
```

### Option Pipeline Changes (option-pipeline.ts)

In `applyChartSettings()`, after existing axis title/showLabels handling:

```typescript
// Label rotation
if (props.xAxis?.labelAngle != null) {
  option.xAxis.axisLabel = { ...option.xAxis.axisLabel, rotate: props.xAxis.labelAngle };
}
if (props.yAxis?.labelAngle != null) {
  option.yAxis.axisLabel = { ...option.yAxis.axisLabel, rotate: props.yAxis.labelAngle };
}

// Grid visibility (splitLine controls gridlines in echarts)
if (props.grid?.x === false) {
  option.xAxis.splitLine = { ...option.xAxis.splitLine, show: false };
}
if (props.grid?.y === false) {
  option.yAxis.splitLine = { ...option.yAxis.splitLine, show: false };
}
```

### Affected Samples

13 samples use axis config (mostly `labels_angle`), 4 use grid visibility. After this change, all render with correct axis labels and gridline settings.

## Issue #14 — Markdown Parser

### Dependency

Add `marked@^15.0.0` to `@casehub/runtime` as a production dependency. Marked is ~40KB, well-maintained, and has no dependencies of its own.

### content.ts Changes

Replace the `renderMarkdown` function:

```typescript
import { marked } from "marked";

export function renderMarkdown(el: HTMLElement, props: Record<string, unknown>): void {
  const content = typeof props.content === "string" ? props.content : "";
  const wrapper = document.createElement("div");
  wrapper.classList.add("casehub-markdown");
  wrapper.innerHTML = marked.parse(content) as string;
  el.appendChild(wrapper);
}
```

### Trust Model

The existing `renderHtml()` uses raw `innerHTML` — dashboard YAML is authored content, not user input. Markdown follows the same trust model. No sanitisation needed for this use case. If sanitisation is needed later (user-submitted content), add DOMPurify as a separate concern.

### Styling

Add minimal markdown styles to the casehub-viz or runtime CSS scope:

```css
.casehub-markdown h1, .casehub-markdown h2, .casehub-markdown h3 { margin: 0.5em 0; }
.casehub-markdown p { margin: 0.3em 0; }
.casehub-markdown strong { font-weight: bold; }
.casehub-markdown a { color: #4a9eff; }
```

## Issue #22 — Validation

### Process

Load each of the 32 dashboards through the casehub gallery and categorise:

| Category | Meaning |
|----------|---------|
| **Full** | Renders correctly — layout, charts, data, interactivity all work |
| **Partial** | Renders with minor visual differences (missing axis label, etc.) |
| **Data error** | Parses and renders layout, but external URL fails (CORS, dead endpoint) |
| **Fails** | Parse error or rendering crash — needs investigation |

### Expected Results

- **Inline data samples** (~20): should render fully — these are self-contained
- **External URL samples** (~7): may fail at data fetch due to CORS or dead endpoints — this is expected and acceptable. The gallery shows an error state rather than crashing.
- **Local file samples** (~5): depend on relative paths that may not resolve — document which ones

### Error Display

The gallery should show errors inline in the dashboard target div rather than silently failing. `loadSite()` errors are caught and displayed as styled error banners.

### Deliverable

A validation matrix committed to the workspace documenting each dashboard's status, plus follow-up issues for any new gaps discovered.

## Non-Goals

- GWT webapp integration (separate concern — the GWT gallery path continues to work independently)
- Refresh timers (#16 — dashboards render fine without auto-refresh)
- Column-level expression evaluator (#3 — data loads without per-column expressions)
- Export/download features
- Playwright E2E screenshot tests (future work)
- New domain-specific example dashboards (#23 — separate issue)
