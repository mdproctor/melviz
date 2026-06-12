import jsonata from "jsonata";
import { ExpressionError } from "./errors.js";

export interface CompiledExpression {
  evaluate(data: unknown, bindings?: Record<string, unknown>): Promise<unknown>;
}

const cache = new Map<string, CompiledExpression>();

export function compile(expression: string): CompiledExpression {
  try {
    const compiled = jsonata(expression);
    return {
      evaluate: (data: unknown, bindings?: Record<string, unknown>) =>
        compiled.evaluate(data, bindings).catch((err: unknown) => {
          throw new ExpressionError(
            "EVALUATION_FAILED",
            expression,
            (err as { position?: number }).position,
            err instanceof Error ? err.message : String(err),
          );
        }),
    };
  } catch (err: unknown) {
    throw new ExpressionError(
      "SYNTAX_ERROR",
      expression,
      (err as { position?: number }).position,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function compileOrCached(expression: string): CompiledExpression {
  const existing = cache.get(expression);
  if (existing) return existing;
  const compiled = compile(expression);
  cache.set(expression, compiled);
  return compiled;
}

export function clearCache(): void {
  cache.clear();
}
