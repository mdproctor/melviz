export type ExpressionErrorCode =
  | "SYNTAX_ERROR"
  | "EVALUATION_FAILED"
  | "TYPE_COERCION_FAILED";

export class ExpressionError extends Error {
  constructor(
    readonly code: ExpressionErrorCode,
    readonly expression: string,
    readonly position: number | undefined,
    message?: string,
  ) {
    super(`${code}: ${message ?? "Expression error"}`);
    this.name = "ExpressionError";
  }
}
