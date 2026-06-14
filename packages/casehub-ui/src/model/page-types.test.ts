import { describe, it, expect } from "vitest";
import type {
  PageProps,
  PageSettings,
  ViewState,
  DeepLink,
  DataComponentDefaults,
  LookupDefaults,
  DataSetDefaults,
  DrillDownStep,
  LayoutOverride,
  Site,
} from "./page-types.js";
import type { Component } from "./types.js";
import type { DataSetId } from "@casehub/data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehub/data/dist/dataset/external/types.js";
import { HttpMethod } from "@casehub/data/dist/dataset/external/types.js";

describe("PageProps", () => {
  it("has name, datasets, settings, properties", () => {
    const datasets: readonly ExternalDataSetDef[] = [
      {
        uuid: "ds1" as DataSetId,
        name: "Sales Data",
        url: "https://api.example.com/sales",
      },
    ];

    const props: PageProps = {
      name: "Dashboard",
      datasets,
      settings: { mode: "dark" },
      properties: { title: "Sales Overview" },
    };

    expect(props.name).toBe("Dashboard");
    expect(props.datasets).toBe(datasets);
    expect(props.settings?.mode).toBe("dark");
    expect(props.properties?.title).toBe("Sales Overview");
  });

  it("all fields are optional", () => {
    const props: PageProps = {};
    expect(props.name).toBeUndefined();
    expect(props.datasets).toBeUndefined();
    expect(props.settings).toBeUndefined();
    expect(props.properties).toBeUndefined();
  });
});

describe("PageSettings", () => {
  it("has mode with light and dark", () => {
    const light: PageSettings = { mode: "light" };
    const dark: PageSettings = { mode: "dark" };

    expect(light.mode).toBe("light");
    expect(dark.mode).toBe("dark");
  });

  it("has allowUrlProperties flag", () => {
    const settings: PageSettings = {
      allowUrlProperties: true,
    };

    expect(settings.allowUrlProperties).toBe(true);
  });

  it("has dataComponentDefaults", () => {
    const settings: PageSettings = {
      dataComponentDefaults: {
        lookup: { dataSetId: "default-ds" as DataSetId, operations: [] },
        chart: { resizable: true, zoom: true },
      },
    };

    expect(settings.dataComponentDefaults?.lookup?.dataSetId).toBe("default-ds");
    expect(settings.dataComponentDefaults?.chart?.resizable).toBe(true);
  });

  it("has datasetDefaults", () => {
    const settings: PageSettings = {
      datasetDefaults: {
        url: "https://api.example.com",
        method: HttpMethod.GET,
        cacheEnabled: true,
        refreshTime: "5m",
      },
    };

    expect(settings.datasetDefaults?.url).toBe("https://api.example.com");
    expect(settings.datasetDefaults?.method).toBe(HttpMethod.GET);
    expect(settings.datasetDefaults?.cacheEnabled).toBe(true);
    expect(settings.datasetDefaults?.refreshTime).toBe("5m");
  });
});

describe("DataComponentDefaults", () => {
  it("has lookup defaults", () => {
    const defaults: DataComponentDefaults = {
      lookup: {
        dataSetId: "global-ds" as DataSetId,
        operations: [],
        rowCount: 100,
        rowOffset: 0,
      },
    };

    expect(defaults.lookup?.dataSetId).toBe("global-ds");
    expect(defaults.lookup?.rowCount).toBe(100);
  });

  it("has chart defaults as partial ChartSettings", () => {
    const defaults: DataComponentDefaults = {
      chart: {
        resizable: true,
        legend: { show: true, position: "bottom" },
      },
    };

    expect(defaults.chart?.resizable).toBe(true);
    expect(defaults.chart?.legend?.position).toBe("bottom");
  });
});

