import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { SelectorProps } from "@casehub/ui/dist/model/displayer-types.js";
import { toTypedDataSet } from "@casehub/data/dist/dataset/conversion.js";

import { CasehubSelector } from "./CasehubSelector.js";

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

// ── Tests ─────────────────────────────────────────────────────────────

describe("CasehubSelector", () => {
  let el: CasehubSelector;

  beforeEach(() => {
    el = document.createElement("casehub-selector") as CasehubSelector;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  // ── Dropdown ──────────────────────────────────────────────────────

  describe("dropdown (default subtype)", () => {
    it("renders <select> with All option plus distinct values", () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"], ["B"], ["A"], ["C"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const select = el.shadowRoot!.querySelector("select");
      expect(select).not.toBeNull();

      const options = Array.from(select!.querySelectorAll("option"));
      expect(options).toHaveLength(4); // All + A, B, C
      expect(options[0]!.textContent).toBe("All");
      expect(options[1]!.textContent).toBe("A");
      expect(options[2]!.textContent).toBe("B");
      expect(options[3]!.textContent).toBe("C");
    });

    it("selection change emits casehub-filter with columnId and rowIndex", () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"], ["B"], ["C"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        filter: { enabled: true, group: "myGroup" },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const select = el.shadowRoot!.querySelector("select")!;
      select.selectedIndex = 2; // Select "B" (index 0 = All, 1 = A, 2 = B)
      select.dispatchEvent(new Event("change"));

      expect(events).toHaveLength(1);
      expect(events[0]!.detail).toEqual({
        columnId: "category",
        rowIndex: 1, // Data row index for "B"
        reset: false,
        group: "myGroup",
      });
    });

    it("selecting All emits reset: true", () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"], ["B"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const select = el.shadowRoot!.querySelector("select")!;
      select.selectedIndex = 0; // All
      select.dispatchEvent(new Event("change"));

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.reset).toBe(true);
    });

    it("filter group is undefined when not set in props", () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const select = el.shadowRoot!.querySelector("select")!;
      select.selectedIndex = 1;
      select.dispatchEvent(new Event("change"));

      expect(events[0]!.detail.group).toBeUndefined();
    });
  });

  // ── Slider ────────────────────────────────────────────────────────

  describe("slider subtype", () => {
    it("renders <input type=range> with min/max from data", () => {
      const ds = makeDataSet(
        [["score", "NUMBER"]],
        [[10], [50], [30]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "slider",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const slider = el.shadowRoot!.querySelector("input[type='range']") as HTMLInputElement;
      expect(slider).not.toBeNull();
      expect(slider.min).toBe("10");
      expect(slider.max).toBe("50");
    });

    it("slider change emits casehub-filter with closest rowIndex", () => {
      const ds = makeDataSet(
        [["score", "NUMBER"]],
        [[10], [20], [30]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "slider",
        filter: { enabled: true },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const slider = el.shadowRoot!.querySelector("input[type='range']") as HTMLInputElement;
      slider.value = "20";
      slider.dispatchEvent(new Event("change"));

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.columnId).toBe("score");
      expect(events[0]!.detail.rowIndex).toBe(1); // Index of row with value 20
      expect(events[0]!.detail.reset).toBe(false);
    });
  });

  // ── Labels ────────────────────────────────────────────────────────

  describe("labels subtype", () => {
    it("renders clickable button chips for distinct values", () => {
      const ds = makeDataSet(
        [["tag", "LABEL"]],
        [["Red"], ["Blue"], ["Red"], ["Green"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "labels",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const chips = el.shadowRoot!.querySelectorAll(".label-chip");
      expect(chips).toHaveLength(3); // Red, Blue, Green
      expect(chips[0]!.textContent).toBe("Red");
      expect(chips[1]!.textContent).toBe("Blue");
      expect(chips[2]!.textContent).toBe("Green");
    });

    it("click emits casehub-filter and adds .selected class", () => {
      const ds = makeDataSet(
        [["tag", "LABEL"]],
        [["Red"], ["Blue"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "labels",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const chips = el.shadowRoot!.querySelectorAll(".label-chip");
      const redChip = chips[0] as HTMLButtonElement;
      redChip.click();

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.columnId).toBe("tag");
      expect(events[0]!.detail.rowIndex).toBe(0);
      expect(events[0]!.detail.reset).toBe(false);

      // Check selection state
      expect(redChip.classList.contains("selected")).toBe(true);
    });

    it("click selected label emits reset: true and removes .selected", () => {
      const ds = makeDataSet(
        [["tag", "LABEL"]],
        [["Red"]],
      );
      const props: SelectorProps = {
        lookup: mockLookup("test"),
        subtype: "labels",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const events: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) => events.push(e as CustomEvent));

      const chip = el.shadowRoot!.querySelector(".label-chip") as HTMLButtonElement;

      // First click — select
      chip.click();
      expect(chip.classList.contains("selected")).toBe(true);

      // Second click — deselect
      chip.click();
      expect(events).toHaveLength(2);
      expect(events[1]!.detail.reset).toBe(true);
      expect(chip.classList.contains("selected")).toBe(false);
    });
  });

  // ── CSS ───────────────────────────────────────────────────────────

  describe("styling", () => {
    it("renders style element in shadow DOM", () => {
      const ds = makeDataSet(
        [["category", "LABEL"]],
        [["A"]],
      );
      const props: SelectorProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot!.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain(":host");
      expect(style!.textContent).toContain("select");
    });
  });
});
