import type { TypedDataSet, CellValue, TypedRow } from "./types.js";
import { ColumnType } from "./types.js";
import type { SortOp, SortColumn } from "./sort.js";
import { DataSetError } from "./errors.js";
import { findColumn, findColumnIndex } from "./column-lookup.js";

export function applySort(ds: TypedDataSet, op: SortOp): TypedDataSet {
  // 1. Validate all referenced columns exist (case-insensitive)
  const validColumns = op.columns.filter((sortCol) => findColumn(ds.columns, sortCol.columnId) !== undefined);
  if (validColumns.length === 0) {
    return ds;
  }

  // 2. Empty dataset or single row - return as is
  if (ds.rows.length <= 1) {
    return ds;
  }

  // 3. Create comparison function (case-insensitive column lookup)
  const compare = (a: TypedRow, b: TypedRow): number => {
    for (const sortCol of validColumns) {
      const colIndex = findColumnIndex(ds.columns, sortCol.columnId);
      const col = findColumn(ds.columns, sortCol.columnId);
      if (colIndex === -1 || !col) continue;
      const aCell = a.cells[colIndex]!;
      const bCell = b.cells[colIndex]!;

      // NULL handling - nulls sort last regardless of direction
      if (aCell.type === "NULL" && bCell.type === "NULL") continue;
      if (aCell.type === "NULL") return 1;
      if (bCell.type === "NULL") return -1;

      // Both cells are non-NULL at this point
      // Type-specific comparison
      let cmp = 0;
      if (col.type === ColumnType.NUMBER && aCell.type === ColumnType.NUMBER && bCell.type === ColumnType.NUMBER) {
        cmp = aCell.value - bCell.value;
      } else if (col.type === ColumnType.DATE && aCell.type === ColumnType.DATE && bCell.type === ColumnType.DATE) {
        cmp = aCell.value.getTime() - bCell.value.getTime();
      } else if ((col.type === ColumnType.TEXT || col.type === ColumnType.LABEL) &&
                 (aCell.type === ColumnType.TEXT || aCell.type === ColumnType.LABEL) &&
                 (bCell.type === ColumnType.TEXT || bCell.type === ColumnType.LABEL)) {
        const aStr = aCell.value;
        const bStr = bCell.value;
        cmp = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      }

      // Apply sort direction
      if (cmp !== 0) {
        return sortCol.order === "ASCENDING" ? cmp : -cmp;
      }
    }
    return 0;
  };

  // 5. Stable sort - spread to mutable array
  const sorted = [...ds.rows].sort(compare);

  // 6. Return new TypedDataSet with reordered rows
  return {
    columns: ds.columns,
    rows: sorted,
  };
}
