import type { ColumnId } from "./types.js";

export type SortOrder = "ASCENDING" | "DESCENDING";

export interface SortColumn {
  readonly columnId: ColumnId;
  readonly order: SortOrder;
}

export interface SortOp {
  readonly type: "sort";
  readonly columns: readonly SortColumn[];
}
