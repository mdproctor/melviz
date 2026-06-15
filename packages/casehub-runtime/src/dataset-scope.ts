import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehub/data/dist/dataset/external/types.js";
import type { PagePathMap } from "./page-paths.js";

export type DataSetScope = Map<string, Map<DataSetId, ExternalDataSetDef>>;

export function buildDataSetScope(
  root: Component,
  paths: PagePathMap,
): DataSetScope {
  const scope: DataSetScope = new Map();
  walkScope(root, new Map(), paths, scope);
  return scope;
}

function walkScope(
  component: Component,
  inherited: Map<DataSetId, ExternalDataSetDef>,
  paths: PagePathMap,
  scope: DataSetScope,
): void {
  let current = inherited;

  if (component.type === "page") {
    const pagePath = paths.get(component) ?? "";
    const datasets = (component.props as Record<string, unknown> | undefined)?.datasets as
      | readonly ExternalDataSetDef[]
      | undefined;

    current = new Map(inherited);
    if (datasets) {
      for (const ds of datasets) {
        current.set(ds.uuid, ds);
      }
    }
    scope.set(pagePath, current);
  }

  if (component.items) {
    for (const item of component.items) {
      walkScope(item.component, current, paths, scope);
    }
  }

  if (component.slots) {
    for (const children of Object.values(component.slots)) {
      for (const child of children) {
        walkScope(child, current, paths, scope);
      }
    }
  }
}

export function resolveDataSetDef(
  dataSetId: DataSetId,
  pagePath: string,
  scope: DataSetScope,
): ExternalDataSetDef | undefined {
  let path = pagePath;
  while (true) {
    const pageScope = scope.get(path);
    if (pageScope) {
      const def = pageScope.get(dataSetId);
      if (def) return def;
    }
    if (path === "") return undefined;
    const lastSlash = path.lastIndexOf("/");
    path = lastSlash === -1 ? "" : path.substring(0, lastSlash);
  }
}
