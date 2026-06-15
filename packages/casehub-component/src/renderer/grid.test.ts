import { describe, it, expect } from "vitest";
import { applyGridPlacement } from "./grid.js";

describe("applyGridPlacement", () => {
  it("maps 0-based placement to 1-based CSS Grid", () => {
    const el = document.createElement("div");
    applyGridPlacement(el, { x: 0, y: 0, w: 6, h: 2 });
    expect(el.style.gridColumn).toBe("1 / span 6");
    expect(el.style.gridRow).toBe("1 / span 2");
  });

  it("handles offset positions", () => {
    const el = document.createElement("div");
    applyGridPlacement(el, { x: 8, y: 3, w: 4, h: 1 });
    expect(el.style.gridColumn).toBe("9 / span 4");
    expect(el.style.gridRow).toBe("4 / span 1");
  });
});
