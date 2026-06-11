import type { CellValue, Column, ColumnId, DataSet, TypedDataSet, TypedRow } from "./types.js";
import { ColumnType } from "./types.js";
import { DataSetError } from "./errors.js";

function parseCell(value: string, column: Column, rowIndex: number): CellValue {
  switch (column.type) {
    case ColumnType.TEXT:
      return { type: ColumnType.TEXT, value };

    case ColumnType.LABEL:
      return { type: ColumnType.LABEL, value };

    case ColumnType.NUMBER: {
      const n = parseFloat(value);
      if (Number.isNaN(n)) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Cannot parse "${value}" as NUMBER in column "${column.id}" at row ${rowIndex}`,
        );
      }
      return { type: ColumnType.NUMBER, value: n };
    }

    case ColumnType.DATE: {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Cannot parse "${value}" as DATE in column "${column.id}" at row ${rowIndex}`,
        );
      }
      return { type: ColumnType.DATE, value: d };
    }
  }
}

export function createTypedRow(cells: readonly CellValue[], columns: readonly Column[]): TypedRow {
  const frozenCells = Object.freeze([...cells]);

  const columnIndex = new Map<ColumnId, number>();
  for (let i = 0; i < columns.length; i++) {
    columnIndex.set(columns[i]!.id, i);
  }

  const row: TypedRow = {
    cells: frozenCells,

    cell(columnId: ColumnId): CellValue {
      const idx = columnIndex.get(columnId);
      if (idx === undefined) {
        throw new DataSetError("UNKNOWN_COLUMN", `Column "${columnId}" not found`);
      }
      return frozenCells[idx]!;
    },

    number(columnId: ColumnId): number {
      const cv = row.cell(columnId);
      if (cv.type !== ColumnType.NUMBER) {
        throw new DataSetError(
          "TYPE_MISMATCH",
          `Column "${columnId}" is ${cv.type}, not NUMBER`,
        );
      }
      return cv.value;
    },

    text(columnId: ColumnId): string {
      const cv = row.cell(columnId);
      if (cv.type !== ColumnType.TEXT && cv.type !== ColumnType.LABEL) {
        throw new DataSetError(
          "TYPE_MISMATCH",
          `Column "${columnId}" is ${cv.type}, not TEXT or LABEL`,
        );
      }
      return cv.value;
    },

    date(columnId: ColumnId): Date {
      const cv = row.cell(columnId);
      if (cv.type !== ColumnType.DATE) {
        throw new DataSetError(
          "TYPE_MISMATCH",
          `Column "${columnId}" is ${cv.type}, not DATE`,
        );
      }
      return cv.value;
    },
  };

  return Object.freeze(row);
}

export function toTypedDataSet(ds: DataSet): TypedDataSet {
  const rows: TypedRow[] = [];

  for (let rowIdx = 0; rowIdx < ds.data.length; rowIdx++) {
    const rawRow = ds.data[rowIdx]!;
    const cells: CellValue[] = [];

    for (let colIdx = 0; colIdx < ds.columns.length; colIdx++) {
      const column = ds.columns[colIdx]!;
      const rawValue = rawRow[colIdx];
      if (rawValue === undefined || rawValue === null) {
        cells.push({ type: "NULL" as const });
      } else {
        cells.push(parseCell(rawValue, column, rowIdx));
      }
    }

    rows.push(createTypedRow(cells, ds.columns));
  }

  return { columns: ds.columns, rows };
}

function cellToString(cell: CellValue): string | null {
  switch (cell.type) {
    case ColumnType.TEXT:
    case ColumnType.LABEL:
      return cell.value;
    case ColumnType.NUMBER:
      return String(cell.value);
    case ColumnType.DATE:
      return cell.value.toISOString();
    case "NULL":
      return null;
  }
}

export function toWireDataSet(ds: TypedDataSet): DataSet {
  const data: (string | null)[][] = [];

  for (const row of ds.rows) {
    const rawRow: (string | null)[] = [];
    for (const cell of row.cells) {
      rawRow.push(cellToString(cell));
    }
    data.push(rawRow);
  }

  return { columns: ds.columns, data };
}
