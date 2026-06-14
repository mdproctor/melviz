import type { TypedDataSet, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { SelectorProps } from "@casehub/ui/dist/model/displayer-types.js";
import { CasehubElement } from "../base/CasehubElement.js";
import { cellToRaw } from "../base/cell-extract.js";

const SELECTOR_CSS = `
:host {
  display: block;
  font-family: var(--casehub-font, system-ui, sans-serif);
}
select {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--casehub-border, #e0e0e0);
  border-radius: var(--casehub-radius, 4px);
  font-size: var(--casehub-font-size, 14px);
  background: var(--casehub-bg, #fff);
  color: var(--casehub-text, #333);
}
input[type="range"] {
  width: 100%;
}
.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.label-chip {
  padding: 4px 12px;
  border: 1px solid var(--casehub-border, #e0e0e0);
  border-radius: 16px;
  cursor: pointer;
  font-size: 0.9em;
  background: var(--casehub-bg, #fff);
  color: var(--casehub-text, #333);
}
.label-chip.selected {
  background: var(--casehub-accent, #5470c6);
  color: #fff;
  border-color: var(--casehub-accent, #5470c6);
}
`;

export class CasehubSelector extends CasehubElement<SelectorProps> {
  private _selectedLabelIndex: number | undefined;

  protected override render(
    container: HTMLDivElement,
    props: SelectorProps,
    dataset: TypedDataSet,
  ): void {
    container.textContent = "";

    // Style
    const style = document.createElement("style");
    style.textContent = SELECTOR_CSS;
    container.appendChild(style);

    if (dataset.columns.length === 0) return;

    const firstColumn = dataset.columns[0]!;
    const distinctValues = this.extractDistinctValues(dataset, firstColumn.id);

    const subtype = props.subtype ?? "dropdown";

    if (subtype === "dropdown") {
      this.renderDropdown(container, props, firstColumn.id, distinctValues);
    } else if (subtype === "slider") {
      this.renderSlider(container, props, firstColumn.id, distinctValues);
    } else if (subtype === "labels") {
      this.renderLabels(container, props, firstColumn.id, distinctValues);
    }
  }

  private extractDistinctValues(
    dataset: TypedDataSet,
    columnId: ColumnId,
  ): Array<{ value: string | number | Date | null; rowIndex: number }> {
    const seen = new Set<string | number | null>();
    const result: Array<{ value: string | number | Date | null; rowIndex: number }> = [];

    const colIdx = dataset.columns.findIndex((c) => c.id === columnId);
    if (colIdx < 0) return result;

    for (let rowIdx = 0; rowIdx < dataset.rows.length; rowIdx++) {
      const row = dataset.rows[rowIdx]!;
      const raw = cellToRaw(row.cells[colIdx]!);

      const key = raw instanceof Date ? raw.getTime() : raw;

      if (!seen.has(key)) {
        seen.add(key);
        result.push({ value: raw, rowIndex: rowIdx });
      }
    }

    return result;
  }

  private renderDropdown(
    container: HTMLDivElement,
    props: SelectorProps,
    columnId: ColumnId,
    values: Array<{ value: string | number | Date | null; rowIndex: number }>,
  ): void {
    const select = document.createElement("select");

    // "All" option
    const allOption = document.createElement("option");
    allOption.textContent = "All";
    allOption.value = "-1";
    select.appendChild(allOption);

    // Distinct values
    for (const { value, rowIndex } of values) {
      const option = document.createElement("option");
      option.textContent = value === null ? "" : String(value);
      option.value = String(rowIndex);
      select.appendChild(option);
    }

    select.addEventListener("change", () => {
      const selectedIndex = parseInt(select.value, 10);

      if (selectedIndex === -1) {
        // "All" selected
        this.dispatchEvent(
          new CustomEvent("casehub-filter", {
            bubbles: true,
            composed: true,
            detail: {
              columnId,
              rowIndex: 0,
              reset: true,
              group: props.filter?.group,
            },
          }),
        );
      } else {
        this.dispatchEvent(
          new CustomEvent("casehub-filter", {
            bubbles: true,
            composed: true,
            detail: {
              columnId,
              rowIndex: selectedIndex,
              reset: false,
              group: props.filter?.group,
            },
          }),
        );
      }
    });

    container.appendChild(select);
  }

  private renderSlider(
    container: HTMLDivElement,
    props: SelectorProps,
    columnId: ColumnId,
    values: Array<{ value: string | number | Date | null; rowIndex: number }>,
  ): void {
    const numericValues = values
      .filter((v) => typeof v.value === "number")
      .map((v) => v.value as number);

    if (numericValues.length === 0) return;

    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(min);

    slider.addEventListener("change", () => {
      const targetValue = parseFloat(slider.value);

      // Find the row index with the closest numeric value
      let closestIndex = 0;
      let closestDiff = Infinity;

      for (const { value, rowIndex } of values) {
        if (typeof value === "number") {
          const diff = Math.abs(value - targetValue);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestIndex = rowIndex;
          }
        }
      }

      this.dispatchEvent(
        new CustomEvent("casehub-filter", {
          bubbles: true,
          composed: true,
          detail: {
            columnId,
            rowIndex: closestIndex,
            reset: false,
            group: props.filter?.group,
          },
        }),
      );
    });

    container.appendChild(slider);
  }

  private renderLabels(
    container: HTMLDivElement,
    props: SelectorProps,
    columnId: ColumnId,
    values: Array<{ value: string | number | Date | null; rowIndex: number }>,
  ): void {
    const labelsDiv = document.createElement("div");
    labelsDiv.className = "labels";

    for (let i = 0; i < values.length; i++) {
      const { value, rowIndex } = values[i]!;
      const chip = document.createElement("button");
      chip.className = "label-chip";
      chip.textContent = value === null ? "" : String(value);
      chip.type = "button";

      chip.addEventListener("click", () => {
        const wasSelected = chip.classList.contains("selected");

        if (wasSelected) {
          // Deselect
          chip.classList.remove("selected");
          this._selectedLabelIndex = undefined;

          this.dispatchEvent(
            new CustomEvent("casehub-filter", {
              bubbles: true,
              composed: true,
              detail: {
                columnId,
                rowIndex,
                reset: true,
                group: props.filter?.group,
              },
            }),
          );
        } else {
          // Select (and clear previous selection)
          const allChips = labelsDiv.querySelectorAll(".label-chip");
          allChips.forEach((c) => c.classList.remove("selected"));

          chip.classList.add("selected");
          this._selectedLabelIndex = i;

          this.dispatchEvent(
            new CustomEvent("casehub-filter", {
              bubbles: true,
              composed: true,
              detail: {
                columnId,
                rowIndex,
                reset: false,
                group: props.filter?.group,
              },
            }),
          );
        }
      });

      labelsDiv.appendChild(chip);
    }

    container.appendChild(labelsDiv);
  }
}

customElements.define("casehub-selector", CasehubSelector);
