import { describe, it, expect } from "vitest";
import { substituteProperties } from "./property-substitution.js";

describe("substituteProperties", () => {
  it("replaces ${name} in string values", () => {
    const result = substituteProperties(
      { pages: [{ components: [{ html: "Hello ${name}" }] }] },
      { name: "World" },
    );
    expect((result as any).pages[0].components[0].html).toBe("Hello World");
  });

  it("replaces in nested objects", () => {
    const result = substituteProperties(
      { url: "https://api.com/${endpoint}" },
      { endpoint: "users" },
    );
    expect((result as any).url).toBe("https://api.com/users");
  });

  it("skips metric template fields (html.html and html.javascript)", () => {
    const input = {
      displayer: {
        type: "METRIC",
        html: {
          html: "<div>${value}</div>",
          javascript: "${this}.style.color = 'red'",
        },
      },
    };
    const result = substituteProperties(input, { value: "SHOULD_NOT_REPLACE" });
    expect((result as any).displayer.html.html).toBe("<div>${value}</div>");
    expect((result as any).displayer.html.javascript).toBe(
      "${this}.style.color = 'red'",
    );
  });

  it("leaves non-matching ${...} intact", () => {
    const result = substituteProperties(
      { text: "Hello ${unknown}" },
      { name: "World" },
    );
    expect((result as any).text).toBe("Hello ${unknown}");
  });

  it("handles multiple substitutions in one string", () => {
    const result = substituteProperties(
      { text: "${greeting} ${name}!" },
      { greeting: "Hello", name: "World" },
    );
    expect((result as any).text).toBe("Hello World!");
  });

  it("handles primitives (numbers, booleans, null)", () => {
    const result = substituteProperties(
      { num: 42, bool: true, nul: null },
      { x: "y" },
    );
    expect(result).toEqual({ num: 42, bool: true, nul: null });
  });

  it("handles arrays of primitives", () => {
    const result = substituteProperties(
      { items: ["${prefix}_a", "${prefix}_b", 123] },
      { prefix: "test" },
    );
    expect((result as any).items).toEqual(["test_a", "test_b", 123]);
  });

  it("preserves empty properties map", () => {
    const result = substituteProperties({ text: "${name}" }, {});
    expect((result as any).text).toBe("${name}");
  });

  it("handles nested arrays", () => {
    const result = substituteProperties(
      { matrix: [["${a}", "${b}"], ["${c}"]] },
      { a: "1", b: "2", c: "3" },
    );
    expect((result as any).matrix).toEqual([["1", "2"], ["3"]]);
  });

  it("handles deeply nested metric templates", () => {
    const input = {
      pages: [
        {
          components: [
            {
              displayer: {
                html: {
                  html: "<span>${value}</span>",
                  javascript: "console.log(${this})",
                },
              },
            },
          ],
        },
      ],
    };
    const result = substituteProperties(input, { value: "NOPE" });
    expect(
      (result as any).pages[0].components[0].displayer.html.html,
    ).toBe("<span>${value}</span>");
    expect(
      (result as any).pages[0].components[0].displayer.html.javascript,
    ).toBe("console.log(${this})");
  });
});
