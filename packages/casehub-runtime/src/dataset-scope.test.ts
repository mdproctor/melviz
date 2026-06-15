import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
import { buildDataSetScope, resolveDataSetDef } from "./dataset-scope.js";
import { buildPagePathMap } from "./page-paths.js";

function makeDef(uuid: string) {
  return { uuid: uuid as DataSetId, content: "[]" } as any;
}

describe("buildDataSetScope", () => {
  it("root page datasets scoped to empty path", () => {
    const ds = makeDef("sales");
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(scope.get("")?.get("sales" as DataSetId)).toBe(ds);
  });

  it("child page inherits parent datasets", () => {
    const ds = makeDef("global");
    const child: Component = { type: "page", props: { name: "Sales" } };
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: { Sales: [child] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(scope.get("Sales")?.get("global" as DataSetId)).toBe(ds);
  });

  it("child page overrides parent dataset with same id", () => {
    const parentDs = makeDef("data");
    const childDs = makeDef("data");
    const child: Component = {
      type: "page",
      props: { name: "Sales", datasets: [childDs] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [parentDs] },
      slots: { Sales: [child] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(scope.get("Sales")?.get("data" as DataSetId)).toBe(childDs);
  });
});

describe("resolveDataSetDef", () => {
  it("resolves from own page", () => {
    const ds = makeDef("local");
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(resolveDataSetDef("local" as DataSetId, "", scope)).toBe(ds);
  });

  it("walks up ancestors to find dataset", () => {
    const ds = makeDef("root-ds");
    const grandchild: Component = { type: "page", props: { name: "Detail" } };
    const child: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: { Detail: [grandchild] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App", datasets: [ds] },
      slots: { Sales: [child] },
    };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(resolveDataSetDef("root-ds" as DataSetId, "Sales/Detail", scope)).toBe(ds);
  });

  it("returns undefined for unknown dataset", () => {
    const root: Component = { type: "page", props: { name: "App" } };
    const paths = buildPagePathMap(root);
    const scope = buildDataSetScope(root, paths);
    expect(resolveDataSetDef("nonexistent" as DataSetId, "", scope)).toBeUndefined();
  });
});
