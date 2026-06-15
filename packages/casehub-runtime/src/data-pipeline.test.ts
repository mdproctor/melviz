import { describe, it, expect, vi } from "vitest";
import type { DataSetId, Column, ColumnId } from "@casehub/data/dist/dataset/types.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";
import { toTypedDataSet } from "@casehub/data/dist/dataset/conversion.js";
import { createDataSetManager } from "@casehub/data/dist/dataset/manager.js";
import { createDataPipeline } from "./data-pipeline.js";
import type { VizTarget } from "./data-pipeline.js";
import type { ComponentRegistry } from "./registry.js";
import type { DataSetScope } from "./dataset-scope.js";
import { createFilterState } from "./cross-filter.js";
import { getActiveFilterOps } from "./cross-filter.js";
import type { FilterState } from "./cross-filter.js";
import type { ResolverContext } from "@casehub/data/dist/dataset/external/resolver.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

function regionDataSet(rows: string[][]) {
  return toTypedDataSet({
    columns: [col("region", "Region", ColumnType.LABEL)],
    data: rows,
  });
}

function makeTarget(): VizTarget {
  return { dataSet: undefined, totalRows: -1, theme: "", error: "" };
}

describe("createDataPipeline", () => {
  it("resolves data-request for registered dataset", () => {
    const manager = createDataSetManager();
    const ds = regionDataSet([["North"], ["South"], ["East"]]);
    manager.register("sales" as DataSetId, ds);

    const registry: ComponentRegistry = new Map();
    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
    });

    const pipeline = createDataPipeline(
      manager,
      new Map() as DataSetScope,
      registry,
      createFilterState(),
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "sales" as DataSetId, operations: [] }, "chart-1");

    expect(target.dataSet).toBeTruthy();
    expect(target.totalRows).toBe(3);
  });

  it("sets error for unknown dataset with no scope entry", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
    });

    const pipeline = createDataPipeline(
      manager,
      new Map() as DataSetScope,
      registry,
      createFilterState(),
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "unknown" as DataSetId, operations: [] }, "chart-1");

    expect(target.error).toContain("unknown");
  });

  it("does nothing for unregistered componentId", () => {
    const manager = createDataSetManager();
    const registry: ComponentRegistry = new Map();
    const pipeline = createDataPipeline(
      manager,
      new Map() as DataSetScope,
      registry,
      createFilterState(),
    );

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "any" as DataSetId, operations: [] }, "nonexistent");

    expect(target.dataSet).toBeUndefined();
    expect(target.error).toBe("");
  });
});

describe("getActiveFilterOps", () => {
  it("returns empty array when no filters exist", () => {
    const fs = createFilterState();
    expect(getActiveFilterOps(fs, "page1", undefined)).toEqual([]);
  });

  it("returns filter ops for matching page and group", () => {
    const fs: FilterState = new Map([
      ["page1", new Map([
        ["groupA", new Map([["region", ["North"]]])],
      ])],
    ]);
    const ops = getActiveFilterOps(fs, "page1", "groupA");
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("filter");
  });

  it("includes ungrouped filters for grouped components", () => {
    const fs: FilterState = new Map([
      ["page1", new Map<string | undefined, Map<string, string[]>>([
        [undefined, new Map([["year", ["2024"]]])],
        ["groupA", new Map([["region", ["North"]]])],
      ])],
    ]);
    const ops = getActiveFilterOps(fs, "page1", "groupA");
    expect(ops).toHaveLength(2);
  });

  it("returns only ungrouped filters when group is undefined", () => {
    const fs: FilterState = new Map([
      ["page1", new Map<string | undefined, Map<string, string[]>>([
        [undefined, new Map([["year", ["2024"]]])],
        ["groupA", new Map([["region", ["North"]]])],
      ])],
    ]);
    const ops = getActiveFilterOps(fs, "page1", undefined);
    expect(ops).toHaveLength(1);
  });
});

describe("data pipeline with filters", () => {
  it("applies active filters when pushing data", () => {
    const manager = createDataSetManager();
    const ds = regionDataSet([["North"], ["South"], ["East"]]);
    manager.register("sales" as DataSetId, ds);

    const registry: ComponentRegistry = new Map();
    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart", props: { filter: { listening: true } } },
      pagePath: "page1",
    });

    const filterState: FilterState = new Map([
      ["page1", new Map<string | undefined, Map<string, string[]>>([
        [undefined, new Map([["region", ["North"]]])],
      ])],
    ]);

    const pipeline = createDataPipeline(manager, new Map() as DataSetScope, registry, filterState);

    const target = makeTarget();
    pipeline.handleDataRequest(target, { dataSetId: "sales" as DataSetId, operations: [] }, "chart-1");

    expect(target.totalRows).toBe(1);
  });
});

describe("data pipeline deduplication", () => {
  it("shares one resolution promise for concurrent requests to same dataSetId", async () => {
    const manager = createDataSetManager();
    const ds = regionDataSet([["North"], ["South"]]);

    const registry: ComponentRegistry = new Map();
    registry.set("chart-1", {
      element: document.createElement("div"),
      component: { type: "bar-chart" },
      pagePath: "",
    });
    registry.set("chart-2", {
      element: document.createElement("div"),
      component: { type: "line-chart" },
      pagePath: "",
    });

    const def = { uuid: "sales" as DataSetId, content: "[]" } as any;
    const scope: DataSetScope = new Map([
      ["", new Map([[def.uuid, def]])],
    ]);

    const pipeline = createDataPipeline(manager, scope, registry, createFilterState());

    let resolveCount = 0;
    const mockCtx: ResolverContext = {
      manager,
      providerFactory: { create: () => undefined },
      providerConfig: {},
      presetRegistry: { get: () => undefined, has: () => false },
    };
    pipeline.setResolverCtx(mockCtx);

    const originalResolve = (await import("@casehub/data/dist/dataset/external/resolver.js")).resolveExternalDataSet;

    // The pipeline already has one pending promise. Verify it's shared.
    const target1 = makeTarget();
    const target2 = makeTarget();

    pipeline.handleDataRequest(target1, { dataSetId: "sales" as DataSetId, operations: [] }, "chart-1");
    pipeline.handleDataRequest(target2, { dataSetId: "sales" as DataSetId, operations: [] }, "chart-2");

    expect(pipeline.pendingResolutions.size).toBe(1);
  });
});
