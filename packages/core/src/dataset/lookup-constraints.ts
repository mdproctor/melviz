import { ColumnType } from "./types.js";
import type { Column } from "./types.js";
import type { DataSetLookup } from "./lookup.js";
import type { GroupOp, ResultColumn, Aggregation } from "./group.js";

export interface DataSetLookupConstraints {
  readonly filterAllowed: boolean;
  readonly groupAllowed: boolean;
  readonly groupRequired: boolean;
  readonly maxGroups?: number; // absent = unlimited
  readonly minColumns?: number; // absent = no minimum
  readonly maxColumns?: number; // absent = no maximum
  readonly columnTypes?: readonly (readonly ColumnType[])[];
  readonly uniqueColumnIds: boolean;
  readonly extraColumnsAllowed: boolean;
  readonly extraColumnsType?: ColumnType;
}

export const DEFAULT_CONSTRAINTS: DataSetLookupConstraints = Object.freeze({
  filterAllowed: true,
  groupAllowed: true,
  groupRequired: false,
  uniqueColumnIds: false,
  extraColumnsAllowed: true,
});

export type LookupViolationCode =
  | "FILTER_NOT_ALLOWED"
  | "GROUP_NOT_ALLOWED"
  | "GROUP_REQUIRED"
  | "TOO_MANY_GROUPS"
  | "TOO_FEW_COLUMNS"
  | "TOO_MANY_COLUMNS"
  | "COLUMN_TYPE_MISMATCH"
  | "DUPLICATE_COLUMN_IDS"
  | "EXTRA_COLUMNS_NOT_ALLOWED"
  | "EXTRA_COLUMN_TYPE_MISMATCH";

export interface LookupViolation {
  readonly code: LookupViolationCode;
  readonly message: string;
  readonly position?: number;
}

