import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { TableProps } from "@casehub/ui/dist/model/displayer-types.js";
import { toTypedDataSet } from "@casehub/data/dist/dataset/conversion.js";

import { CasehubTable } from "./CasehubTable.js";

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function makeDataSet(
  columns: [string, string][],
  rows: (string | number | null)[][],
): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows,
  };
  return toTypedDataSet(ds);
}

function makeDataSetWithNames(
  columns: { id: string; name: string; type: string }[],
  rows: (string | number | null)[][],
): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map((c) => ({
      id: c.id as ColumnId,
      name: c.name,
      type: c.type as ColumnType,
    })),
    data: rows,
  };
  return toTypedDataSet(ds);
}

function queryRows(el: CasehubTable): HTMLTableRowElement[] {
  return Array.from(el.shadowRoot!.querySelectorAll("tbody tr"));
}

function queryHeaders(el: CasehubTable): HTMLTableCellElement[] {
  return Array.from(el.shadowRoot!.querySelectorAll("thead th"));
}

function queryCells(row: HTMLTableRowElement): string[] {
  return Array.from(row.querySelectorAll("td")).map((td) => td.textContent ?? "");
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("CasehubTable", () => {
  let el: CasehubTable;

  beforeEach(() => {
    el = document.createElement("casehub-table") as CasehubTable;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  // ── Rendering ─────────────────────────────────────────────────────

  describe("rendering", () => {
    it("renders table with correct number of rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["Alice", 10], ["Bob", 20], ["Carol", 30]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(3);
    });

    it("header uses display names via resolveColumnName", () => {
      const ds = makeDataSetWithNames(
        [
          { id: "col1", name: "Column One", type: "LABEL" },
          { id: "col2", name: "Column Two", type: "NUMBER" },
        ],
        [["A", 1]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const headers = queryHeaders(el);
      expect(headers).toHaveLength(2);
      expect(headers[0]!.textContent).toContain("Column One");
      expect(headers[1]!.textContent).toContain("Column Two");
    });

    it("header uses props.columns override when present", () => {
      const ds = makeDataSetWithNames(
        [
          { id: "col1", name: "Original", type: "LABEL" },
        ],
        [["A"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        columns: [{ id: "col1" as ColumnId, name: "Overridden" }],
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const headers = queryHeaders(el);
      expect(headers[0]!.textContent).toContain("Overridden");
    });

    it("cell values are rendered via cellToRaw", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", 42]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      const cells = queryCells(rows[0]!);
      expect(cells[0]).toBe("Alice");
      expect(cells[1]).toBe("42");
    });

    it("null cells render as empty string", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", null]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      const cells = queryCells(rows[0]!);
      expect(cells[1]).toBe("");
    });

    it("renders style element in shadow DOM", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot!.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain("border-collapse");
    });
  });

  // ── Client-side pagination ────────────────────────────────────────

  describe("client-side pagination", () => {
    it("without pageSize shows all rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"], ["E"]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(5);
    });

    it("with pageSize shows correct page of rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"], ["E"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const rows = queryRows(el);
      expect(rows).toHaveLength(2);
      expect(queryCells(rows[0]!)[0]).toBe("A");
      expect(queryCells(rows[1]!)[0]).toBe("B");
    });

    it("clicking next page updates displayed rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"], ["E"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      // Click next (4th button: first, prev, next, last)
      const pagingBtns = el.shadowRoot!.querySelectorAll(".paging button");
      const nextBtn = pagingBtns[2] as HTMLButtonElement;
      expect(nextBtn).not.toBeNull();
      nextBtn.click();

      const rows = queryRows(el);
      expect(rows).toHaveLength(2);
      expect(queryCells(rows[0]!)[0]).toBe("C");
      expect(queryCells(rows[1]!)[0]).toBe("D");
    });

    it("shows range and page count", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"], ["E"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const paging = el.shadowRoot!.querySelector(".paging");
      expect(paging).not.toBeNull();
      const range = paging!.querySelector(".range")!;
      expect(range.textContent).toContain("1");
      expect(range.textContent).toContain("5");
    });

    it("first and prev buttons are disabled on first page", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const btns = el.shadowRoot!.querySelectorAll(".paging button");
      expect((btns[0] as HTMLButtonElement).disabled).toBe(true); // first
      expect((btns[1] as HTMLButtonElement).disabled).toBe(true); // prev
    });

    it("next and last buttons are disabled on last page", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      // Navigate to last page via last button
      const btns = el.shadowRoot!.querySelectorAll(".paging button");
      (btns[3] as HTMLButtonElement).click(); // last

      const btnsAfter = el.shadowRoot!.querySelectorAll(".paging button");
      expect((btnsAfter[2] as HTMLButtonElement).disabled).toBe(true); // next
      expect((btnsAfter[3] as HTMLButtonElement).disabled).toBe(true); // last
    });

    it("no paging controls when pageSize is not set", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const paging = el.shadowRoot!.querySelector(".paging");
      expect(paging).toBeNull();
    });

    it("clicking prev page goes back", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      // Go to page 2 via next
      const btns = el.shadowRoot!.querySelectorAll(".paging button");
      (btns[2] as HTMLButtonElement).click(); // next

      // Go back via prev
      const btns2 = el.shadowRoot!.querySelectorAll(".paging button");
      (btns2[1] as HTMLButtonElement).click(); // prev

      const rows = queryRows(el);
      expect(queryCells(rows[0]!)[0]).toBe("A");
    });
  });

  // ── Server-side pagination ────────────────────────────────────────

  describe("server-side pagination", () => {
    it("emits casehub-page on page change when totalRows > rows.length", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.totalRows = 10;
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-page", (e) => events.push(e as CustomEvent));

      // Click next page (3rd button: first, prev, next, last)
      const btns = el.shadowRoot!.querySelectorAll(".paging button");
      (btns[2] as HTMLButtonElement).click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({ offset: 2, count: 2 });
    });

    it("does not slice locally in server-side mode", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.totalRows = 10;
      el.dataSet = ds;

      // All received rows should be displayed (server controls the slice)
      const rows = queryRows(el);
      expect(rows).toHaveLength(2);
    });

    it("shows correct page count based on totalRows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.totalRows = 10;
      el.dataSet = ds;

      const paging = el.shadowRoot!.querySelector(".paging");
      expect(paging!.textContent).toContain("5"); // 10 / 2 = 5 pages
    });
  });

  // ── Sorting ───────────────────────────────────────────────────────

  describe("sorting", () => {
    it("click header sorts client-side", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Charlie", 30], ["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      // Click on "score" header (second column)
      const headers = queryHeaders(el);
      headers[1]!.click();

      const rows = queryRows(el);
      // Ascending sort: 10, 20, 30
      expect(queryCells(rows[0]!)[1]).toBe("10");
      expect(queryCells(rows[1]!)[1]).toBe("20");
      expect(queryCells(rows[2]!)[1]).toBe("30");
    });

    it("second click reverses sort order", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Charlie", 30], ["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const headers = queryHeaders(el);
      // First click — ascending
      headers[1]!.click();
      // Second click — descending
      headers[1]!.click();

      const rows = queryRows(el);
      expect(queryCells(rows[0]!)[1]).toBe("30");
      expect(queryCells(rows[1]!)[1]).toBe("20");
      expect(queryCells(rows[2]!)[1]).toBe("10");
    });

    it("server-side sort emits casehub-sort", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: true };

      el.props = props;
      document.body.appendChild(el);
      el.totalRows = 100;
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-sort", (e) => events.push(e as CustomEvent));

      const headers = queryHeaders(el);
      headers[0]!.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.columnId).toBe("name");
      expect(events[0]!.detail.order).toBe("ASCENDING");
    });

    it("does not sort when sortable is false", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Charlie", 30], ["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = { lookup: mockLookup("test"), sortable: false };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const headers = queryHeaders(el);
      headers[1]!.click();

      // Order should be unchanged
      const rows = queryRows(el);
      expect(queryCells(rows[0]!)[0]).toBe("Charlie");
      expect(queryCells(rows[1]!)[0]).toBe("Alice");
      expect(queryCells(rows[2]!)[0]).toBe("Bob");
    });
  });

  // ── Filtering ─────────────────────────────────────────────────────

  describe("filtering", () => {
    it("click cell emits casehub-filter with correct detail", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", 10], ["Bob", 20]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true, group: "myGroup" },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        events.push(e as CustomEvent),
      );

      // Click the first cell of the second row
      const rows = queryRows(el);
      const firstCell = rows[1]!.querySelector("td")!;
      firstCell.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({
        columnId: "name",
        rowIndex: 1,
        reset: false,
        group: "myGroup",
      });
    });

    it("filter event has correct columnId for non-first column", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["score", "NUMBER"]],
        [["Alice", 10]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        events.push(e as CustomEvent),
      );

      // Click the second cell (score column) of the first row
      const rows = queryRows(el);
      const secondCell = rows[0]!.querySelectorAll("td")[1]!;
      secondCell.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.columnId).toBe("score");
      expect(events[0]!.detail.rowIndex).toBe(0);
    });

    it("filter group is undefined when not set in props", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"]],
      );
      const props: TableProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        events.push(e as CustomEvent),
      );

      const rows = queryRows(el);
      rows[0]!.querySelector("td")!.click();

      expect(events[0]!.detail.group).toBeUndefined();
    });
  });

  // ── Text filter ──────────────────────────────────────────────────

  describe("text filter", () => {
    it("filter input exists in toolbar", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input");
      expect(input).not.toBeNull();
      expect(input!.placeholder).toBe("Filter");
    });

    it("typing in filter reduces visible rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["city", "LABEL"]],
        [["Alice", "London"], ["Bob", "Paris"], ["Charlie", "London"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input")!;
      input.value = "London";
      input.dispatchEvent(new Event("input"));

      const rows = queryRows(el);
      expect(rows).toHaveLength(2);
      expect(queryCells(rows[0]!)[0]).toBe("Alice");
      expect(queryCells(rows[1]!)[0]).toBe("Charlie");
    });

    it("filter is case-insensitive", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["bob"], ["CHARLIE"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input")!;
      input.value = "ali";
      input.dispatchEvent(new Event("input"));

      const rows = queryRows(el);
      expect(rows).toHaveLength(1);
      expect(queryCells(rows[0]!)[0]).toBe("Alice");
    });

    it("filter resets page to 0", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"], ["E"], ["F"]],
      );
      el.props = { lookup: mockLookup("test"), pageSize: 2 };
      document.body.appendChild(el);
      el.dataSet = ds;

      // Go to page 2
      const btns = el.shadowRoot!.querySelectorAll(".paging button");
      (btns[2] as HTMLButtonElement).click();

      // Now filter
      const input = el.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input")!;
      input.value = "A";
      input.dispatchEvent(new Event("input"));

      const rows = queryRows(el);
      expect(queryCells(rows[0]!)[0]).toBe("A");
    });

    it("filter updates pagination count", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"], ["Charlie"], ["Dave"], ["Eve"]],
      );
      el.props = { lookup: mockLookup("test"), pageSize: 2 };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input")!;
      input.value = "e";
      input.dispatchEvent(new Event("input"));

      // "Alice", "Charlie", "Dave", "Eve" match "e" → 4 results
      const range = el.shadowRoot!.querySelector(".paging .range")!;
      expect(range.textContent).toContain("4");
    });

    it("clearing filter restores all rows", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input")!;
      input.value = "Alice";
      input.dispatchEvent(new Event("input"));
      expect(queryRows(el)).toHaveLength(1);

      input.value = "";
      input.dispatchEvent(new Event("input"));
      expect(queryRows(el)).toHaveLength(2);
    });

    it("filter input retains focus after typing", () => {
      const ds = makeDataSet(
        [["name", "LABEL"]],
        [["Alice"], ["Bob"]],
      );
      el.props = { lookup: mockLookup("test") };
      document.body.appendChild(el);
      el.dataSet = ds;

      const input = el.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input")!;
      input.focus();
      input.value = "A";
      input.dispatchEvent(new Event("input"));

      const active = el.shadowRoot!.activeElement;
      expect(active?.tagName).toBe("INPUT");
    });
  });

  // ── Re-render ─────────────────────────────────────────────────────

  describe("re-render", () => {
    it("resets page to 0 when new data arrives", () => {
      const ds1 = makeDataSet(
        [["name", "LABEL"]],
        [["A"], ["B"], ["C"], ["D"]],
      );
      const props: TableProps = { lookup: mockLookup("test"), pageSize: 2 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds1;

      // Navigate to page 2 via next button
      const btns = el.shadowRoot!.querySelectorAll(".paging button");
      (btns[2] as HTMLButtonElement).click();

      // New data arrives — page should reset to 0
      const ds2 = makeDataSet(
        [["name", "LABEL"]],
        [["X"], ["Y"], ["Z"]],
      );
      el.dataSet = ds2;

      const rows = queryRows(el);
      expect(queryCells(rows[0]!)[0]).toBe("X");
    });
  });
});
