import type { TypedDataSet, CellValue, TypedRow } from "./types.js";
import { ColumnType } from "./types.js";
import type { SortOp, SortColumn } from "./sort.js";
import { DataSetError } from "./errors.js";

export function applySort(ds: TypedDataSet, op: SortOp): TypedDataSet {
  // 1. Validate all referenced columns exist
  const columnMap = new Map(ds.columns.map((c) => [c.id, c]));
  for (const sortCol of op.columns) {
    const col = columnMap.get(sortCol.columnId);
    if (!col) {
      throw new DataSetError(
        "UNKNOWN_COLUMN",
        `Sort references unknown column: ${sortCol.columnId}`
      );
    }
  }

  // 2. Empty dataset or single row - return as is
  if (ds.rows.length <= 1) {
    return ds;
  }

  // 3. Build column index map for fast lookup
  const colIndexMap = new Map(ds.columns.map((c, i) => [c.id, i]));

  // 4. Create comparison function
  const compare = (a: TypedRow, b: TypedRow): number => {
    for (const sortCol of op.columns) {
      const colIndex = colIndexMap.get(sortCol.columnId)!;
      const col = columnMap.get(sortCol.columnId)!;
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
