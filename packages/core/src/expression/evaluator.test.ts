import { describe, it, expect, vi } from "vitest";
import { evaluateExpression } from "./evaluator.js";

describe("evaluateExpression — fast paths", () => {
  it("returns value when expression is undefined", async () => {
    expect(await evaluateExpression("hello", undefined)).toBe("hello");
  });

  it("returns value when expression is empty string", async () => {
    expect(await evaluateExpression("hello", "")).toBe("hello");
  });

  it("returns value when expression is 'value'", async () => {
    expect(await evaluateExpression("hello", "value")).toBe("hello");
  });

  it("returns null when value is null and no expression", async () => {
    expect(await evaluateExpression(null, undefined)).toBeNull();
  });

  it("returns null when value is null and expression is 'value'", async () => {
    expect(await evaluateExpression(null, "value")).toBeNull();
  });
});

describe("evaluateExpression — transforms", () => {
  it("evaluates $uppercase", async () => {
    expect(await evaluateExpression("hello", "$uppercase(value)")).toBe("HELLO");
  });

  it("evaluates arithmetic", async () => {
    expect(await evaluateExpression("42", "value * 100")).toBe("4200");
  });

  it("evaluates $trim", async () => {
    expect(await evaluateExpression("  hello  ", "$trim(value)")).toBe("hello");
  });

  it("evaluates $substring", async () => {
    expect(await evaluateExpression("hello world", "$substring(value, 0, 5)")).toBe("hello");
  });
});

describe("evaluateExpression — null handling", () => {
  it("null value with null-coalescing expression", async () => {
    expect(await evaluateExpression(null, "value ? value : 'N/A'")).toBe("N/A");
  });

  it("null value with arithmetic returns null", async () => {
    expect(await evaluateExpression(null, "value * 100")).toBeNull();
  });
});

describe("evaluateExpression — coercion", () => {
  it("coerces number result to string", async () => {
    const result = await evaluateExpression("5", "value + 10");
    expect(result).toBe("15");
    expect(typeof result).toBe("string");
  });

  it("coerces boolean result to string", async () => {
    const result = await evaluateExpression("5", "value > 3");
    expect(result).toBe("true");
  });

  it("array result triggers onError and returns original value", async () => {
    const onError = vi.fn();
    const result = await evaluateExpression("hello", "$split(value, '')", onError);
    expect(result).toBe("hello");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]!.code).toBe("TYPE_COERCION_FAILED");
  });
});

describe("evaluateExpression — error handling", () => {
  it("invalid expression returns original value and calls onError", async () => {
    const onError = vi.fn();
    const result = await evaluateExpression("hello", "bad + +", onError);
    expect(result).toBe("hello");
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]!.code).toBe("SYNTAX_ERROR");
  });

  it("without onError, invalid expression still returns original value", async () => {
    const result = await evaluateExpression("hello", "bad + +");
    expect(result).toBe("hello");
  });
});
