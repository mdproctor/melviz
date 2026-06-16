import type { CellValue, Column, ColumnSettings } from "@casehub/data/dist/dataset/types.js";

export function cellToRaw(cell: CellValue): string | number | Date | null {
  if (cell.type === "NULL") return null;
  return cell.value;
}

export function resolveColumnName(
  column: Column,
  propsColumns?: readonly ColumnSettings[],
): string {
  const override = propsColumns?.find((c) => c.id === column.id);
  return override?.name ?? column.settings?.name ?? column.name;
}

export function applyCellExpression(
  raw: string | number | Date | null,
  expression: string,
): string | number | Date | null {
  if (raw === null) return null;
  try {
    const fn = new Function("value", `return ${expression}`);
    const result = fn(raw);
    if (result === undefined || result === null) return null;
    if (typeof result === "number") return result;
    if (result instanceof Date) return result;
    return String(result);
  } catch {
    return raw;
  }
}

export function resolveColumnExpression(
  columnId: string,
  propsColumns?: readonly ColumnSettings[],
): string | undefined {
  return propsColumns?.find((c) => c.id === columnId)?.expression;
}
