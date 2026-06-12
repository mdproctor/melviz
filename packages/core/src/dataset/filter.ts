import type { ColumnId } from "./types.js";
import type { TimeFrame } from "./timeframe.js";

export type CoreFunctionType =
  | "IS_NULL" | "NOT_NULL"
  | "EQUALS_TO" | "NOT_EQUALS_TO"
  | "LIKE_TO"
  | "GREATER_THAN" | "GREATER_OR_EQUALS_TO"
  | "LOWER_THAN" | "LOWER_OR_EQUALS_TO"
  | "BETWEEN"
  | "TIME_FRAME"
  | "IN" | "NOT_IN";

type NullFilter =
  | { readonly fn: "IS_NULL" }
  | { readonly fn: "NOT_NULL" };

export type NumericFilter =
  | NullFilter
  | { readonly fn: "EQUALS_TO"; readonly value: number }
  | { readonly fn: "NOT_EQUALS_TO"; readonly value: number }
  | { readonly fn: "GREATER_THAN"; readonly value: number }
  | { readonly fn: "GREATER_OR_EQUALS_TO"; readonly value: number }
  | { readonly fn: "LOWER_THAN"; readonly value: number }
  | { readonly fn: "LOWER_OR_EQUALS_TO"; readonly value: number }
  | { readonly fn: "BETWEEN"; readonly low: number; readonly high: number }
  | { readonly fn: "IN"; readonly values: readonly number[] }
  | { readonly fn: "NOT_IN"; readonly values: readonly number[] };

export type StringFilter =
  | NullFilter
  | { readonly fn: "EQUALS_TO"; readonly value: string }
  | { readonly fn: "NOT_EQUALS_TO"; readonly value: string }
  | { readonly fn: "GREATER_THAN"; readonly value: string }
  | { readonly fn: "GREATER_OR_EQUALS_TO"; readonly value: string }
  | { readonly fn: "LOWER_THAN"; readonly value: string }
  | { readonly fn: "LOWER_OR_EQUALS_TO"; readonly value: string }
  | { readonly fn: "BETWEEN"; readonly low: string; readonly high: string }
  | { readonly fn: "LIKE_TO"; readonly pattern: string; readonly caseSensitive: boolean }
  | { readonly fn: "IN"; readonly values: readonly string[] }
  | { readonly fn: "NOT_IN"; readonly values: readonly string[] };

export type DateFilter =
  | NullFilter
  | { readonly fn: "EQUALS_TO"; readonly value: Date }
  | { readonly fn: "NOT_EQUALS_TO"; readonly value: Date }
  | { readonly fn: "GREATER_THAN"; readonly value: Date }
  | { readonly fn: "GREATER_OR_EQUALS_TO"; readonly value: Date }
  | { readonly fn: "LOWER_THAN"; readonly value: Date }
  | { readonly fn: "LOWER_OR_EQUALS_TO"; readonly value: Date }
  | { readonly fn: "BETWEEN"; readonly low: Date; readonly high: Date }
  | { readonly fn: "TIME_FRAME"; readonly timeFrame: TimeFrame }
  | { readonly fn: "IN"; readonly values: readonly Date[] }
  | { readonly fn: "NOT_IN"; readonly values: readonly Date[] };

export type FilterExprTree<Leaf> =
  | Leaf
  | { readonly type: "and"; readonly children: readonly FilterExprTree<Leaf>[] }
  | { readonly type: "or"; readonly children: readonly FilterExprTree<Leaf>[] }
  | { readonly type: "not"; readonly child: FilterExprTree<Leaf> };

export type ResolvedLeaf =
  | { readonly type: "numeric"; readonly columnId: ColumnId; readonly filter: NumericFilter }
  | { readonly type: "string"; readonly columnId: ColumnId; readonly filter: StringFilter }
  | { readonly type: "date"; readonly columnId: ColumnId; readonly filter: DateFilter };

export type UnresolvedLeaf = {
  readonly type: "unresolved";
  readonly columnId: ColumnId;
  readonly fn: CoreFunctionType;
  readonly args: readonly string[];
};

export type ResolvedFilterExpression = FilterExprTree<ResolvedLeaf>;
export type FilterExpression = FilterExprTree<ResolvedLeaf | UnresolvedLeaf>;

export interface ResolvedFilterOp {
  readonly type: "filter";
  readonly expressions: readonly ResolvedFilterExpression[];
}

export interface FilterOp {
  readonly type: "filter";
  readonly expressions: readonly FilterExpression[];
}
