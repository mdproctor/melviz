import type { Component } from "@casehub/component/dist/model/types.js";

export type PagePathMap = Map<Component, string>;

export function buildPagePathMap(root: Component): PagePathMap {
  const map: PagePathMap = new Map();
  walk(root, "", undefined, map);
  return map;
}

function walk(
  component: Component,
  currentPath: string,
  slotName: string | undefined,
  map: PagePathMap,
): void {
  let path = currentPath;
  if (component.type === "page" && slotName !== undefined) {
    path = currentPath ? `${currentPath}/${slotName}` : slotName;
  }

  map.set(component, path);

  if (component.items) {
    for (const item of component.items) {
      walk(item.component, path, undefined, map);
    }
  }

  if (component.slots) {
    for (const [name, children] of Object.entries(component.slots)) {
      for (const child of children) {
        walk(child, path, name, map);
      }
    }
  }
}
