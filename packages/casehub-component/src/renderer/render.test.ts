import { describe, it, expect } from "vitest";
import type { Component, PermissionContext } from "../model/types.js";
import { renderComponent } from "./render.js";

describe("renderComponent — basic rendering", () => {
  it("unknown type produces activation container with all three data attributes", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "bar-chart",
      props: { dataset: "sales" },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.dataset.componentType).toBe("bar-chart");
    expect(el.dataset.componentId).toBeTruthy();
    expect(el.dataset.componentProps).toBe(JSON.stringify({ dataset: "sales" }));
  });

  it("clears target before rendering", () => {
    const target = document.createElement("div");
    target.innerHTML = "<p>old content</p>";
    const component: Component = { type: "html" };
    renderComponent(target, component);
    expect(target.querySelector("p")).toBeNull();
    expect(target.children).toHaveLength(1);
  });

  it("auto-generates deterministic IDs with :: separator", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "rows",
      slots: {
        default: [{ type: "html" }, { type: "html" }],
      },
    };
    renderComponent(target, component);
    const root = target.firstElementChild as HTMLElement;
    expect(root.dataset.componentId).toBe("root");
    const children = root.querySelectorAll("[data-slot='default'] > [data-component-id]");
    expect(children[0]!.getAttribute("data-component-id")).toBe("root::default::0");
    expect(children[1]!.getAttribute("data-component-id")).toBe("root::default::1");
  });

  it("uses explicit ID when provided", () => {
    const target = document.createElement("div");
    const component: Component = { type: "html", id: "my-widget" };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    expect(el.dataset.componentId).toBe("my-widget");
  });
});

describe("renderComponent — Component.style", () => {
  it("style properties applied as inline CSS", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "html",
      style: { "background-color": "red", padding: "8px" },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    expect(el.style.backgroundColor).toBe("red");
    expect(el.style.padding).toBe("8px");
  });

  it("author style overrides layout CSS on the same property", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "rows",
      style: { display: "block" },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    // rows sets display:flex, but author override should win
    expect(el.style.display).toBe("block");
  });
});

describe("renderComponent — layout types", () => {
  it("grid with items: correct CSS and grid placement on children", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "grid",
      props: { columns: 12 },
      items: [
        {
          placement: { x: 0, y: 0, w: 6, h: 1 },
          component: { type: "html" },
        },
        {
          placement: { x: 6, y: 0, w: 6, h: 1 },
          component: { type: "html" },
        },
      ],
    };
    renderComponent(target, component);
    const gridEl = target.firstElementChild as HTMLElement;
    expect(gridEl.style.display).toBe("grid");
    expect(gridEl.style.gridTemplateColumns).toBe("repeat(12, 1fr)");
    const children = gridEl.querySelectorAll(":scope > [data-component-type]");
    expect(children).toHaveLength(2);
    const child0 = children[0] as HTMLElement;
    expect(child0.style.gridColumn).toBe("1 / span 6");
    expect(child0.style.gridRow).toBe("1 / span 1");
    const child1 = children[1] as HTMLElement;
    expect(child1.style.gridColumn).toBe("7 / span 6");
    expect(child1.style.gridRow).toBe("1 / span 1");
  });

  it("columns with col-N slots: correct distribution", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "columns",
      props: { distribution: [2, 1] },
      slots: {
        "col-0": [{ type: "html" }],
        "col-1": [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("2fr 1fr");
    const slots = el.querySelectorAll("[data-slot]");
    expect(slots).toHaveLength(2);
  });

  it("rows with flex column", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "rows",
      slots: { default: [{ type: "html" }] },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    expect(el.style.display).toBe("flex");
    expect(el.style.flexDirection).toBe("column");
  });

  it("sidebar with nav and main slots", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "sidebar",
      slots: {
        nav: [{ type: "html" }],
        main: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("auto 1fr");
    expect(el.querySelector("[data-slot='nav']")).toBeTruthy();
    expect(el.querySelector("[data-slot='main']")).toBeTruthy();
  });

  it("panel with title header", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "panel",
      props: { title: "My Panel" },
      slots: { default: [{ type: "html" }] },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    const titleEl = el.querySelector("[data-panel-title]") as HTMLElement;
    expect(titleEl).toBeTruthy();
    expect(titleEl.textContent).toBe("My Panel");
  });
});

