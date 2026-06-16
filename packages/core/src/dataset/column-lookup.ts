import type { Column, ColumnId } from "./types.js";

export function findColumn(columns: readonly Column[], id: ColumnId): Column | undefined {
  return columns.find((c) => c.id === id)
    ?? columns.find((c) => (c.id as string).toLowerCase() === (id as string).toLowerCase());
}

export function findColumnIndex(columns: readonly Column[], id: ColumnId): number {
  let idx = columns.findIndex((c) => c.id === id);
  if (idx === -1) {
    idx = columns.findIndex((c) => (c.id as string).toLowerCase() === (id as string).toLowerCase());
  }
  return idx;
}
