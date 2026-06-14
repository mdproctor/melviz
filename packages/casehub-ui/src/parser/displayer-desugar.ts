import type { Component } from "../model/types.js";

/**
 * Maps DisplayerType enum values to component type strings.
 */
const TYPE_MAP: Record<string, string> = {
  BARCHART: "bar-chart",
  LINECHART: "line-chart",
  AREACHART: "area-chart",
  PIECHART: "pie-chart",
  SCATTERCHART: "scatter-chart",
  BUBBLECHART: "bubble-chart",
  TIMESERIES: "timeseries",
  TABLE: "table",
  METRIC: "metric",
  METERCHART: "meter",
  SELECTOR: "selector",
  MAP: "map",
};

/**
 * Maps subtype enum values to lowercase component subtype strings.
 */
const SUBTYPE_MAP: Record<string, string> = {
  SELECTOR_DROPDOWN: "dropdown",
  SELECTOR_SLIDER: "slider",
  SELECTOR_LABELS: "labels",
  BAR: "bar",
  BAR_STACKED: "bar-stacked",
  COLUMN: "column",
  COLUMN_STACKED: "column-stacked",
  LINE: "line",
  SMOOTH: "smooth",
  AREA: "area",
  AREA_STACKED: "area-stacked",
  PIE: "pie",
  PIE_3D: "pie", // 3D dropped
  DONUT: "donut",
  MAP_REGIONS: "regions",
  MAP_MARKERS: "markers",
  METRIC_CARD: "card",
  METRIC_CARD2: "card2",
  METRIC_PLAIN_TEXT: "plain-text",
  METRIC_QUOTA: "quota",
};

/**
 * Converts a raw YAML displayer object to a typed Component.
 *
 * Handles:
 * - Type mapping from DisplayerType enums to component types
 * - Settings extraction from nested YAML structure to flat props
 * - Lookup passthrough (parsed separately)
 * - External component handling (iframe-plugin)
 * - Field renames (html.html → html.template, extraConfiguration → extra)
 */
export function desugarDisplayer(raw: Record<string, unknown>): Component {
  const props: Record<string, unknown> = {};

  // Determine component type
  let type: string;
  if (raw.component && typeof raw.component === "string") {
    // External component
    type = "iframe-plugin";
    props.componentId = raw.component;

    // Collect settings for the component
    const componentId = raw.component;
    const settings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === componentId || key.startsWith(`${componentId}.`)) {
        settings[key] = value;
      }
    }
    if (Object.keys(settings).length > 0) {
      props.settings = settings;
    }
  } else {
    // Standard displayer — case-insensitive lookup
    const rawType = raw.type as string | undefined;
    const normalised = rawType?.toUpperCase();
    type = normalised && TYPE_MAP[normalised] ? TYPE_MAP[normalised] : "table";
  }

  // Extract general settings
  if (raw.general && typeof raw.general === "object") {
    const general = raw.general as Record<string, unknown>;
    if (general.title !== undefined) {
      props.title = general.title;
    }
    if (general.visible !== undefined) {
      props.visible = general.visible;
    }
  }

  // Extract chart settings
  if (raw.chart && typeof raw.chart === "object") {
    const chart = raw.chart as Record<string, unknown>;
    if (chart.resizable !== undefined) {
      props.resizable = chart.resizable;
    }
    if (chart.zoom !== undefined) {
      props.zoom = chart.zoom;
    }
    if (chart.legend !== undefined) {
      props.legend = chart.legend;
    }
    if (chart.margin !== undefined) {
      props.margin = chart.margin;
    }
    if (chart.height !== undefined) {
      props.height = chart.height;
    }
    if (chart.width !== undefined) {
      props.width = chart.width;
    }
  }

  // Extract external settings (for iframe-plugin)
  if (raw.external && typeof raw.external === "object") {
    const external = raw.external as Record<string, unknown>;
    if (external.width !== undefined) {
      props.width = external.width;
    }
    if (external.height !== undefined) {
      props.height = external.height;
    }
  }

  // Extract table settings
  if (raw.table && typeof raw.table === "object") {
    const table = raw.table as Record<string, unknown>;
    if (table.pageSize !== undefined) {
      props.pageSize = table.pageSize;
    }
  }

  // Extract meter settings
  if (raw.meter && typeof raw.meter === "object") {
    const meter = raw.meter as Record<string, unknown>;
    if (meter.end !== undefined) {
      // Convert string to number if needed
      props.end = typeof meter.end === "string" ? Number(meter.end) : meter.end;
    }
    if (meter.warning !== undefined) {
      props.warning = typeof meter.warning === "string" ? Number(meter.warning) : meter.warning;
    }
    if (meter.critical !== undefined) {
      props.critical = typeof meter.critical === "string" ? Number(meter.critical) : meter.critical;
    }
  }

  // Extract subtype
  if (raw.subtype && typeof raw.subtype === "string") {
    const mappedSubtype = SUBTYPE_MAP[raw.subtype];
    props.subtype = mappedSubtype || raw.subtype.toLowerCase();
  }

  // Extract filter settings
  if (raw.filter !== undefined) {
    props.filter = raw.filter;
  }

  // Extract columns
  if (raw.columns !== undefined) {
    props.columns = raw.columns;
  }

  // Handle html settings for METRIC type
  if (raw.html && typeof raw.html === "object") {
    const html = raw.html as Record<string, unknown>;
    const htmlProps: Record<string, unknown> = {};

    // Rename html.html to html.template
    if (html.html !== undefined) {
      htmlProps.template = html.html;
    }

    // Pass through other html properties
    for (const [key, value] of Object.entries(html)) {
      if (key !== "html") {
        htmlProps[key] = value;
      }
    }

    if (Object.keys(htmlProps).length > 0) {
      props.html = htmlProps;
    }
  }

  // Extract extraConfiguration → extra
  if (raw.extraConfiguration && typeof raw.extraConfiguration === "string") {
    try {
      props.extra = JSON.parse(raw.extraConfiguration);
    } catch {
      // If parsing fails, store as-is
      props.extra = raw.extraConfiguration;
    }
  }

  // Extract lookup (passthrough)
  const lookup = raw.lookup || raw.dataSetLookup;
  if (lookup) {
    props.lookup = lookup;

    // Extract rowCount from lookup into props (display-level setting)
    if (typeof lookup === "object" && lookup !== null) {
      const lookupObj = lookup as Record<string, unknown>;
      if (lookupObj.rowCount !== undefined) {
        props.rowCount = lookupObj.rowCount;
      }
    }
  }

  return {
    type,
    ...(Object.keys(props).length > 0 ? { props } : {}),
  };
}
