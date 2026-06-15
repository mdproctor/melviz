import type { Component } from "@casehub/component/dist/model/types.js";
import type { PagePathMap } from "./page-paths.js";

export type PageIndex = Map<string, Component>;
export type ActiveSlots = Map<string, string>;

const INTERACTIVE_TYPES = new Set([
  "tabs", "pills", "sidebar", "accordion", "carousel", "stack",
]);

export function buildPageIndex(
  root: Component,
  paths: PagePathMap,
): PageIndex {
  const index: PageIndex = new Map();
  walkPages(root, paths, index);
  return index;
}

function walkPages(
  component: Component,
  paths: PagePathMap,
  index: PageIndex,
): void {
  if (component.type === "page") {
    const path = paths.get(component) ?? "";
    index.set(path, component);
  }

  if (component.items) {
    for (const item of component.items) {
      walkPages(item.component, paths, index);
    }
  }

  if (component.slots) {
    for (const children of Object.values(component.slots)) {
      for (const child of children) {
        walkPages(child, paths, index);
      }
    }
  }
}

export function computeCurrentPage(
  root: Component,
  activeSlots: ActiveSlots,
): string {
  const segments: string[] = [];
  walkActive(root, activeSlots, segments);
  return segments.join("/");
}

function walkActive(
  component: Component,
  activeSlots: ActiveSlots,
  segments: string[],
): void {
  if (!component.slots) return;

  if (INTERACTIVE_TYPES.has(component.type) && component.id) {
    const activeSlot = activeSlots.get(component.id);
    if (activeSlot) {
      const children = component.slots[activeSlot];
      if (children) {
        for (const child of children) {
          if (child.type === "page") {
            segments.push(activeSlot);
          }
          walkActive(child, activeSlots, segments);
        }
      }
      return;
    }
  }

  // Non-interactive or no active slot: walk all children
  for (const children of Object.values(component.slots)) {
    for (const child of children) {
      walkActive(child, activeSlots, segments);
    }
  }
}
