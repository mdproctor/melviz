import { describe, it, expect } from "vitest";
import { applyLayoutCSS, isLayoutType } from "./layout.js";

describe("isLayoutType", () => {
  it("recognises layout types", () => {
    expect(isLayoutType("grid")).toBe(true);
    expect(isLayoutType("columns")).toBe(true);
    expect(isLayoutType("rows")).toBe(true);
    expect(isLayoutType("stack")).toBe(true);
    expect(isLayoutType("tabs")).toBe(true);
    expect(isLayoutType("pills")).toBe(true);
    expect(isLayoutType("accordion")).toBe(true);
    expect(isLayoutType("carousel")).toBe(true);
    expect(isLayoutType("sidebar")).toBe(true);
    expect(isLayoutType("panel")).toBe(true);
    expect(isLayoutType("app-grid")).toBe(true);
  });

  it("rejects non-layout types", () => {
    expect(isLayoutType("bar-chart")).toBe(false);
    expect(isLayoutType("html")).toBe(false);
    expect(isLayoutType("page")).toBe(false);
    expect(isLayoutType("tree")).toBe(false);
    expect(isLayoutType("menu")).toBe(false);
  });
});

describe("applyLayoutCSS", () => {
  it("applies grid CSS", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "grid", { columns: 12 });
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("repeat(12, 1fr)");
  });

  it("applies columns CSS with distribution", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "columns", { distribution: [2, 1] });
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("2fr 1fr");
  });

  it("applies rows CSS", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "rows", {});
    expect(el.style.display).toBe("flex");
    expect(el.style.flexDirection).toBe("column");
  });

  it("stack does not set display:grid", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "stack", {});
    expect(el.style.display).not.toBe("grid");
  });

  it("applies sidebar CSS", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "sidebar", {});
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("auto 1fr");
  });

  it("applies app-grid CSS with template areas", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "app-grid", {});
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("auto 1fr");
    expect(el.style.gridTemplateRows).toBe("auto 1fr auto");
  });

  it("accordion applies flex column", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "accordion", {});
    expect(el.style.display).toBe("flex");
    expect(el.style.flexDirection).toBe("column");
  });

  it("tabs/pills/carousel do not set layout CSS (handled by interactivity)", () => {
    for (const type of ["tabs", "pills", "carousel"]) {
      const el = document.createElement("div");
      applyLayoutCSS(el, type, {});
      expect(el.style.display).toBe("");
    }
  });

  it("panel does not set layout CSS", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "panel", {});
    expect(el.style.display).toBe("");
  });

  it("grid defaults to 12 columns if not specified", () => {
    const el = document.createElement("div");
    applyLayoutCSS(el, "grid", undefined);
    expect(el.style.gridTemplateColumns).toBe("repeat(12, 1fr)");
  });
});