describe("LookupDefaults", () => {
  it("has dataSetId and operations", () => {
    const defaults: LookupDefaults = {
      dataSetId: "default-ds" as DataSetId,
      operations: [{ type: "filter", column: "status" as any, function: "EQUALS_TO", terms: ["active"] }],
    };

    expect(defaults.dataSetId).toBe("default-ds");
    expect(defaults.operations).toHaveLength(1);
  });

  it("has rowCount and rowOffset", () => {
    const defaults: LookupDefaults = {
      rowCount: 50,
      rowOffset: 10,
    };

    expect(defaults.rowCount).toBe(50);
    expect(defaults.rowOffset).toBe(10);
  });
});

describe("DataSetDefaults", () => {
  it("has url, content, method, headers", () => {
    const defaults: DataSetDefaults = {
      url: "https://api.example.com/data",
      content: "inline content",
      method: HttpMethod.POST,
      headers: { Authorization: "Bearer token" },
    };

    expect(defaults.url).toBe("https://api.example.com/data");
    expect(defaults.content).toBe("inline content");
    expect(defaults.method).toBe(HttpMethod.POST);
    expect(defaults.headers?.Authorization).toBe("Bearer token");
  });

  it("has columns array", () => {
    const defaults: DataSetDefaults = {
      columns: [
        { id: "col1" as any, name: "Column 1", type: 1 /* NUMBER */ },
        { id: "col2" as any, name: "Column 2", type: 2 /* LABEL */ },
      ],
    };

    expect(defaults.columns).toHaveLength(2);
    expect(defaults.columns![0]!.id).toBe("col1");
  });

  it("has cacheEnabled and refreshTime", () => {
    const defaults: DataSetDefaults = {
      cacheEnabled: true,
      refreshTime: "10m",
    };

    expect(defaults.cacheEnabled).toBe(true);
    expect(defaults.refreshTime).toBe("10m");
  });
});

describe("ViewState", () => {
  it("has currentPage", () => {
    const state: ViewState = {
      currentPage: "overview",
    };

    expect(state.currentPage).toBe("overview");
  });

  it("has expandedNodes array", () => {
    const state: ViewState = {
      expandedNodes: ["node1", "node2", "node3"],
    };

    expect(state.expandedNodes).toHaveLength(3);
    expect(state.expandedNodes![0]).toBe("node1");
  });

  it("has activeFilters keyed by string (ColumnId branded type)", () => {
    const state: ViewState = {
      activeFilters: {
        status: ["active", "pending"],
        region: ["NA", "EU"],
      },
    };

    expect(state.activeFilters?.status).toEqual(["active", "pending"]);
    expect(state.activeFilters?.region).toEqual(["NA", "EU"]);
  });

  it("has drillDownPath array", () => {
    const state: ViewState = {
      drillDownPath: [
        {
          source: "chart1",
          column: "region",
          value: "NA",
          targetPage: "region-details",
        },
        {
          source: "chart2",
          column: "country",
          value: "USA",
          targetPage: "country-details",
        },
      ],
    };

    expect(state.drillDownPath).toHaveLength(2);
    expect(state.drillDownPath![0]!.value).toBe("NA");
    expect(state.drillDownPath![1]!.targetPage).toBe("country-details");
  });

  it("has layoutOverrides array", () => {
    const state: ViewState = {
      layoutOverrides: [
        {
          componentId: "chart1",
          placement: { row: 0, column: 0, width: 2, height: 1 },
        },
      ],
    };

    expect(state.layoutOverrides).toHaveLength(1);
    expect(state.layoutOverrides![0]!.componentId).toBe("chart1");
  });

  it("has collapsedPanels array", () => {
    const state: ViewState = {
      collapsedPanels: ["panel1", "panel2"],
    };

    expect(state.collapsedPanels).toHaveLength(2);
    expect(state.collapsedPanels![0]).toBe("panel1");
  });

  it("has scrollPositions map", () => {
    const state: ViewState = {
      scrollPositions: {
        "page1": 120,
        "page2": 340,
      },
    };

    expect(state.scrollPositions?.page1).toBe(120);
    expect(state.scrollPositions?.page2).toBe(340);
  });
});

