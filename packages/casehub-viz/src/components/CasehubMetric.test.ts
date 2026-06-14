import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { MetricProps } from "@casehub/ui/dist/model/displayer-types.js";
import { toTypedDataSet } from "@casehub/data/dist/dataset/conversion.js";

import { CasehubMetric } from "./CasehubMetric.js";

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

describe("CasehubMetric", () => {
  let el: CasehubMetric;

  beforeEach(() => {
    el = document.createElement("casehub-metric") as CasehubMetric;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  // ── Card subtype ──────────────────────────────────────────────────

  describe("card subtype (default)", () => {
    it("renders value and title with .card class", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[42]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        title: "My Metric",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const card = el.shadowRoot!.querySelector(".card");
      expect(card).not.toBeNull();

      const title = el.shadowRoot!.querySelector(".card .title");
      expect(title?.textContent).toBe("My Metric");

      const value = el.shadowRoot!.querySelector(".card .value");
      expect(value?.textContent).toBe("42");
    });

    it("renders without title when not provided", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[100]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const title = el.shadowRoot!.querySelector(".card .title");
      expect(title?.textContent).toBe("");

      const value = el.shadowRoot!.querySelector(".card .value");
      expect(value?.textContent).toBe("100");
    });

    it("renders style element in shadow DOM", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[1]],
      );
      const props: MetricProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const style = el.shadowRoot!.querySelector("style");
      expect(style).not.toBeNull();
      expect(style!.textContent).toContain(":host");
    });
  });

  // ── Card2 subtype ─────────────────────────────────────────────────

  describe("card2 subtype", () => {
    it("renders with .card2 class", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[999]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        subtype: "card2",
        title: "Compact Metric",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const card2 = el.shadowRoot!.querySelector(".card2");
      expect(card2).not.toBeNull();

      const value = el.shadowRoot!.querySelector(".card2 .value");
      expect(value?.textContent).toBe("999");

      const title = el.shadowRoot!.querySelector(".card2 .title");
      expect(title?.textContent).toBe("Compact Metric");
    });
  });

  // ── Plain-text subtype ────────────────────────────────────────────

  describe("plain-text subtype", () => {
    it("renders with .plain-text class", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"]],
        [["Active"]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        subtype: "plain-text",
        title: "Status",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const plainText = el.shadowRoot!.querySelector(".plain-text");
      expect(plainText).not.toBeNull();

      const title = el.shadowRoot!.querySelector(".plain-text .title");
      expect(title?.textContent).toBe("Status");

      const value = el.shadowRoot!.querySelector(".plain-text .value");
      expect(value?.textContent).toBe("Active");
    });
  });

  // ── Quota subtype ─────────────────────────────────────────────────

  describe("quota subtype", () => {
    it("renders progress bar with single column (no max)", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[75]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        subtype: "quota",
        title: "Progress",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const quota = el.shadowRoot!.querySelector(".quota");
      expect(quota).not.toBeNull();

      const value = el.shadowRoot!.querySelector(".quota .value");
      expect(value?.textContent).toBe("75");

      const bar = el.shadowRoot!.querySelector(".quota .bar");
      expect(bar).not.toBeNull();

      const barFill = el.shadowRoot!.querySelector(".quota .bar-fill") as HTMLElement;
      expect(barFill).not.toBeNull();
      // With no max, assume 100
      expect(barFill.style.width).toBe("75%");
    });

    it("renders progress bar with two columns (value and max)", () => {
      const ds = makeDataSet(
        [["current", "NUMBER"], ["max", "NUMBER"]],
        [[60, 200]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        subtype: "quota",
        title: "Storage",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const value = el.shadowRoot!.querySelector(".quota .value");
      expect(value?.textContent).toBe("60");

      const barFill = el.shadowRoot!.querySelector(".quota .bar-fill") as HTMLElement;
      expect(barFill).not.toBeNull();
      // 60 / 200 = 30%
      expect(barFill.style.width).toBe("30%");
    });
  });

  // ── HTML template ─────────────────────────────────────────────────

  describe("html template", () => {
    it("replaces ${value} with actual value", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[123]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        html: {
          template: "<div class='custom'>Value: ${value}</div>",
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const custom = el.shadowRoot!.querySelector(".custom");
      expect(custom).not.toBeNull();
      expect(custom?.textContent).toBe("Value: 123");
    });

    it("handles multiple ${value} replacements", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[5]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        html: {
          template: "<p>${value} items (${value} total)</p>",
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const p = el.shadowRoot!.querySelector("p");
      expect(p?.textContent).toBe("5 items (5 total)");
    });
  });

  // ── Value extraction ──────────────────────────────────────────────

  describe("value extraction", () => {
    it("extracts value from first row first column", () => {
      const ds = makeDataSet(
        [["col1", "NUMBER"], ["col2", "NUMBER"]],
        [[99, 88], [77, 66]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const value = el.shadowRoot!.querySelector(".card .value");
      expect(value?.textContent).toBe("99");
    });

    it("handles null values", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[null]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const value = el.shadowRoot!.querySelector(".card .value");
      expect(value?.textContent).toBe("");
    });

    it("handles string values", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"]],
        [["Success"]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const value = el.shadowRoot!.querySelector(".card .value");
      expect(value?.textContent).toBe("Success");
    });
  });

  // ── Title extraction ──────────────────────────────────────────────

  describe("title extraction", () => {
    it("uses props.title when provided", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[1]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
        title: "Custom Title",
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const title = el.shadowRoot!.querySelector(".card .title");
      expect(title?.textContent).toBe("Custom Title");
    });

    it("uses empty string when title not provided", () => {
      const ds = makeDataSet(
        [["metric", "NUMBER"]],
        [[1]],
      );
      const props: MetricProps = {
        lookup: mockLookup("test"),
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const title = el.shadowRoot!.querySelector(".card .title");
      expect(title?.textContent).toBe("");
    });
  });
});
