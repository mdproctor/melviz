import type { GridProps, ColumnsProps } from "../model/component-props.js";

const LAYOUT_TYPES = new Set([
  "grid", "columns", "rows", "stack",
  "tabs", "pills", "accordion", "carousel",
  "sidebar", "panel", "app-grid",
]);

export function isLayoutType(type: string): boolean {
  return LAYOUT_TYPES.has(type);
}

export function applyLayoutCSS(
  element: HTMLElement,
  type: string,
  props: Readonly<Record<string, unknown>> | undefined,
): void {
  switch (type) {
    case "grid": {
      const gridProps = props as unknown as GridProps | undefined;
      element.style.display = "grid";
      element.style.gridTemplateColumns = `repeat(${gridProps?.columns ?? 12}, 1fr)`;
      break;
    }
    case "columns": {
      const colProps = props as unknown as ColumnsProps | undefined;
      element.style.display = "grid";
      if (colProps?.distribution) {
        element.style.gridTemplateColumns = colProps.distribution.map((n) => `${n}fr`).join(" ");
      }
      break;
    }
    case "rows":
      element.style.display = "flex";
      element.style.flexDirection = "column";
      break;
    case "stack":
    case "tabs":
    case "pills":
    case "carousel":
      break;
    case "accordion":
      element.style.display = "flex";
      element.style.flexDirection = "column";
      break;
    case "sidebar":
      element.style.display = "grid";
      element.style.gridTemplateColumns = "auto 1fr";
      break;
    case "panel":
      break;
    case "app-grid":
      element.style.display = "grid";
      element.style.gridTemplateAreas = '"header header" "nav main" "footer footer"';
      element.style.gridTemplateColumns = "auto 1fr";
      element.style.gridTemplateRows = "auto 1fr auto";
      break;
  }
}
