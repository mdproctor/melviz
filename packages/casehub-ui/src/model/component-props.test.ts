import { describe, it, expect } from "vitest";
import type {
  GridProps, ColumnsProps, PanelProps, HtmlProps, MarkdownProps,
  TitleProps, LazyPageProps, FilterSettings, DrillDown, RefreshSettings,
} from "./component-props.js";

describe("component props", () => {
  it("GridProps has columns", () => {
    const p: GridProps = { columns: 12 };
    expect(p.columns).toBe(12);
  });

  it("ColumnsProps has distribution", () => {
    const p: ColumnsProps = { distribution: [1, 2, 1] };
    expect(p.distribution).toEqual([1, 2, 1]);
  });

  it("PanelProps has title", () => {
    const p: PanelProps = { title: "Admin" };
    expect(p.title).toBe("Admin");
  });

  it("HtmlProps has content", () => {
    const p: HtmlProps = { content: "<h1>Hi</h1>" };
    expect(p.content).toBe("<h1>Hi</h1>");
  });

  it("LazyPageProps has name and href", () => {
    const p: LazyPageProps = { name: "Admin", href: "/pages/admin.json" };
    expect(p.name).toBe("Admin");
    expect(p.href).toBe("/pages/admin.json");
  });

  it("FilterSettings with drill-down", () => {
    const f: FilterSettings = {
      notification: true,
      listening: false,
      group: "region",
      drillDown: { target: "Detail", parameters: { region: "region" } },
    };
    expect(f.group).toBe("region");
    expect(f.drillDown!.target).toBe("Detail");
  });

  it("RefreshSettings uses showStaleIndicator", () => {
    const r: RefreshSettings = { interval: 30, showStaleIndicator: true };
    expect(r.interval).toBe(30);
    expect(r.showStaleIndicator).toBe(true);
  });
});
