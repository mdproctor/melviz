import type { GridPlacement } from "../model/types.js";

export function applyGridPlacement(
  element: HTMLElement,
  placement: GridPlacement,
): void {
  element.style.gridColumn = `${placement.x + 1} / span ${placement.w}`;
  element.style.gridRow = `${placement.y + 1} / span ${placement.h}`;
}
