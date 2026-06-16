import type { TypedDataSet, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { TableProps } from "@casehub/ui/dist/model/displayer-types.js";
import { CasehubElement } from "../base/CasehubElement.js";
import { cellToRaw, resolveColumnName, applyCellExpression, resolveColumnExpression } from "../base/cell-extract.js";

const TABLE_CSS = `
:host {
  display: block;
  font-family: var(--casehub-font, system-ui, sans-serif);
  font-size: var(--casehub-font-size, 14px);
  color: var(--casehub-text, #333);
}
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 4px; gap: 12px;
}
.filter-box {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--casehub-border, #ddd); border-radius: 4px;
  padding: 4px 8px; background: var(--casehub-bg, #fff);
}
.filter-box svg { width: 14px; height: 14px; fill: var(--casehub-text-muted, #999); flex-shrink: 0; }
.filter-box input {
  border: none; outline: none; font-size: 13px; background: transparent;
  color: var(--casehub-text, #333); width: 140px;
}
.paging {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--casehub-text, #333); white-space: nowrap;
}
.paging .range { margin-right: 8px; }
.paging button {
  cursor: pointer; padding: 2px 6px; border: 1px solid var(--casehub-border, #ddd);
  background: var(--casehub-bg, #fff); border-radius: 3px; font-size: 13px;
  color: var(--casehub-text, #333); line-height: 1;
}
.paging button:disabled { opacity: 0.3; cursor: default; }
.paging button:hover:not(:disabled) { background: var(--casehub-bg-alt, #f0f0f0); }
.paging input[type="number"] {
  width: 40px; text-align: center; border: 1px solid var(--casehub-border, #ddd);
  border-radius: 3px; padding: 2px 4px; font-size: 13px;
  color: var(--casehub-text, #333); background: var(--casehub-bg, #fff);
}
.paging input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
.paging input[type="number"] { -moz-appearance: textfield; }
table { width: 100%; border-collapse: collapse; }
th {
  border-bottom: 2px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px; text-align: left; cursor: pointer; user-select: none;
  font-weight: 600;
}
td {
  border-bottom: 1px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px;
}
tr:nth-child(even) { background: var(--casehub-bg-alt, #fafafa); }
tr.clickable:hover { background: var(--casehub-bg-hover, #e8f0fe); cursor: pointer; }
`;

const SEARCH_ICON = `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;

export class CasehubTable extends CasehubElement<TableProps> {
  private _currentPage = 0;
  private _sortColumn: ColumnId | undefined;
  private _sortOrder: "ASCENDING" | "DESCENDING" = "ASCENDING";
  private _lastDataSet: TypedDataSet | undefined;
  private _filterText = "";

  protected override render(
    container: HTMLDivElement,
    props: TableProps,
    dataset: TypedDataSet,
  ): void {
    if (dataset !== this._lastDataSet) {
      this._currentPage = 0;
      this._lastDataSet = dataset;
    }

    container.textContent = "";

    const style = document.createElement("style");
    style.textContent = TABLE_CSS;
    container.appendChild(style);

    const serverSide = this.isServerSide(dataset);
    const pageSize = props.pageSize;

    // Apply text filter and sorting (client-side only)
    const filteredRows = serverSide ? dataset.rows : this.getFilteredRows(dataset);
    const sortedRows = this.getSortedRows([...filteredRows], dataset, serverSide);
    const totalCount = serverSide ? this.totalRows : sortedRows.length;
    const totalPages = pageSize ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

    if (this._currentPage >= totalPages) this._currentPage = totalPages - 1;
    if (this._currentPage < 0) this._currentPage = 0;

    const displayRows = (!serverSide && pageSize)
      ? sortedRows.slice(this._currentPage * pageSize, (this._currentPage + 1) * pageSize)
      : sortedRows;

    // Toolbar: filter (left) + pagination (right)
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    // Filter input
    const filterBox = document.createElement("div");
    filterBox.className = "filter-box";
    filterBox.innerHTML = SEARCH_ICON;
    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.placeholder = "Filter";
    filterInput.value = this._filterText;
    filterInput.addEventListener("input", () => {
      this._filterText = filterInput.value;
      const cursorPos = filterInput.selectionStart;
      this._currentPage = 0;
      this.rerender(props, dataset);
      const restored = this.shadowRoot!.querySelector<HTMLInputElement>(".filter-box input");
      if (restored) {
        restored.focus();
        restored.setSelectionRange(cursorPos, cursorPos);
      }
    });
    filterBox.appendChild(filterInput);
    toolbar.appendChild(filterBox);

    // Pagination
    if (pageSize && totalCount > 0) {
      const paging = document.createElement("div");
      paging.className = "paging";

      const startRow = this._currentPage * pageSize + 1;
      const endRow = Math.min(startRow + pageSize - 1, totalCount);

      const range = document.createElement("span");
      range.className = "range";
      range.textContent = `${startRow} – ${endRow} of ${totalCount}`;
      paging.appendChild(range);

      const firstBtn = document.createElement("button");
      firstBtn.innerHTML = "&#171;";
      firstBtn.title = "First page";
      firstBtn.disabled = this._currentPage === 0;
      firstBtn.addEventListener("click", () => this.goToPage(0, props, dataset, pageSize, serverSide));

      const prevBtn = document.createElement("button");
      prevBtn.innerHTML = "&#8249;";
      prevBtn.title = "Previous page";
      prevBtn.disabled = this._currentPage === 0;
      prevBtn.addEventListener("click", () => this.goToPage(this._currentPage - 1, props, dataset, pageSize, serverSide));

      const pageInput = document.createElement("input");
      pageInput.type = "number";
      pageInput.min = "1";
      pageInput.max = String(totalPages);
      pageInput.value = String(this._currentPage + 1);
      pageInput.addEventListener("change", () => {
        const val = parseInt(pageInput.value, 10);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
          this.goToPage(val - 1, props, dataset, pageSize, serverSide);
        } else {
          pageInput.value = String(this._currentPage + 1);
        }
      });
      pageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") pageInput.blur();
      });

      const ofLabel = document.createElement("span");
      ofLabel.textContent = `of ${totalPages}`;

      const nextBtn = document.createElement("button");
      nextBtn.innerHTML = "&#8250;";
      nextBtn.title = "Next page";
      nextBtn.disabled = this._currentPage >= totalPages - 1;
      nextBtn.addEventListener("click", () => this.goToPage(this._currentPage + 1, props, dataset, pageSize, serverSide));

      const lastBtn = document.createElement("button");
      lastBtn.innerHTML = "&#187;";
      lastBtn.title = "Last page";
      lastBtn.disabled = this._currentPage >= totalPages - 1;
      lastBtn.addEventListener("click", () => this.goToPage(totalPages - 1, props, dataset, pageSize, serverSide));

      paging.append(firstBtn, prevBtn, pageInput, ofLabel, nextBtn, lastBtn);
      toolbar.appendChild(paging);
    }

    container.appendChild(toolbar);

    // Table
    const table = document.createElement("table");

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const col of dataset.columns) {
      const th = document.createElement("th");
      const displayName = resolveColumnName(col, props.columns);
      let sortIndicator = "";
      if (props.sortable && this._sortColumn === col.id) {
        sortIndicator = this._sortOrder === "ASCENDING" ? " ▲" : " ▼";
      }
      th.textContent = displayName + sortIndicator;
      if (props.sortable) {
        th.addEventListener("click", () => this.handleSort(col.id, serverSide));
      }
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rowIdx = 0; rowIdx < displayRows.length; rowIdx++) {
      const row = displayRows[rowIdx]!;
      const tr = document.createElement("tr");
      if (props.filter?.enabled) tr.className = "clickable";

      for (let colIdx = 0; colIdx < dataset.columns.length; colIdx++) {
        const td = document.createElement("td");
        const cell = row.cells[colIdx]!;
        let raw = cellToRaw(cell);
        const expr = resolveColumnExpression(dataset.columns[colIdx]!.id, props.columns);
        if (expr) raw = applyCellExpression(raw, expr);
        td.textContent = raw === null ? "" : String(raw);

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
  }

  private goToPage(page: number, props: TableProps, dataset: TypedDataSet, pageSize: number, serverSide: boolean): void {
    this._currentPage = page;
    if (serverSide) {
      this.dispatchEvent(
        new CustomEvent("casehub-page", {
          bubbles: true,
          composed: true,
          detail: { offset: page * pageSize, count: pageSize },
        }),
      );
    }
    this.rerender(props, dataset);
  }

  private isServerSide(dataset: TypedDataSet): boolean {
    return this.totalRows > 0 && this.totalRows > dataset.rows.length;
  }

  private getFilteredRows(dataset: TypedDataSet): readonly import("@casehub/data/dist/dataset/types.js").TypedRow[] {
    if (!this._filterText) return dataset.rows;
    const term = this._filterText.toLowerCase();
    return dataset.rows.filter((row) =>
      row.cells.some((cell) => {
        const raw = cellToRaw(cell);
        return raw !== null && String(raw).toLowerCase().includes(term);
      }),
    );
  }

  private getSortedRows(
    rows: readonly import("@casehub/data/dist/dataset/types.js").TypedRow[],
    dataset: TypedDataSet,
    serverSide: boolean,
  ): readonly import("@casehub/data/dist/dataset/types.js").TypedRow[] {
    if (serverSide || this._sortColumn === undefined) return rows;

    const colIdx = dataset.columns.findIndex((c) => c.id === this._sortColumn);
    if (colIdx < 0) return rows;

    const sorted = [...rows];
    sorted.sort((a, b) => {
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
    return sorted;
  }

  private handleSort(columnId: ColumnId, serverSide: boolean): void {
    if (this._sortColumn === columnId) {
      this._sortOrder = this._sortOrder === "ASCENDING" ? "DESCENDING" : "ASCENDING";
    } else {
      this._sortColumn = columnId;
      this._sortOrder = "ASCENDING";
    }
    if (serverSide) {
      this.dispatchEvent(
        new CustomEvent("casehub-sort", {
          bubbles: true,
          composed: true,
          detail: { columnId, order: this._sortOrder },
        }),
      );
    } else if (this.props && this.dataSet) {
      this.rerender(this.props, this.dataSet);
    }
  }

  private rerender(props: TableProps, dataset: TypedDataSet): void {
    this.render(this.container, props, dataset);
  }
}

customElements.define("casehub-table", CasehubTable);