describe("renderComponent — access control", () => {
  it("component with denied role not rendered", () => {
    const target = document.createElement("div");
    const permissions: PermissionContext = {
      hasRole: () => false,
      hasPermission: () => false,
    };
    const component: Component = {
      type: "html",
      access: { roles: ["admin"] },
    };
    renderComponent(target, component, { permissions });
    expect(target.children).toHaveLength(0);
  });

  it("denied parent skips entire subtree", () => {
    const target = document.createElement("div");
    const permissions: PermissionContext = {
      hasRole: () => false,
      hasPermission: () => false,
    };
    const component: Component = {
      type: "rows",
      access: { roles: ["admin"] },
      slots: {
        default: [{ type: "html" }, { type: "html" }],
      },
    };
    renderComponent(target, component, { permissions });
    expect(target.children).toHaveLength(0);
    expect(target.querySelectorAll("[data-component-type]")).toHaveLength(0);
  });

  it("no permissions provided defaults to ALLOW_ALL", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "html",
      access: { roles: ["admin"] },
    };
    renderComponent(target, component);
    expect(target.children).toHaveLength(1);
  });
});

describe("renderComponent — page handling", () => {
  it("page is an activation container but slot children render recursively", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "page",
      slots: {
        default: [{ type: "html" }, { type: "rows" }],
      },
    };
    renderComponent(target, component);
    const pageEl = target.firstElementChild as HTMLElement;
    expect(pageEl.dataset.componentType).toBe("page");
    // Slots render children recursively even for non-layout types
    const slotEl = pageEl.querySelector("[data-slot='default']");
    expect(slotEl).toBeTruthy();
    const children = slotEl!.querySelectorAll("[data-component-type]");
    expect(children).toHaveLength(2);
  });
});

describe("renderComponent — DOM attributes on layout types", () => {
  it("layout types carry all three data attributes", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "grid",
      props: { columns: 6 },
    };
    renderComponent(target, component);
    const el = target.firstElementChild as HTMLElement;
    expect(el.dataset.componentType).toBe("grid");
    expect(el.dataset.componentId).toBeTruthy();
    expect(el.dataset.componentProps).toBe(JSON.stringify({ columns: 6 }));
  });
});

describe("renderComponent — items vs slots precedence", () => {
  it("when both present, items take precedence", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "grid",
      props: { columns: 12 },
      items: [
        {
          placement: { x: 0, y: 0, w: 12, h: 1 },
          component: { type: "html" },
        },
      ],
      slots: {
        default: [{ type: "html" }, { type: "html" }],
      },
    };
    renderComponent(target, component);
    const gridEl = target.firstElementChild as HTMLElement;
    // Items rendered — one child with grid placement
    const gridChildren = gridEl.querySelectorAll(":scope > [data-component-type]");
    expect(gridChildren).toHaveLength(1);
    // No slot containers
    expect(gridEl.querySelector("[data-slot]")).toBeNull();
  });
});

describe("renderComponent — onNode callback", () => {
  it("fires onNode for each component with element and component model", () => {
    const target = document.createElement("div");
    const calls: Array<{ type: string; id: string }> = [];
    const component: Component = {
      type: "rows",
      slots: {
        default: [
          { type: "bar-chart", props: { title: "Revenue" } },
          { type: "table", props: { title: "Sales" } },
        ],
      },
    };
    renderComponent(target, component, {
      onNode: (el, comp) => {
        calls.push({ type: comp.type, id: el.dataset.componentId! });
      },
    });
    expect(calls).toHaveLength(3); // rows + bar-chart + table
    expect(calls[0]!.type).toBe("rows");
    expect(calls[1]!.type).toBe("bar-chart");
    expect(calls[2]!.type).toBe("table");
  });

  it("element is connected to DOM when onNode fires", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    let connected = false;
    const component: Component = { type: "bar-chart" };
    renderComponent(target, component, {
      onNode: (el) => {
        connected = el.isConnected;
      },
    });
    expect(connected).toBe(true);
    document.body.removeChild(target);
  });

  it("children not yet rendered when onNode fires for parent", () => {
    const target = document.createElement("div");
    let childCount = -1;
    const component: Component = {
      type: "tabs",
      slots: { A: [{ type: "bar-chart" }], B: [{ type: "table" }] },
    };
    renderComponent(target, component, {
      onNode: (el, comp) => {
        if (comp.type === "tabs") {
          childCount = el.children.length;
        }
      },
    });
    expect(childCount).toBe(0);
  });
});
