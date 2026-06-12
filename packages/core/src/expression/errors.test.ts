import { describe, it, expect } from "vitest";
import { ExpressionError } from "./errors.js";

describe("ExpressionError", () => {
  it("creates a SYNTAX_ERROR with position", () => {
    const err = new ExpressionError("SYNTAX_ERROR", "bad + +", 6, "Unexpected token");
    expect(err.code).toBe("SYNTAX_ERROR");
    expect(err.expression).toBe("bad + +");
    expect(err.position).toBe(6);
    expect(err.message).toBe("SYNTAX_ERROR: Unexpected token");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ExpressionError");
  });

  it("creates EVALUATION_FAILED without position", () => {
    const err = new ExpressionError("EVALUATION_FAILED", "$unknown()", undefined, "Unknown function");
    expect(err.code).toBe("EVALUATION_FAILED");
    expect(err.position).toBeUndefined();
  });

  it("creates TYPE_COERCION_FAILED", () => {
    const err = new ExpressionError("TYPE_COERCION_FAILED", "$keys(value)", undefined, "Result is an array");
    expect(err.code).toBe("TYPE_COERCION_FAILED");
  });
});
