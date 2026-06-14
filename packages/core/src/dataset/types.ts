export type ColumnId = string & { readonly __brand: "ColumnId" };
export type DataSetId = string & { readonly __brand: "DataSetId" };

export enum ColumnType {
  DATE = "DATE",
  NUMBER = "NUMBER",
  LABEL = "LABEL",
  TEXT = "TEXT",
}

export interface Column {
  readonly id: ColumnId;
  readonly name: string;
  readonly type: ColumnType;
  readonly settings?: ColumnSettings;
}

export interface ColumnSettings {
  readonly id: ColumnId;
  readonly name?: string;
  readonly expression?: string;
  readonly pattern?: string;
  readonly empty?: string;
}

export type CellValue =
  | { readonly type: ColumnType.TEXT; readonly value: string }
  | { readonly type: ColumnType.NUMBER; readonly value: number }
  | { readonly type: ColumnType.DATE; readonly value: Date }
  | { readonly type: ColumnType.LABEL; readonly value: string }
  | { readonly type: "NULL" };

export interface TypedDataSet {
  readonly columns: readonly Column[];
  readonly rows: readonly TypedRow[];
}

export interface TypedRow {
  readonly cells: readonly CellValue[];
  cell(columnId: ColumnId): CellValue;
  number(columnId: ColumnId): number;
  text(columnId: ColumnId): string;
  date(columnId: ColumnId): Date;
}

export interface DataSet {
  readonly columns: readonly Column[];
  readonly data: readonly (readonly (string | null)[])[];
}
