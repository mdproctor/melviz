import type { TypedDataSet, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { TableProps } from "@casehub/ui/dist/model/displayer-types.js";
import { CasehubElement } from "../base/CasehubElement.js";
import { cellToRaw, resolveColumnName } from "../base/cell-extract.js";

const TABLE_CSS = `
:host {
  display: block;
  font-family: var(--casehub-font, system-ui, sans-serif);
  font-size: var(--casehub-font-size, 14px);
  color: var(--casehub-text, #333);
}
table { width: 100%; border-collapse: collapse; }
th {
  background: var(--casehub-bg-alt, #f5f5f5);
  border-bottom: 2px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px; text-align: left; cursor: pointer; user-select: none;
}
td {
  border-bottom: 1px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px;
}
tr:nth-child(even) { background: var(--casehub-bg-alt, #f5f5f5); }
.pagination { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; font-size: 0.9em; color: var(--casehub-text-muted, #888); }
.pagination button { cursor: pointer; padding: 4px 12px; border: 1px solid var(--casehub-border, #e0e0e0); background: var(--casehub-bg, #fff); border-radius: var(--casehub-radius, 4px); }
.pagination button:disabled { opacity: 0.4; cursor: default; }
`;

export class CasehubTable extends CasehubElement<TableProps> {
  private _currentPage = 0;
  private _sortColumn: ColumnId | undefined;
  private _sortOrder: "ASCENDING" | "DESCENDING" = "ASCENDING";
  private _lastDataSet: TypedDataSet | undefined;

  protected override render(
    container: HTMLDivElement,
    props: TableProps,
    dataset: TypedDataSet,
  ): void {
    // Reset page when dataset changes
    if (dataset !== this._lastDataSet) {
      this._currentPage = 0;
      this._lastDataSet = dataset;
    }

    container.textContent = "";

    // Style
    const style = document.createElement("style");
    style.textContent = TABLE_CSS;
    container.appendChild(style);

    const serverSide = this.isServerSide(dataset);
    const pageSize = props.pageSize;
    const rows = this.getDisplayRows(dataset, props, serverSide);

    // Table
    const table = document.createElement("table");

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (let colIdx = 0; colIdx < dataset.columns.length; colIdx++) {
      const col = dataset.columns[colIdx]!;
      const th = document.createElement("th");
      const displayName = resolveColumnName(col, props.columns);

      // Sort indicator
      let sortIndicator = "";
      if (props.sortable && this._sortColumn === col.id) {
        sortIndicator = this._sortOrder === "ASCENDING" ? " ▲" : " ▼";
      }
      th.textContent = displayName + sortIndicator;

      if (props.sortable) {
        th.addEventListener("click", () => {
          this.handleSort(col.id, serverSide);
        });
      }

      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]!;
      const tr = document.createElement("tr");

      for (let colIdx = 0; colIdx < dataset.columns.length; colIdx++) {
        const td = document.createElement("td");
        const cell = row.cells[colIdx]!;
        const raw = cellToRaw(cell);
        td.textContent = raw === null ? "" : String(raw);

        // Compute the real row index for filter events
        const realRowIdx = serverSide
          ? rowIdx
          : (pageSize ? this._currentPage * pageSize + rowIdx : rowIdx);

        if (props.filter?.enabled) {
          const columnId = dataset.columns[colIdx]!.id;
          td.addEventListener("click", () => {
            this.dispatchEvent(
              new CustomEvent("casehub-filter", {
                bubbles: true,
                composed: true,
                detail: {
                  columnId,
                  rowIndex: realRowIdx,
                  reset: false,
                  group: props.filter?.group,
                },
              }),
            );
          });
        }

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);

    // Pagination
    if (pageSize) {
      const totalRows = serverSide ? this.totalRows : dataset.rows.length;
      const totalPages = Math.ceil(totalRows / pageSize);

      if (totalPages > 1 || serverSide) {
        const paginationDiv = document.createElement("div");
        paginationDiv.className = "pagination";

        const prevBtn = document.createElement("button");
        prevBtn.textContent = "Prev";
        prevBtn.disabled = this._currentPage === 0;
        prevBtn.addEventListener("click", () => {
          this._currentPage--;
          if (serverSide) {
            this.dispatchEvent(
              new CustomEvent("casehub-page", {
                bubbles: true,
                composed: true,
                detail: {
                  offset: this._currentPage * pageSize,
                  count: pageSize,
                },
              }),
            );
          }
          this.rerender(props, dataset);
        });

        const info = document.createElement("span");
        info.textContent = `Page ${this._currentPage + 1} of ${totalPages}`;

        const nextBtn = document.createElement("button");
        nextBtn.textContent = "Next";
        nextBtn.disabled = this._currentPage >= totalPages - 1;
        nextBtn.addEventListener("click", () => {
          this._currentPage++;
          if (serverSide) {
            this.dispatchEvent(
              new CustomEvent("casehub-page", {
                bubbles: true,
                composed: true,
                detail: {
                  offset: this._currentPage * pageSize,
                  count: pageSize,
                },
              }),
            );
          }
          this.rerender(props, dataset);
        });

        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(info);
        paginationDiv.appendChild(nextBtn);
        container.appendChild(paginationDiv);
      }
    }
  }

  private isServerSide(dataset: TypedDataSet): boolean {
    return this.totalRows > 0 && this.totalRows > dataset.rows.length;
  }

  private getDisplayRows(
    dataset: TypedDataSet,
    props: TableProps,
    serverSide: boolean,
  ): readonly import("@casehub/data/dist/dataset/types.js").TypedRow[] {
    let rows = [...dataset.rows];

    // Client-side sorting
    if (!serverSide && this._sortColumn !== undefined) {
      const colIdx = dataset.columns.findIndex(
        (c) => c.id === this._sortColumn,
      );
      if (colIdx >= 0) {
        rows.sort((a, b) => {
          const cellA = cellToRaw(a.cells[colIdx]!);
          const cellB = cellToRaw(b.cells[colIdx]!);

          if (cellA === null && cellB === null) return 0;
          if (cellA === null) return 1;
          if (cellB === null) return -1;

          let cmp: number;
          if (typeof cellA === "number" && typeof cellB === "number") {
            cmp = cellA - cellB;
          } else if (cellA instanceof Date && cellB instanceof Date) {
            cmp = cellA.getTime() - cellB.getTime();
          } else {
            cmp = String(cellA).localeCompare(String(cellB));
          }

          return this._sortOrder === "DESCENDING" ? -cmp : cmp;
        });
      }
    }

    // Client-side pagination
    if (!serverSide && props.pageSize) {
      const start = this._currentPage * props.pageSize;
      rows = rows.slice(start, start + props.pageSize);
    }

    return rows;
  }

  private handleSort(columnId: ColumnId, serverSide: boolean): void {
    if (this._sortColumn === columnId) {
      this._sortOrder =
        this._sortOrder === "ASCENDING" ? "DESCENDING" : "ASCENDING";
    } else {
      this._sortColumn = columnId;
      this._sortOrder = "ASCENDING";
    }

    if (serverSide) {
      this.dispatchEvent(
        new CustomEvent("casehub-sort", {
          bubbles: true,
          composed: true,
          detail: {
            columnId,
            order: this._sortOrder,
          },
        }),
      );
    } else {
      // Re-render with sorted data
      if (this.props && this.dataSet) {
        this.rerender(this.props, this.dataSet);
      }
    }
  }

  private rerender(props: TableProps, dataset: TypedDataSet): void {
    this.render(this.container, props, dataset);
  }
}

customElements.define("casehub-table", CasehubTable);
