import type { Column, ColumnId } from "./types.js";
import { findColumn } from "./column-lookup.js";
import { ColumnType } from "./types.js";
import type {
  FilterExpression,
  ResolvedFilterExpression,
  CoreFunctionType,
  NumericFilter,
  StringFilter,
  DateFilter,
  ResolvedLeaf,
} from "./filter.js";
import { DataSetError } from "./errors.js";
import { parseTimeFrame } from "./timeframe.js";

export function resolveFilterTypes(
  expression: FilterExpression,
  columns: readonly Column[],
): ResolvedFilterExpression {
  if ("children" in expression) {
    if (expression.type === "and" || expression.type === "or") {
      return {
        type: expression.type,
        children: expression.children.map(child => resolveFilterTypes(child, columns)),
      };
    }
  }

  if ("child" in expression && expression.type === "not") {
    return {
      type: "not",
      child: resolveFilterTypes(expression.child, columns),
    };
  }

  if (expression.type === "unresolved") {
    const column = findColumn(columns, expression.columnId);
    if (!column) {
      throw new DataSetError(
        "UNKNOWN_COLUMN",
        `Column "${expression.columnId}" not found`,
      );
    }

    return resolveLeaf(expression.columnId, expression.fn, expression.args, column.type);
  }

  // Already resolved
  return expression as ResolvedFilterExpression;
}

function resolveLeaf(
  columnId: ColumnId,
  fn: CoreFunctionType,
  args: readonly string[],
  columnType: ColumnType,
): ResolvedLeaf {
  switch (columnType) {
    case ColumnType.NUMBER:
      return { type: "numeric", columnId, filter: resolveNumericFilter(fn, args) };
    case ColumnType.TEXT:
    case ColumnType.LABEL:
      return { type: "string", columnId, filter: resolveStringFilter(fn, args) };
    case ColumnType.DATE:
      return { type: "date", columnId, filter: resolveDateFilter(fn, args) };
  }
}

function resolveNumericFilter(fn: CoreFunctionType, args: readonly string[]): NumericFilter {
  switch (fn) {
    case "IS_NULL":
      return { fn: "IS_NULL" };
    case "NOT_NULL":
      return { fn: "NOT_NULL" };
    case "EQUALS_TO":
      return { fn: "EQUALS_TO", value: parseNumber(args[0]!) };
    case "NOT_EQUALS_TO":
      return { fn: "NOT_EQUALS_TO", value: parseNumber(args[0]!) };
    case "GREATER_THAN":
      return { fn: "GREATER_THAN", value: parseNumber(args[0]!) };
    case "GREATER_OR_EQUALS_TO":
      return { fn: "GREATER_OR_EQUALS_TO", value: parseNumber(args[0]!) };
    case "LOWER_THAN":
      return { fn: "LOWER_THAN", value: parseNumber(args[0]!) };
    case "LOWER_OR_EQUALS_TO":
      return { fn: "LOWER_OR_EQUALS_TO", value: parseNumber(args[0]!) };
    case "BETWEEN":
      return { fn: "BETWEEN", low: parseNumber(args[0]!), high: parseNumber(args[1]!) };
    case "IN":
      return { fn: "IN", values: args.map(parseNumber) };
    case "NOT_IN":
      return { fn: "NOT_IN", values: args.map(parseNumber) };
    case "LIKE_TO":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `LIKE_TO cannot be used with NUMBER columns`,
      );
    case "TIME_FRAME":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `TIME_FRAME cannot be used with NUMBER columns`,
      );
  }
}

function resolveStringFilter(fn: CoreFunctionType, args: readonly string[]): StringFilter {
  switch (fn) {
    case "IS_NULL":
      return { fn: "IS_NULL" };
    case "NOT_NULL":
      return { fn: "NOT_NULL" };
    case "EQUALS_TO":
      return { fn: "EQUALS_TO", value: args[0]! };
    case "NOT_EQUALS_TO":
      return { fn: "NOT_EQUALS_TO", value: args[0]! };
    case "GREATER_THAN":
      return { fn: "GREATER_THAN", value: args[0]! };
    case "GREATER_OR_EQUALS_TO":
      return { fn: "GREATER_OR_EQUALS_TO", value: args[0]! };
    case "LOWER_THAN":
      return { fn: "LOWER_THAN", value: args[0]! };
    case "LOWER_OR_EQUALS_TO":
      return { fn: "LOWER_OR_EQUALS_TO", value: args[0]! };
    case "BETWEEN":
      return { fn: "BETWEEN", low: args[0]!, high: args[1]! };
    case "LIKE_TO": {
      const pattern = args[0]!;
      const caseSensitive = args[1] === "false" ? false : true;
      return { fn: "LIKE_TO", pattern, caseSensitive };
    }
    case "IN":
      return { fn: "IN", values: args };
    case "NOT_IN":
      return { fn: "NOT_IN", values: args };
    case "TIME_FRAME":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `TIME_FRAME cannot be used with TEXT/LABEL columns`,
      );
  }
}

function resolveDateFilter(fn: CoreFunctionType, args: readonly string[]): DateFilter {
  switch (fn) {
    case "IS_NULL":
      return { fn: "IS_NULL" };
    case "NOT_NULL":
      return { fn: "NOT_NULL" };
    case "EQUALS_TO":
      return { fn: "EQUALS_TO", value: parseDate(args[0]!) };
    case "NOT_EQUALS_TO":
      return { fn: "NOT_EQUALS_TO", value: parseDate(args[0]!) };
    case "GREATER_THAN":
      return { fn: "GREATER_THAN", value: parseDate(args[0]!) };
    case "GREATER_OR_EQUALS_TO":
      return { fn: "GREATER_OR_EQUALS_TO", value: parseDate(args[0]!) };
    case "LOWER_THAN":
      return { fn: "LOWER_THAN", value: parseDate(args[0]!) };
    case "LOWER_OR_EQUALS_TO":
      return { fn: "LOWER_OR_EQUALS_TO", value: parseDate(args[0]!) };
    case "BETWEEN":
      return { fn: "BETWEEN", low: parseDate(args[0]!), high: parseDate(args[1]!) };
    case "TIME_FRAME":
      return { fn: "TIME_FRAME", timeFrame: parseTimeFrame(args[0]!) };
    case "IN":
      return { fn: "IN", values: args.map(parseDate) };
    case "NOT_IN":
      return { fn: "NOT_IN", values: args.map(parseDate) };
    case "LIKE_TO":
      throw new DataSetError(
        "RESOLUTION_FAILED",
        `LIKE_TO cannot be used with DATE columns`,
      );
  }
}

function parseNumber(s: string): number {
  const n = parseFloat(s);
  if (Number.isNaN(n)) {
    throw new DataSetError(
      "RESOLUTION_FAILED",
      `Cannot parse "${s}" as a number`,
    );
  }
  return n;
}

function parseDate(s: string): Date {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new DataSetError(
      "RESOLUTION_FAILED",
      `Cannot parse "${s}" as a date`,
    );
  }
  return d;
}