describe("DrillDownStep", () => {
  it("has source, column, value, targetPage", () => {
    const step: DrillDownStep = {
      source: "sales-chart",
      column: "region",
      value: "EMEA",
      targetPage: "regional-breakdown",
    };

    expect(step.source).toBe("sales-chart");
    expect(step.column).toBe("region");
    expect(step.value).toBe("EMEA");
    expect(step.targetPage).toBe("regional-breakdown");
  });
});

describe("LayoutOverride", () => {
  it("has componentId and placement", () => {
    const override: LayoutOverride = {
      componentId: "metric1",
      placement: { row: 1, column: 2, width: 1, height: 1 },
    };

    expect(override.componentId).toBe("metric1");
    expect(override.placement.row).toBe(1);
    expect(override.placement.column).toBe(2);
  });
});

describe("DeepLink", () => {
  it("has page and optional parameters", () => {
    const link: DeepLink = {
      page: "dashboard",
      parameters: { view: "summary", mode: "compact" },
    };

    expect(link.page).toBe("dashboard");
    expect(link.parameters?.view).toBe("summary");
  });

  it("has optional filters", () => {
    const link: DeepLink = {
      page: "dashboard",
      filters: {
        status: ["active", "pending"],
        priority: ["high"],
      },
    };

    expect(link.filters?.status).toEqual(["active", "pending"]);
    expect(link.filters?.priority).toEqual(["high"]);
  });

  it("has optional drillDown array", () => {
    const link: DeepLink = {
      page: "dashboard",
      drillDown: [
        {
          source: "chart1",
          column: "region",
          value: "NA",
          targetPage: "region-view",
        },
      ],
    };

    expect(link.drillDown).toHaveLength(1);
    expect(link.drillDown![0]!.value).toBe("NA");
  });

  it("has optional sort configuration", () => {
    const linkAsc: DeepLink = {
      page: "dashboard",
      sort: { column: "revenue", order: "ASC" },
    };
    const linkDesc: DeepLink = {
      page: "dashboard",
      sort: { column: "revenue", order: "DESC" },
    };

    expect(linkAsc.sort?.column).toBe("revenue");
    expect(linkAsc.sort?.order).toBe("ASC");
    expect(linkDesc.sort?.order).toBe("DESC");
  });
});

describe("Site", () => {
  it("has root component", () => {
    const root: Component = { type: "page", props: {}, children: [] };
    const state: ViewState = {};

    const site: Site = {
      root,
      page: () => null,
      dataset: () => null,
      state,
    };

    expect(site.root).toBe(root);
  });

  it("has page method returning Component or null", () => {
    const root: Component = { type: "page", props: {}, children: [] };
    const state: ViewState = {};

    const site: Site = {
      root,
      page: (path: string) => {
        if (path === "dashboard") {
          return { type: "page", props: { name: "Dashboard" }, children: [] };
        }
        return null;
      },
      dataset: () => null,
      state,
    };

    const found = site.page("dashboard");
    const notFound = site.page("unknown");

    expect(found).not.toBeNull();
    expect(found?.type).toBe("page");
    expect(notFound).toBeNull();
  });

  it("has dataset method returning ExternalDataSetDef or null", () => {
    const root: Component = { type: "page", props: {}, children: [] };
    const state: ViewState = {};

    const site: Site = {
      root,
      page: () => null,
      dataset: (id: DataSetId, fromPage?: string) => {
        if (id === "sales-data" as DataSetId) {
          return {
            uuid: id,
            name: "Sales Data",
            url: "https://api.example.com/sales",
          };
        }
        return null;
      },
      state,
    };

    const found = site.dataset("sales-data" as DataSetId);
    const notFound = site.dataset("unknown" as DataSetId);

    expect(found).not.toBeNull();
    expect(found?.name).toBe("Sales Data");
    expect(notFound).toBeNull();
  });

  it("has state property", () => {
    const root: Component = { type: "page", props: {}, children: [] };
    const state: ViewState = {
      currentPage: "overview",
      expandedNodes: ["node1"],
    };

    const site: Site = {
      root,
      page: () => null,
      dataset: () => null,
      state,
    };

    expect(site.state).toBe(state);
    expect(site.state.currentPage).toBe("overview");
  });
});
