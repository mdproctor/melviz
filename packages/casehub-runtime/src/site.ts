import type { Component, PermissionContext } from "@casehub/component/dist/model/types.js";
import { ALLOW_ALL } from "@casehub/component/dist/model/types.js";
import { renderComponent } from "@casehub/component/dist/renderer/render.js";
import { activateSlot } from "@casehub/component/dist/renderer/activate-slot.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
import type { DataProviderConfig, ExternalDataSetDef } from "@casehub/data/dist/dataset/external/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { DataSetOp } from "@casehub/data/dist/dataset/ops.js";
import { createDataSetManager } from "@casehub/data/dist/dataset/manager.js";
import { createDataProviderFactory, createPresetRegistry } from "@casehub/data/dist/dataset/external/index.js";
import type { Site, ViewState, DeepLink } from "@casehub/ui/dist/model/page-types.js";
import { parsePage } from "@casehub/ui/dist/parser/page-parser.js";
import { load as yamlLoad } from "js-yaml";
import { cellToRaw } from "@casehub/viz/dist/base/cell-extract.js";
import { buildPagePathMap } from "./page-paths.js";
import { buildDataSetScope, resolveDataSetDef } from "./dataset-scope.js";
import { buildPageIndex, computeCurrentPage } from "./navigation.js";
import type { ActiveSlots } from "./navigation.js";
import { createActivationCallback } from "./activation.js";
import type { ComponentRegistry } from "./registry.js";
import { createDataPipeline } from "./data-pipeline.js";
import type { VizTarget } from "./data-pipeline.js";
import { createFilterState, updateFilter, deriveActiveFilters, getActiveFilterOps } from "./cross-filter.js";
import { serializeToUrl, parseFromUrl } from "./url.js";

export interface LiveSite extends Site {
  navigate(path: string): void;
  dispose(): void;
}

export interface SiteOptions {
  readonly permissions?: PermissionContext;
  readonly fetch?: typeof globalThis.fetch;
  readonly providerConfig?: DataProviderConfig;
}

