import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
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
