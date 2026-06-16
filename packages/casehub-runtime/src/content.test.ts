import { describe, it, expect, beforeEach } from "vitest";
import { renderMarkdown, renderHtml, renderTitle } from "./content.js";

describe("renderMarkdown", () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement("div");
  });

  it("renders bold text as <strong>", () => {
    renderMarkdown(el, { content: "**bold**" });
    expect(el.querySelector(".casehub-markdown")?.innerHTML).toContain("<strong>bold</strong>");
  });

  it("renders heading", () => {
    renderMarkdown(el, { content: "### Heading" });
    expect(el.querySelector(".casehub-markdown")?.innerHTML).toContain("<h3>Heading</h3>");
  });

  it("renders mixed markdown and HTML", () => {
    renderMarkdown(el, { content: "**Filters**\n<br />\nSome text" });
    const html = el.querySelector(".casehub-markdown")?.innerHTML ?? "";
    expect(html).toContain("<strong>Filters</strong>");
    expect(html).toContain("<br");
  });

  it("renders empty string without error", () => {
    renderMarkdown(el, { content: "" });
    expect(el.querySelector(".casehub-markdown")).toBeDefined();
  });

  it("handles non-string content gracefully", () => {
    renderMarkdown(el, { content: 42 });
    expect(el.querySelector(".casehub-markdown")?.textContent).toBe("");
  });

  it("adds casehub-markdown class to wrapper", () => {
    renderMarkdown(el, { content: "text" });
    expect(el.querySelector(".casehub-markdown")).not.toBeNull();
  });
});

describe("renderTitle", () => {
  it("creates h1 by default", () => {
    const el = document.createElement("div");
    renderTitle(el, { text: "Hello" });
    expect(el.querySelector("h1")?.textContent).toBe("Hello");
  });

  it("creates h3 when size specified", () => {
    const el = document.createElement("div");
    renderTitle(el, { text: "Hello", size: "h3" });
    expect(el.querySelector("h3")?.textContent).toBe("Hello");
  });
});

describe("renderHtml", () => {
  it("sets innerHTML from content", () => {
    const el = document.createElement("div");
    renderHtml(el, { content: "<p>hello</p>" });
    expect(el.innerHTML).toBe("<p>hello</p>");
  });
});
