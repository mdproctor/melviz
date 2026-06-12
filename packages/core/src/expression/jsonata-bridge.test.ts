import { describe, it, expect, beforeEach } from "vitest";
import { compile, compileOrCached, clearCache } from "./jsonata-bridge.js";
import { ExpressionError } from "./errors.js";

describe("compile", () => {
  it("compiles a valid expression", () => {
    const expr = compile("2 + 3");
    expect(expr).toBeDefined();
    expect(typeof expr.evaluate).toBe("function");
  });

  it("throws ExpressionError with SYNTAX_ERROR for invalid expression", () => {
    expect(() => compile("2 + +")).toThrow(ExpressionError);
    try {
      compile("2 + +");
    } catch (e) {
      const err = e as ExpressionError;
      expect(err.code).toBe("SYNTAX_ERROR");
      expect(err.expression).toBe("2 + +");
      expect(err.position).toBeTypeOf("number");
    }
  });
});

describe("evaluate", () => {
  it("evaluates simple arithmetic", async () => {
    const expr = compile("2 + 3");
    const result = await expr.evaluate({});
    expect(result).toBe(5);
  });

  it("evaluates with data binding", async () => {
    const expr = compile("account.name");
    const result = await expr.evaluate({ account: { name: "Alice" } });
    expect(result).toBe("Alice");
  });

  it("evaluates with variable bindings", async () => {
    const expr = compile("$x * $y");
    const result = await expr.evaluate({}, { x: 3, y: 4 });
    expect(result).toBe(12);
  });

  it("returns undefined for missing path", async () => {
    const expr = compile("missing.path");
    const result = await expr.evaluate({ other: 1 });
    expect(result).toBeUndefined();
  });

  it("evaluates string functions", async () => {
    const expr = compile("$uppercase(name)");
    const result = await expr.evaluate({ name: "hello" });
    expect(result).toBe("HELLO");
  });
});

describe("compileOrCached", () => {
  beforeEach(() => {
    clearCache();
  });

  it("returns the same compiled object for the same expression string", () => {
    const a = compileOrCached("1 + 1");
    const b = compileOrCached("1 + 1");
    expect(a).toBe(b);
  });

  it("returns different objects for different expressions", () => {
    const a = compileOrCached("1 + 1");
    const b = compileOrCached("2 + 2");
    expect(a).not.toBe(b);
  });

  it("clearCache causes recompilation", () => {
    const a = compileOrCached("1 + 1");
    clearCache();
    const b = compileOrCached("1 + 1");
    expect(a).not.toBe(b);
  });
});