export async function loadSite(
  target: HTMLElement,
  source: string | Component,
  options?: SiteOptions,
): Promise<LiveSite> {
  const root = typeof source === "string" ? parsePage(yamlLoad(source)) : source;
  const permissions = options?.permissions ?? ALLOW_ALL;

  const pagePathMap = buildPagePathMap(root);
  const dataSetScope = buildDataSetScope(root, pagePathMap);
  const pageIndex = buildPageIndex(root, pagePathMap);

  const registry: ComponentRegistry = new Map();
  const activeSlots: ActiveSlots = new Map();
  const filterState = createFilterState();
  const abortController = new AbortController();
  const manager = createDataSetManager();

  const pipeline = createDataPipeline(manager, dataSetScope, registry, filterState);
  pipeline.setResolverCtx({
    manager,
    providerFactory: createDataProviderFactory(options?.fetch),
    providerConfig: options?.providerConfig ?? {},
    presetRegistry: createPresetRegistry(),
  });

  let _navigating = false;
  let currentPage = "";

  const onNode = createActivationCallback(registry, pagePathMap);
  renderComponent(target, root, { permissions, onNode });

  function findComponentId(e: Event): string | undefined {
    const el = (e.target as HTMLElement).closest("[data-component-id]") as HTMLElement | null;
    return el?.dataset.componentId;
  }

  function syncUrl(method: "pushState" | "replaceState"): void {
    if (typeof history === "undefined") return;
    const filters = deriveActiveFilters(filterState, currentPage);
    const hasFilters = Object.keys(filters).length > 0;
    const link: DeepLink = { page: currentPage, ...(hasFilters ? { filters } : {}) };
    history[method](null, "", serializeToUrl(link));
  }

  // --- Event delegation ---

  target.addEventListener("casehub-data-request", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const vizTarget = detail.element as VizTarget;
    const lookup = detail.lookup as DataSetLookup;
    if (!vizTarget || !lookup) return;
    const componentId = findComponentId(e);
    if (componentId) {
      pipeline.handleDataRequest(vizTarget, lookup, componentId);
    }
  }) as EventListener, { signal: abortController.signal });

  target.addEventListener("casehub-slot-change", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { activeSlot, containerId } = detail;
    if (typeof activeSlot === "string" && typeof containerId === "string") {
      activeSlots.set(containerId, activeSlot);
      currentPage = computeCurrentPage(root, activeSlots);
    }
    if (!_navigating) {
      syncUrl("pushState");
    }
  }) as EventListener, { signal: abortController.signal });

  target.addEventListener("casehub-filter", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { columnId, rowIndex, reset, group } = detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement) return;

    const ds = entry.vizElement.dataSet;
    if (!ds) return;

    const row = ds.rows[rowIndex];
    if (!row) return;

    const cell = row.cell(columnId);
    const value = String(cellToRaw(cell));

    updateFilter(filterState, entry.pagePath, group, columnId, [value], reset);

    for (const [id, candidate] of registry) {
      if (candidate.pagePath !== entry.pagePath) continue;
      const filterProps = (candidate.component.props as Record<string, unknown> | undefined)
        ?.filter as { listening?: boolean; selfApply?: boolean; group?: string } | undefined;

      if (filterProps?.listening === false) continue;
      if (id === componentId && !filterProps?.selfApply) continue;
      if (group !== undefined && filterProps?.group !== undefined && filterProps.group !== group) continue;

      if (candidate.vizElement && candidate.originalLookup) {
        pipeline.handleDataRequest(candidate.vizElement as unknown as VizTarget, candidate.originalLookup, id);
      }
    }

    syncUrl("replaceState");
  }) as EventListener, { signal: abortController.signal });

  target.addEventListener("casehub-page", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { offset, count } = detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement || !entry.originalLookup) return;

    const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
      ?.filter as { group?: string } | undefined;
    const filterOps = getActiveFilterOps(filterState, entry.pagePath, filterGroup?.group);
    const effectiveOps: DataSetOp[] = [...filterOps, ...entry.originalLookup.operations];
    const effectiveLookup: DataSetLookup = { ...entry.originalLookup, operations: effectiveOps };

    try {
      const result = manager.lookup(effectiveLookup, { rowOffset: offset, rowCount: count });
      (entry.vizElement as unknown as VizTarget).dataSet = result.dataset;
      (entry.vizElement as unknown as VizTarget).totalRows = result.totalRows;
    } catch (err) {
      (entry.vizElement as unknown as VizTarget).error = err instanceof Error ? err.message : String(err);
    }
  }) as EventListener, { signal: abortController.signal });

  target.addEventListener("casehub-sort", ((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    const { columnId, order } = detail;
    const componentId = findComponentId(e);
    if (!componentId) return;

    const entry = registry.get(componentId);
    if (!entry?.vizElement || !entry.originalLookup) return;

    const filterGroup = (entry.component.props as Record<string, unknown> | undefined)
      ?.filter as { group?: string } | undefined;
    const filterOps = getActiveFilterOps(filterState, entry.pagePath, filterGroup?.group);
    const existingOps = entry.originalLookup.operations.filter((op: DataSetOp) => op.type !== "sort");
    const sortOp: DataSetOp = { type: "sort" as const, columnId, order };
    const effectiveOps: DataSetOp[] = [...filterOps, ...existingOps, sortOp];
    const effectiveLookup: DataSetLookup = { ...entry.originalLookup, operations: effectiveOps };

    try {
      const result = manager.lookup(effectiveLookup);
      (entry.vizElement as unknown as VizTarget).dataSet = result.dataset;
      (entry.vizElement as unknown as VizTarget).totalRows = result.totalRows;
    } catch (err) {
      (entry.vizElement as unknown as VizTarget).error = err instanceof Error ? err.message : String(err);
    }
  }) as EventListener, { signal: abortController.signal });

  // popstate — back/forward browser navigation
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      const deepLink = parseFromUrl(location.hash);
      if (deepLink.page !== currentPage) {
        site.navigate(deepLink.page);
      }
    }, { signal: abortController.signal });
  }

  // ViewState
  const state: ViewState = Object.defineProperties({} as ViewState, {
    currentPage: { get: () => currentPage, enumerable: true },
    activeFilters: { get: () => deriveActiveFilters(filterState, currentPage), enumerable: true },
  });

  const site: LiveSite = {
    root,

    page(path: string): Component | null {
      return pageIndex.get(path) ?? null;
    },

    dataset(id: DataSetId, fromPage?: string): ExternalDataSetDef | null {
      return resolveDataSetDef(id, fromPage ?? currentPage, dataSetScope) ?? null;
    },

    state,

    navigate(path: string): void {
      _navigating = true;
      const segments = path.split("/").filter(Boolean);
      let reached = "";

      for (const segment of segments) {
        const containers = target.querySelectorAll<HTMLElement>(
          "[data-component-type='tabs'], [data-component-type='pills'], [data-component-type='sidebar'], [data-component-type='accordion'], [data-component-type='carousel'], [data-component-type='stack']",
        );
        let found = false;
        for (const container of containers) {
          if (activateSlot(container, segment)) {
            reached = reached ? `${reached}/${segment}` : segment;
            found = true;
            break;
          }
        }
        if (!found) break;
      }

      currentPage = reached;
      _navigating = false;

      if (typeof history !== "undefined") {
        const filters = deriveActiveFilters(filterState, currentPage);
        const hasFilters = Object.keys(filters).length > 0;
        const link: DeepLink = { page: currentPage, ...(hasFilters ? { filters } : {}) };
        history.pushState(null, "", serializeToUrl(link));
      }
    },

    dispose(): void {
      abortController.abort();
      for (const timer of pipeline.refreshTimers.values()) {
        clearInterval(timer);
      }
      pipeline.refreshTimers.clear();
      registry.clear();
      target.innerHTML = "";
    },
  };

  // Apply initial URL state
  if (typeof location !== "undefined" && location.hash) {
    const deepLink = parseFromUrl(location.hash);
    if (deepLink.page) {
      site.navigate(deepLink.page);
    }
    if (deepLink.filters) {
      for (const [col, values] of Object.entries(deepLink.filters)) {
        updateFilter(filterState, currentPage, undefined, col, [...values], false);
      }
    }
  }

  return site;
}