export function validateLookup(
  lookup: DataSetLookup,
  constraints: DataSetLookupConstraints,
  columns?: readonly Column[],
): readonly LookupViolation[] {
  const violations: LookupViolation[] = [];

  // Check filter allowed
  const hasFilter = lookup.operations.some((op) => op.type === "filter");
  if (hasFilter && !constraints.filterAllowed) {
    violations.push({
      code: "FILTER_NOT_ALLOWED",
      message: "Filtering is not allowed for this component",
    });
  }

  // Check group allowed / required
  const groupOps = lookup.operations.filter((op) => op.type === "group") as GroupOp[];
  const hasGroup = groupOps.length > 0;

  if (hasGroup && !constraints.groupAllowed) {
    violations.push({
      code: "GROUP_NOT_ALLOWED",
      message: "Grouping is not allowed for this component",
    });
  }

  if (!hasGroup && constraints.groupRequired) {
    violations.push({
      code: "GROUP_REQUIRED",
      message: "Grouping is required for this component",
    });
  }

  // Check max groups
  if (
    constraints.maxGroups !== undefined &&
    hasGroup &&
    groupOps.some((op) => {
      const keyCount = op.groupingKey ? 1 : 0;
      const selectCount = op.columns.filter((c) => c.kind === "select").length;
      return keyCount + selectCount > constraints.maxGroups!;
    })
  ) {
    violations.push({
      code: "TOO_MANY_GROUPS",
      message: `Maximum ${constraints.maxGroups} grouping ${constraints.maxGroups === 1 ? "column" : "columns"} allowed`,
    });
  }

  // If no group, can't validate column count/types (no result columns)
  if (!hasGroup) {
    return violations;
  }

  // Get result columns from last group op
  const lastGroup = groupOps[groupOps.length - 1]!;
  // Build full result columns: key (if present) + columns array
  const resultColumns: ResultColumn[] = [];
  if (lastGroup.groupingKey !== null) {
    resultColumns.push({
      kind: "key",
      sourceId: lastGroup.groupingKey.sourceId,
      columnId: lastGroup.groupingKey.columnId,
    });
  }
  resultColumns.push(...lastGroup.columns);

  // Check min/max columns
  if (constraints.minColumns !== undefined && resultColumns.length < constraints.minColumns) {
    violations.push({
      code: "TOO_FEW_COLUMNS",
      message: `At least ${constraints.minColumns} ${constraints.minColumns === 1 ? "column" : "columns"} required`,
    });
  }

  if (constraints.maxColumns !== undefined && resultColumns.length > constraints.maxColumns) {
    violations.push({
      code: "TOO_MANY_COLUMNS",
      message: `At most ${constraints.maxColumns} ${constraints.maxColumns === 1 ? "column" : "columns"} allowed`,
    });
  }

  // Check column types
  if (constraints.columnTypes !== undefined) {
    const expectedTypes = constraints.columnTypes;
    const baseCount = expectedTypes.length;

    // Check base columns (non-extra)
    for (let i = 0; i < Math.min(baseCount, resultColumns.length); i++) {
      const col = resultColumns[i]!;
      const expected = expectedTypes[i]!;
      const actual = inferColumnType(col, columns);

      // If actual is undefined (source-dependent type, no columns), skip
      if (actual !== undefined && !expected.includes(actual)) {
        violations.push({
          code: "COLUMN_TYPE_MISMATCH",
          message: `Column ${i} must be ${formatTypes(expected)}, got ${actual}`,
          position: i,
        });
      }
    }

    // Check extra columns
    if (resultColumns.length > baseCount) {
      if (!constraints.extraColumnsAllowed) {
        violations.push({
          code: "EXTRA_COLUMNS_NOT_ALLOWED",
          message: `Only ${baseCount} ${baseCount === 1 ? "column" : "columns"} allowed`,
        });
      } else if (constraints.extraColumnsType !== undefined) {
        // Validate extra column types
        for (let i = baseCount; i < resultColumns.length; i++) {
          const col = resultColumns[i]!;
          const actual = inferColumnType(col, columns);

          if (actual !== undefined && actual !== constraints.extraColumnsType) {
            violations.push({
              code: "EXTRA_COLUMN_TYPE_MISMATCH",
              message: `Extra column ${i} must be ${constraints.extraColumnsType}, got ${actual}`,
              position: i,
            });
          }
        }
      }
    }
  }

  // Check unique column IDs
  if (constraints.uniqueColumnIds) {
    const ids = resultColumns.map((c) => c.columnId);
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const id of ids) {
      if (seen.has(id)) {
        duplicates.add(id);
      }
      seen.add(id);
    }

    if (duplicates.size > 0) {
      violations.push({
        code: "DUPLICATE_COLUMN_IDS",
        message: `Duplicate column IDs: ${Array.from(duplicates).join(", ")}`,
      });
    }
  }

  return violations;
}

function inferColumnType(col: ResultColumn, columns: readonly Column[] | undefined): ColumnType | undefined {
  if (col.kind === "key") {
    return ColumnType.LABEL;
  }

  if (col.kind === "aggregate") {
    return inferAggregateType(col.fn, col.sourceId, columns);
  }

  // select — requires source column
  if (columns === undefined) {
    return undefined; // can't infer without source columns
  }

  const source = columns.find((c) => c.id === col.sourceId);
  return source?.type;
}

function inferAggregateType(
  fn: Aggregation,
  sourceId: string,
  columns: readonly Column[] | undefined,
): ColumnType | undefined {
  switch (fn.fn) {
    case "COUNT":
    case "DISTINCT":
    case "SUM":
    case "AVERAGE":
    case "MEDIAN":
      return ColumnType.NUMBER;

    case "JOIN":
      return ColumnType.TEXT;

    case "MIN":
    case "MAX":
      // Requires source column type
      if (columns === undefined) {
        return undefined;
      }
      const source = columns.find((c) => c.id === sourceId);
      return source?.type;
  }
}

function formatTypes(types: readonly ColumnType[]): string {
  if (types.length === 1) {
    return types[0]!;
  }
  return `one of [${types.join(", ")}]`;
}
