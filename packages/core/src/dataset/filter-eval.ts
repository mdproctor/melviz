import type { CellValue, TypedDataSet, TypedRow } from "./types.js";
import type { ResolvedFilterOp, ResolvedFilterExpression, NumericFilter, StringFilter, DateFilter } from "./filter.js";
import type { TimeFrame } from "./timeframe.js";
import { resolveTimeFrame } from "./timeframe.js";

type ResolvedTimeFrames = Map<TimeFrame, { from: Date; to: Date }>;

export function applyFilter(
  ds: TypedDataSet,
  op: ResolvedFilterOp,
  referenceDate?: Date,
): TypedDataSet {
  const ref = referenceDate ?? new Date();
  const resolved = preResolveTimeFrames(op.expressions, ref);
  const rows = ds.rows.filter((row) =>
    op.expressions.every((expr) => evaluateExpression(row, expr, resolved)),
  );
  return { columns: ds.columns, rows };
}

function preResolveTimeFrames(
  expressions: readonly ResolvedFilterExpression[],
  referenceDate: Date,
): ResolvedTimeFrames {
  const resolved: ResolvedTimeFrames = new Map();
  walkExpressions(expressions, (expr) => {
    if (expr.type === "date" && expr.filter.fn === "TIME_FRAME") {
      const tf = expr.filter.timeFrame;
      if (!resolved.has(tf)) {
        resolved.set(tf, resolveTimeFrame(tf, referenceDate));
      }
    }
  });
  return resolved;
}

function walkExpressions(
  expressions: readonly ResolvedFilterExpression[],
  visitor: (expr: ResolvedFilterExpression) => void,
): void {
  for (const expr of expressions) {
    visitor(expr);
    switch (expr.type) {
      case "and": walkExpressions(expr.children, visitor); break;
      case "or": walkExpressions(expr.children, visitor); break;
      case "not": walkExpressions([expr.child], visitor); break;
    }
  }
}

function evaluateExpression(
  row: TypedRow,
  expr: ResolvedFilterExpression,
  resolved: ResolvedTimeFrames,
): boolean {
  switch (expr.type) {
    case "numeric":
      return evaluateNumericFilter(row.cell(expr.columnId), expr.filter);
    case "string":
      return evaluateStringFilter(row.cell(expr.columnId), expr.filter);
    case "date":
      return evaluateDateFilter(row.cell(expr.columnId), expr.filter, resolved);
    case "and":
      return expr.children.every((c) => evaluateExpression(row, c, resolved));
    case "or":
      return expr.children.some((c) => evaluateExpression(row, c, resolved));
    case "not":
      return !evaluateExpression(row, expr.child, resolved);
  }
}

function evaluateNumericFilter(cell: CellValue, filter: NumericFilter): boolean {
  if (filter.fn === "IS_NULL") return cell.type === "NULL";
  if (filter.fn === "NOT_NULL") return cell.type !== "NULL";
  if (cell.type === "NULL") return false;

  const value = cell.type === "NUMBER" ? cell.value : NaN;

  switch (filter.fn) {
    case "EQUALS_TO": return value === filter.value;
    case "NOT_EQUALS_TO": return value !== filter.value;
    case "GREATER_THAN": return value > filter.value;
    case "GREATER_OR_EQUALS_TO": return value >= filter.value;
    case "LOWER_THAN": return value < filter.value;
    case "LOWER_OR_EQUALS_TO": return value <= filter.value;
    case "BETWEEN": return value >= filter.low && value <= filter.high;
    case "IN": return filter.values.includes(value);
    case "NOT_IN": return !filter.values.includes(value);
  }
}

function evaluateStringFilter(cell: CellValue, filter: StringFilter): boolean {
  if (filter.fn === "IS_NULL") return cell.type === "NULL";
  if (filter.fn === "NOT_NULL") return cell.type !== "NULL";
  if (cell.type === "NULL") return false;

  const value = (cell.type === "TEXT" || cell.type === "LABEL") ? cell.value : "";

  switch (filter.fn) {
    case "EQUALS_TO": return value === filter.value;
    case "NOT_EQUALS_TO": return value !== filter.value;
    case "GREATER_THAN": return value > filter.value;
    case "GREATER_OR_EQUALS_TO": return value >= filter.value;
    case "LOWER_THAN": return value < filter.value;
    case "LOWER_OR_EQUALS_TO": return value <= filter.value;
    case "BETWEEN": return value >= filter.low && value <= filter.high;
    case "IN": return filter.values.includes(value);
    case "NOT_IN": return !filter.values.includes(value);
    case "LIKE_TO": {
      const patternStr = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();
      const strValue = filter.caseSensitive ? value : value.toLowerCase();
      const regex = new RegExp("^" + compileLikePattern(patternStr) + "$");
      return regex.test(strValue);
    }
  }
}

function compileLikePattern(pattern: string): string {
  let result = "";
  let inBracket = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;

    if (inBracket) {
      result += ch;
      if (ch === "]") inBracket = false;
      continue;
    }

    if (ch === "[") {
      inBracket = true;
      result += ch;
      continue;
    }

    switch (ch) {
      case "%": result += ".*"; break;
      case "_": result += "."; break;
      default:
        if (".*+?^${}()|[]\\".includes(ch)) result += "\\" + ch;
        else result += ch;
    }
  }

  return result;
}

function evaluateDateFilter(cell: CellValue, filter: DateFilter, resolved: ResolvedTimeFrames): boolean {
  if (filter.fn === "IS_NULL") return cell.type === "NULL";
  if (filter.fn === "NOT_NULL") return cell.type !== "NULL";
  if (cell.type === "NULL") return false;

  const value = cell.type === "DATE" ? cell.value.getTime() : NaN;

  switch (filter.fn) {
    case "EQUALS_TO": return value === filter.value.getTime();
    case "NOT_EQUALS_TO": return value !== filter.value.getTime();
    case "GREATER_THAN": return value > filter.value.getTime();
    case "GREATER_OR_EQUALS_TO": return value >= filter.value.getTime();
    case "LOWER_THAN": return value < filter.value.getTime();
    case "LOWER_OR_EQUALS_TO": return value <= filter.value.getTime();
    case "BETWEEN": return value >= filter.low.getTime() && value <= filter.high.getTime();
    case "TIME_FRAME": {
      const range = resolved.get(filter.timeFrame);
      if (!range) return false;
      return value >= range.from.getTime() && value <= range.to.getTime();
    }
    case "IN": return filter.values.some((d) => d.getTime() === value);
    case "NOT_IN": return !filter.values.some((d) => d.getTime() === value);
  }
}
