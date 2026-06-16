import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
import { loadSite } from "./site.js";
import type { LiveSite } from "./site.js";

function simpleSite(): Component {
  return {
    type: "page",
    props: {
      name: "App",
      datasets: [{
        uuid: "sales" as DataSetId,
        content: JSON.stringify([
          { region: "North", revenue: 100 },
          { region: "South", revenue: 200 },
        ]),
      }],
    },
    slots: {
      default: [
        { type: "title", props: { text: "Dashboard" } },
      ],
    },
  };
}

describe("loadSite", () => {
  it("renders component tree into target", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(target.children.length).toBeGreaterThan(0);
    expect(target.querySelector("[data-component-type='page']")).toBeTruthy();
    site.dispose();
    document.body.removeChild(target);
  });

  it("returns working Site interface", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(site.root).toBeTruthy();
    expect(site.root.type).toBe("page");
    expect(site.state).toBeTruthy();
    site.dispose();
    document.body.removeChild(target);
  });

  it("page() returns component by path", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    const root = site.page("");
    expect(root).toBeTruthy();
    expect(root?.type).toBe("page");
    site.dispose();
    document.body.removeChild(target);
  });

  it("dataset() resolves from page scope", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    const ds = site.dataset("sales" as DataSetId);
    expect(ds).toBeTruthy();
    expect(ds?.uuid).toBe("sales");
    site.dispose();
    document.body.removeChild(target);
  });

  it("dispose clears target", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    site.dispose();
    expect(target.children.length).toBe(0);
    document.body.removeChild(target);
  });

  it("dispose is idempotent", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    site.dispose();
    site.dispose();
    expect(target.children.length).toBe(0);
    document.body.removeChild(target);
  });

  it("page() returns null for unknown path", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(site.page("nonexistent")).toBeNull();
    site.dispose();
    document.body.removeChild(target);
  });

  it("dataset() returns null for unknown id", async () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const site = await loadSite(target, simpleSite());
    expect(site.dataset("unknown" as DataSetId)).toBeNull();
    site.dispose();
    document.body.removeChild(target);
  });

  it("accepts a YAML string as source", async () => {
    const yaml = `
pages:
  - components:
      - html: "<p>hello</p>"
`;
    const target = document.createElement("div");
    const site = await loadSite(target, yaml);
    expect(site.root.type).toBe("page");
    expect(target.innerHTML).toContain("hello");
    site.dispose();
  });
});
