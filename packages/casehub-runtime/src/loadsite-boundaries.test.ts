import { describe, it, expect } from "vitest";
import { loadSite } from "./site.js";

describe("loadSite input boundaries", () => {
  it("throws on empty YAML string", async () => {
    const target = document.createElement("div");
    await expect(loadSite(target, "")).rejects.toThrow();
  });

  it("throws on invalid YAML that produces null", async () => {
    const target = document.createElement("div");
    // YAML "null" produces JS null
    await expect(loadSite(target, "null")).rejects.toThrow("Invalid input");
  });

  it("throws on YAML that produces a scalar", async () => {
    const target = document.createElement("div");
    await expect(loadSite(target, "42")).rejects.toThrow("Invalid input");
  });

  it("throws on YAML with no pages", async () => {
    const target = document.createElement("div");
    await expect(loadSite(target, "datasets:\n  - uuid: test")).rejects.toThrow("At least one page");
  });

  it("accepts Component object directly", async () => {
    const target = document.createElement("div");
    const site = await loadSite(target, {
      type: "page",
      props: { name: "root" },
      slots: {
        content: [{
          type: "page",
          props: { name: "Page 1" },
          items: [{
            placement: { x: 0, y: 0, w: 12, h: 1 },
            component: { type: "html", props: { content: "<p>test</p>" } },
          }],
        }],
      },
    });
    expect(site.root.type).toBe("page");
    expect(target.innerHTML).toContain("test");
    site.dispose();
  });

  it("dispose cleans up DOM completely", async () => {
    const target = document.createElement("div");
    const yaml = `
pages:
  - components:
      - html: "<p>content</p>"
`;
    const site = await loadSite(target, yaml);
    expect(target.innerHTML).toContain("content");
    site.dispose();
    expect(target.innerHTML).toBe("");
  });

  it("loading a second dashboard after dispose works", async () => {
    const target = document.createElement("div");
    const yaml1 = `
pages:
  - components:
      - html: "<p>first</p>"
`;
    const yaml2 = `
pages:
  - components:
      - html: "<p>second</p>"
`;
    const site1 = await loadSite(target, yaml1);
    expect(target.innerHTML).toContain("first");
    site1.dispose();

    const site2 = await loadSite(target, yaml2);
    expect(target.innerHTML).toContain("second");
    expect(target.innerHTML).not.toContain("first");
    site2.dispose();
  });
});
