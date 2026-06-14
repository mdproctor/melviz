import { describe, it, expect } from "vitest";
import type {
  DataComponentCommon,
  ChartSettings,
  BarChartProps,
  IframePluginProps,
  BubbleChartProps,
  MapProps,
  MetricProps,
} from "./displayer-types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";

describe("DataComponentCommon", () => {
  it("requires lookup", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const component: DataComponentCommon = {
      lookup,
    };

    expect(component.lookup).toBe(lookup);
  });

  it("has optional title, visible, width, height, csvExport", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const component: DataComponentCommon = {
      lookup,
      title: "My Component",
      visible: true,
      width: "800px",
      height: "600px",
      csvExport: true,
    };

    expect(component.title).toBe("My Component");
    expect(component.visible).toBe(true);
    expect(component.width).toBe("800px");
    expect(component.height).toBe("600px");
    expect(component.csvExport).toBe(true);
  });

  it("has optional rowCount and rowOffset", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const component: DataComponentCommon = {
      lookup,
      rowCount: 100,
      rowOffset: 10,
    };

    expect(component.rowCount).toBe(100);
    expect(component.rowOffset).toBe(10);
  });

  it("has optional columns array", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const component: DataComponentCommon = {
      lookup,
      columns: [
        { id: "col1" as any, expression: "$.value" },
        { id: "col2" as any, pattern: "###.##" },
      ],
    };

    expect(component.columns).toHaveLength(2);
    expect(component.columns![0]!.id).toBe("col1");
    expect(component.columns![1]!.pattern).toBe("###.##");
  });

  it("has optional filter and refresh settings", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const component: DataComponentCommon = {
      lookup,
      filter: { enabled: true, listening: true },
      refresh: { interval: 5000, showStaleIndicator: true },
    };

    expect(component.filter?.enabled).toBe(true);
    expect(component.refresh?.interval).toBe(5000);
  });
});

describe("ChartSettings", () => {
  it("has resizable and zoom flags", () => {
    const settings: ChartSettings = {
      resizable: true,
      zoom: true,
    };

    expect(settings.resizable).toBe(true);
    expect(settings.zoom).toBe(true);
  });

  it("has optional maxWidth and maxHeight", () => {
    const settings: ChartSettings = {
      maxWidth: 1200,
      maxHeight: 800,
    };

    expect(settings.maxWidth).toBe(1200);
    expect(settings.maxHeight).toBe(800);
  });

  it("has legend with position", () => {
    const settings: ChartSettings = {
      legend: {
        show: true,
        position: "bottom",
      },
    };

    expect(settings.legend?.show).toBe(true);
    expect(settings.legend?.position).toBe("bottom");
  });

  it("has margin configuration", () => {
    const settings: ChartSettings = {
      margin: {
        top: 10,
        right: 20,
        bottom: 30,
        left: 40,
      },
    };

    expect(settings.margin?.top).toBe(10);
    expect(settings.margin?.right).toBe(20);
    expect(settings.margin?.bottom).toBe(30);
    expect(settings.margin?.left).toBe(40);
  });

  it("has xAxis and yAxis configuration", () => {
    const settings: ChartSettings = {
      xAxis: { title: "X Label", showLabels: true },
      yAxis: { title: "Y Label", showLabels: false },
    };

    expect(settings.xAxis?.title).toBe("X Label");
    expect(settings.xAxis?.showLabels).toBe(true);
    expect(settings.yAxis?.title).toBe("Y Label");
    expect(settings.yAxis?.showLabels).toBe(false);
  });

  it("has extra passthrough for arbitrary config", () => {
    const settings: ChartSettings = {
      extra: {
        tooltip: { enabled: true },
        animation: { duration: 500 },
      },
    };

    expect(settings.extra?.tooltip).toEqual({ enabled: true });
    expect(settings.extra?.animation).toEqual({ duration: 500 });
  });
});

