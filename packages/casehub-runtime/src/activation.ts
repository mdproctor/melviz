import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";
import type { ColumnId } from "@casehub/data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehub/data/dist/dataset/conversion.js";
import type { CasehubElement } from "@casehub/viz/dist/base/CasehubElement.js";
import type { VizComponentProps } from "@casehub/viz/dist/base/types.js";
import type { ComponentRegistry } from "./registry.js";
import type { PagePathMap } from "./page-paths.js";
import { renderTitle, renderHtml, renderMarkdown } from "./content.js";

const DATA_COMPONENT_TYPES = new Set([
  "bar-chart",
  "line-chart",
  "area-chart",
  "pie-chart",
  "scatter-chart",
  "bubble-chart",
  "timeseries",
  "table",
  "metric",
  "meter",
  "selector",
  "map",
  "iframe-plugin",
]);

export function createActivationCallback(
  registry: ComponentRegistry,
  pagePathMap: PagePathMap,
): (el: HTMLElement, component: Component) => void {
  return (el: HTMLElement, component: Component): void => {
    const componentId = el.dataset.componentId;
    if (!componentId) return;

    const pagePath = pagePathMap.get(component) ?? "";

    if (DATA_COMPONENT_TYPES.has(component.type)) {
      const tagName = `casehub-${component.type}`;
      const vizEl = document.createElement(tagName) as CasehubElement<VizComponentProps>;

      const lookup = (component.props as Record<string, unknown> | undefined)?.lookup as
        | DataSetLookup
        | undefined;

      const entry = {
        element: el,
        vizElement: vizEl,
        component,
        pagePath,
        ...(lookup !== undefined && { originalLookup: lookup }),
      };
      registry.set(componentId, entry);

      if (component.props) {
        vizEl.props = component.props as VizComponentProps;
      }
      el.appendChild(vizEl);

      // Handle inline dataSet on displayer (legacy DashBuilder shorthand)
      const inlineData = (component.props as Record<string, unknown> | undefined)?.inlineDataSet;
      if (inlineData !== undefined && lookup === undefined) {
        resolveInlineDataSet(vizEl, inlineData);
      }
      return;
    }

    if (component.type === "title" && component.props) {
      renderTitle(el, component.props as Record<string, unknown>);
      return;
    }

    if (component.type === "html" && component.props) {
      renderHtml(el, component.props as Record<string, unknown>);
      return;
    }

    if (component.type === "markdown" && component.props) {
      renderMarkdown(el, component.props as Record<string, unknown>);
      return;
    }

    // Layout, page, lazy-page, unknown: no activation needed
  };
}

function resolveInlineDataSet(
  vizEl: CasehubElement<VizComponentProps>,
  inlineData: unknown,
): void {
  try {
    let raw: unknown;
    if (typeof inlineData === "string") {
      let cleaned = inlineData.replace(/,\s*([\]}])/g, "$1");
      cleaned = cleaned.replace(/'/g, '"');
      raw = JSON.parse(cleaned);
    } else {
      raw = inlineData;
    }

    if (!Array.isArray(raw)) return;

    // Flat array → single row (Shape D)
    const isFlat = raw.every((v: unknown) => typeof v !== "object" || v === null);
    const rows: unknown[][] = isFlat ? [raw] : (raw as unknown[][]);

    const maxCols = rows.reduce((max: number, row: unknown[]) => Math.max(max, row.length), 0);
    const columns = Array.from({ length: maxCols }, (_: unknown, i: number) => ({
      id: `Column ${i}` as ColumnId,
      name: `Column ${i}`,
      type: typeof rows[0]?.[i] === "number" ? ColumnType.NUMBER : ColumnType.LABEL,
    }));

    const data = rows.map((row: unknown[]) =>
      Array.from({ length: maxCols }, (_: unknown, i: number) =>
        row[i] === undefined || row[i] === null ? null : String(row[i]),
      ),
    );

    const dataset = toTypedDataSet({ columns, data });
    vizEl.dataSet = dataset;
  } catch {
    vizEl.error = "Failed to parse inline dataSet";
  }
}
