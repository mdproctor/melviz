import { compileOrCached } from "./jsonata-bridge.js";
import { ExpressionError } from "./errors.js";

export async function evaluateExpression(
  value: string | null,
  expression: string | undefined,
  onError?: (error: ExpressionError) => void,
): Promise<string | null> {
  if (!expression || expression === "value") {
    return value;
  }

  try {
    const compiled = compileOrCached(expression);
    const contextValue = coerceToNumber(value);
    const result = await compiled.evaluate({ value: contextValue });
    return coerceResult(result, value, expression, onError);
  } catch (err: unknown) {
    if (onError) {
      onError(
        err instanceof ExpressionError
          ? err
          : new ExpressionError("EVALUATION_FAILED", expression, undefined, String(err)),
      );
    }
    return value;
  }
}

function coerceToNumber(value: string | null): string | number | null {
  if (value === null) return null;
  const num = Number(value);
  return isNaN(num) || value.trim() === "" ? value : num;
}

function coerceResult(
  result: unknown,
  originalValue: string | null,
  expression: string,
  onError?: (error: ExpressionError) => void,
): string | null {
  if (result === undefined || result === null) {
    return null;
  }
  if (typeof result === "string") {
    return result;
  }
  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }
  if (onError) {
    onError(
      new ExpressionError(
        "TYPE_COERCION_FAILED",
        expression,
        undefined,
        `Expression produced ${typeof result}, expected scalar`,
      ),
    );
  }
  return originalValue;
}