describe("BarChartProps", () => {
  it("has subtype union", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const column: BarChartProps = {
      lookup,
      subtype: "column",
    };
    const columnStacked: BarChartProps = {
      lookup,
      subtype: "column-stacked",
    };
    const bar: BarChartProps = {
      lookup,
      subtype: "bar",
    };
    const barStacked: BarChartProps = {
      lookup,
      subtype: "bar-stacked",
    };

    expect(column.subtype).toBe("column");
    expect(columnStacked.subtype).toBe("column-stacked");
    expect(bar.subtype).toBe("bar");
    expect(barStacked.subtype).toBe("bar-stacked");
  });

  it("extends DataComponentCommon and ChartSettings", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const props: BarChartProps = {
      lookup,
      title: "Bar Chart",
      resizable: true,
      legend: { show: true, position: "top" },
      subtype: "column",
    };

    expect(props.title).toBe("Bar Chart");
    expect(props.resizable).toBe(true);
    expect(props.legend?.position).toBe("top");
  });
});

describe("IframePluginProps", () => {
  it("does NOT require lookup", () => {
    const props: IframePluginProps = {
      componentId: "plugin-1",
    };

    expect(props.componentId).toBe("plugin-1");
    expect(props.lookup).toBeUndefined();
  });

  it("has optional lookup", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const props: IframePluginProps = {
      componentId: "plugin-1",
      lookup,
    };

    expect(props.lookup).toBe(lookup);
  });

  it("has optional settings", () => {
    const props: IframePluginProps = {
      componentId: "plugin-1",
      settings: { apiKey: "secret", theme: "dark" },
    };

    expect(props.settings?.apiKey).toBe("secret");
    expect(props.settings?.theme).toBe("dark");
  });

  it("has optional title, visible, width, height", () => {
    const props: IframePluginProps = {
      componentId: "plugin-1",
      title: "My Plugin",
      visible: true,
      width: "800px",
      height: "600px",
    };

    expect(props.title).toBe("My Plugin");
    expect(props.visible).toBe(true);
    expect(props.width).toBe("800px");
    expect(props.height).toBe("600px");
  });

  it("has optional refresh settings", () => {
    const props: IframePluginProps = {
      componentId: "plugin-1",
      refresh: { interval: 10000, showStaleIndicator: true },
    };

    expect(props.refresh?.interval).toBe(10000);
    expect(props.refresh?.showStaleIndicator).toBe(true);
  });

  it("has optional filter settings", () => {
    const props: IframePluginProps = {
      componentId: "plugin-1",
      filter: { enabled: true, listening: true },
    };

    expect(props.filter?.enabled).toBe(true);
    expect(props.filter?.listening).toBe(true);
  });
});

describe("BubbleChartProps", () => {
  it("has radius configuration", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const props: BubbleChartProps = {
      lookup,
      minRadius: 5,
      maxRadius: 50,
    };

    expect(props.minRadius).toBe(5);
    expect(props.maxRadius).toBe(50);
  });

  it("extends DataComponentCommon and ChartSettings", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const props: BubbleChartProps = {
      lookup,
      title: "Bubble Chart",
      resizable: true,
      minRadius: 10,
    };

    expect(props.title).toBe("Bubble Chart");
    expect(props.resizable).toBe(true);
    expect(props.minRadius).toBe(10);
  });
});

describe("MapProps", () => {
  it("has colorScheme", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const props: MapProps = {
      lookup,
      colorScheme: "blue-green",
    };

    expect(props.colorScheme).toBe("blue-green");
  });

  it("has subtype union", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const regions: MapProps = {
      lookup,
      subtype: "regions",
    };
    const markers: MapProps = {
      lookup,
      subtype: "markers",
    };

    expect(regions.subtype).toBe("regions");
    expect(markers.subtype).toBe("markers");
  });
});

describe("MetricProps", () => {
  it("has subtype for built-in templates", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const card: MetricProps = {
      lookup,
      subtype: "card",
    };
    const card2: MetricProps = {
      lookup,
      subtype: "card2",
    };
    const plainText: MetricProps = {
      lookup,
      subtype: "plain-text",
    };
    const quota: MetricProps = {
      lookup,
      subtype: "quota",
    };

    expect(card.subtype).toBe("card");
    expect(card2.subtype).toBe("card2");
    expect(plainText.subtype).toBe("plain-text");
    expect(quota.subtype).toBe("quota");
  });

  it("has optional html template and javascript", () => {
    const lookup: DataSetLookup = {
      dataSetId: "ds1" as any,
      operations: [],
    };

    const props: MetricProps = {
      lookup,
      html: {
        template: "<div>${value}</div>",
        javascript: "console.log('loaded');",
      },
    };

    expect(props.html?.template).toBe("<div>${value}</div>");
    expect(props.html?.javascript).toBe("console.log('loaded');");
  });
});
