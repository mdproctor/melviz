export type DataSetErrorCode =
  | "FETCH_FAILED"
  | "PARSE_FAILED"
  | "SCHEMA_MISMATCH"
  | "TRANSFORM_FAILED"
  | "TIMEOUT"
  | "INVALID_REF"
  | "UNKNOWN_COLUMN"
  | "TYPE_MISMATCH"
  | "UNKNOWN_PROVIDER"
  | "INVALID_OPERATION"
  | "RESOLUTION_FAILED"
  | "UNKNOWN_PRESET"
  | "EXTRACTION_ERROR"
  | "INVALID_DEFINITION"
  | "EMPTY_RESULT";

export class DataSetError extends Error {
  override readonly cause?: unknown;

  constructor(
    readonly code: DataSetErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(`${code}: ${message}`);
    this.name = "DataSetError";
    this.cause = cause;
  }

  get recoverable(): boolean {
    return this.code === "FETCH_FAILED" || this.code === "TIMEOUT";
  }
}
